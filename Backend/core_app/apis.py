from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from core_app.models import ConfiguracionSistema

class SupportEmailApi(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        try:
            # Buscar por id=23 o clave='emailSoporte'
            config = ConfiguracionSistema.objects.get(id_config=23)
            return Response({"email": config.valor})
        except ConfiguracionSistema.DoesNotExist:
            try:
                config = ConfiguracionSistema.objects.get(clave='emailSoporte')
                return Response({"email": config.valor})
            except ConfiguracionSistema.DoesNotExist:
                return Response({"email": "soporte@ifixnet.com"}) # Fallback de la BD
