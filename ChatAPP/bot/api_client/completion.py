import base64
from typing import Optional, List, Dict
from openai import AsyncOpenAI
import aiofiles
from .memory_handler import MemoryHandler
import os
from PIL import Image
import logfire

class CompletionResponse:
    def __init__(self, text: str, full: object):
        self.text = text
        self.full = full

class Completion:
    def __init__(
        self,
        api_key: str,
        system: Optional[str] = "You are a helpful assistant.",
        model: str = "gpt-4o",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        memory: Optional[MemoryHandler] = None
    ) -> None:
        self.client = AsyncOpenAI(api_key=api_key)
        logfire.instrument_openai(self.client)
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        self.frequency_penalty = frequency_penalty
        self.presence_penalty = presence_penalty
        self.memory = memory if memory is not None else MemoryHandler(system_prompt=system)

    async def __call__(
        self,
        message: Optional[str] = None,
        images: Optional[List[str]] = None 
    ) -> 'CompletionResponse':
        return self.completion(message, images)
    
    async def completion(
            self, 
            message: Optional[str] = None, 
            images: Optional[List[str]] = None 
    ) -> 'CompletionResponse':
        # Images are already base64-encoded, no need to encode them again
        encoded_images = images if images else []

        # Add the user's message and images to the conversation
        self.memory(is_user=True, message=message, images=encoded_images)
        # Get the conversation history
        conversation = self.memory.get_conversation()

        # Send the conversation to the OpenAI API
        if self.model == "o1-preview" or "o1-mini":
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=conversation,
            )
        else: 
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=conversation,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                top_p=self.top_p,
                frequency_penalty=self.frequency_penalty,
                presence_penalty=self.presence_penalty
            )

        # Extract assistant's reply
        assistant_reply = response.choices[0].message.content

        # Add the assistant's reply to the conversation
        self.memory(is_user=False, message=assistant_reply)

        return CompletionResponse(
            text=assistant_reply,
            full=response.choices[0]
        )

    async def _encode_images(self, images: List[str]) -> List[str]:
        """
        Asynchronously encode images to base64 strings; convert to PNG if necessary.
        """
        if not images:
            return []

        encoded_images = []
        for image_path in images:
            # Convert image to PNG format if not already
            if not image_path.lower().endswith('.png'):
                image_path = await self._convert_image_to_png(image_path)

            async with aiofiles.open(image_path, 'rb') as image_file:
                image_data = await image_file.read()
                base64_image = base64.b64encode(image_data).decode('utf-8')
                encoded_images.append(base64_image)

        return encoded_images

    async def _convert_image_to_png(self, image_path: str) -> str:
        """
        Convert the image to PNG format if it's not already.
        """
        with Image.open(image_path) as img:
            img = img.convert('RGBA')
            png_image_path = os.path.splitext(image_path)[0] + ".png"
            img.save(png_image_path, format='PNG')
        return png_image_path