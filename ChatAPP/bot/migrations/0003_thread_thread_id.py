# Generated by Django 5.1.2 on 2024-10-29 16:00

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bot', '0002_user_is_superuser'),
    ]

    operations = [
        migrations.AddField(
            model_name='thread',
            name='thread_id',
            field=models.CharField(max_length=50, null=True, unique=True),
        ),
    ]
