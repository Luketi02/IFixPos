import os
from django.conf import settings
from django.utils import timezone as django_timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError
from workshop_app.models import Dispositivo
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo
from core_app.models import LogSistema

UMBRAL_ACTIVACION_AUTOMATICA = 8


def normalizar_nombre(texto: str) -> str:
    """Elimina espacios redundantes de cadenas de texto."""
    if not texto:
        return ""
    return " ".join(texto.split()).strip()


def homologar_o_crear_catalogo_personalizado(
    *, 
    id_tipo: int = None, 
    nombre_tipo_otro: str = None, 
    id_marca: int = None, 
    nombre_marca_otro: str = None, 
    nombre_modelo_otro: str
) -> ModeloDispositivo:
    """
    Homologa o crea los registros de TipoDispositivo, Marca y ModeloDispositivo con estado_activo=False.
    Si ya existían previamente (case-insensitive), reutiliza los registros existentes para evitar duplicados.
    """
    # 1. Resolver Tipo de Dispositivo
    tipo = None
    if id_tipo:
        tipo = TipoDispositivo.objects.filter(pk=id_tipo).first()

    if not tipo and nombre_tipo_otro:
        nombre_t_norm = normalizar_nombre(nombre_tipo_otro)
        tipo = TipoDispositivo.objects.filter(nombre__iexact=nombre_t_norm).first()
        if not tipo:
            tipo = TipoDispositivo.objects.create(
                nombre=nombre_t_norm,
                estado_activo=False
            )

    # Fallback defensivo si no vino tipo: asignar o crear 'Dispositivo General'
    if not tipo:
        tipo = TipoDispositivo.objects.filter(nombre__iexact='Dispositivo General').first()
        if not tipo:
            tipo = TipoDispositivo.objects.create(
                nombre='Dispositivo General',
                estado_activo=True
            )

    # 2. Resolver Marca
    marca = None
    if id_marca:
        marca = Marca.objects.filter(pk=id_marca).first()

    if not marca and nombre_marca_otro:
        nombre_m_norm = normalizar_nombre(nombre_marca_otro)
        marca = Marca.objects.filter(nombre__iexact=nombre_m_norm).first()
        if not marca:
            marca = Marca.objects.create(
                nombre=nombre_m_norm,
                estado_activo=False
            )

    if not marca:
        raise ValidationError("No fue posible resolver la marca del dispositivo.")

    # 3. Resolver Modelo
    nombre_mod_norm = normalizar_nombre(nombre_modelo_otro)
    modelo = ModeloDispositivo.objects.filter(
        nombre__iexact=nombre_mod_norm,
        id_marca=marca,
        id_tipo_dispositivo=tipo
    ).first()

    if not modelo:
        modelo = ModeloDispositivo.objects.create(
            nombre=nombre_mod_norm,
            estado_activo=False,
            id_marca=marca,
            id_tipo_dispositivo=tipo
        )

    return modelo


def evaluar_y_promover_catalogo_8_usos(*, modelo: ModeloDispositivo, usuario_ejecutor: Usuario) -> None:
    """
    Regla de Inteligencia del Catálogo:
    Si un modelo, marca o tipo de dispositivo fue creado de forma manual (estado_activo=False)
    y alcanza un conteo acumulado de 8 o más dispositivos registrados en el sistema,
    se promueve automáticamente a estado_activo=True para que quede disponible en el catálogo
    público de toda la comunidad, registrando una traza de auditoría en LogSistema.
    """
    hora_actual = django_timezone.now().time()

    # 1. Evaluar Modelo
    if not modelo.estado_activo:
        usos_modelo = Dispositivo.objects.filter(id_modelo=modelo).count()
        if usos_modelo >= UMBRAL_ACTIVACION_AUTOMATICA:
            modelo.estado_activo = True
            modelo.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de modelo {modelo.id_modelo}",
                detalle=f"El modelo '{modelo.nombre}' alcanzó {usos_modelo} usos y fue promovido automáticamente a activo en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="modelo",
                id_registro_afectado=str(modelo.id_modelo),
                id_usuario=usuario_ejecutor
            )

    # 2. Evaluar Marca
    marca = modelo.id_marca
    if marca and not marca.estado_activo:
        usos_marca = Dispositivo.objects.filter(id_modelo__id_marca=marca).count()
        if usos_marca >= UMBRAL_ACTIVACION_AUTOMATICA:
            marca.estado_activo = True
            marca.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de marca {marca.id_marca}",
                detalle=f"La marca '{marca.nombre}' alcanzó {usos_marca} usos acumulados y fue promovida automáticamente a activa en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="marca",
                id_registro_afectado=str(marca.id_marca),
                id_usuario=usuario_ejecutor
            )

    # 3. Evaluar Tipo de Dispositivo
    tipo = modelo.id_tipo_dispositivo
    if tipo and not tipo.estado_activo:
        usos_tipo = Dispositivo.objects.filter(id_modelo__id_tipo_dispositivo=tipo).count()
        if usos_tipo >= UMBRAL_ACTIVACION_AUTOMATICA:
            tipo.estado_activo = True
            tipo.save(update_fields=['estado_activo'])
            LogSistema.objects.create(
                fecha_hora=hora_actual,
                accion=f"Promoción automática de tipo de dispositivo {tipo.id_tipo_dispositivo}",
                detalle=f"El tipo de dispositivo '{tipo.nombre}' alcanzó {usos_tipo} usos acumulados y fue promovido automáticamente a activo en el catálogo oficial.",
                tipo="INFO",
                modulo_origen="workshop_app",
                tabla_afectada="tipo_dispositivo",
                id_registro_afectado=str(tipo.id_tipo_dispositivo),
                id_usuario=usuario_ejecutor
            )


