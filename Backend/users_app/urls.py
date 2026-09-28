from django.urls import path
from users_app.apis import LoginApi, GoogleLoginApi


urlpatterns = [
    path('login/', LoginApi.as_view(), name='api_login'),
    path('login/google/', GoogleLoginApi.as_view(), name='api_login_google'),
]
