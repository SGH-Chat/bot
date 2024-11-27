# openai_client/__init__.py

from .assistant import Assistant
from .completion import Completion, CompletionResponse
from .embeddings import Embeddings
from .upload import Upload
from .search import Search
from .crawler import Crawler
from .memory_handler import MemoryHandler
from .faiss_search import FaissSearch
from .documents import DocumentProcessor
from .index_manager import DocumentIndexManager
from .batch import BatchRequests, BatchRequestsError
from .schemas import CompleteResponse, BatchResponse, ResponseData, ResponseBody, ResponseBodyChoice
from .delete_old_files import Command
#from .exceptions import (
#    ModelValidationError,
#    EncodingFormatError,
#    DimensionsError,
#    UploadError,
#    ChatError,
#)

# Optionally, define __all__ to specify what is exported when using 'from openai_client import *'
__all__ = [
    "Assistant",
    "Completion",
    "CompletionResponse",
    "Embeddings",
    "Upload",
    "Search",
    "Crawler",
    "MemoryHandler",
    "FaissSearch",
    "DocumentProcessor",
    "DocumentIndexManager",
    "BatchRequests",
    "BatchRequestsError",
    "CompleteResponse", 
    "BatchResponse", 
    "ResponseData", 
    "ResponseBody", 
    "ResponseBodyChoice",
    "Command",
#    "ModelValidationError",
#    "EncodingFormatError",
#    "DimensionsError",
#    "UploadError",
#    "ChatError",
]
