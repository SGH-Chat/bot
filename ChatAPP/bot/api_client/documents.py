import os
import re
import fitz  # PyMuPDF
from typing import Optional, List

import tiktoken

class DocumentProcessor:
    def __init__(self):
        """
        Initialize the DocumentProcessor instance.
        """
        pass

    def load_pdf(self, pdf_path: str) -> str:
        """
        Load and extract text from a PDF file.

        Parameters:
        - pdf_path (str): Path to the PDF file.

        Returns:
        - str: Extracted text content.
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file {pdf_path} does not exist.")

        doc = fitz.open(pdf_path)
        text = ""
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            text += page.get_text()
        doc.close()
        return text

    def clean_text(self, text: str) -> str:
        """
        Clean and preprocess text by removing unnecessary characters.

        Parameters:
        - text (str): Raw text to clean.

        Returns:
        - str: Cleaned text.
        """
        # Remove URLs
        text = re.sub(r'http\S+|www\S+', '', text)
        # Remove HTML tags
        text = re.sub(r'<.*?>', '', text)
        # Remove non-alphanumeric characters (excluding spaces)
        text = re.sub(r'[^A-Za-z0-9\s]+', '', text)
        # Convert to lowercase
        text = text.lower()
        # Remove extra whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def split_text(self, text: str, max_tokens: int = 1000) -> List[str]:
        """
        Split text into chunks based on token count using tiktoken.
        """
        encoding = tiktoken.encoding_for_model("text-embedding-3-small")  # Replace with appropriate encoding
        tokens = encoding.encode(text)
        total_tokens = len(tokens)
        chunks = []
        start = 0

        while start < total_tokens:
            end = start + max_tokens
            chunk_tokens = tokens[start:end]
            chunk_text = encoding.decode(chunk_tokens)
            chunks.append(chunk_text)
            start = end

        # Log the number of chunks and their sizes
        for i, chunk in enumerate(chunks):
            chunk_token_count = len(encoding.encode(chunk))
            print(f"Chunk {i+1}: {chunk_token_count} tokens")

        return chunks


        
    def split_text2(self, text: str, max_tokens: int = 1000) -> List[str]:
        """
        Split text into chunks of approximately max_tokens words.
        """
        sentences = re.split(r'(?<=[.!?]) +', text)
        chunks = []
        current_chunk = ''
        current_length = 0

        for sentence in sentences:
            sentence_length = len(sentence.split())
            if current_length + sentence_length > max_tokens:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + ' '
                current_length = sentence_length
            else:
                current_chunk += sentence + ' '
                current_length += sentence_length
        if current_chunk:
            chunks.append(current_chunk.strip())
        return chunks
