from typing import Any
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from core_app.models import LogSistema
from .models import Marca, ModeloDispositivo, TipoDispositivo, Producto, CategoriaProducto
from .selectors import (
    obtener_marca_por_nombre,
    obtener_marca_por_id,
    obtener_marca,
    obtener_todas_marcas,
    obtener_tipo_dispositivo_por_id,
    obtener_tipo_dispositivo,
    obtener_categoria_producto,
    obtener_modelo_por_nombre_y_marca,
    obtener_modelo,
    filtrar_modelos
)

@transaction.atomic
def crear_o_reactivar_marca(
    *,
    usuario_admin: Any = None,
    nombre: str
) -> tuple[Marca, bool]:
    """
    CU-77: Registrar Marca.
    Crea una nueva marca o reactiva una existente si estaba inactiva.
    Invoca LogSistema para auditar la acción (Alta nueva o Reactivación).
    Retorna una tupla (instancia_marca, fue_creada).
    """
    nombre_limpio = str(nombre or '').strip()
    if not nombre_limpio:
        raise ValidationError("El nombre de la marca no puede estar vacío.")

    marca_existente = obtener_marca_por_nombre(nombre_limpio)
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin)) if usuario_admin else 'Sistema'

    if marca_existente:
        if marca_existente.estado_activo:
            raise ValidationError("La marca ya se encuentra registrada y activa")
        else:
            marca_existente.estado_activo = True
            marca_existente.save(update_fields=['estado_activo'])

            LogSistema.objects.create(
                fecha_hora=timezone.now().time(),
                accion="Reactivación de Marca (CU-77)",
                detalle=f"Reactivación de marca '{marca_existente.nombre}' (ID: {marca_existente.id_marca}) por {email_admin}.",
                tipo="AUDITORIA_CATALOGO",
                modulo_origen="catalog_app",
                tabla_afectada="marca",
                id_registro_afectado=str(marca_existente.id_marca),
                id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
            )
            return marca_existente, False

    # Si no existe, la creamos como alta nueva
    nueva_marca = Marca.objects.create(
        nombre=nombre_limpio,
        estado_activo=True
    )

    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Alta nueva de Marca (CU-77)",
        detalle=f"Alta nueva de marca '{nueva_marca.nombre}' (ID: {nueva_marca.id_marca}) por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="marca",
        id_registro_afectado=str(nueva_marca.id_marca),
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return nueva_marca, True


@transaction.atomic
def cambiar_estado_marca(
    *,
    usuario_admin: Any,
    id_marca: int
) -> Marca:
    """
    CU-78: Cambiar Estado de Marca.
    Utiliza obtener_marca para recuperar la instancia.
    Invierte el valor del atributo estado_activo (de True a False, o de False a True).
    Guarda en la base de datos y genera el LogSistema documentando el cambio de estado.
    Retorna la marca modificada.
    """
    marca = obtener_marca(id_marca)
    marca.estado_activo = not marca.estado_activo
    marca.save(update_fields=['estado_activo'])

    operacion = "Habilitación (Activo)" if marca.estado_activo else "Inhabilitación (Soft Delete / Inactivo)"
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin)) if usuario_admin else 'Sistema'

    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Cambio de Estado de Marca (CU-78)",
        detalle=f"Cambio de estado de la marca '{marca.nombre}' (ID: {marca.id_marca}) a {operacion} por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="marca",
        id_registro_afectado=str(marca.id_marca),
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return marca


