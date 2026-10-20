from typing import Optional, Union
from .models import Marca, ModeloDispositivo, TipoDispositivo

def obtener_marca_por_nombre(nombre: str) -> Optional[Marca]:
    """Obtiene una marca por nombre ignorando mayúsculas/minúsculas."""
    return Marca.objects.filter(nombre__iexact=nombre).first()

def obtener_marca_por_id(id_marca: int) -> Optional[Marca]:
    """Obtiene una marca por su ID."""
    return Marca.objects.filter(id_marca=id_marca).first()

def obtener_marca(id_marca: int) -> Marca:
    """
    Retorna la instancia exacta de Marca por su ID.
    Levanta Marca.DoesNotExist (ObjectDoesNotExist) si no existe.
    """
    return Marca.objects.get(id_marca=id_marca)

def obtener_todas_marcas(
    solo_activas: bool = False,
    texto_busqueda: Optional[str] = None,
    estado_activo: Optional[Union[str, bool]] = None
):
    """
    Retorna la lista de marcas.
    Si solo_activas es True, filtra por estado_activo=True.
    Si estado_activo es provisto, filtra por ese valor booleano.
    Si se provee texto_busqueda, filtra por nombre (insensible a mayúsculas).
    """
    qs = Marca.objects.all()
    if solo_activas:
        qs = qs.filter(estado_activo=True)
    elif estado_activo is not None:
        if isinstance(estado_activo, bool):
            qs = qs.filter(estado_activo=estado_activo)
        else:
            estado_str = str(estado_activo).strip().lower()
            if estado_str in ['true', '1', 'si']:
                qs = qs.filter(estado_activo=True)
            elif estado_str in ['false', '0', 'no']:
                qs = qs.filter(estado_activo=False)

    if texto_busqueda:
        termino = str(texto_busqueda).strip()
        if termino:
            qs = qs.filter(nombre__icontains=termino)
    return qs.order_by('nombre')

def obtener_tipo_dispositivo_por_id(id_tipo_dispositivo: int) -> Optional[TipoDispositivo]:
    """Obtiene un tipo de dispositivo por su ID."""
    return TipoDispositivo.objects.filter(id_tipo_dispositivo=id_tipo_dispositivo).first()

def obtener_tipo_dispositivo(id_tipo: int) -> TipoDispositivo:
    """
    Retorna una instancia de TipoDispositivo por su ID.
    Levanta TipoDispositivo.DoesNotExist (ObjectDoesNotExist) si no existe.
    """
    return TipoDispositivo.objects.get(id_tipo_dispositivo=id_tipo)

def obtener_todos_tipos_dispositivos(
    solo_activos: bool = False,
    estado_activo: Optional[Union[str, bool]] = None
):
    """
    Retorna el listado de tipos de dispositivos.
    Si solo_activos es True, filtra por estado_activo=True.
    Si estado_activo es provisto, filtra por ese valor booleano.
    """
    qs = TipoDispositivo.objects.all()
    if solo_activos:
        qs = qs.filter(estado_activo=True)
    elif estado_activo is not None:
        if isinstance(estado_activo, bool):
            qs = qs.filter(estado_activo=estado_activo)
        else:
            estado_str = str(estado_activo).strip().lower()
            if estado_str in ['true', '1', 'si']:
                qs = qs.filter(estado_activo=True)
            elif estado_str in ['false', '0', 'no']:
                qs = qs.filter(estado_activo=False)
    return qs.order_by('nombre')

def obtener_modelo_por_nombre_y_marca(nombre: str, id_marca: int) -> Optional[ModeloDispositivo]:
    """Obtiene un modelo por su nombre ignorando mayúsculas/minúsculas y su marca asociada."""
    return ModeloDispositivo.objects.filter(nombre__iexact=nombre, id_marca_id=id_marca).first()

