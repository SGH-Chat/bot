from typing import List, Optional, Dict, Any

class MemoryHandler:
    def __init__(self, system_prompt: str = "You are a helpful assistant.", messages: Optional[List[Dict[str, Any]]] = None):
        """
        Initializes the MemoryHandler with a system prompt and existing messages.
        """
        if messages is not None:
            self.messages = messages
        else:
            self.messages = []
            if system_prompt:
                self.messages.append({
                    "role": "system",
                    "content": [
                        {
                            "type": "text",
                            "text": system_prompt
                        }
                    ]
                })

    def add_user_message(self, text: Optional[str] = None, images: Optional[List[str]] = None) -> None:
        """
        Adds a user message to the conversation history.
        """
        content: List[Dict[str, Any]] = []

        if text:
            content.append({
                "type": "text",
                "text": text
            })

        if images:
            for image in images:
                content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image}"
                    }
                })

        if content:
            self.messages.append({
                "role": "user",
                "content": content
            })

    def add_assistant_message(self, text: str) -> None:
        """
        Adds an assistant message to the conversation history.
        """
        if text:
            content = [{
                "type": "text",
                "text": text
            }]
            self.messages.append({
                "role": "assistant",
                "content": content
            })

    def get_conversation(self) -> List[Dict[str, Any]]:
        """
        Retrieves the current conversation history as a list of dictionaries.
        """
        return self.messages

    def __call__(self, is_user: bool, message: Optional[str] = None, images: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """
        Adds a message to the conversation history based on the role.
        """
        if is_user:
            self.add_user_message(text=message, images=images)
        else:
            self.add_assistant_message(text=message)

        # Optional: Print the complete conversation for debugging
        print("Complete Conversation:")
        for msg in self.messages:
            print(msg)

        return self.get_conversation()
