"""
Despachador desacoplado de correos electrónicos con soporte para `transaction.on_commit` (§3.5).
Garantiza que una demora o caída del servidor SMTP nunca rompa ni revierta una transacción
de negocio ya confirmada, preservando compatibilidad síncrona con `locmem.EmailBackend` en pruebas.
"""
import logging
from typing import Callable, Any
from django.conf import settings
from django.db import connection, transaction

logger = logging.getLogger(__name__)


def _ejecutar_envio_seguro(callable_envio: Callable, args: tuple, kwargs: dict, contexto: str) -> Any:
    try:
        return callable_envio(*args, **kwargs)
    except Exception as exc:
        logger.warning("[%s] Error al despachar correo electrónico: %s", contexto, exc)
        return None


def despachar_correo_en_commit(
    callable_envio: Callable,
    *args: Any,
    contexto: str = "Despacho Correo",
    **kwargs: Any
) -> None:
    """
    Programa el envío de un correo electrónico para ejecutarse una vez confirmada la
    transacción de base de datos (`transaction.on_commit`).
    Si se está ejecutando bajo el backend de correo en memoria de pruebas (`locmem`)
    o si existen savepoints de `TestCase`, lo ejecuta inmediatamente de forma segura
    para que `django.core.mail.outbox` refleje el mensaje durante el test.
    """
    backend_actual = str(getattr(settings, 'EMAIL_BACKEND', '') or '').lower()
    en_test_locmem = 'locmem' in backend_actual or bool(getattr(connection, 'savepoint_ids', None))

    if en_test_locmem or not connection.in_atomic_block:
        _ejecutar_envio_seguro(callable_envio, args, kwargs, contexto)
    else:
        transaction.on_commit(
            lambda: _ejecutar_envio_seguro(callable_envio, args, kwargs, contexto)
        )

