import os
import re
import tempfile
import base64
import faiss
import fitz
import numpy as np
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status
from datetime import datetime
from django.conf import settings
import asyncio
from .api_client import Assistant as AssistantAPI, Embeddings, Crawler, Completion, MemoryHandler, Upload, Search, FaissSearch, DocumentProcessor, DocumentIndexManager, BatchRequests
from .models import User, Assistant, Chat, ChatMessage, FileInfo, FileVault, Batch, BatchRequest
from django.shortcuts import render
import json
import aiohttp
from rest_framework.parsers import MultiPartParser
from django.utils.timezone import now
from asgiref.sync import async_to_sync
import logging
logger = logging.getLogger(__name__)
from django.shortcuts import render, get_object_or_404
import hashlib
import time
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

@api_view(['POST'])
@permission_classes([AllowAny])
def create_user(request):
    """
    Endpoint to create a new user.
    """
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')

    if not all([username, email, password]):
        return Response({"error": "Username, email, and password are required."}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email=email).exists():
        return Response({"error": "Email already in use."}, status=status.HTTP_400_BAD_REQUEST)

    new_user = User(username=username, email=email, password=password)
    new_user.save()

    return Response({
        "message": "User created successfully.",
        "api_key": new_user.api_key,
        "is_superuser": new_user.is_superuser
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def assistant_endpoint(request):
    # Retrieve the API key from settings for OpenAI authentication
    openai_api_key = settings.OPENAI_API_KEY

    # Get the API key from headers for user authentication
    user_api_key = request.headers.get('X-API-Key')
    if not user_api_key:
        return Response({"error": "User API key required"}, status=status.HTTP_401_UNAUTHORIZED)

    message = request.data.get('message')
    assistant_id = request.data.get('assistant_id')  # This will correspond to Assistant.model
    thread_id = request.data.get('thread_id')
    
    if not assistant_id:
        return Response({"error": "Assistant ID is required"}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user  # Get the authenticated user

    # Get or create the Assistant object based on the model field
    assistant, _ = Assistant.objects.get_or_create(model=assistant_id)
    chat = None
    # If thread_id is provided, try to get the existing Chat
    if thread_id:
        chat = Chat.objects.get(user=user, thread_id=thread_id)

    # Initialize the assistant with OpenAI API key
    openai_assistant = AssistantAPI(api_key=openai_api_key, assistant_id=assistant_id, thread_id=thread_id)
    
    response = asyncio.run(openai_assistant(message))

    # Save the user message and assistant response
    if chat:
        ChatMessage.objects.create(chat=chat, sender='user', content=message)
        ChatMessage.objects.create(chat=chat, sender='assistant', content=response)

    return Response({
        "datetime": datetime.now().isoformat(),
        "assistant_id": assistant_id,
        "thread_id": thread_id,
        "user_message": message,
        "assistant_response": response
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_endpoint(request):
    # Retrieve the API key from settings for OpenAI authentication
    openai_api_key = settings.OPENAI_API_KEY

    # Get the API key from headers for user authentication
    user_api_key = request.headers.get('X-API-Key')
    if not user_api_key:
        return Response({"error": "User API key required"}, status=status.HTTP_401_UNAUTHORIZED)

    message = request.data.get('message')
    system = request.data.get('system')
    max_tokens = int(request.data.get('max_tokens', 4096))
    model = request.data.get('model', "gpt-4o")
    if model == "o1-preview" or "o1-mini":
        system = None
        max_tokens = None
    temperature = float(request.data.get('temperature', 0.7))
    top_p = float(request.data.get('top_p', 1.0))
    frequency_penalty = float(request.data.get('frequency_penalty', 0.0))
    presence_penalty = float(request.data.get('presence_penalty', 0.0))
    assistant_id = request.data.get('assistant_id')  # This will correspond to Assistant.model
    thread_id = request.data.get('thread_id')

    user = request.user  # Get the authenticated user

    if not assistant_id:
        return Response({"error": "Assistant ID is required"}, status=status.HTTP_400_BAD_REQUEST)

    # Get or create the Assistant object based on the model field
    assistant, _ = Assistant.objects.get_or_create(model=assistant_id)

    chat = None
    # If thread_id is provided, try to get the existing Chat
    if thread_id:
        chat = Chat.objects.get(user=user, thread_id=thread_id)

    # Extract conversation history from request
    conversation_history_json = request.data.get('conversation_history')
    if conversation_history_json:
        try:
            conversation_history = json.loads(conversation_history_json)
        except json.JSONDecodeError:
            return Response({"error": "Invalid conversation history format."}, status=status.HTTP_400_BAD_REQUEST)
    else:
        conversation_history = []

    # Reconstruct the conversation history, including images
    messages = []
    for msg in conversation_history:
        role = msg['sender']  # Should be 'user', 'assistant', or 'system'
        content = []
        if 'content' in msg and msg['content']:
            content.append({'type': 'text', 'text': msg['content']})
        if 'images' in msg and msg['images']:
            for img_b64 in msg['images']:
                content.append({
                    'type': 'image_url',
                    'image_url': {
                        'url': f"data:image/png;base64,{img_b64}"
                    }
                })
        messages.append({'role': role, 'content': content})

    # Initialize MemoryHandler with existing messages
    memory = MemoryHandler(system_prompt=system, messages=messages)

    # Process uploaded images
    images_base64 = []
    image_files = request.FILES.getlist('image')  # Get all uploaded images
    if image_files:
        for image_file in image_files:
            try:
                # Read the uploaded image file and encode to base64
                image_data = image_file.read()
                base64_image = base64.b64encode(image_data).decode('utf-8')
                images_base64.append(base64_image)
            except Exception as e:
                return Response({"error": f"Failed to process image: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Add the new user message and images to the memory
    memory.add_user_message(text=message, images=images_base64)

    # Initialize the client with OpenAI API key and memory
    openai_client = Completion(
        api_key=openai_api_key,
        system=system,
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        top_p=top_p,
        frequency_penalty=frequency_penalty,
        presence_penalty=presence_penalty,
        memory=memory  # Pass memory here
    )

    # Call the completion method
    try:
        response = asyncio.run(openai_client.completion())
    except Exception as e:
        return Response({"error": f"Error during OpenAI completion: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    # Extract assistant's reply
    assistant_response = response.text if hasattr(response, 'text') else ''

    # Add assistant's response to memory
    memory.add_assistant_message(text=assistant_response)

    return Response({
        "datetime": datetime.now().isoformat(),
        "user_message": message,
        "assistant_response": assistant_response,
        "thread_id": thread_id,
        "assistant_id": assistant_id
    }, status=status.HTTP_200_OK)

def old(request):
    return render(request, 'old.html')

def snake(request):
    return render(request, 'snake.html')

def index(request):
    return render(request, 'index.html')

def jobs(request):
    return render(request, 'jobs.html')

def delete_old_files():
    """
    Deletes files in UPLOADED_DOCUMENTS_DIR older than 24 hours.
    """
    cutoff_time = time.time() - 24 * 3600  # 24 hours ago
    for file_name in os.listdir(settings.UPLOADED_DOCUMENTS_DIR):
        file_path = os.path.join(settings.UPLOADED_DOCUMENTS_DIR, file_name)
        if os.path.isfile(file_path):
            file_mod_time = os.path.getmtime(file_path)
            if file_mod_time < cutoff_time:
                try:
                    os.remove(file_path)
                    print(f"Deleted old file: {file_name}")
                except Exception as e:
                    print(f"Error deleting file {file_name}: {e}")

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_chat_history(request):
    """
    Endpoint to retrieve chat history for the authenticated user.
    Executes delete_old_files to remove old documents.
    """
    # Delete old files
    delete_old_files()

    user = request.user
    chats = Chat.objects.filter(user=user).order_by('-creation_date')  # Latest chats first
    chat_data = []
    for chat in chats:
        print(f"assistant: {chat.assistant.name if chat.assistant else 'None'}")
        chat_data.append({
            'thread_id': chat.thread_id,
            'assistant_id': chat.assistant.name if chat.assistant else None,  # Using the 'model' field as assistant_id
            'chat_description': chat.chat_description or f"Chat {chat.id}",
            'creation_date': chat.creation_date.isoformat(),
        })
    return Response({'chats': chat_data}, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def load_chat_messages(request):
    """
    Endpoint to load messages of a specific chat.
    """
    user = request.user
    thread_id = request.data.get('thread_id')
    if not thread_id:
        return Response({"error": "Thread ID is required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        chat = Chat.objects.get(user=user, thread_id=thread_id)
    except Chat.DoesNotExist:
        return Response({"error": "Chat not found."}, status=status.HTTP_404_NOT_FOUND)
    messages = ChatMessage.objects.filter(chat=chat).order_by('sent_at')
    message_data = []
    for message in messages:
        message_data.append({
            'sender': message.sender,
            'content': message.content,
            'sent_at': message.sent_at.isoformat(),
        })
    return Response({
        'messages': message_data,
        'assistant_id': chat.assistant.name if chat.assistant else None  # Include assistant_id in response
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_file(request):
    """
    Endpoint to upload a file related to a chat.
    """
    user = request.user
    purpose = request.data.get('purpose')
    mime_type = request.data.get('mime_type')
    file = request.FILES.get('file')

    # Get the latest chat for the user
    chat = Chat.objects.filter(user=user).order_by('-creation_date').first()
    if not chat:
        return Response({"error": "No chat found for the user."}, status=status.HTTP_404_NOT_FOUND)

    chat_id = str(chat.id)

    # Validate inputs
    if not all([chat_id, purpose, mime_type, file]):
        return Response({"error": "All fields (chat_id, purpose, mime_type, file) are required."}, status=status.HTTP_400_BAD_REQUEST)

    # Retrieve the API key from settings
    openai_api_key = settings.OPENAI_API_KEY

    # Initialize the upload client
    upload_client = Upload(api_key=openai_api_key)

    # Save the uploaded file to a temporary file
    try:
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            for chunk in file.chunks():
                temp_file.write(chunk)
            temp_file_path = temp_file.name

        # Invoke the upload asynchronously
        upload_response = asyncio.run(upload_client(
            chat_id=chat_id,
            file_path=temp_file_path,
            purpose=purpose,
            mime_type=mime_type
        ))
    except Exception as e:
        return Response({"error": f"Error during file upload: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        # Clean up the temporary file
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

    # Successful response
    return Response({
        "message": "File uploaded successfully.",
        "upload_details": upload_response
    }, status=status.HTTP_201_CREATED)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def search(request):
    """
    Endpoint to handle search requests.
    """
    serper_api_key = settings.SERPER_API_KEY
    openai_api_key = settings.OPENAI_API_KEY
    searchQuery = request.data.get('searchQuery')
    searchMail = request.data.get('searchMail')

    search = Search(api_key=serper_api_key, num=20, country='de', location='Germany', language='de')
    result = search(searchQuery)
    completion = ""
    if searchMail != "" or " " or None:
        system = """Identify and filter a list of URLs from JSON input based on their thematic relevance to a specified name or entity. Extract valid links and exclude irrelevant ones based on a clear name-matching logic.

---

### Detailed Instructions

#### Objective:
Analyze JSON input containing search results, extract URLs, and validate them based on whether they are relevant to the provided name or entity. Return only the valid URLs that satisfy the content criteria.

---

### Steps:

1. **Input Processing**:
   - Parse the JSON input to extract all URLs from fields such as `"link"` in sections like `"organic"`, `"peopleAlsoAsk"`, and `"relatedSearches"`.
   - Each URL must be processed in its entirety (e.g., `https://www.example.com/profile/Name`).

2.1 **Name Matching**:
   - Extract key components of the provided name or entity (e.g., `John Doe`).
   - Validate URLs based on:
     - Direct match of the name in the URL path (e.g., `/profile/John_Doe`).
     - Case-insensitive partial matches or common name variations (e.g., `john-doe`).
   - Missmatched URLs would also be:
     - Case-insensitive partial matches or common name variations that does not match the name of the person searched for (e.g., `Kaspar_Etter2` instead of `John_Doe061506`).

2.1 **Domain Matching**:
   - Beside extracting key components of the provided name or entity, also extract domains related to the company searched for.
   - Validate URLs based on:
     - Direct match of the name of the domain (e.g., `companyxyz.org`).
     - Add the name of the company domain itself to the list of extracted links (e.g., `https://companyxyz.org/`).
     - Case-insensitive partial matches or common domain name variations (e.g., `companyxyz.com/impressum`, `company-xyz.net/contacts/john_doe`).     
     - Add the domain from the user message to the list of domains, if not contained add 'https://' to the domain before adding it to the list. Also add the domain the user send to the list even so the domain wasn't contained in the search results send!     

3. **Content Evaluation**:
   - Ensure links are thematically relevant to the provided name or entity.
   - Exclude URLs where the name appears in unrelated contexts (e.g., `/profile/Mary_Smith` when searching for `John Doe`).

4. **List Creation**:
   - Include only URLs that meet the thematic relevance criteria.
   - Ensure duplicates are retained if they appear multiple times in the input.

5. **Output Formatting**:
   - Return the valid URLs in a plain-text format, each on a new line.
   - Ensure there are no blank lines or additional characters.

6. **Preferred website results**:
    - Filter for websites related to the named company based on it's name and the domain send by the user.
    - Filter for websites of buissness networks like LinkedIn and Xing as long as they are related to the person we are searching for!

---

### Output Format:

- **Search Query:** John Doe at companyXYZ AG john_doe@company-xyz.de
- The output should consist of valid URLs, each on a new line, such as:
  ```
  https://www.xing.com/profile/John_Doe
  https://de.linkedin.com/in/john-doe-12345
  https://company-xyz.de/contacts
  https://companyxyz.com/about_us

  ```

---

### Examples

#### Input:
```json
{
  "organic": [
    {"link": "https://www.xing.com/profile/John_Doe"},
    {"link": "https://de.linkedin.com/in/john-doe-12345"},
    {"link": "https://www.xing.com/profile/Mary_Smith"},
    {"link": "https://company-xyz.de/contacts"},
    {"link": "https://companyxyz.com/about_us"},
    {"link": "https://companyxxzy.com/news"},
  ]
}
```

#### Output:
```
https://www.xing.com/profile/John_Doe
https://de.linkedin.com/in/john-doe-12345
https://company-xyz.de/contacts
https://companyxyz.com/about_us
```

---

### Important
- Only send the domains, do not add any kind of text beside the list of domains to your answer!
- This is important do to the follow up processing of the link list, since it makes it easyer to retrieve the links from the list! 

### Notes
- Special attention should be given to name normalization and variation handling (e.g., treating `john-doe` and `john_doe` as equivalent).
- Ignore links entirely unrelated to the name, even if the domain seems plausible.
- Ensure output integrity, avoiding missing or malformed URLs."""

        search = Search(api_key=serper_api_key, num=20, country='de', location='Germany', language='de')
        openai_client = Completion(
            api_key=openai_api_key,
            system=system,
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=4096,
        )
        result = search(searchQuery)
        completion = asyncio.run(openai_client.completion(message=f"please filter all search results that are fitting to our search query: '{searchQuery}', the ones related to the company as well as the ones that have this domain (even if not contained in the search results): {searchMail.split("@")[1]} and finaly links from buissness network pages like linkedin and xing\n\nHere are the search results: {result.json()}"))
    else:    
        system = """Identify and filter a list of domain names from URLs provided in JSON input, based on their content suitability as per provided criteria.

Examine the JSON input for valid URLs and extract domains. Validate each domain based on content criteria, and return a list of suitable domains in the required format.

# Steps

1. **Input Processing**:
   - Parse through the given JSON input containing search results.
   - Extract all URLs from fields such as `"link"` found in sections like `"organic"`, `"peopleAlsoAsk"`, and `"relatedSearches"`.

2. **Domain Extraction**:
   - From the URLs, send the complete linkg (e.g. https://www.blick-aktuell.de/Nachrichten/Archiv_2018_10_22.html?nLoadItems=718).

3. **Content Evaluation**:
   - Assess each domain to determine its suitability based on the described or inferred content criteria.

4. **List Creation**:
   - Include only the domains that meet all content criteria requirements.
   - Add domains that fit the criteria to the output list, ensuring to include duplicates if they occur multiple times in the input.

5. **Formatting the Output**:
   - Write each selected domain on a new line in the output.

# Output Format

- The output should consist of the valid domains, each on a new line, without any additional characters or blank lines.
- Example:
  ```
  https://www.blick-aktuell.de/Nachrichten/Archiv_2018_10_22.html?nLoadItems=718
  https://media.licdn.com/dms/image/sync/v2/D4D27AQEmBJtsPkHK2g/articleshare-shrink_800/articleshare-shrink_800/0/1712068075831?e=2147483647&v=beta&t=8KCmOULHrZgo6QZnRJnEQgScDdRg2WgCcQsedmnc5bs
  https://mathiasedrich.de/pdf/rwt-magazin_1808.pdf
  https://licdn.com/dms/articleshare-shrink_800/articleshare-shrink_800/
  ```

# Notes

- Ensure to handle and include duplicate domains if they appear multiple times as valid links.
- The final output must follow the exact format as given, with no additional lines or characters.
- Special attention should be given to parsing URLs correctly to ensure proper domain extraction."""
        openai_client = Completion(
            api_key=openai_api_key,
            system=system,
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=4096,
        )
        completion = asyncio.run(openai_client.completion(message=f"please filter all search results that are fitting to our search query: '{searchQuery}'\n\nHere are the search results: {result.json()}"))
    
    assistant_response = completion.text if hasattr(completion, 'text') else ''
    response = assistant_response.split("```")
    response_lines = response[1].split("\n")
    links = response_lines[1:-1]

    crawler = Crawler()

    # For placeholder, return echo response
    return Response({
         "results": assistant_response
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def search(request):
    """
    Endpoint to handle search requests.
    """
    serper_api_key = settings.SERPER_API_KEY
    openai_api_key = settings.OPENAI_API_KEY
    searchQuery = request.data.get('searchQuery')
    searchMail = request.data.get('searchMail')

    search = Search(api_key=serper_api_key, num=20, country='de', location='Germany', language='de')
    result = search(searchQuery)
    completion = ""
    if searchMail != "" or " " or None:
        system = """Identify and filter a list of URLs from JSON input based on their thematic relevance to a specified name or entity. Extract valid links and exclude irrelevant ones based on a clear name-matching logic.

---

### Detailed Instructions

#### Objective:
Analyze JSON input containing search results, extract URLs, and validate them based on whether they are relevant to the provided name or entity. Return only the valid URLs that satisfy the content criteria.

---

### Steps:

1. **Input Processing**:
   - Parse the JSON input to extract all URLs from fields such as `"link"` in sections like `"organic"`, `"peopleAlsoAsk"`, and `"relatedSearches"`.
   - Each URL must be processed in its entirety (e.g., `https://www.example.com/profile/Name`).

2.1 **Name Matching**:
   - Extract key components of the provided name or entity (e.g., `John Doe`).
   - Validate URLs based on:
     - Direct match of the name in the URL path (e.g., `/profile/John_Doe`).
     - Case-insensitive partial matches or common name variations (e.g., `john-doe`).
   - Missmatched URLs would also be:
     - Case-insensitive partial matches or common name variations that does not match the name of the person searched for (e.g., `Kaspar_Etter2` instead of `John_Doe061506`).

2.1 **Domain Matching**:
   - Beside extracting key components of the provided name or entity, also extract domains related to the company searched for.
   - Validate URLs based on:
     - Direct match of the name of the domain (e.g., `companyxyz.org`).
     - Add the name of the company domain itself to the list of extracted links (e.g., `https://companyxyz.org/`).
     - Case-insensitive partial matches or common domain name variations (e.g., `companyxyz.com/impressum`, `company-xyz.net/contacts/john_doe`).     
     - Add the domain from the user message to the list of domains, if not contained add 'https://' to the domain before adding it to the list. Also add the domain the user send to the list even so the domain wasn't contained in the search results send!     

3. **Content Evaluation**:
   - Ensure links are thematically relevant to the provided name or entity.
   - Exclude URLs where the name appears in unrelated contexts (e.g., `/profile/Mary_Smith` when searching for `John Doe`).

4. **List Creation**:
   - Include only URLs that meet the thematic relevance criteria.
   - Ensure duplicates are retained if they appear multiple times in the input.

5. **Output Formatting**:
   - Return the valid URLs in a plain-text format, each on a new line.
   - Ensure there are no blank lines or additional characters.

6. **Preferred website results**:
    - Filter for websites related to the named company based on it's name and the domain send by the user.
    - Filter for websites of buissness networks like LinkedIn and Xing as long as they are related to the person we are searching for!

---

### Output Format:

- **Search Query:** John Doe at companyXYZ AG john_doe@company-xyz.de
- The output should consist of valid URLs, each on a new line, such as:
https://www.xing.com/profile/John_Doe https://de.linkedin.com/in/john-doe-12345 https://company-xyz.de/contacts https://companyxyz.com/about_us

sql
Copy code

---

### Important
- Only send the domains, do not add any kind of text beside the list of domains to your answer!
- This is important do to the follow up processing of the link list, since it makes it easyer to retrieve the links from the list! 

### Notes
- Special attention should be given to name normalization and variation handling (e.g., treating `john-doe` and `john_doe` as equivalent).
- Ignore links entirely unrelated to the name, even if the domain seems plausible.
- Ensure output integrity, avoiding missing or malformed URLs."""
        openai_client = Completion(
            api_key=openai_api_key,
            system=system,
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=4096,
        )
        result = search(searchQuery)
        completion = asyncio.run(openai_client.completion(message=f"please filter all search results that are fitting to our search query: '{searchQuery}', the ones related to the company as well as the ones that have this domain (even if not contained in the search results): {searchMail.split('@')[1]} and finaly links from buissness network pages like linkedin and xing\n\nHere are the search results: {result.json()}"))
    else:    
        system = """Identify and filter a list of domain names from URLs provided in JSON input, based on their content suitability as per provided criteria.

Examine the JSON input for valid URLs and extract domains. Validate each domain based on content criteria, and return a list of suitable domains in the required format.

# Steps

1. **Input Processing**:
 - Parse through the given JSON input containing search results.
 - Extract all URLs from fields such as `"link"` found in sections like `"organic"`, `"peopleAlsoAsk"`, and `"relatedSearches"`.

2. **Domain Extraction**:
 - From the URLs, send the complete linkg (e.g. https://www.blick-aktuell.de/Nachrichten/Archiv_2018_10_22.html?nLoadItems=718).

3. **Content Evaluation**:
 - Assess each domain to determine its suitability based on the described or inferred content criteria.

4. **List Creation**:
 - Include only the domains that meet all content criteria requirements.
 - Add domains that fit the criteria to the output list, ensuring to include duplicates if they occur multiple times in the input.

5. **Formatting the Output**:
 - Write each selected domain on a new line in the output.

# Output Format

- The output should consist of the valid domains, each on a new line, without any additional characters or blank lines.
- Example:
https://www.blick-aktuell.de/Nachrichten/Archiv_2018_10_22.html?nLoadItems=718 https://media.licdn.com/dms/image/sync/v2/D4D27AQEmBJtsPkHK2g/articleshare-shrink_800/articleshare-shrink_800/0/1712068075831?e=2147483647&v=beta&t=8KCmOULHrZgo6QZnRJnEQgScDdRg2WgCcQsedmnc5bs https://mathiasedrich.de/pdf/rwt-magazin_1808.pdf https://licdn.com/dms/articleshare-shrink_800/articleshare-shrink_800/

vbnet
Copy code

# Notes

- Ensure to handle and include duplicate domains if they appear multiple times as valid links.
- The final output must follow the exact format as given, with no additional lines or characters.
- Special attention should be given to parsing URLs correctly to ensure proper domain extraction."""
        openai_client = Completion(
            api_key=openai_api_key,
            system=system,
            model="gpt-4o-mini",
            temperature=0.6,
            max_tokens=4096,
        )
        completion = asyncio.run(openai_client.completion(message=f"please filter all search results that are fitting to our search query: '{searchQuery}'\n\nHere are the search results: {result.json()}"))

    assistant_response = completion.text if hasattr(completion, 'text') else ''
    # Extract links from the assistant's response
    response_parts = assistant_response.strip().split("```")
    if len(response_parts) >= 2:
        response_lines = response_parts[1].strip().split("\n")
        links = [line.strip() for line in response_lines if line.strip()]
    else:
        # Fallback if the assistant's response doesn't contain code blocks
        links = [line.strip() for line in assistant_response.strip().split("\n") if line.strip()]

    crawler = Crawler()

    # Function to crawl links asynchronously
    async def crawl_links(links):
        async with aiohttp.ClientSession() as session:
            web_contents = await crawler(links, session)
        return web_contents

    # Use async_to_sync to run the async function in a synchronous context
    from asgiref.sync import async_to_sync
    web_contents = async_to_sync(crawl_links)(links)

    # For placeholder, return the crawled web contents
    return Response({
        "results": assistant_response,
        "web_contents": web_contents
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def semantic_search(request):
    """
    Endpoint to create querys for semantic search.
    """
    openai_api_key = settings.OPENAI_API_KEY
    message = request.data.get('query')
    client = Completion(openai_api_key, "You are an assistant which helps formulating search querys for semantic search", model="gpt-3.5-turbo")
    result = asyncio.run(client.completion(f"Rewrite this into a query that helps in executing semantic while rewriting the search query to clearly express the meaning and intent behind: '{message}'"))
    return Response({
        "search_query": result.text,
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_batch_request(request):
    """
    Endpoint to create a batch request with multiple items and metadata.
    """
    # Retrieve batch metadata
    requests_data = request.data.get('requests', [])  # List of requests: [{system, user, model}]
    description = request.data.get('description', 'Batch Request')
    max_tokens = int(request.data.get('max_tokens', 4096))

    if not requests_data:
        return Response({"error": "Requests data is required."}, status=status.HTTP_400_BAD_REQUEST)

    # Initialize BatchRequests with OpenAI API key
    openai_api_key = settings.OPENAI_API_KEY
    batch_handler = BatchRequests(api_key=openai_api_key, max_tokens=max_tokens)

    try:
        # Start creating the batch requests
        for request_item in requests_data:
            system = request_item.get('system', '')
            user = request_item.get('user', '')
            model = request_item.get('model', 'gpt-4o')

            if not all([system, user, model]):
                return Response(
                    {"error": "Each request must include 'system', 'user', and 'model'."},
                    status=status.HTTP_400_BAD_REQUEST
                )

            # Add request to the batch
            async_to_sync(batch_handler.define_request)(custom_id=None, model=model, system=system, user=user)

        # Finalize the batch creation
        batch_result = async_to_sync(batch_handler.create_batch)(metadata={"description": description})

        logger.info(f"Request Data: {request.data}")

        return Response({
            "message": "Batch created successfully.",
            "batch_id": batch_result['batch_id'],
            "metadata": batch_result,
            "requests_count": len(requests_data),
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
            logger.error(f"Error creating batch: {str(e)}")
            return Response({"error": f"Failed to create batch: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_batches(request):
    """
    Endpoint to retrieve all batch details.
    """
    try:
        # Fetch all batches from the database
        api_key = settings.OPENAI_API_KEY
        batches = Batch.objects.all().order_by('-created_at')

        # Create an instance of BatchRequests
        batch_request_handler = BatchRequests(api_key=api_key, max_tokens=1000)

        # Prepare a list of batch IDs for status checking
        batch_ids = [batch.batch_id for batch in batches]

        # Fetch batch statuses asynchronously
        async def fetch_batch_statuses(batch_ids):
            async with aiohttp.ClientSession() as session:
                tasks = [batch_request_handler.check_batch_status(batch_id=batch_id) for batch_id in batch_ids]
                return await asyncio.gather(*tasks)

        # Use async_to_sync to execute the async function in this sync context
        from asgiref.sync import async_to_sync
        batch_statuses = async_to_sync(fetch_batch_statuses)(batch_ids)

        # Combine batch details with their statuses
        batch_data = [
            {
                "id": batch.id,
                "created_at": batch.created_at.isoformat(),
                "finished_at": batch.finished_at.isoformat() if batch.finished_at else None,
                "finished": batch.finished,
                "canceled": batch.canceled,
                "batch_id": batch.batch_id,
                "metadata": batch.metadata,
                "status": status  # Add the fetched status here
            }
            for batch, status in zip(batches, batch_statuses)
        ]

        return Response({"batches": batch_data}, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": f"Failed to fetch batches: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def get_batch_requests(request):
    """
    Endpoint to retrieve all requests for a specific batch.
    """
    api_key = settings.OPENAI_API_KEY
    logger.info("Received request to fetch batch requests.")
    batch_id = request.data.get('batch_id')
    batch = BatchRequests(api_key=api_key, max_tokens=1000)
    
    async def retrieve_batch_results(batch_id):
        async with aiohttp.ClientSession() as session:
            tasks = [batch.retrieve_batch_results(batch_id=batch_id)]
            return await asyncio.gather(*tasks)
        
    if not batch_id:
        logger.warning("Batch ID is missing in the request.")
        return Response({"error": "Batch ID is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        logger.debug("Fetching batch requests for Batch ID: %s", batch_id)
        # Fetch all requests associated with the given batch_id
        batch_requests = BatchRequest.objects.filter(batch__batch_id=batch_id).order_by('id')

        if not batch_requests.exists():
            logger.info("No requests found for Batch ID: %s", batch_id)
            return Response({"error": "No requests found for the given batch ID."}, status=status.HTTP_404_NOT_FOUND)
        
        logger.debug("Found %d requests for Batch ID: %s", batch_requests.count(), batch_id)
        ## from asgiref.sync import async_to_sync
        ## batch_statuses = async_to_sync(retrieve_batch_results)(batch_id)
        
        # Prepare request data
        request_data = [
            {
                "id": request_item.id,
                "model": request_item.model,
                "system_instructions": request_item.system_instructions,
                "user_message": request_item.user_message,
                'assistant_message': request_item.assistant_message,
                "max_tokens": request_item.max_tokens,
                "request_id": request_item.custom_id,
            }
            for request_item in batch_requests
        ]

        # Include batch status in the response
        logger.info("Successfully fetched batch requests for Batch ID: %s", batch_id)
        return Response(
            {
                "requests": request_data,
            },
            status=status.HTTP_200_OK
        )

    except Exception as e:
        logger.error(
            "Error fetching batch requests for Batch ID: %s. Error: %s",
            batch_id,
            str(e),
            exc_info=True
        )
        return Response(
            {"error": f"Failed to fetch batch requests: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


    except Exception as e:
        logger.error("Error fetching batch requests for Batch ID: %s. Error: %s", batch_id, str(e), exc_info=True)
        return Response({"error": f"Failed to fetch batch requests: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def cancel_batch(request):
    """
    Endpoint to cancel a batch by its ID.
    """
    batch_id = request.data.get('batch_id')
    if not batch_id:
        return Response({"error": "Batch ID is required."}, status=status.HTTP_400_BAD_REQUEST)

    openai_api_key = settings.OPENAI_API_KEY
    batch_handler = BatchRequests(api_key=openai_api_key, max_tokens=4096)

    try:
        cancel_response = asyncio.run(batch_handler.cancel_batch(batch_id=batch_id))
        return Response({
            "message": "Batch canceled successfully.",
            "details": cancel_response,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": f"Failed to cancel batch: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def retrieve_batch_result(request):
    """
    Endpoint to retrieve the results of a completed batch.
    """
    batch_id = request.query_params.get('batch_id')
    if not batch_id:
        return Response({"error": "Batch ID is required."}, status=status.HTTP_400_BAD_REQUEST)

    openai_api_key = settings.OPENAI_API_KEY
    batch_handler = BatchRequests(api_key=openai_api_key, max_tokens=4096)

    try:
        results = asyncio.run(batch_handler.retrieve_batch_results(batch_id=batch_id))
        return Response({
            "batch_id": batch_id,
            "results": results,
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": f"Failed to retrieve batch results: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def job_detail(request, batch_id):
    """
    View to render the jobs.html template with the specified batch_id.
    """
    
    context = {
        'batch_id': batch_id
    }
    return render(request, 'jobs.html', context)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def chat_with_doc(request):
    """
    Endpoint to retrieve the context based on the user's message and uploaded documents.
    """
    # Retrieve the API key from settings
    openai_api_key = settings.OPENAI_API_KEY
    embedding_model = "text-embedding-3-small"  # Replace with your preferred model

    # Define paths for the FAISS index and document mapping
    faiss_index_file = os.path.join(settings.BASE_DIR, "faiss_index.idx")
    mapping_file = os.path.join(settings.BASE_DIR, "document_mapping.json")
    embedding_client = Embeddings(openai_api_key, embedding_model)
    doc_process = DocumentProcessor()

    # Get the 'message' from the request
    message = request.data.get('message')
    if not message:
        return Response({"error": "Message is required."}, status=status.HTTP_400_BAD_REQUEST)

    # Handle file uploads
    files = request.FILES.getlist('documents')  # Expecting files in 'documents' field
    uploaded_files = []

    web_search = request.data.get('web_search')
    temp_pdf = None  # To keep track of the temporary PDF file

    if web_search:
        try:
            # Create a temporary PDF file
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf', prefix='web_search_', dir=tempfile.gettempdir())
            temp_pdf_path = temp_pdf.name

            # Use reportlab to generate PDF
            c = canvas.Canvas(temp_pdf_path, pagesize=letter)
            width, height = letter
            # Define text object
            text_object = c.beginText(40, height - 50)  # Starting position

            # Split the web_search text into lines to fit the PDF
            lines = web_search.split('\n')
            for line in lines:
                text_object.textLine(line)

            c.drawText(text_object)
            c.save()

            logger.info(f"Temporary PDF for 'web_search' created at {temp_pdf_path}")

            # Add the temp PDF path to uploaded_files
            uploaded_files.append(temp_pdf_path)

        except Exception as e:
            logger.error(f"Error creating temporary PDF from 'web_search': {str(e)}")
            return Response({"error": f"Error processing 'web_search' data: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    if files:
        for file in files:
            # Compute the file hash to check for duplicates
            hasher = hashlib.md5()
            for chunk in file.chunks():
                hasher.update(chunk)
            file_hash = hasher.hexdigest()

            # Define the file path using the hash
            file_extension = os.path.splitext(file.name)[1]
            file_name = f"{file_hash}{file_extension}"
            file_path = os.path.join(settings.UPLOADED_DOCUMENTS_DIR, file_name)

            if os.path.exists(file_path):
                # File already exists, reuse it
                logger.info(f"File {file.name} already exists. Reusing the existing file.")
                # Update the modification time to extend its lifespan
                os.utime(file_path, None)
            else:
                # Save the file
                with open(file_path, 'wb') as f:
                    for chunk in file.chunks():
                        f.write(chunk)
                # Set the modification time to now
                os.utime(file_path, None)
                logger.info(f"File {file.name} saved successfully.")

            uploaded_files.append(file_path)

    # Initialize FAISS index and document mapping
    vector_dimension = 1536  # Adjust based on your embedding model
    index = None
    document_mapping = []

    # Load existing FAISS index and document mapping if they exist
    if os.path.exists(faiss_index_file) and os.path.exists(mapping_file):
        index = faiss.read_index(faiss_index_file)
        with open(mapping_file, 'r', encoding='utf-8') as f:
            document_mapping = json.load(f)
    else:
        # Initialize new FAISS index
        index = faiss.IndexFlatL2(vector_dimension)

    ALLOWED_EXTENSIONS = [
        '.pdf', '.txt', '.html', '.htm', '.xml', '.csv', '.md', '.py', '.js', '.ts', '.jsx', '.tsx', '.java',
        '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.go', '.rs', '.swift', '.kt', '.kts', '.scala',
        '.sql', '.json', '.jsonl', '.yaml', '.yml', '.ini', '.cfg', '.conf', '.bat', '.sh', '.r', '.pl',
        '.tex', '.log', '.css', '.scss', '.less', '.dart', '.erl', '.ex', '.exs', '.lua', '.m', '.mm',
        '.vb', '.vbs', '.ps1', '.psm1', '.psd1', '.asm', '.s', '.properties', '.toml', '.text', '.rmd',
    ]

    # Process and index uploaded documents
    if uploaded_files:
        for file_path in uploaded_files:
            try:
                # Determine the file extension
                _, file_extension = os.path.splitext(file_path)
                file_extension = file_extension.lower()
                
                if file_extension not in ALLOWED_EXTENSIONS:
                    logger.warning(f"File {file_path} has unsupported extension {file_extension} and will be skipped.")
                    continue

                if file_extension == '.pdf':
                    # Load and extract text from the PDF document
                    text = doc_process.load_pdf(file_path)
                    logger.info("Successfully loaded pdf: %s", file_path)
                else:
                    # Open and read the file as text
                    try:
                        with open(file_path, 'r', encoding='utf-8') as f:
                            text = f.read()
                        
                        logger.info("Successfully loaded file: %s", file_path)
                    except UnicodeDecodeError:
                        logger.error(f"Could not read file {file_path} as text.")
                        continue  # Skip this file

                text = doc_process.clean_text(text)

                text = doc_process.clean_text(text)
                # Split the text into chunks
                chunks = doc_process.split_text(text, 500)

                # Generate embeddings for each chunk and add to the index
                for chunk in chunks:
                    # Skip empty chunks
                    if not chunk.strip():
                        continue

                    embedding = asyncio.run(embedding_client(chunk))
                    embedding = np.array(embedding, dtype=np.float32)

                    # Add embedding to FAISS index
                    index.add(embedding.reshape(1, -1))

                    # Add metadata to document mapping
                    metadata = {
                        "title": os.path.basename(file_path),
                        "text": chunk,
                    }
                    document_mapping.append(metadata)

                logger.info(f"Document '{os.path.basename(file_path)}' processed and indexed successfully.")

            except Exception as e:
                logger.error(f"Error processing file {os.path.basename(file_path)}: {str(e)}")
                return Response({"error": f"Error processing file {os.path.basename(file_path)}: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # Save FAISS index and document mapping
        faiss.write_index(index, faiss_index_file)
        with open(mapping_file, 'w', encoding='utf-8') as f:
            json.dump(document_mapping, f, ensure_ascii=False, indent=4)

    # Perform similarity search
    try:
        # Generate embedding for the query
        query_embedding = asyncio.run(embedding_client(message))
        query_embedding = np.array(query_embedding, dtype=np.float32)

        # Search the FAISS index
        top_k = 5
        distances, indices = index.search(query_embedding.reshape(1, -1), top_k)

        # Retrieve the most relevant chunks
        relevant_chunks = []
        for idx in indices[0]:
            if 0 <= idx < len(document_mapping):
                relevant_chunks.append(document_mapping[idx]['text'])
            else:
                logger.warning(f"Index {idx} out of range for document mapping.")

        # Prepare the context from the retrieved chunks
        context = "\n\n".join(relevant_chunks)

    except Exception as e:
        logger.error(f"Error during similarity search: {str(e)}")
        return Response({"error": f"Error during similarity search: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    client = Completion(
        openai_api_key,
        "You are an assistant that refines user search queries to be more detailed and precise based on the user's intent and provided context.",
        model="gpt-4-turbo"
    )

    # Update the prompt passed to the first client.completion call
    query = asyncio.run(client.completion(
        f"Please rewrite the following user query to make it more detailed and precise, considering the provided context.\n\nUser Query: {message}\n\nContext:\n{context}"
    ))
    logger.info("Created refined search query for the following message: %s\nGenerated Query: %s", message, query.text)

    
    # Perform similarity search
    try:
        # Generate embedding for the query
        query_embedding = asyncio.run(embedding_client(query.text))
        query_embedding = np.array(query_embedding, dtype=np.float32)

        # Search the FAISS index
        top_k = 5
        distances, indices = index.search(query_embedding.reshape(1, -1), top_k)

        # Retrieve the most relevant chunks
        relevant_chunks = []
        for idx in indices[0]:
            if 0 <= idx < len(document_mapping):
                relevant_chunks.append(document_mapping[idx]['text'])
            else:
                logger.warning(f"Index {idx} out of range for document mapping.")

        # Prepare the context from the retrieved chunks
        context = "\n\n".join(relevant_chunks)

    except Exception as e:
        logger.error(f"Error during similarity search: {str(e)}")
        return Response({"error": f"Error during similarity search: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # Second, update the system prompt for the second client instantiation
    client = Completion(
        openai_api_key,
        "You are an assistant that extracts and summarizes relevant information from the provided context based on the user's refined query.",
        model="gpt-4-turbo"
    )

    # Update the prompt passed to the second client.completion call
    context = asyncio.run(client.completion(
        f"Based on the following refined query and context, please provide a concise and relevant answer that addresses the user's intent.\n\nRefined Query: {query.text}\n\nContext:\n{context}"
    ))

    # Return the context
    return Response({
        "context": context.text
    }, status=status.HTTP_200_OK)
