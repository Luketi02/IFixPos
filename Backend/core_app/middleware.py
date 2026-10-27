from django.core.cache import cache
from django.http import JsonResponse
from rest_framework import status


class ModoMantenimientoMiddleware:
    """
    Middleware que verifica si el sistema se encuentra en 'Modo Mantenimiento'
    durante operaciones críticas de restauración de base de datos (CU-23).
    Si está activo, bloquea solicitudes entrantes con HTTP 503, permitiendo únicamente
    operaciones administrativas de copias de seguridad.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if cache.get('MAINTENANCE_MODE'):
            # Permitir rutas exclusivas de restauración o health check si fuera necesario
            if not request.path.startswith('/api/core/backups/'):
                return JsonResponse(
                    {
                        "error": "El sistema se encuentra en modo mantenimiento por restauración de base de datos.",
                        "codigo": "MODO_MANTENIMIENTO"
                    },
                    status=status.HTTP_503_SERVICE_UNAVAILABLE
                )

        return self.get_response(request)
