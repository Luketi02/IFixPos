from typing import Any, Optional
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PaginacionEstandar(PageNumberPagination):
    """
    Paginador estándar de IFixPos (Fase 2 — Auditoría de Rendimiento).
    Define un tamaño de página por defecto de 25 registros, permite ajustarlo
    mediante `?page_size=` y establece un tope máximo de 100 registros por página.
    """
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100


def paginar_queryset_opcional(
    request: Any,
    queryset_o_lista: Any,
    serializer_class: Optional[Any] = None,
    context: Optional[dict] = None
) -> Optional[Response]:
    """
    Helper compatible hacia atrás para vistas basadas en APIView:
    - Si el cliente envía `?page=` en la URL, pagina el queryset/lista con PaginacionEstandar
      y retorna el Response paginado (`count`, `next`, `previous`, `results`).
    - Si no se especifica `?page=`, retorna None para que la vista mantenga su respuesta
      tradicional sin romper contratos existentes del frontend.
    """
    if 'page' not in request.query_params:
        return None

    paginator = PaginacionEstandar()
    pagina = paginator.paginate_queryset(queryset_o_lista, request)
    if pagina is None:
        return None

    if serializer_class is not None:
        datos = serializer_class(pagina, many=True, context=context or {}).data
    else:
        datos = pagina
    return paginator.get_paginated_response(datos)

