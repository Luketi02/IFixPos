from datetime import datetime, timezone
from typing import Dict, Any
from django.db import transaction
from django.core.exceptions import PermissionDenied, ObjectDoesNotExist, ValidationError
from geo_app.models import Direccion, Ciudad, Pais, Provincia
from users_app.models import Usuario
from core_app.models import LogSistema


def _registrar_auditoria_personal(*, usuario: Usuario, accion: str, id_registro: int, detalle: str = None) -> None:
    """
    Condición de Auditoría Estricta:
    Si el usuario posee rol 'ADMIN' o 'TECNICO', registra el evento en LogSistema del módulo core_app.
    """
    rol_codigo = ''
    if hasattr(usuario, 'id_rol') and usuario.id_rol and hasattr(usuario.id_rol, 'codigo'):
        rol_codigo = (usuario.id_rol.codigo or '').upper()
    elif hasattr(usuario, 'rol') and usuario.rol and hasattr(usuario.rol, 'codigo'):
        rol_codigo = (usuario.rol.codigo or '').upper()

    if rol_codigo in ['ADMIN', 'TECNICO']:
        LogSistema.objects.create(
            fecha_hora=datetime.now(timezone.utc).time(),
            accion=accion,
            detalle=detalle,
            tipo='AUDITORIA',
            modulo_origen='geo_app',
            tabla_afectada='direccion',
            id_registro_afectado=str(id_registro),
            id_usuario=usuario
        )


@transaction.atomic
def registrar_direccion(*, usuario: Usuario, datos: Dict[str, Any]) -> Direccion:
    """
    CU-47: Registrar Dirección.
    Crea y persiste una nueva dirección vinculada al usuario autenticado.
    """
    ciudad = datos.get('id_ciudad')
    if isinstance(ciudad, int):
        ciudad = Ciudad.objects.get(id_ciudad=ciudad)

    direccion = Direccion.objects.create(
        id_usuario=usuario,
        id_ciudad=ciudad,
        alias=datos.get('alias', '').strip(),
        nro_calle=(datos.get('nro_calle') or datos.get('calle_numero', '')).strip(),
        nombre_barrio=(datos.get('nombre_barrio') or datos.get('barrio', '')).strip(),
        nro_dpto=datos.get('nro_dpto') or datos.get('piso_dpto') or None,
        piso=datos.get('piso'),
        is_active=True
    )

    _registrar_auditoria_personal(
        usuario=usuario,
        accion="Registrar Dirección (CU-47)",
        id_registro=direccion.id_direccion,
        detalle=f"Dirección creada con alias '{direccion.alias}' en ciudad '{ciudad.nombre_ciudad}'"
    )

    return direccion


@transaction.atomic
def modificar_direccion(*, usuario: Usuario, id_direccion: int, datos: Dict[str, Any]) -> Direccion:
    """
    CU-48: Modificar Dirección.
    Busca la dirección, asegura que pertenezca al usuario (o administrador) y actualiza sus campos.
    """
    try:
        direccion = Direccion.objects.select_related('id_usuario', 'id_ciudad').get(id_direccion=id_direccion)
    except Direccion.DoesNotExist:
        raise ObjectDoesNotExist(f"No se encontró la dirección con ID {id_direccion}.")

    # Verificación de propiedad del registro
    rol_codigo = ''
    if hasattr(usuario, 'id_rol') and usuario.id_rol and hasattr(usuario.id_rol, 'codigo'):
        rol_codigo = (usuario.id_rol.codigo or '').upper()

    if direccion.id_usuario_id != usuario.id_usuario and rol_codigo != 'ADMIN':
        raise PermissionDenied("No tienes permisos para modificar esta dirección.")

    ciudad = datos.get('id_ciudad')
    if ciudad is not None:
        if isinstance(ciudad, int):
            ciudad = Ciudad.objects.get(id_ciudad=ciudad)
        direccion.id_ciudad = ciudad

    if 'alias' in datos:
        direccion.alias = datos['alias'].strip()
    if 'nro_calle' in datos or 'calle_numero' in datos:
        direccion.nro_calle = (datos.get('nro_calle') or datos.get('calle_numero', '')).strip()
    if 'nombre_barrio' in datos or 'barrio' in datos:
        direccion.nombre_barrio = (datos.get('nombre_barrio') or datos.get('barrio', '')).strip()
    if 'nro_dpto' in datos or 'piso_dpto' in datos:
        direccion.nro_dpto = datos.get('nro_dpto') or datos.get('piso_dpto') or None
    if 'piso' in datos:
        direccion.piso = datos['piso']

    direccion.save()

    _registrar_auditoria_personal(
        usuario=usuario,
        accion="Modificar Dirección (CU-48)",
        id_registro=direccion.id_direccion,
        detalle=f"Dirección actualizada con alias '{direccion.alias}'"
    )

    return direccion


