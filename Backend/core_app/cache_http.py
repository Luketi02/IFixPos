# ==============================================================================
# UTILIDADES DE CACHÉ HTTP Y ETAG PARA CATÁLOGOS PÚBLICOS (core_app/cache_http.py)
# Cumple con Fase 3 (§3.3 y §3.4) de la Auditoría de Backend.
# ==============================================================================

import hashlib
import json
from typing import Any
from rest_framework import status
from rest_framework.response import Response


def respuesta_catalogo_cacheada(
    request: Any,
    datos: Any,
    *,
    max_age: int = 60
) -> Response:
    """
    Genera una respuesta HTTP con encabezados de caché ('Cache-Control' y 'ETag')
    para endpoints públicos de catálogos o listas estáticas/semiestáticas.
    Si el cliente envía un 'If-None-Match' coincidente con el ETag calculado,
    retorna HTTP 304 Not Modified sin transferir nuevamente el cuerpo JSON.
    """
    try:
        payload_serializado = json.dumps(datos, sort_keys=True, ensure_ascii=False, default=str)
        hash_hex = hashlib.sha256(payload_serializado.encode('utf-8')).hexdigest()[:16]
        etag = f'W/"{hash_hex}"'
    except Exception:
        etag = None

    cache_control = f"public, max-age={int(max_age)}"
    if_none_match = None
    if request is not None and hasattr(request, 'META'):
        if_none_match = request.META.get('HTTP_IF_NONE_MATCH')

    if etag and if_none_match and if_none_match.strip() == etag:
        respuesta_304 = Response(status=status.HTTP_304_NOT_MODIFIED)
        respuesta_304['ETag'] = etag
        respuesta_304['Cache-Control'] = cache_control
        return respuesta_304

    respuesta = Response(datos, status=status.HTTP_200_OK)
    if etag:
        respuesta['ETag'] = etag
    respuesta['Cache-Control'] = cache_control
    return respuesta

