from django.urls import path
from core_app.apis import SupportEmailApi

urlpatterns = [
    path('config/email-soporte/', SupportEmailApi.as_view(), name='api_email_soporte'),
]