def obtener_modelo(id_modelo: int) -> ModeloDispositivo:
    """
    Retorna la instancia exacta de ModeloDispositivo por su ID.
    Levanta ModeloDispositivo.DoesNotExist (ObjectDoesNotExist) si no existe.
    Optimizado con select_related para id_marca e id_tipo_dispositivo.
    """
    return ModeloDispositivo.objects.select_related('id_marca', 'id_tipo_dispositivo').get(id_modelo=id_modelo)

def filtrar_modelos(
    *,
    texto_busqueda: Optional[str] = None,
    id_marca: Optional[int] = None,
    id_tipo_dispositivo: Optional[int] = None,
    estado_activo: Optional[Union[str, bool]] = None
):
    """
    CU-81: Filtrar Modelos.
    Retorna un QuerySet de ModeloDispositivo optimizado con select_related('id_marca', 'id_tipo_dispositivo').
    Aplica filtros por búsqueda parcial de nombre, id_marca, id_tipo_dispositivo y estado_activo.
    """
    qs = ModeloDispositivo.objects.select_related('id_marca', 'id_tipo_dispositivo').all()

    if texto_busqueda:
        termino = str(texto_busqueda).strip()
        if termino:
            qs = qs.filter(nombre__icontains=termino)

    if id_marca is not None:
        qs = qs.filter(id_marca_id=id_marca)

    if id_tipo_dispositivo is not None:
        qs = qs.filter(id_tipo_dispositivo_id=id_tipo_dispositivo)

    if estado_activo is not None:
        if isinstance(estado_activo, bool):
            qs = qs.filter(estado_activo=estado_activo)
        else:
            estado_str = str(estado_activo).strip().lower()
            if estado_str in ['true', '1', 'si']:
                qs = qs.filter(estado_activo=True)
            elif estado_str in ['false', '0', 'no']:
                qs = qs.filter(estado_activo=False)

    return qs.order_by('nombre')


def obtener_categorias_activas():
    """Retorna todas las categorías de productos habilitadas."""
    from .models import CategoriaProducto
    return CategoriaProducto.objects.filter(estado=True).order_by('nombre')


def filtrar_categorias_producto(
    *,
    texto_busqueda: Optional[str] = None,
    estado_activo: Optional[Union[str, bool]] = None
):
    """
    CU-39: Filtrar Categorías de Producto.
    Retorna un QuerySet de CategoriaProducto.
    Aplica filtros por búsqueda parcial de nombre y estado_activo.
    """
    from .models import CategoriaProducto

    qs = CategoriaProducto.objects.all()
    if estado_activo is not None:
        if isinstance(estado_activo, bool):
            qs = qs.filter(estado=estado_activo)
        else:
            estado_str = str(estado_activo).strip().lower()
            if estado_str in ['true', '1', 'si']:
                qs = qs.filter(estado=True)
            elif estado_str in ['false', '0', 'no']:
                qs = qs.filter(estado=False)

    if texto_busqueda:
        termino = str(texto_busqueda).strip()
        if termino:
            qs = qs.filter(nombre__icontains=termino)

    return qs.order_by('nombre')


def obtener_categoria_producto(id_categoria: int):
    """
    Retorna la instancia exacta de CategoriaProducto por su ID.
    Levanta CategoriaProducto.DoesNotExist (ObjectDoesNotExist) si no existe.
    """
    from .models import CategoriaProducto

    return CategoriaProducto.objects.get(id_categoria=id_categoria)


