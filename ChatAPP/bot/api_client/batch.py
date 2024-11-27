import json
import tempfile
import uuid
from typing import List, Optional, Any, Dict
from .schemas import CompleteResponse, BatchResponse
from pydantic import ValidationError
from openai import AsyncOpenAI
import tiktoken
import logfire
from ..models import Batch, BatchRequest
from django.utils import timezone
from asgiref.sync import sync_to_async
import os
import logging
import json

# Configure the logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)  # Set to DEBUG to capture all log messages
handler = logging.StreamHandler()  # Output to the console
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

class BatchRequestsError(Exception):
    """Custom exception for BatchRequests errors."""
    pass


class BatchRequests:
    BASE_URL = "https://gateway.ai.cloudflare.com/v1/12cb59530e8606c6a991c612e79f083c/sgh-chatbot/openai"

    def __init__(self, api_key: str, max_tokens: int):
        """
        Initialize the BatchRequests object.

        :param api_key: OpenAI API key
        :param max_tokens: Maximum token limit per request
        """
        self.client = AsyncOpenAI(api_key=api_key, base_url=self.BASE_URL)
        logfire.instrument_openai(self.client)
        self.max_tokens = max_tokens
        self.requests: List[Dict] = []
        self.current_batch: Optional[Batch] = None

    # Function to check batch status
    async def check_batch_status(self, batch_id: str) -> Dict:
        logger.debug("Checking batch status for Batch ID: %s", batch_id)
        try:
            batch_status = await self.client.batches.retrieve(batch_id=batch_id)
            logger.debug("Batch status retrieved: %s", batch_status)
            if batch_status.status == "completed":
                await self.retrieve_batch_results(batch_id)
            return batch_status.status
        except Exception as e:
            logger.error("Failed to check batch status: %s", str(e), exc_info=True)
            raise BatchRequestsError(f"Failed to check batch status: {str(e)}")

    async def cancel_batch(self, batch_id: str) -> Dict:
        logger.debug("Cancelling batch with ID: %s", batch_id)
        try:
            cancel_response = await self.client.batches.cancel(batch_id=batch_id)
            logger.debug("Batch cancelled successfully: %s", cancel_response)

            batch = await sync_to_async(Batch.objects.get)(batch_id=batch_id)
            batch.canceled = True
            await sync_to_async(batch.save)()
            logger.info("Batch status updated to cancelled for Batch ID: %s", batch_id)

            return cancel_response
        except Exception as e:
            logger.error("Failed to cancel batch: %s", str(e), exc_info=True)
            raise BatchRequestsError(f"Failed to cancel batch: {str(e)}")

    async def retrieve_batch_results(self, batch_id: str) -> List[Dict]:
        logger.debug("Retrieving results for Batch ID: %s", batch_id)
        try:
            batch = await self.client.batches.retrieve(batch_id=batch_id)
            input_file = await self.client.files.content(batch.input_file_id)
            output_file = await self.client.files.content(batch.output_file_id)
            
            # Log raw content for debugging
            input_content = input_file.content.decode('utf-8')
            input_json_lines = input_content.strip().splitlines()
            input_json_objects = [json.loads(line) for line in input_json_lines]
            
            for i, content in enumerate(input_json_objects, start=0):
                logger.info("Input File Custom ID: %s", content.get("custom_id"))
            
            output_content = output_file.content.decode('utf-8')
            output_json_lines = output_content.strip().splitlines()
            output_json_objects = [json.loads(line) for line in output_json_lines]
            
            for i, content in enumerate(output_json_objects, start=0):
                assistant_response = content.get("response").get('body').get('choices')[0].get('message').get('content')
                custom_id = content.get("custom_id")
                logger.info("Output File Custom ID: %s", custom_id)
                error = content.get("error")
                assistant_exists = await sync_to_async(
                        BatchRequest.objects.filter(
                            custom_id=custom_id,
                            assistant_message__isnull=False
                        ).exists
                    )()
                logger.info("The assistant response for: %s is already set!", custom_id)
                if assistant_exists:
                    logger.info("Custom ID %s has already been processed. Skipping retrieval.", custom_id)
                else:
                    logger.info("Output File Custom ID: %s", custom_id)
                    await self.update_batch_requests(custom_id=custom_id, assistant=assistant_response, response=content, status='completed', error=error)

            return input_json_objects, output_json_objects
        except Exception as e:
            logger.error("Failed to retrieve batch results: %s", str(e), exc_info=True)
            raise BatchRequestsError(f"Failed to retrieve batch results: {str(e)}")
    
    async def update_batch_requests(self, custom_id, assistant, response, status, error) -> None:
        try:
            batch_request = await sync_to_async(BatchRequest.objects.get)(custom_id=custom_id)
            batch_request.assistant_message = assistant
            batch_request.response = response
            batch_request.status = status
            batch_request.error_message = error if error else None
            await sync_to_async(batch_request.save)()
            logger.info("Updated BatchRequest %s successfully.", custom_id)
        except BatchRequest.DoesNotExist:
                logger.error("BatchRequest with custom_id %s does not exist.", custom_id)
        except Exception as e:
                logger.error("Error updating BatchRequest %s: %s", custom_id, str(e), exc_info=True)

    async def list_batches(self) -> List[Dict]:
        logger.debug("Listing all batches.")
        try:
            batches = await self.client.batches.list()
            logger.debug("Batch list retrieved: %s", batches)

            for batch_data in batches:
                await sync_to_async(Batch.objects.update_or_create)(
                    batch_id=batch_data.id,
                    defaults={
                        "created_at": batch_data.get("created_at", timezone.now()),
                        "finished_at": batch_data.get("finished_at"),
                        "finished": batch_data.get("finished", False),
                        "canceled": batch_data.get("canceled", False),
                        "metadata": batch_data.get("metadata", {}),
                    },
                )
            logger.info("Batch list updated in database.")
            return batches
        except Exception as e:
            logger.error("Failed to list batches: %s", str(e), exc_info=True)
            raise BatchRequestsError(f"Failed to list batches: {str(e)}")

    def check_token(self, query: str, model: str) -> Optional[str]:
        logger.debug("Checking token count for model: %s", model)
        try:
            tokenizer = tiktoken.encoding_for_model(model)
            tokenized_query = tokenizer.encode(query)
            token_count = len(tokenized_query)

            logger.debug("Token count: %d for query: %s", token_count, query)
            if token_count > self.max_tokens:
                return f"Query exceeds max token limit of {self.max_tokens}. Current token count: {token_count}."
        except Exception as e:
            logger.error("Failed to check token count: %s", str(e), exc_info=True)
            return f"Unable to initialize tokenizer for model '{model}'. {str(e)}"
        return None

    async def define_request(self, custom_id: Optional[str], model: str, system: str, user: str) -> None:
        """
        Define a single request and add it to the batch's request list.

        :param custom_id: A unique identifier for the request
        :param model: The model name to be used (e.g., 'gpt-4o')
        :param system: Content for the 'system' role message
        :param user: Content for the 'user' role message
        :raises BatchRequestsError: If the token check fails
        """
        custom_id = custom_id or str(uuid.uuid4())
        logger.debug("Defining request with ID: %s", custom_id)

        query = f"{system} {user}"
        logger.debug("Checking token limit for query: %s", query)

        token_error = self.check_token(query, model)
        if token_error:
            logger.error("Token check failed for request %s: %s", custom_id, token_error)
            raise BatchRequestsError(f"Error for request '{custom_id}': {token_error}")

        request = {
            "custom_id": custom_id,
            "method": "POST",
            "url": "/v1/chat/completions",
            "body": {
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user}
                ],
                "max_tokens": self.max_tokens
            }
        }

        self.requests.append(request)
        logger.info("Request added to batch: %s", custom_id)

    async def create_batch(self, metadata: Optional[Dict] = None) -> Dict:
        """
        Create a batch for processing and save the batch and its requests to the database.

        :param metadata: Optional metadata for the batch
        :return: Batch object returned by OpenAI API
        :raises BatchRequestsError: If there are no valid requests or batch creation fails
        """
        if not self.requests:
            logger.error("No valid requests defined. Cannot create batch.")
            raise BatchRequestsError("Cannot create batch. No valid requests have been defined.")

        try:
            logger.debug("Creating batch with metadata: %s", metadata)

            # Write requests to a temporary JSONL file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".jsonl") as temp_file:
                for request in self.requests:
                    logger.debug("Writing request to temp file: %s", request)
                    temp_file.write(json.dumps(request).encode('utf-8') + b"\n")
                temp_file_path = temp_file.name

            logger.debug("Temporary batch file created at: %s", temp_file_path)

            # Upload the batch file
            with open(temp_file_path, "rb") as batch_file:
                batch_input_file = await self.client.files.create(file=batch_file, purpose="batch")

            logger.debug("Batch file uploaded. File ID: %s", batch_input_file.id)

            # Create the batch job via OpenAI API
            batch_job = await self.client.batches.create(
                input_file_id=batch_input_file.id,
                endpoint="/v1/chat/completions",
                completion_window="24h",
                metadata=metadata or {},
            )

            logger.info("Batch job created successfully. Batch ID: %s", batch_job.id)

            # Save the Batch record to the database
            batch = await sync_to_async(Batch.objects.create)(
                batch_id=batch_job.id,
                metadata=metadata or {}
            )
            logger.info("Batch created in database with ID: %s", batch.id)

            # Save the BatchRequest objects associated with the Batch
            logger.debug("Saving BatchRequest objects for Batch ID: %s", batch.batch_id)
            for request in self.requests:
                await sync_to_async(BatchRequest.objects.create)(
                    batch=batch,
                    custom_id=request["custom_id"],
                    model=request["body"]["model"],
                    system_instructions=request["body"]["messages"][0]["content"],
                    user_message=request["body"]["messages"][1]["content"],
                    max_tokens=request["body"]["max_tokens"]
                )
                logger.info("BatchRequest saved with Custom ID: %s", request["custom_id"])

            logger.info("Batch creation process completed for Batch ID: %s", batch.batch_id)

            return {"batch_id": batch.batch_id}

        except Exception as e:
            logger.error("Failed to create batch: %s", str(e), exc_info=True)
            raise BatchRequestsError(f"Failed to create batch: {str(e)}")
        finally:
            # Clean up the temporary file
            try:
                os.remove(temp_file_path)
                logger.debug("Temporary file deleted: %s", temp_file_path)
            except Exception as cleanup_error:
                logger.warning("Failed to clean up temp file: %s", str(cleanup_error))


    async def create_batch_record(self, batch_id: str, metadata: dict) -> Batch:
        logger.debug("Creating batch record with ID: %s", batch_id)
        return await sync_to_async(Batch.objects.create)(
            batch_id=batch_id,
            metadata=metadata
        )

    async def create_batch_request_record(self, batch: Batch, custom_id: str, model: str, system_instructions: str, user_message: str, max_tokens: int) -> BatchRequest:
        logger.debug("Creating batch request record for Custom ID: %s", custom_id)
        return await sync_to_async(BatchRequest.objects.create)(
            batch=batch,
            custom_id=custom_id,
            model=model,
            system_instructions=system_instructions,
            user_message=user_message,
            max_tokens=max_tokens
        )