def guardar_archivo_imagen_dispositivo(*, archivo, id_propietario: int) -> str:
    """
    Valida y guarda un archivo binario de imagen para el dispositivo en MEDIA_ROOT/dispositivos.
    Retorna la URL relativa al archivo guardado.
    """
    if not archivo:
        return None

    ext = os.path.splitext(archivo.name)[1].lower()
    formatos_permitidos = ['.png', '.jpg', '.jpeg', '.webp']
    if ext not in formatos_permitidos:
        raise ValidationError(f"Formato no permitido. Solo se admiten imágenes: {', '.join(formatos_permitidos)}")

    if hasattr(archivo, 'size') and archivo.size > 5 * 1024 * 1024:
        raise ValidationError("El archivo de imagen supera el tamaño máximo permitido de 5 MB.")

    carpeta_destino = os.path.join(settings.MEDIA_ROOT, 'dispositivos')
    os.makedirs(carpeta_destino, exist_ok=True)

    timestamp = int(django_timezone.now().timestamp())
    nombre_archivo = f"disp_u{id_propietario}_{timestamp}{ext}"
    ruta_completa = os.path.join(carpeta_destino, nombre_archivo)

    with open(ruta_completa, 'wb+') as destino:
        for chunk in archivo.chunks():
            destino.write(chunk)

    return f"/media/dispositivos/{nombre_archivo}"