@transaction.atomic
def crear_o_reactivar_modelo(
    *,
    usuario_ejecutor: Any = None,
    nombre: str,
    id_marca: int,
    id_tipo_dispositivo: int
) -> tuple[ModeloDispositivo, bool]:
    """
    CU-79: Registrar Modelo.
    Crea un nuevo modelo de dispositivo o reactiva uno existente si estaba inactivo.
    Audita en LogSistema identificando al usuario ejecutor.
    Retorna una tupla (instancia_modelo, fue_creado).
    """
    nombre_limpio = str(nombre or '').strip()
    if not nombre_limpio:
        raise ValidationError("El nombre del modelo no puede estar vacío.")

    marca = obtener_marca(id_marca)
    if not marca.estado_activo:
        raise ValidationError("La marca especificada no se encuentra activa.")

    tipo_dispositivo = obtener_tipo_dispositivo(id_tipo_dispositivo)
    if not tipo_dispositivo.estado_activo:
        raise ValidationError("El tipo de dispositivo especificado no se encuentra activo.")

    modelo_existente = obtener_modelo_por_nombre_y_marca(nombre_limpio, id_marca)
    email_ejecutor = getattr(usuario_ejecutor, 'email', str(usuario_ejecutor)) if usuario_ejecutor else 'Sistema'

    if modelo_existente:
        if modelo_existente.estado_activo:
            raise ValidationError("El modelo ya se encuentra registrado y activo para esta marca")
        else:
            modelo_existente.estado_activo = True
            modelo_existente.id_tipo_dispositivo = tipo_dispositivo
            modelo_existente.save(update_fields=['estado_activo', 'id_tipo_dispositivo'])

            LogSistema.objects.create(
                fecha_hora=timezone.now().time(),
                accion="Reactivación de Modelo (CU-79)",
                detalle=f"Reactivación de modelo '{modelo_existente.nombre}' (ID: {modelo_existente.id_modelo}) para marca '{marca.nombre}' por {email_ejecutor}.",
                tipo="AUDITORIA_CATALOGO",
                modulo_origen="catalog_app",
                tabla_afectada="modelo",
                id_registro_afectado=str(modelo_existente.id_modelo),
                id_usuario=usuario_ejecutor if hasattr(usuario_ejecutor, 'pk') else None
            )
            return modelo_existente, False

    # Si no existe, se crea como alta nueva
    nuevo_modelo = ModeloDispositivo.objects.create(
        nombre=nombre_limpio,
        id_marca=marca,
        id_tipo_dispositivo=tipo_dispositivo,
        estado_activo=True
    )

    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Alta nueva de Modelo (CU-79)",
        detalle=f"Alta nueva de modelo '{nuevo_modelo.nombre}' (ID: {nuevo_modelo.id_modelo}) para marca '{marca.nombre}' por {email_ejecutor}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="modelo",
        id_registro_afectado=str(nuevo_modelo.id_modelo),
        id_usuario=usuario_ejecutor if hasattr(usuario_ejecutor, 'pk') else None
    )

    return nuevo_modelo, True


@transaction.atomic
def cambiar_estado_modelo(
    *,
    usuario_admin: Any,
    id_modelo: int
) -> ModeloDispositivo:
    """
    CU-80: Cambiar Estado de Modelo.
    Usa obtener_modelo para recuperar la instancia.
    Invierte el valor de estado_activo.
    Genera un LogSistema detallando el Soft Delete o Restauración.
    Retorna el modelo modificado.
    """
    modelo = obtener_modelo(id_modelo)
    modelo.estado_activo = not modelo.estado_activo
    modelo.save(update_fields=['estado_activo'])

    operacion = "Restauración (Activo)" if modelo.estado_activo else "Soft Delete (Inactivo)"
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin)) if usuario_admin else 'Sistema'

    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Cambio de Estado de Modelo (CU-80)",
        detalle=f"Cambio de estado del modelo '{modelo.nombre}' (ID: {modelo.id_modelo}) a {operacion} por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="modelo",
        id_registro_afectado=str(modelo.id_modelo),
        id_usuario=usuario_admin if hasattr(usuario_admin, 'pk') else None
    )

    return modelo


