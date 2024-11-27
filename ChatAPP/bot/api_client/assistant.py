import asyncio
import re
from typing import Optional, List, Dict
from openai import AsyncOpenAI
import logfire
from ..models import User, Chat, ChatMessage, Assistant as AssistantModel, FileVault, FileInfo
from asgiref.sync import sync_to_async
import json  # Added for JSON serialization
from .completion import Completion

class Assistant:        
    def __init__(
        self,
        api_key: str,
        assistant_id: str = "asst_a95l9Zx6anqTbkq07rqHZqnJ",
        thread_id: Optional[str] = None,
    ) -> None:
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://gateway.ai.cloudflare.com/v1/12cb59530e8606c6a991c612e79f083c/sgh-chatbot/openai")
        logfire.instrument_openai(self.client)
        self.assistant_id = assistant_id
        
        if not thread_id:
            thread = asyncio.run(self.client.beta.threads.create())
            thread_id = thread.id
        self.thread_id = thread_id

        # Initialize message counter and storage
        self.message_count = 0
        self.first_two_messages = []

    async def __call__(self, message: str) -> str:
        """
        Sends a message to the assistant and returns the response.
        
        Parameters:
        - message (str): The user's message to the assistant.
        
        Returns:
        str: The response from the assistant.
        """
        # Increment message count
        self.message_count += 1

        # Retrieve or create assistant record asynchronously
        assistant, _ = await sync_to_async(AssistantModel.objects.get_or_create)(
            name=self.assistant_id, 
            model="gpt-4o"
        )
        
        # Retrieve the first superuser asynchronously
        superuser = await sync_to_async(lambda: User.objects.filter(is_superuser=True).first())()
        
        # Retrieve or create chat record asynchronously
        chat, created = await sync_to_async(Chat.objects.get_or_create)(
            user=superuser,
            assistant=assistant,
            thread_id=self.thread_id  # Store thread_id in chat
        )

        # Create a user message asynchronously
        user_message = await sync_to_async(ChatMessage.objects.create)(
            chat=chat,
            sender=ChatMessage.SenderChoices.USER,
            content=message
        )
        
        # Save the first two send and receive messages
        if self.message_count <= 2:
            self.first_two_messages.append({
                "role": "user",
                "content": message
            })

        # Send message to the assistant
        await self.client.beta.threads.messages.create(
            thread_id=self.thread_id,
            role="user",
            content=message
        )
        # Create a run with the assistant and thread
        run = await self.client.beta.threads.runs.create_and_poll(
            thread_id=self.thread_id,
            assistant_id=self.assistant_id
        )
        # Get the assistant's reply
        messages = await self.client.beta.threads.messages.list(thread_id=self.thread_id)
        # Assuming the assistant's message is the last one
        pattern = r'【\d+:\d+†source】'
        assistant_message_content = messages.data[0].content[0].text.value
        clean_assistant_message_content = re.sub(pattern, '', assistant_message_content)
        # Save the assistant's response in the database asynchronously
        assistant_message = await sync_to_async(ChatMessage.objects.create)(
            chat=chat,
            sender=ChatMessage.SenderChoices.ASSISTANT,
            content=clean_assistant_message_content
        )

        # Save the first two send and receive messages
        if self.message_count <= 2:
            self.first_two_messages.append({
                "role": "assistant",
                "content": clean_assistant_message_content
            })
        elif self.message_count == 2:
            await self.handle_message_limit_reached(chat)

        print(f"Assistant response: {clean_assistant_message_content}")

        return clean_assistant_message_content

    async def handle_message_limit_reached(self, chat):
        """
        Handles actions to perform when the message count limit is reached.
        
        Parameters:
        - chat (Chat): The current chat instance.
        """
        # Serialize the first two send and receive messages to JSON
        messages_json = json.dumps(self.first_two_messages, indent=2)
        print(f"First two messages serialized to JSON:\n{messages_json}")

        # Generate a short name for the chat description
        try:
            # Ensure that the API key is available
            openai_client = Completion(api_key=self.client.api_key, 
                                                    system="You are a helpful assistant, helping to create one sentence descriptions for my chat.")

            # Perform request to generate description
            response = await openai_client.completion(f"{messages_json}")
            print(f"\n\n\ndescription: {response.text}\n\n\n")
            # Check if the response is valid
            if not message or not message.text:
                print("Failed to generate a valid chat description. Using default description.")
                message = "Default description due to error during generation."
        
        except Exception as e:
            print(f"Error generating chat description: {str(e)}")

        # Save the new chat in history with the generated short name as description
        await sync_to_async(Chat.objects.create)(
            user=chat.user,
            assistant=chat.assistant,
            thread_id=None,  # New chat, so no thread_id yet
            chat_description=message
        )

        print(f"Chat saved to history with description: {message}")


    def new_chat(self) -> str:
        """
        Starts a new chat thread.
        
        Returns:
        str: The ID of the new chat thread.
        """
        thread = asyncio.run(self.client.beta.threads.create())
        self.thread_id = thread.id
        # Reset message count and messages for the new thread
        self.message_count = 0
        self.first_two_messages = []
        return self.thread_id
    
    async def get_messages_from_thread(self, thread_id: str) -> List[Dict[str, str]]:
        """
        Retrieves messages from a specified thread.
        
        Parameters:
        - thread_id (str): The ID of the thread to retrieve messages from.
        
        Returns:
        List[Dict[str, str]]: A list of messages with roles and content.
        """
        messages = await self.client.beta.threads.messages.list(thread_id=thread_id)
        return [
            {
                "role": message.role,
                "content": message.content[0].text.value if message.content else ""
            }
            for message in messages.data
        ]
