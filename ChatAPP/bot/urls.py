from django.urls import path
from . import views
from .models import User
superuser = User.objects.filter(is_superuser=True).first()
if not superuser:
    # Create a default superuser if none exists
    default_superuser = User(username="mm29942", email="mm29942@pm.me", password="Ai#31415926535*", is_superuser=True)
    default_superuser.save()
    print(f"Created default superuser with API Key: {default_superuser.api_key}")

urlpatterns = [
    path('old', views.old, name='old'),
    path('', views.index, name='index'),
    path('jobs', views.jobs, name='jobs'),
    path('jobs/<str:batch_id>/', views.job_detail, name='job_detail'),
    path('snake', views.snake, name='snake'),

    path('api/assistant/', views.assistant_endpoint, name='assistant_endpoint'),
    path('api/chat/', views.chat_endpoint, name='chat_endpoint'),
    path('api/upload/', views.upload_file, name='upload'),

    path('api/get_chat_history/', views.get_chat_history, name='get_chat_history'),
    path('api/load_chat_messages/', views.load_chat_messages, name='load_chat_messages'),

    path('api/search/', views.search, name='search'),
    path('api/semantic_search/', views.semantic_search, name='semantic_search'),
    path('api/chat_with_doc/', views.chat_with_doc, name='chat_with_doc'),

    path('api/batch/create/', views.create_batch_request, name='create_batch_request'),
    path('api/batch/list/', views.get_batches, name='get_batches'),
    path('api/batch/requests/', views.get_batch_requests, name='get_batch_requests'),
    path('api/batch/cancel/', views.cancel_batch, name='cancel_batch'),
    path('api/batch/results/', views.retrieve_batch_result, name='retrieve_batch_result'),
]