@transaction.atomic
def cambiar_estado_direccion(*, usuario: Usuario, id_direccion: int) -> Direccion:
    """
    CU-49: Cambiar Estado de Dirección (Borrado Lógico / Recuperación).
    Busca la dirección, asegura propiedad e invierte su valor is_active (de True a False o viceversa).
    """
    try:
        direccion = Direccion.objects.select_related('id_usuario').get(id_direccion=id_direccion)
    except Direccion.DoesNotExist:
        raise ObjectDoesNotExist(f"No se encontró la dirección con ID {id_direccion}.")

    # Verificación de propiedad
    rol_codigo = ''
    if hasattr(usuario, 'id_rol') and usuario.id_rol and hasattr(usuario.id_rol, 'codigo'):
        rol_codigo = (usuario.id_rol.codigo or '').upper()

    if direccion.id_usuario_id != usuario.id_usuario and rol_codigo != 'ADMIN':
        raise PermissionDenied("No tienes permisos para cambiar el estado de esta dirección.")

    # Conmutar estado lógico
    direccion.is_active = not direccion.is_active
    direccion.save(update_fields=['is_active'])

    estado_str = "Activa" if direccion.is_active else "Inactiva"
    _registrar_auditoria_personal(
        usuario=usuario,
        accion=f"Cambiar Estado Dirección a {estado_str} (CU-49)",
        id_registro=direccion.id_direccion,
        detalle=f"Estado de dirección {direccion.id_direccion} cambiado a is_active={direccion.is_active}"
    )

    return direccion


