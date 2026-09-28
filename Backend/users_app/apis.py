from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from users_app.serializers import LoginInputSerializer, GoogleLoginSerializer
from users_app.services import autenticar_y_obtener_tokens, autenticar_con_google, CredencialesInvalidasError


class LoginApi(APIView):
    """
    Controlador HTTP puro para el manejo del inicio de sesión.
    """
    def post(self, request):
        serializer = LoginInputSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            resultado = autenticar_y_obtener_tokens(
                email=serializer.validated_data['email'],
                password_plano=serializer.validated_data['password']
            )
            return Response(resultado, status=status.HTTP_200_OK)
            
        except CredencialesInvalidasError as e:
            return Response({"detail": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class GoogleLoginApi(APIView):
    """
    Controlador HTTP puro para el manejo del inicio de sesión con Google.
    """
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            resultado = autenticar_con_google(
                google_token=serializer.validated_data['google_token']
            )
            return Response(resultado, status=status.HTTP_200_OK)
            
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