def obtener_productos_tienda(
    *,
    search: Optional[str] = None,
    id_categoria: Optional[int] = None,
    usuario: Optional[Any] = None
):
    """
    Retorna los productos activos y aptos para venta para el portal de clientes,
    calculando en tiempo real la disponibilidad de stock, e incluyendo marca, modelo,
    tipo de dispositivo, imagen representativa, galería de imágenes y descuentos aplicables.
    """
    from decimal import Decimal
    from django.db.models import Q
    from .models import Producto
    from inventory_app.selectors import obtener_stock_actual_producto
    from sales_app.selectors import obtener_beneficios_activos_usuario

    qs = Producto.objects.filter(estado=True, apto_venta=True).select_related(
        'id_categoria',
        'id_marca',
        'id_modelo',
        'id_modelo__id_tipo_dispositivo',
        'id_tipo_dispositivo'
    ).prefetch_related('imagenes')

    if id_categoria:
        qs = qs.filter(id_categoria_id=id_categoria)

    if search:
        termino = search.strip()
        if termino:
            qs = qs.filter(
                Q(nombre__icontains=termino) |
                Q(descripcion__icontains=termino) |
                Q(id_marca__nombre__icontains=termino) |
                Q(id_modelo__nombre__icontains=termino) |
                Q(id_tipo_dispositivo__nombre__icontains=termino) |
                Q(id_modelo__id_tipo_dispositivo__nombre__icontains=termino)
            )

    qs = qs.order_by('nombre')

    # Consultar beneficios/descuentos del cliente si está autenticado
    id_usuario = getattr(usuario, 'id_usuario', None) if usuario else None
    beneficios_usuario = obtener_beneficios_activos_usuario(id_usuario) if id_usuario else {}

    resultados = []
    for prod in qs:
        cant_stock = obtener_stock_actual_producto(prod.id_producto)

        # Resolver tipo de dispositivo (directo en producto o heredado de modelo)
        tipo_disp_nombre = ''
        id_tipo_disp = None
        if prod.id_tipo_dispositivo:
            tipo_disp_nombre = prod.id_tipo_dispositivo.nombre
            id_tipo_disp = prod.id_tipo_dispositivo_id
        elif prod.id_modelo and prod.id_modelo.id_tipo_dispositivo:
            tipo_disp_nombre = prod.id_modelo.id_tipo_dispositivo.nombre
            id_tipo_disp = prod.id_modelo.id_tipo_dispositivo_id

        # Resolver imágenes
        imagenes_list = [img.url_imagen for img in prod.imagenes.all()]
        img_principal = prod.imagen_principal
        if not img_principal and imagenes_list:
            img_principal = imagenes_list[0]
        if img_principal and img_principal not in imagenes_list:
            imagenes_list.insert(0, img_principal)

        # Resolver descuento si existe beneficio para el usuario
        tiene_descuento = False
        porcentaje_desc = Decimal('0.00')
        precio_base = prod.precio_venta
        precio_final = precio_base
        motivo_desc = ''

        if prod.id_producto in beneficios_usuario:
            info_b = beneficios_usuario[prod.id_producto]
            pct = Decimal(str(info_b['porcentaje_descuento']))
            if pct > 0:
                tiene_descuento = True
                porcentaje_desc = pct
                descuento_monto = (precio_base * pct) / Decimal('100.00')
                precio_final = round(precio_base - descuento_monto, 2)
                motivo_desc = info_b.get('motivo', '')

        resultados.append({
            'id_producto': prod.id_producto,
            'nombre': prod.nombre,
            'descripcion': prod.descripcion or '',
            'precio_venta': precio_base,
            'id_categoria': prod.id_categoria_id,
            'categoria_nombre': prod.id_categoria.nombre if prod.id_categoria else '',
            'id_marca': prod.id_marca_id,
            'marca_nombre': prod.id_marca.nombre if prod.id_marca else '',
            'id_modelo': prod.id_modelo_id,
            'modelo_nombre': prod.id_modelo.nombre if prod.id_modelo else '',
            'id_tipo_dispositivo': id_tipo_disp,
            'tipo_dispositivo_nombre': tipo_disp_nombre,
            'imagen_principal': img_principal or '',
            'imagenes': imagenes_list,
            'stock_disponible': max(0, cant_stock),
            'en_stock': cant_stock > 0,
            'tiene_descuento': tiene_descuento,
            'porcentaje_descuento': porcentaje_desc,
            'precio_final': precio_final,
            'motivo_descuento': motivo_desc
        })

    return resultados