@transaction.atomic
def registrar_dispositivo(*, usuario_ejecutor: Usuario, datos_validados: dict) -> Dispositivo:
    """
    CU-06: Registrar Dispositivo.
    Registra un nuevo equipo físico en el sistema para un cliente del taller.

    Regla de Negocio (Seguridad de Roles):
    - Si usuario_ejecutor.rol.codigo == 'CLIENTE', el sistema ignora/sobrescribe el id_cliente
      que venga en datos_validados y fuerza que el dueño del dispositivo sea el propio usuario_ejecutor.id.
    - Si es 'TECNICO' o 'ADMIN', se respeta el id_cliente validado en el payload.

    Catálogo Dinámico e Inteligencia:
    - Admite equipos existentes o la opción 'Otro' (Tipo, Marca, Modelo).
    - Homologa registros manuales en estado inactivo.
    - Promueve automáticamente a activo cuando alcanzan 8 dispositivos registrados.

    Auditoría Estricta:
    - Genera un LogSistema (módulo core_app) indicando el ID del dispositivo creado,
      la tabla afectada ('dispositivo') y el usuario_ejecutor de la acción.
    """
    if not usuario_ejecutor:
        raise ValidationError("No se pudo identificar al usuario ejecutor de la acción.")

    # 1. Determinar el rol del usuario ejecutor
    rol_codigo = ''
    if hasattr(usuario_ejecutor, 'rol') and usuario_ejecutor.rol and hasattr(usuario_ejecutor.rol, 'codigo'):
        rol_codigo = (usuario_ejecutor.rol.codigo or '').upper()
    elif hasattr(usuario_ejecutor, 'id_rol') and usuario_ejecutor.id_rol and hasattr(usuario_ejecutor.id_rol, 'codigo'):
        rol_codigo = (usuario_ejecutor.id_rol.codigo or '').upper()

    # 2. Aplicar regla de roles para el dueño del dispositivo
    if rol_codigo == 'CLIENTE':
        id_cliente_final = usuario_ejecutor.id_usuario
    else:
        id_cliente_final = datos_validados.get('id_cliente') or datos_validados.get('id_usuario')
        if not id_cliente_final:
            id_cliente_final = usuario_ejecutor.id_usuario

    cliente = Usuario.objects.filter(pk=id_cliente_final).first()
    if not cliente:
        raise ValidationError("El cliente especificado no existe.")

    # 3. Validar modelo de dispositivo (Estándar o Manual 'Otro')
    es_otro = datos_validados.get('es_otro', False) or bool(datos_validados.get('nombre_modelo_otro'))
    if es_otro:
        modelo = homologar_o_crear_catalogo_personalizado(
            id_tipo=datos_validados.get('id_tipo'),
            nombre_tipo_otro=datos_validados.get('nombre_tipo_otro'),
            id_marca=datos_validados.get('id_marca'),
            nombre_marca_otro=datos_validados.get('nombre_marca_otro'),
            nombre_modelo_otro=datos_validados.get('nombre_modelo_otro')
        )
    else:
        id_modelo = datos_validados.get('id_modelo')
        modelo = ModeloDispositivo.objects.filter(pk=id_modelo).first()
        if not modelo:
            raise ValidationError("El modelo de dispositivo especificado no existe.")

    # 4. Normalizar número de serie / IMEI
    nro_serie = datos_validados.get('nro_serie') or datos_validados.get('numero_serie')
    if nro_serie is not None:
        nro_serie = str(nro_serie).strip() or None

    # 5. Gestionar imagen (archivo binario multipart o URL string)
    imagen_data = datos_validados.get('imagen')
    url_imagen = None
    if imagen_data:
        if hasattr(imagen_data, 'chunks') or hasattr(imagen_data, 'read'):
            url_imagen = guardar_archivo_imagen_dispositivo(archivo=imagen_data, id_propietario=cliente.id_usuario)
        elif isinstance(imagen_data, str) and imagen_data.strip():
            url_imagen = imagen_data.strip()

    # 6. Crear el registro en base de datos
    fecha_actual = django_timezone.now().date()
    dispositivo = Dispositivo.objects.create(
        id_usuario=cliente,
        id_modelo=modelo,
        numero_serie=nro_serie,
        imagen=url_imagen,
        fecha_registro=fecha_actual
    )

    # 7. Evaluación de Inteligencia de Catálogo (Regla de los 8 usos)
    evaluar_y_promover_catalogo_8_usos(modelo=modelo, usuario_ejecutor=usuario_ejecutor)

    # 8. Auditoría Estricta en LogSistema
    hora_actual = django_timezone.now().time()
    LogSistema.objects.create(
        fecha_hora=hora_actual,
        accion=f"Alta de dispositivo {dispositivo.id_dispositivo}",
        detalle=f"Dispositivo registrado para cliente ID {cliente.id_usuario} (Modelo: {modelo.nombre}, Serie: {nro_serie or 'S/N'}).",
        tipo="INFO",
        modulo_origen="workshop_app",
        tabla_afectada="dispositivo",
        id_registro_afectado=str(dispositivo.id_dispositivo),
        id_usuario=usuario_ejecutor
    )

    return dispositivo


def crear_dispositivo(
    *, 
    id_ejecutor: int, 
    id_usuario: int, 
    id_modelo: int, 
    numero_serie: str = None, 
    imagen: str = None
) -> Dispositivo:
    """
    Función de compatibilidad histórica para llamadas existentes.
    """
    ejecutor = Usuario.objects.filter(pk=id_ejecutor).first()
    if not ejecutor:
        raise ValidationError("El usuario ejecutor de la acción no existe.")
    return registrar_dispositivo(
        usuario_ejecutor=ejecutor,
        datos_validados={
            'id_cliente': id_usuario,
            'id_modelo': id_modelo,
            'nro_serie': numero_serie,
            'imagen': imagen
        }
    )
