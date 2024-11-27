from django.core.management.base import BaseCommand
from django.conf import settings
import os
import time

class Command(BaseCommand):
    help = 'Deletes files in UPLOADED_DOCUMENTS_DIR older than 24 hours'

    def handle(self, *args, **options):
        cutoff_time = time.time() - 24*3600  # 24 hours ago
        for file_name in os.listdir(settings.UPLOADED_DOCUMENTS_DIR):
            file_path = os.path.join(settings.UPLOADED_DOCUMENTS_DIR, file_name)
            if os.path.isfile(file_path):
                file_mod_time = os.path.getmtime(file_path)
                if file_mod_time < cutoff_time:
                    try:
                        os.remove(file_path)
                        self.stdout.write(f"Deleted old file: {file_name}")
                    except Exception as e:
                        self.stderr.write(f"Error deleting file {file_name}: {e}")