@transaction.atomic
def registrar_producto(
    *,
    usuario_admin: Any,
    datos_validados: dict
) -> Producto:
    """
    CU-12: Registrar Producto.
    Da de alta manualmente un nuevo producto en el catálogo e inicializa su stock en el inventario.
    Operación envuelta en @transaction.atomic.
    """
    from django.db import transaction
    from django.utils import timezone
    from catalog_app.models import Producto
    from inventory_app.models import Stock, MovimientoStock
    from core_app.models import LogSistema

    with transaction.atomic():
        # 1. Separar datos propios de Producto de los del Stock inicial
        nombre = datos_validados['nombre']
        categoria = datos_validados['categoria']
        descripcion = datos_validados.get('descripcion') or ''
        precio_venta = datos_validados['precio_venta']
        apto_venta = datos_validados.get('apto_venta', False)
        apto_reparacion = datos_validados.get('apto_reparacion', False)
        apto_consumible = datos_validados.get('apto_consumible', False)
        modulo_automatico = datos_validados.get('modulo_automatico', False)

        stock_inicial = int(datos_validados.get('stock_inicial', 0) or 0)
        stock_minimo = int(datos_validados.get('stock_minimo', 0) or 0)

        marca = datos_validados.get('marca')
        modelo = datos_validados.get('modelo')
        if not marca and datos_validados.get('id_marca'):
            from catalog_app.models import Marca
            marca = Marca.objects.filter(id_marca=datos_validados['id_marca']).first()
        if not modelo and datos_validados.get('id_modelo'):
            from catalog_app.models import ModeloDispositivo
            modelo = ModeloDispositivo.objects.filter(id_modelo=datos_validados['id_modelo']).first()

        tipo_disp = datos_validados.get('tipo_dispositivo')
        if not tipo_disp and datos_validados.get('id_tipo_dispositivo'):
            from catalog_app.models import TipoDispositivo
            tipo_disp = TipoDispositivo.objects.filter(id_tipo_dispositivo=datos_validados['id_tipo_dispositivo']).first()
        elif not tipo_disp and modelo and getattr(modelo, 'id_tipo_dispositivo', None):
            tipo_disp = modelo.id_tipo_dispositivo

        imagen_principal = str(datos_validados.get('imagen_principal') or '').strip()
        imagenes = datos_validados.get('imagenes') or []
        if not imagen_principal and imagenes:
            imagen_principal = str(imagenes[0] or '').strip()

        # 2. Crear y guardar el Producto
        producto = Producto.objects.create(
            nombre=nombre,
            descripcion=descripcion,
            precio_venta=precio_venta,
            estado=True,
            apto_venta=apto_venta,
            apto_reparacion=apto_reparacion,
            apto_consumible=apto_consumible,
            modulo_automatico=modulo_automatico,
            id_categoria=categoria,
            id_marca=marca,
            id_modelo=modelo,
            id_tipo_dispositivo=tipo_disp,
            imagen_principal=imagen_principal or None
        )

        # 2.b Guardar galería de imágenes complementarias
        from catalog_app.models import ImagenProducto
        urls_galeria = [str(u).strip() for u in imagenes if str(u).strip()]
        if imagen_principal and imagen_principal not in urls_galeria:
            urls_galeria.insert(0, imagen_principal)

        for idx, url_img in enumerate(urls_galeria):
            ImagenProducto.objects.create(
                id_producto=producto,
                url_imagen=url_img,
                orden=idx
            )

        # 3. Crear entidad Stock asociada
        stock = Stock.objects.create(
            id_producto=producto,
            stock_minimo=stock_minimo
        )

        # 4. Asignar saldo inicial mediante MovimientoStock si stock_inicial > 0
        if stock_inicial > 0:
            MovimientoStock.objects.create(
                id_stock=stock,
                tipo_movimiento='ingreso',
                cantidad=stock_inicial,
                fecha=timezone.now().date(),
                motivo='Alta inicial de producto en inventario',
                uso_taller=False
            )

        # 5. Generar auditoría inmutable en LogSistema
        email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
        LogSistema.objects.create(
            fecha_hora=timezone.now().time(),
            accion="Registrar Producto (CU-12)",
            detalle=(
                f"Alta del producto '{producto.nombre}' (ID: {producto.id_producto}) por {email_admin}. "
                f"Categoría: {categoria.nombre}, Precio: ${precio_venta}, Stock Inicial: {stock_inicial}, "
                f"Stock Mínimo: {stock_minimo}."
            )[:1000],
            tipo="AUDITORIA_CATALOGO",
            modulo_origen="catalog_app",
            tabla_afectada="producto",
            id_registro_afectado=str(producto.id_producto),
            id_usuario=usuario_admin
        )

        # Propiedades auxiliares para formateo de salida
        producto.categoria_nombre = categoria.nombre
        producto.stock_inicial = stock_inicial
        producto.stock_minimo = stock_minimo

        return producto


