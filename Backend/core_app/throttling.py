"""
Políticas de limitación de tasa de peticiones (Rate Limiting / Throttling) para IFixPos (§4.5).
Protege endpoints sensibles (login, OTP, registro, checkout de invitados) frente a abuso o fuerza bruta.
"""
import sys
from django.conf import settings
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle, ScopedRateThrottle


def _throttling_activo() -> bool:
    """
    Determina si el rate limiting debe aplicarse en la petición actual.
    Durante la ejecución de `manage.py test` se desactiva por defecto para no interferir
    con baterías masivas de pruebas, salvo que el test active `@override_settings(THROTTLE_EN_TESTS=True)`.
    """
    if getattr(settings, 'THROTTLE_EN_TESTS', False):
        return True
    if 'test' in sys.argv:
        return False
    return bool(getattr(settings, 'HABILITAR_THROTTLING', True))


class IFixPosAnonRateThrottle(AnonRateThrottle):
    scope = 'anon'

    def allow_request(self, request, view):
        if not _throttling_activo():
            return True
        return super().allow_request(request, view)


class IFixPosUserRateThrottle(UserRateThrottle):
    scope = 'user'

    def allow_request(self, request, view):
        if not _throttling_activo():
            return True
        return super().allow_request(request, view)


class IFixPosScopedRateThrottle(ScopedRateThrottle):
    def allow_request(self, request, view):
        if not _throttling_activo():
            return True
        return super().allow_request(request, view)


class LoginRateThrottle(IFixPosAnonRateThrottle):
    scope = 'login'


class OtpRateThrottle(IFixPosAnonRateThrottle):
    scope = 'otp'


class CheckoutInvitadoRateThrottle(IFixPosAnonRateThrottle):
    scope = 'checkout_invitado'

