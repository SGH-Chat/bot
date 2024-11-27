import chardet
import faiss
import numpy as np
import json
import os
from typing import List, Dict, Any, Optional
import base64

class FaissSearch:
    def __init__(
        self,
        vector_dimension: int = 1536,
        index_type: str = 'L2',
        mapping_file: Optional[str] = None
    ):
        """
        Initialize the FaissSearch instance.

        Parameters:
        - vector_dimension (int): Dimension of the embedding vectors.
        - index_type (str): Type of FAISS index to use ('L2' for Euclidean, 'IP' for Inner Product).
        - mapping_file (str, optional): Path to save/load the document mapping.
        """
        self.vector_dimension = vector_dimension
        self.index_type = index_type.upper()
        self.mapping_file = mapping_file

        # Initialize FAISS index
        if self.index_type == 'L2':
            self.index = faiss.IndexFlatL2(self.vector_dimension)
        elif self.index_type == 'IP':
            self.index = faiss.IndexFlatIP(self.vector_dimension)
        else:
            raise ValueError("Unsupported index type. Use 'L2' or 'IP'.")

        # Initialize document mapping
        self.document_mapping: List[Dict[str, Any]] = []
        if mapping_file and os.path.exists(mapping_file):
            self.load_mapping(mapping_file)

    def normalize_vectors(self, vectors: np.ndarray) -> np.ndarray:
        """
        Normalize vectors to unit length (L2 normalization).

        Parameters:
        - vectors (np.ndarray): Array of vectors to normalize.

        Returns:
        - np.ndarray: Normalized vectors.
        """
        faiss.normalize_L2(vectors)
        return vectors

    def add_embeddings(
        self,
        embedding: Any,
        title: str,
        text: str,
        description: Optional[str] = None,
        **kwargs: Any
    ):
        """
        Add a single embedding to the FAISS index with metadata.

        Parameters:
        - embedding (Any): A single embedding vector (float list or base64-encoded string).
        - title (str): Title of the document.
        - description (str, optional): Description of the document.
        - **kwargs (dict): Additional metadata fields to include.
        """
        # Handle base64-encoded embeddings
        if isinstance(embedding, str):  # Assume base64 format
            try:
                embedding = base64.b64decode(embedding)
                embedding = np.frombuffer(embedding, dtype=np.float32)
            except (ValueError, TypeError) as e:
                raise ValueError("Invalid base64 embedding provided.") from e

        # Ensure the embedding is a numpy array in float32 format
        elif isinstance(embedding, list):  # Assume float list
            embedding = np.array(embedding, dtype=np.float32)

        else:
            raise ValueError("Embedding must be a list of floats or a base64-encoded string.")

        # Reshape for FAISS compatibility
        vector = embedding.reshape(1, -1)

        # Check dimension compatibility
        if vector.shape[1] != self.vector_dimension:
            raise ValueError(
                f"Embedding dimension mismatch: expected {self.vector_dimension}, got {vector.shape[1]}"
            )

        # Normalize vector if needed
        if self.index_type == 'IP':
            vector = self.normalize_vectors(vector)

        # Add vector to the FAISS index
        self.index.add(vector)

        # Prepare metadata
        metadata = {
            "title": title,
            "text": text,
        }
        metadata.update(kwargs)

        # Add metadata to the document mapping
        self.document_mapping.append(metadata)

    def search(
        self,
        query_embeddings: List[List[float]],
        top_k: int = 5,
        normalize: bool = True
    ) -> List[List[Dict[str, Any]]]:
        """
        Search the FAISS index with the given query embeddings.

        Parameters:
        - query_embeddings (List[List[float]]): List of query embedding vectors.
        - top_k (int): Number of top results to retrieve.
        - normalize (bool): Whether to normalize query vectors before searching.

        Returns:
        - List[List[Dict[str, Any]]]: List of lists containing metadata for top_k results per query.
        """
        queries = np.array(query_embeddings).astype('float32')
        if queries.shape[1] != self.vector_dimension:
            raise ValueError(f"Query embedding dimension mismatch: expected {self.vector_dimension}, got {queries.shape[1]}")

        if normalize and self.index_type == 'IP':
            queries = self.normalize_vectors(queries)

        distances, indices = self.index.search(queries, top_k)

        results = []
        for distance_list, index_list in zip(distances, indices):
            query_results = []
            for dist, idx in zip(distance_list, index_list):
                if 0 <= idx < len(self.document_mapping):
                    doc_info = self.document_mapping[idx].copy()  # Copy to avoid accidental modifications
                    doc_info['score'] = float(dist)  # Convert to regular float for JSON serialization
                    doc_info['faiss_index'] = int(idx)
                    query_results.append(doc_info)
                else:
                    # Handle cases where FAISS returns an index out of range
                    query_results.append({'score': float(dist), 'faiss_index': int(idx), 'error': 'Index out of range'})
            results.append(query_results)
        return results

    def save_index(self, index_file: str):
        """
        Save the FAISS index to disk.

        Parameters:
        - index_file (str): Path to save the FAISS index.
        """
        faiss.write_index(self.index, index_file)
        print(f"FAISS index saved to {index_file}")

    def load_index(self, index_file: str):
        """
        Load a FAISS index from disk.

        Parameters:
        - index_file (str): Path to the saved FAISS index.
        """
        if not os.path.exists(index_file):
            raise FileNotFoundError(f"Index file {index_file} does not exist.")

        self.index = faiss.read_index(index_file)
        print(f"FAISS index loaded from {index_file}")
        return self.index

    def save_mapping(self, mapping_file: Optional[str] = None):
        """
        Save the document mapping to a JSON file.

        Parameters:
        - mapping_file (str, optional): Path to save the mapping. If None, use the initialized mapping_file.
        """
        if not mapping_file:
            if not self.mapping_file:
                raise ValueError("No mapping_file specified.")
            mapping_file = self.mapping_file

        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(self.document_mapping, f, ensure_ascii=False, indent=4)
        print(f"Document mapping saved to {mapping_file}")

    def load_mapping(self, mapping_file: Optional[str] = None):
        """
        Load the document mapping from a JSON file.
        """
        if not mapping_file:
            if not self.mapping_file:
                raise ValueError("No mapping_file specified.")
            mapping_file = self.mapping_file

        if not os.path.exists(mapping_file):
            raise FileNotFoundError(f"Mapping file {mapping_file} does not exist.")

        # Decode the content using the detected encoding
        with open(mapping_file, 'r', encoding='utf-8') as f:
            self.document_mapping = json.load(f)

    def save_state(self, index_file: str, mapping_file: Optional[str] = None):
        """
        Save both the FAISS index and document mapping.

        Parameters:
        - index_file (str): Path to save the FAISS index.
        - mapping_file (str, optional): Path to save the document mapping.
        """
        self.save_index(index_file)
        self.save_mapping(mapping_file)

    def load_state(self, index_file: str, mapping_file: Optional[str] = None):
        """
        Load both the FAISS index and document mapping.

        Parameters:
        - index_file (str): Path to the saved FAISS index.
        - mapping_file (str, optional): Path to the saved document mapping.
        """
        self.load_index(index_file)
        self.load_mapping(mapping_file)

    def reset(self):
        """
        Reset the FAISS index and document mapping.
        """
        self.index.reset()
        self.document_mapping = []
        print("FAISS index and document mapping have been reset.")

    def get_index(self):
        return self.index