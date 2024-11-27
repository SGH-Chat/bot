import re
from typing import Optional
from bs4 import BeautifulSoup
from openai import AsyncOpenAI
import logfire
from dotenv import load_dotenv

class Embeddings:
    ALLOWED_MODELS = {
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002"
    }
    VALID_ENCODING_FORMATS = {"base64", "float"}
    BASE_URL = "https://gateway.ai.cloudflare.com/v1/12cb59530e8606c6a991c612e79f083c/sgh-chatbot/openai"
    
    # Updated VERSION_PATTERN to match version 3 and above
    VERSION_PATTERN = re.compile(r'^text-embedding-(?:[3-9]|[1-9]\d+).*$')
    
    def __init__(
        self,
        api_key: str,
        model: str,
        encoding_format: Optional[str] = None,
        dimensions: Optional[int] = None
    ):
        self.api_key = api_key
        self.model = model
        self.encoding_format = encoding_format
        self.dimensions = dimensions
        self.client = AsyncOpenAI(api_key=api_key, base_url=self.BASE_URL)
        logfire.instrument_openai(self.client)

        # Perform validations during initialization
        self.validate_model()
        self.validate_encoding_format()
        self.validate_dimensions()

    def validate_model(self):
        """Validates whether the model is allowed."""
        if self.model not in self.ALLOWED_MODELS:
            raise ValueError(
                f"Invalid model. Must be one of: {', '.join(self.ALLOWED_MODELS)}"
            )

    def validate_encoding_format(self):
        """Validates the encoding format if provided."""
        if self.encoding_format:
            if self.encoding_format not in self.VALID_ENCODING_FORMATS:
                raise ValueError(
                    f"Invalid encoding_format. Must be one of: {', '.join(self.VALID_ENCODING_FORMATS)}"
                )

    def validate_dimensions(self):
        """Validates the dimensions if provided."""
        if self.dimensions is not None:
            if not isinstance(self.dimensions, int) or self.dimensions <= 0:
                raise ValueError("Dimensions must be a positive integer.")
            
            # Check if the model supports changing dimensions
            if not self.is_model_version_3_or_later():
                raise ValueError(
                    "Changing the number of dimensions is only supported in text-embedding-3 and later models."
                )

    def is_model_version_3_or_later(self) -> bool:
        """Checks if the model is version 3 or later."""
        return bool(self.VERSION_PATTERN.match(self.model))

    async def __call__(self, text: str):
        """Creates embeddings for the given text."""
        if not isinstance(text, str) or not text.strip():
            raise ValueError("Input text must be a non-empty string.")
        
        # Prepare the payload with optional parameters
        payload = {
            "input": text,
            "model": self.model
        }
        
        if self.encoding_format:
            payload["encoding_format"] = self.encoding_format
        
        if self.dimensions:
            payload["dimensions"] = self.dimensions
        
        try:
            response = await self.client.embeddings.create(**payload)
            return response.data[0].embedding
        except Exception as e:
            # Handle or log the exception as needed
            raise RuntimeError(f"Failed to create embeddings: {e}") from e