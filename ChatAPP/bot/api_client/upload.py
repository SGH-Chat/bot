import base64
from typing import Optional, List, Dict
from openai import AsyncOpenAI
import aiofiles
import logfire
import os
from ..models import User, Chat, ChatMessage, Assistant as AssistantModel, FileVault, FileInfo
from asgiref.sync import sync_to_async
import hashlib

class Upload:
    ALLOWED_PURPOSES = {"assistants", "fine-tune", "batch", "vision"}
    BASE_URL = "https://gateway.ai.cloudflare.com/v1/12cb59530e8606c6a991c612e79f083c/sgh-chatbot/openai"

    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key, base_url=self.BASE_URL)
        logfire.instrument_openai(self.client)
        
    async def __call__(self, chat_id: int, file_path: str, purpose: str, mime_type: str) -> dict:
        """Manage the entire file upload process and save the metadata to the database."""
        try:
            # Validate purpose
            self.validate_purpose(purpose)

            # Ensure the chat and its file vault exist
            chat = await sync_to_async(Chat.objects.get)(id=chat_id)
            file_vault, created = await sync_to_async(FileVault.objects.get_or_create)(chat=chat)

            # Start the upload session
            upload_info = await self.create_upload(file_path, purpose, mime_type)
            upload_id = upload_info['id']

            # Upload file parts
            part_ids = await self.upload_file_parts(upload_id, file_path)

            # Calculate MD5 checksum for verification
            with open(file_path, 'rb') as file:
                file_md5 = hashlib.md5(file.read()).hexdigest()

            # Complete the upload session
            completed_upload = await self.complete_upload(upload_id, part_ids, expected_md5=file_md5)

            # Save file information into FileInfo
            await sync_to_async(FileInfo.objects.create)(
                file_vault=file_vault,
                file_id=completed_upload['id'],
                filename=completed_upload['filename'],
                bytes=completed_upload['bytes'],
                purpose=completed_upload['purpose'],
                status=completed_upload.get('status', 'completed'),
                created_at=completed_upload['created_at'],
                expires_at=completed_upload.get('expires_at'),
                object_type=completed_upload['object']
            )
            
            return completed_upload

        except Exception as e:
            print(f"Error during file upload: {str(e)}")
            if 'upload_id' in locals():
                await self.cancel_upload(upload_id)
            raise

    def validate_purpose(self, purpose: str):
        """Validates whether the purpose is allowed."""
        if purpose not in self.ALLOWED_PURPOSES:
            raise ValueError(f"Invalid purpose. Must be one of: {', '.join(self.ALLOWED_PURPOSES)}")

    async def _read_file_in_chunks(self, file_path: str, chunk_size: int = 64 * 1024 * 1024):
        """Generator to read file in chunks."""
        async with aiofiles.open(file_path, 'rb') as file:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                yield chunk

    async def create_upload(self, file_path: str, purpose: str, mime_type: str) -> dict:
        """Creates an upload session."""
        file_size = os.path.getsize(file_path)
        filename = os.path.basename(file_path)

        upload_response = await self.client.files.create(
            file=open(file_path, "rb"),
            filename=filename,
            purpose=purpose,
            bytes=file_size,
            mime_type=mime_type
        )
        return upload_response

    async def upload_file_parts(self, upload_id: str, file_path: str) -> List[str]:
        """Uploads file in parts to an existing upload session."""
        part_ids = []
        async for chunk in self._read_file_in_chunks(file_path):
            encoded_chunk = base64.b64encode(chunk).decode('utf-8')
            part_response = await self.client.uploads.upload(upload_id).parts.post(
                data=encoded_chunk
            )
            part_ids.append(part_response['id'])
        return part_ids

    async def complete_upload(self, upload_id: str, part_ids: List[str], expected_md5: str = None) -> dict:
        """Completes the upload by providing part IDs."""
        complete_response = await self.client.uploads.upload(upload_id).complete.post(
            part_ids=part_ids,
            md5=expected_md5 if expected_md5 else hashlib.md5().hexdigest()
        )
        return complete_response

    async def cancel_upload(self, upload_id: str) -> dict:
        """Cancels an upload session."""
        cancel_response = await self.client.uploads.upload(upload_id).cancel.post()
        return cancel_response