@transaction.atomic
def actualizar_cobertura_zonas(
    *,
    usuario_admin: Usuario,
    nivel_taxonomico: str,
    zonas_modificadas: list[dict]
) -> dict:
    """
    CU-50: Administrar Zonas de Cobertura.
    Actualiza masivamente el estado de cobertura_habilitada para entidades
    del nivel taxonómico dado ('PAIS', 'PROVINCIA' o 'CIUDAD').
    Aplica regla de negocio de cascada estricta al restringir (cobertura_habilitada=False).
    Registra auditoría en LogSistema.
    """
    nivel = (nivel_taxonomico or '').upper()
    if nivel not in ('PAIS', 'PROVINCIA', 'CIUDAD'):
        raise ValidationError(f"Nivel taxonómico no válido: '{nivel_taxonomico}'.")

    if not zonas_modificadas:
        raise ValidationError("No se proporcionaron zonas para actualizar.")

    ids_actualizados = []
    cascada_ciudades_afectadas = 0

    if nivel == 'PAIS':
        for item in zonas_modificadas:
            id_entidad = item.get('id') or item.get('id_pais')
            nuevo_estado = bool(item.get('cobertura_habilitada'))
            pais = Pais.objects.filter(id_pais=id_entidad).first()
            if not pais:
                continue

            pais.cobertura_habilitada = nuevo_estado
            pais.save(update_fields=['cobertura_habilitada'])
            ids_actualizados.append(id_entidad)

            # Regla de Cascada Territorial Total (Descendente):
            # Tanto al habilitar como al deshabilitar un país, sus provincias y ciudades
            # adoptan el mismo estado para mantener consistencia operativa absoluta.
            provincias_ids = list(
                Provincia.objects.filter(id_pais=pais).values_list('id_provincia', flat=True)
            )
            Provincia.objects.filter(id_pais=pais).update(cobertura_habilitada=nuevo_estado)
            cnt = Ciudad.objects.filter(id_provincia_id__in=provincias_ids).update(cobertura_habilitada=nuevo_estado)
            cascada_ciudades_afectadas += cnt

    elif nivel == 'PROVINCIA':
        for item in zonas_modificadas:
            id_entidad = item.get('id') or item.get('id_provincia')
            nuevo_estado = bool(item.get('cobertura_habilitada'))
            provincia = Provincia.objects.filter(id_provincia=id_entidad).select_related('id_pais').first()
            if not provincia:
                continue

            provincia.cobertura_habilitada = nuevo_estado
            provincia.save(update_fields=['cobertura_habilitada'])
            ids_actualizados.append(id_entidad)

            # 1. Cascada Descendente: Todas las ciudades de la provincia toman el mismo estado
            cnt = Ciudad.objects.filter(id_provincia=provincia).update(cobertura_habilitada=nuevo_estado)
            cascada_ciudades_afectadas += cnt

            # 2. Cascada Ascendente:
            if nuevo_estado:
                # Si se habilita la provincia, asegurar que el país padre esté habilitado
                if provincia.id_pais and not provincia.id_pais.cobertura_habilitada:
                    provincia.id_pais.cobertura_habilitada = True
                    provincia.id_pais.save(update_fields=['cobertura_habilitada'])
            else:
                # Si se deshabilita la provincia, verificar si el país padre aún tiene al menos una provincia habilitada.
                # Si ya NO le queda ninguna provincia habilitada, deshabilitar automáticamente el país.
                pais = provincia.id_pais
                if pais and pais.cobertura_habilitada:
                    tiene_otras_provs_activas = Provincia.objects.filter(id_pais=pais, cobertura_habilitada=True).exists()
                    if not tiene_otras_provs_activas:
                        pais.cobertura_habilitada = False
                        pais.save(update_fields=['cobertura_habilitada'])

    elif nivel == 'CIUDAD':
        for item in zonas_modificadas:
            id_entidad = item.get('id') or item.get('id_ciudad')
            nuevo_estado = bool(item.get('cobertura_habilitada'))
            ciudad = Ciudad.objects.filter(id_ciudad=id_entidad).select_related('id_provincia__id_pais').first()
            if not ciudad:
                continue

            ciudad.cobertura_habilitada = nuevo_estado
            ciudad.save(update_fields=['cobertura_habilitada'])
            ids_actualizados.append(id_entidad)

            # Cascada Ascendente:
            if nuevo_estado:
                # Si se habilita una ciudad, asegurar que su provincia y su país queden habilitados
                if ciudad.id_provincia:
                    prov = ciudad.id_provincia
                    if not prov.cobertura_habilitada:
                        prov.cobertura_habilitada = True
                        prov.save(update_fields=['cobertura_habilitada'])
                    if prov.id_pais and not prov.id_pais.cobertura_habilitada:
                        prov.id_pais.cobertura_habilitada = True
                        prov.id_pais.save(update_fields=['cobertura_habilitada'])
            else:
                # Si se deshabilita la ciudad, verificar si la provincia aún tiene al menos una ciudad habilitada.
                # Si NO queda ninguna ciudad habilitada en la provincia, deshabilitar automáticamente la provincia.
                prov = ciudad.id_provincia
                if prov and prov.cobertura_habilitada:
                    tiene_ciudades_activas = Ciudad.objects.filter(id_provincia=prov, cobertura_habilitada=True).exists()
                    if not tiene_ciudades_activas:
                        prov.cobertura_habilitada = False
                        prov.save(update_fields=['cobertura_habilitada'])

                        # Y comprobar si al deshabilitar esta provincia, el país padre quedó sin provincias activas
                        pais = prov.id_pais
                        if pais and pais.cobertura_habilitada:
                            tiene_provs_activas = Provincia.objects.filter(id_pais=pais, cobertura_habilitada=True).exists()
                            if not tiene_provs_activas:
                                pais.cobertura_habilitada = False
                                pais.save(update_fields=['cobertura_habilitada'])

    # Detalle de auditoría
    detalle_auditoria = (
        f"Actualización de Cobertura en {nivel}. "
        f"IDs modificados ({len(ids_actualizados)}): {ids_actualizados}. "
    )
    if cascada_ciudades_afectadas > 0:
        detalle_auditoria += f"Cascada aplicada a {cascada_ciudades_afectadas} ciudades hijas."
    detalle_auditoria = detalle_auditoria[:1000]

    _registrar_auditoria_personal(
        usuario=usuario_admin,
        accion=f"Administrar Zonas Cobertura ({nivel}) (CU-50)",
        id_registro=ids_actualizados[0] if ids_actualizados else 0,
        detalle=detalle_auditoria
    )

    return {
        "mensaje": f"Se actualizaron {len(ids_actualizados)} zonas de cobertura ({nivel.capitalize()}) exitosamente.",
        "ids_actualizados": ids_actualizados,
        "ciudades_cascada_restringidas": cascada_ciudades_afectadas,
        "nivel": nivel
    }
