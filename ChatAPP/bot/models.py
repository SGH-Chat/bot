from django.db import models
import uuid
from django.utils import timezone

class User(models.Model):
    """
    Represents a user in the AI chatbot system.
    """
    username = models.CharField(max_length=50, unique=True)
    email = models.EmailField(max_length=100, unique=True)
    password = models.CharField(max_length=255)  # Encrypted using Falcon1024
    api_key = models.CharField(max_length=36, unique=True, editable=False)  # UUID as text
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('banned', 'Banned'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    is_superuser = models.BooleanField(default=False)  # New field to designate a superuser

    def save(self, *args, **kwargs):
        """
        Override the save method to automatically generate a UUID-based api_key
        if it doesn't already exist.
        """
        if not self.api_key:
            self.api_key = str(uuid.uuid4())
        super().save(*args, **kwargs)

    @property
    def is_authenticated(self):
        """
        Always return True. This is a way to tell if the user is authenticated.
        """
        return True
    
    def __str__(self):
        return self.username

class Assistant(models.Model):
    """
    Represents different AI assistants/models.
    """
    name = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    version = models.CharField(max_length=50, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.model})"

class Chat(models.Model):
    """
    Represents a chat session initiated by a user.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='chats')
    assistant = models.ForeignKey(Assistant, on_delete=models.SET_NULL, null=True, related_name='chats')
    thread_id = models.CharField(max_length=50, unique=True, null=True)  # Field to store custom thread IDs
    creation_date = models.DateTimeField(auto_now_add=True)
    chat_description = models.TextField(blank=True)

    def __str__(self):
        return f"Chat {self.id} by {self.user.username}"

class ChatMessage(models.Model):
    """
    Stores individual messages within a chat.
    """
    class SenderChoices(models.TextChoices):
        USER = 'user', 'User'
        ASSISTANT = 'assistant', 'Assistant'
        SYSTEM = 'system', 'System'

    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.CharField(max_length=10, choices=SenderChoices.choices)
    content = models.TextField()
    sent_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Message {self.id} in Chat {self.chat.id} by {self.sender}"

    class Meta:
        ordering = ['sent_at']
        indexes = [
            models.Index(fields=['chat', 'sent_at']),
            models.Index(fields=['sender']),
        ]
        verbose_name = "Chat Message"
        verbose_name_plural = "Chat Messages"

class ErrorLog(models.Model):
    """
    Logs errors and exceptions within the system.
    """
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='error_logs')
    chat = models.ForeignKey(Chat, on_delete=models.SET_NULL, null=True, blank=True, related_name='error_logs')
    error_message = models.TextField()
    occurred_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Error {self.id} at {self.occurred_at}"

    class Meta:
        ordering = ['-occurred_at']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['chat']),
            models.Index(fields=['occurred_at']),
        ]
        verbose_name = "Error Log"
        verbose_name_plural = "Error Logs"

class FileVault(models.Model):
    """
    Represents a file storage vault for each chat session.
    """
    first_uploaded = models.DateTimeField(auto_now_add=True)
    last_updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"FileVault for {self.chat}"

class FileInfo(models.Model):
    """
    Represents metadata about each uploaded file and its embedding.
    """
    file_vault = models.ForeignKey(FileVault, on_delete=models.CASCADE, related_name='files')
    file_id = models.CharField(max_length=50, unique=True)
    filename = models.CharField(max_length=255)
    bytes = models.BigIntegerField()
    purpose = models.CharField(max_length=50)
    status = models.CharField(max_length=20)
    created_at = models.DateTimeField()
    expires_at = models.DateTimeField(null=True, blank=True)
    object_type = models.CharField(max_length=50, default='upload')
    file_hash = models.CharField(max_length=64, blank=True, null=True)

    # Embedding-related fields
    embedding = models.BinaryField(null=True, blank=True)  # Store embedding vector as binary (e.g., base64-encoded)
    embedding_format = models.CharField(max_length=20, choices=[('base64', 'Base64'), ('float', 'Float')], default='float')
    dimensions = models.IntegerField(default=1536)  # Default dimension size for embeddings
    metadata = models.JSONField(default=dict)  # Store additional metadata like document title, description, etc.

    def __str__(self):
        return f"File: {self.filename} (ID: {self.file_id})"

    class Meta:
        indexes = [
            models.Index(fields=['file_id']),
            models.Index(fields=['purpose']),
            models.Index(fields=['status']),
            models.Index(fields=['embedding_format']),
        ]
        ordering = ['-created_at']

class Batch(models.Model):
    batch_id = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)  # Automatically set to now
    finished_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict)  # Assuming metadata is a JSON field
    finished = models.BooleanField(default=False)
    canceled = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Ensure created_at is set if it is None
        if not self.created_at:
            self.created_at = timezone.now()

        # Calculate finished_at if not already set
        if not self.finished_at:
            self.finished_at = self.created_at + timezone.timedelta(hours=24)

        super().save(*args, **kwargs)

    def __str__(self):
        return f"Batch {self.batch_id} (Finished: {self.finished}, Canceled: {self.canceled})"


class BatchRequest(models.Model):
    """
    Represents individual requests within a batch.
    """
    batch = models.ForeignKey(Batch, on_delete=models.CASCADE, related_name='requests')
    model = models.CharField(max_length=100)
    system_instructions = models.TextField()
    user_message = models.TextField()
    assistant_message = models.TextField(null=True, blank=True)
    max_tokens = models.IntegerField()
    custom_id = models.CharField(max_length=50, unique=True)  # Custom ID for mapping request results
    status = models.CharField(max_length=20, default='pending')  # 'pending', 'completed', 'failed'
    response = models.JSONField(null=True, blank=True)  # The response from OpenAI
    error_message = models.TextField(null=True, blank=True)  # If the request fails

    def __str__(self):
        return f"Request {self.custom_id} in Batch {self.batch.batch_id}"