@transaction.atomic
def crear_tipo_dispositivo(*, usuario_admin: Any, nombre: str) -> TipoDispositivo:
    """
    CU-65: Crear Tipo de Dispositivo.
    Instancia un nuevo TipoDispositivo con el nombre provisto, fuerza estado_activo=True,
    guarda en BD y crea un LogSistema de auditoría.
    """
    nombre_limpio = str(nombre or '').strip()

    tipo_dispositivo = TipoDispositivo.objects.create(
        nombre=nombre_limpio,
        estado_activo=True
    )

    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Alta de Tipo de Dispositivo",
        detalle=f"Alta del tipo de dispositivo '{tipo_dispositivo.nombre}' (ID: {tipo_dispositivo.id_tipo_dispositivo}) por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="tipo_dispositivo",
        id_registro_afectado=str(tipo_dispositivo.id_tipo_dispositivo),
        id_usuario=usuario_admin
    )

    return tipo_dispositivo


@transaction.atomic
def cambiar_estado_tipo_dispositivo(*, usuario_admin: Any, id_tipo: int) -> TipoDispositivo:
    """
    CU-66: Cambiar Estado de Tipo de Dispositivo.
    Recupera el tipo de dispositivo por su ID, invierte el valor de estado_activo,
    guarda en BD y crea un LogSistema documentando el cambio de estado (Soft Delete o Restauración).
    """
    tipo_dispositivo = obtener_tipo_dispositivo(id_tipo)

    # Invertir el valor booleano
    tipo_dispositivo.estado_activo = not tipo_dispositivo.estado_activo
    tipo_dispositivo.save(update_fields=['estado_activo'])

    operacion = "Restauración (Activo)" if tipo_dispositivo.estado_activo else "Soft Delete (Inactivo)"
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Cambio de Estado de Tipo de Dispositivo",
        detalle=f"Cambio de estado del tipo de dispositivo '{tipo_dispositivo.nombre}' (ID: {tipo_dispositivo.id_tipo_dispositivo}) a {operacion} por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="tipo_dispositivo",
        id_registro_afectado=str(tipo_dispositivo.id_tipo_dispositivo),
        id_usuario=usuario_admin
    )

    return tipo_dispositivo


@transaction.atomic
def crear_categoria_producto(
    *,
    usuario_admin: Any,
    nombre: str,
    descripcion: str = ""
) -> CategoriaProducto:
    """
    CU-29: Agregar Categoría de Producto.
    Instancia y guarda una nueva CategoriaProducto asignando estado_activo = True por defecto,
    generando una traza de auditoría en LogSistema.
    """
    nombre_limpio = str(nombre or '').strip()
    descripcion_limpia = str(descripcion or '').strip()

    categoria = CategoriaProducto.objects.create(
        nombre=nombre_limpio,
        descripcion=descripcion_limpia,
        estado=True
    )

    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))
    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Alta de Categoría de Producto (CU-29)",
        detalle=f"Alta de categoría '{categoria.nombre}' (ID: {categoria.id_categoria}) por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="categoria_producto",
        id_registro_afectado=str(categoria.id_categoria),
        id_usuario=usuario_admin
    )

    return categoria


@transaction.atomic
def cambiar_estado_categoria_producto(
    *,
    usuario_admin: Any,
    id_categoria: int
) -> CategoriaProducto:
    """
    CU-30: Cambiar Estado de Categoría de Producto.
    Recupera la categoría por su ID, invierte el valor de estado_activo (True a False, o viceversa),
    guarda en base de datos y genera el LogSistema documentando la habilitación o inhabilitación lógica.
    """
    categoria = obtener_categoria_producto(id_categoria)

    # Invertir el valor de estado
    categoria.estado = not categoria.estado
    categoria.save(update_fields=['estado'])

    operacion = "Habilitación (Activo)" if categoria.estado else "Inhabilitación lógica (Soft Delete)"
    email_admin = getattr(usuario_admin, 'email', str(usuario_admin))

    LogSistema.objects.create(
        fecha_hora=timezone.now().time(),
        accion="Cambio de Estado de Categoría de Producto (CU-30)",
        detalle=f"Cambio de estado de categoría '{categoria.nombre}' (ID: {categoria.id_categoria}) a {operacion} por {email_admin}.",
        tipo="AUDITORIA_CATALOGO",
        modulo_origen="catalog_app",
        tabla_afectada="categoria_producto",
        id_registro_afectado=str(categoria.id_categoria),
        id_usuario=usuario_admin
    )

    return categoria
