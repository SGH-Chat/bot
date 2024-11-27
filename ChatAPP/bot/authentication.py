from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import User

class APIKeyAuthentication(BaseAuthentication):
    def authenticate(self, request):
        api_key = request.headers.get('X-API-Key')
        if not api_key:
            return None

        try:
            user = User.objects.get(api_key=api_key)
        except User.DoesNotExist:
            raise AuthenticationFailed('Invalid API key.')

        return (user, None)