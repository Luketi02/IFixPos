from typing import Optional
from django.db.models import QuerySet
from django.core.exceptions import ValidationError, PermissionDenied, ObjectDoesNotExist
from geo_app.models import Pais, Provincia, Ciudad, Direccion


def obtener_paises(*, solo_habilitados: bool = True) -> QuerySet[Pais]:
    """
    Retorna el listado de países registrados en el catálogo geográfico.
    Por defecto expone solo los países con cobertura habilitada.
    """
    qs = Pais.objects.all().order_by('nombre_pais')
    if solo_habilitados:
        qs = qs.filter(cobertura_habilitada=True)
    return qs


def obtener_provincias_por_pais(id_pais: int, *, solo_habilitadas: bool = True) -> QuerySet[Provincia]:
    """
    Retorna las provincias pertenecientes a un país específico para alimentar selectores dependientes.
    """
    qs = Provincia.objects.filter(id_pais_id=id_pais).order_by('nombre_provincia')
    if solo_habilitadas:
        qs = qs.filter(cobertura_habilitada=True)
    return qs


def obtener_todas_las_provincias(*, solo_habilitadas: bool = True) -> QuerySet[Provincia]:
    """
    Retorna todas las provincias del sistema ordenadas por nombre.
    """
    qs = Provincia.objects.all().order_by('nombre_provincia')
    if solo_habilitadas:
        qs = qs.filter(cobertura_habilitada=True)
    return qs


def obtener_ciudades_por_provincia(id_provincia: int, *, solo_habilitadas: bool = True) -> QuerySet[Ciudad]:
    """
    Retorna las ciudades pertenecientes a una provincia específica para alimentar selectores dependientes.
    """
    qs = Ciudad.objects.filter(id_provincia_id=id_provincia).order_by('nombre_ciudad')
    if solo_habilitadas:
        qs = qs.filter(cobertura_habilitada=True)
    return qs


def obtener_direcciones_usuario(id_usuario: int, *, solo_activas: bool = False) -> QuerySet[Direccion]:
    """
    CU-47, CU-48, CU-49: Retorna todas las direcciones asociadas a ese usuario,
    usando select_related('id_ciudad__id_provincia__id_pais') para optimizar la consulta.
    Si solo_activas=True, filtra únicamente las que tienen is_active=True.
    """
    qs = Direccion.objects.filter(
        id_usuario_id=id_usuario
    ).select_related('id_ciudad__id_provincia__id_pais').order_by('-id_direccion')
    if solo_activas:
        qs = qs.filter(is_active=True)
    return qs


def obtener_direcciones_activas_usuario(id_usuario: int) -> QuerySet[Direccion]:
    """
    Retorna únicamente las direcciones vigentes (is_active=True) de un usuario.
    Aplica select_related para traer en un solo query Ciudad, Provincia y País.
    """
    return obtener_direcciones_usuario(id_usuario, solo_activas=True)


def obtener_todas_direcciones_usuario(id_usuario: int) -> QuerySet[Direccion]:
    """
    Retorna el historial completo de direcciones de un usuario (activas e inactivas).
    Aplica select_related para optimizar la carga relacional.
    """
    return obtener_direcciones_usuario(id_usuario, solo_activas=False)


def obtener_direccion_usuario(id_direccion: int, id_usuario: int, *, es_admin: bool = False) -> Direccion:
    """
    Retorna una dirección específica. Si no existe o no pertenece al usuario,
    levanta ObjectDoesNotExist o PermissionDenied.
    """
    try:
        direccion = Direccion.objects.select_related(
            'id_ciudad__id_provincia__id_pais'
        ).get(id_direccion=id_direccion)
    except Direccion.DoesNotExist:
        raise ObjectDoesNotExist(f"No se encontró la dirección con ID {id_direccion}.")

    if not es_admin and direccion.id_usuario_id != id_usuario:
        raise PermissionDenied("No tienes permisos para acceder a esta dirección.")

    return direccion


def obtener_direccion_sede() -> Optional[Direccion]:
    """
    Retorna la dirección física de la sede de la empresa, referenciada por el parámetro
    de configuración 'direccionLocal' (ID de la tabla Dirección). None si no está definida.
    """
    from core_app.models import ConfiguracionSistema

    config = ConfiguracionSistema.objects.filter(clave='direccionLocal').first()
    valor = (config.valor or '').strip() if config else ''
    if not valor.isdigit():
        return None
    return Direccion.objects.select_related(
        'id_ciudad__id_provincia__id_pais'
    ).filter(id_direccion=int(valor)).first()


def obtener_direccion_por_id(id_direccion: int) -> Optional[Direccion]:
    """
    Recupera una dirección específica optimizando sus relaciones foráneas con ciudad y usuario.
    """
    try:
        return Direccion.objects.select_related(
            'id_ciudad__id_provincia__id_pais',
            'id_usuario'
        ).get(id_direccion=id_direccion)
    except Direccion.DoesNotExist:
        return None


def filtrar_zonas_cobertura(
    *,
    nivel_taxonomico: str,
    padre_id: Optional[int] = None,
    estado: Optional[str] = None,
    busqueda: str = ''
) -> QuerySet:
    """
    CU-59: Filtrar Zonas de Cobertura.
    Permite segmentar y consultar el catálogo geográfico respetando
    la regla de rendimiento crítico (dependencia jerárquica obligatoria).
    """
    nivel = (nivel_taxonomico or '').upper()

    if nivel == 'PAIS':
        qs = Pais.objects.all().order_by('nombre_pais')
        if busqueda:
            qs = qs.filter(nombre_pais__icontains=busqueda.strip())

    elif nivel == 'PROVINCIA':
        qs = Provincia.objects.all().select_related('id_pais').order_by('nombre_provincia')
        if padre_id:
            qs = qs.filter(id_pais_id=padre_id)
        if busqueda:
            qs = qs.filter(nombre_provincia__icontains=busqueda.strip())

    elif nivel == 'CIUDAD':
        qs = Ciudad.objects.all().select_related('id_provincia__id_pais').order_by('nombre_ciudad')
        if padre_id:
            qs = qs.filter(id_provincia_id=padre_id)
        if busqueda:
            qs = qs.filter(nombre_ciudad__icontains=busqueda.strip())

    else:
        raise ValidationError(f"Nivel taxonómico no válido: '{nivel_taxonomico}'. Debe ser 'PAIS', 'PROVINCIA' o 'CIUDAD'.")

    # Filtro de estado
    if estado is not None and str(estado).strip().lower() not in ('', 'todos', 'all'):
        est_val = str(estado).strip().lower()
        if est_val in ('true', 'habilitado', 'habilitados', '1'):
            qs = qs.filter(cobertura_habilitada=True)
        elif est_val in ('false', 'restringido', 'restringidos', '0'):
            qs = qs.filter(cobertura_habilitada=False)

    return qs
