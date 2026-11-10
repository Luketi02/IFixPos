"""
Manejador de excepciones unificado para Django REST Framework en IFixPos (§4.1).
Conserva intactas todas las claves de validación esperadas por el frontend y las suites
de pruebas existentes, e inyecta de forma consistente `error` y `codigo_error` cuando
una respuesta de error de DRF solo expone `detail` o errores por campo.
"""
from typing import Any, Optional
from rest_framework.views import exception_handler


def _extraer_primer_mensaje(data: Any) -> Optional[str]:
    if isinstance(data, str):
        return data
    if isinstance(data, list) and data:
        return _extraer_primer_mensaje(data[0])
    if isinstance(data, dict):
        if 'error' in data and isinstance(data['error'], str):
            return data['error']
        if 'detail' in data:
            return _extraer_primer_mensaje(data['detail'])
        for k, v in data.items():
            if k in ('codigo', 'codigo_error', 'campos'):
                continue
            msg = _extraer_primer_mensaje(v)
            if msg:
                return msg
    return None


def manejador_excepciones_ifixpos(exc: Exception, context: dict):
    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(response.data, dict):
        if 'error' not in response.data:
            mensaje_principal = _extraer_primer_mensaje(response.data)
            if mensaje_principal:
                response.data['error'] = str(mensaje_principal)
        if 'codigo_error' not in response.data:
            codigo = getattr(exc, 'default_code', 'error_validacion')
            response.data['codigo_error'] = str(codigo)

    return response

