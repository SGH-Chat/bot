from .embeddings import Embeddings
from .faiss_search import FaissSearch
from .documents import DocumentProcessor
from ..models import FileInfo, FileVault
import os
import asyncio
import numpy as np
from django.utils import timezone
from typing import Optional
import hashlib
from asgiref.sync import sync_to_async

class DocumentIndexManager:
    def __init__(self, api_key: str, embedding_model: str, index_file: str, mapping_file: str, vector_dimension: Optional[int] = None):
        self.api_key = api_key
        self.embedding_model = embedding_model
        self.document_processor = DocumentProcessor()
        self.embeddings = Embeddings(api_key=api_key, model=embedding_model)
        if vector_dimension is None:
            vector_dimension = 1536  # default dimension
        self.faiss_search = FaissSearch(vector_dimension=vector_dimension, index_type='L2')

        self.index_file = index_file
        self.mapping_file = mapping_file

        # Load existing index and mapping if they exist
        if os.path.exists(self.index_file) and os.path.exists(self.mapping_file):
            self.faiss_search.load_state(index_file=self.index_file, mapping_file=self.mapping_file)

    async def is_file_indexed(self, file_hash: str) -> bool:
        existing_file = await sync_to_async(FileInfo.objects.filter(file_hash=file_hash).exists)()
        return existing_file

    async def upload_and_index_document(self, file_path: str, file_vault: FileVault, metadata: dict = None):
        # Compute the file hash
        with open(file_path, 'rb') as f:
            file_data = f.read()
            file_hash = hashlib.md5(file_data).hexdigest()

        # Check if this file has already been indexed
        if await self.is_file_indexed(file_hash):
            print(f"File {os.path.basename(file_path)} already indexed.")
            return  # Skip indexing

        # Proceed with processing and indexing
        # Extract text from the document
        text = self.document_processor.load_pdf(file_path)
        cleaned_text = self.document_processor.clean_text(text)

        # Split the text into chunks
        text_chunks = self.document_processor.split_text(cleaned_text)

        # Get file info
        filename = os.path.basename(file_path)
        file_size = os.path.getsize(file_path)

        # Process each chunk
        for chunk in text_chunks:
            # Generate embeddings for the chunk
            embedding = await self.embeddings(chunk)
            embedding = np.array(embedding, dtype=np.float32)

            # Save FileInfo
            file_info = await sync_to_async(FileInfo.objects.create)(
                file_vault=file_vault,
                file_id=os.urandom(16).hex(),
                filename=filename,
                bytes=file_size,
                purpose="search",
                status="processed",
                created_at=timezone.now(),
                object_type="upload",
                embedding=embedding.tobytes(),
                embedding_format="float",
                dimensions=len(embedding),
                metadata=metadata or {},
                file_hash=file_hash
            )

            # Add embedding to FAISS index, include chunk text and file_id
            self.faiss_search.add_embeddings(
                embedding=embedding.tolist(),
                title=file_info.filename,
                description=metadata.get('description', '') if metadata else '',
                file_id=file_info.file_id,
                text=chunk  # Include the chunk text
            )

        # Save the FAISS index and document mapping
        self.faiss_search.save_state(index_file=self.index_file, mapping_file=self.mapping_file)
        print(f"Document '{filename}' uploaded and indexed successfully.")

    async def search_documents(self, query_text: str, top_k: int = 5):
        """
        Search for documents matching the query text using FAISS.
        """
        # Generate query embeddings
        query_embedding = np.array(await self.embeddings(query_text), dtype=np.float32)

        # Search FAISS index
        results = self.faiss_search.search([query_embedding.tolist()], top_k=top_k)

        # Fetch corresponding metadata from FileInfo
        matches = []
        for result in results[0]:
            file_info = await sync_to_async(FileInfo.objects.filter(file_id=result['file_id']).first)()
            if file_info:
                match = {
                    "filename": file_info.filename,
                    "description": file_info.metadata.get('description', ''),
                    "score": result['score'],
                    "text": result['text'],
                }
                matches.append(match)

        return matches