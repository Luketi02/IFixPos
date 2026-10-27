import json
from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers


# ==============================================================================
# CU-36: FILTRAR PROVEEDORES (SERIALIZERS)
# ==============================================================================

class FiltrarProveedoresInputSerializer(serializers.Serializer):
    """La Aduana (CU-36): Valida parámetros de consulta para filtrar proveedores."""
    buscar = serializers.CharField(required=False, allow_blank=True, max_length=255)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True, max_length=255)
    cuit_prov = serializers.CharField(required=False, allow_blank=True, max_length=20)
    ofrece_envio = serializers.BooleanField(required=False, allow_null=True)
    nivel = serializers.CharField(required=False, allow_blank=True, max_length=50)


class ProveedorOutputSerializer(serializers.Serializer):
    """Formato de salida estructurado para proveedores."""
    cuit_prov = serializers.CharField(read_only=True)
    nombre_proveedor = serializers.CharField(read_only=True)
    correo = serializers.CharField(read_only=True, allow_null=True)
    telefono = serializers.CharField(read_only=True, allow_null=True)
    ofrece_envio = serializers.BooleanField(read_only=True)
    indice_confiabilidad = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    tiempo_promedio_entrega = serializers.IntegerField(read_only=True)
    nivel = serializers.CharField(read_only=True)
    id_direccion = serializers.IntegerField(source='id_direccion_id', read_only=True, allow_null=True)


# ==============================================================================
# CU-37: FILTRAR ÓRDENES DE COMPRA (SERIALIZERS)
# ==============================================================================

class FiltrarOrdenesCompraInputSerializer(serializers.Serializer):
    """La Aduana (CU-37): Valida parámetros de consulta para órdenes de compra."""
    id_orden = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    estado_orden = serializers.IntegerField(required=False, allow_null=True)
    cuit_prov = serializers.CharField(required=False, allow_blank=True, max_length=20)
    tipo_entrega = serializers.IntegerField(required=False, allow_null=True)
    sol_tec = serializers.BooleanField(required=False, allow_null=True)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)

    def validate(self, attrs):
        f_desde = attrs.get('fecha_desde')
        f_hasta = attrs.get('fecha_hasta')
        if f_desde and f_hasta and f_desde > f_hasta:
            raise serializers.ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")
        return attrs


class DetalleOrdenCompraOutputSerializer(serializers.Serializer):
    id_detalle_compra = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()
    cantidad = serializers.IntegerField(read_only=True)
    cantidad_recibida = serializers.IntegerField(read_only=True, allow_null=True)
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    subtotal = serializers.SerializerMethodField()

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""

    def get_subtotal(self, obj):
        cant = obj.cantidad_recibida if obj.cantidad_recibida is not None else obj.cantidad
        if cant is not None and obj.precio_unitario is not None:
            return str(Decimal(str(cant)) * Decimal(str(obj.precio_unitario)))
        return "0.00"


class OrdenCompraOutputSerializer(serializers.Serializer):
    """Formato de salida estructurado para órdenes de compra."""
    id_orden = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_orden = serializers.IntegerField(read_only=True)
    sol_tec = serializers.BooleanField(read_only=True)
    nro_remito = serializers.CharField(read_only=True, allow_null=True)
    tipo_entrega = serializers.IntegerField(read_only=True)
    fecha_recepcion = serializers.DateField(read_only=True, allow_null=True)
    cuit_prov = serializers.CharField(source='cuit_prov_id', read_only=True)
    nombre_proveedor = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    def get_nombre_proveedor(self, obj):
        return obj.cuit_prov.nombre_proveedor if obj.cuit_prov else ""

    def get_items(self, obj):
        detalles = obj.detalleordencompra_set.all()
        return DetalleOrdenCompraOutputSerializer(detalles, many=True).data


# ==============================================================================
# CU-41: FILTRAR SOLICITUD DE COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class FiltrarSolicitudCotizacionInputSerializer(serializers.Serializer):
    """La Aduana (CU-41): Valida parámetros de consulta para solicitudes de cotización."""
    id_solicitud = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    estado_solicitud = serializers.IntegerField(required=False, allow_null=True)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)
    id_producto = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    buscar_producto = serializers.CharField(required=False, allow_blank=True, max_length=255)

    def validate(self, attrs):
        f_desde = attrs.get('fecha_desde')
        f_hasta = attrs.get('fecha_hasta')
        if f_desde and f_hasta and f_desde > f_hasta:
            raise serializers.ValidationError("La fecha inicial (fecha_desde) no puede ser posterior a la fecha final (fecha_hasta).")
        return attrs


class SolicitudProductoOutputSerializer(serializers.Serializer):
    id_solicitud_producto = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""


class SolicitudCotizacionOutputSerializer(serializers.Serializer):
    """Formato de salida estructurado para solicitudes de cotización."""
    id_solicitud = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_solicitud = serializers.IntegerField(read_only=True)
    productos = serializers.SerializerMethodField()

    def get_productos(self, obj):
        items = obj.solicitudcotizacionproducto_set.all()
        return SolicitudProductoOutputSerializer(items, many=True).data


# ==============================================================================
# CU-60: FILTRAR COTIZACIONES (SERIALIZERS)
# ==============================================================================

class FiltrarCotizacionesInputSerializer(serializers.Serializer):
    """La Aduana (CU-60): Valida parámetros de consulta para cotizaciones recibidas."""
    id_cotizacion = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    id_solicitud = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    cuit_prov = serializers.CharField(required=False, allow_blank=True, max_length=20)
    estado_cotizacion = serializers.IntegerField(required=False, allow_null=True)
    fecha_validez_desde = serializers.DateField(required=False, allow_null=True)
    fecha_validez_hasta = serializers.DateField(required=False, allow_null=True)
    id_producto = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate(self, attrs):
        f_desde = attrs.get('fecha_validez_desde')
        f_hasta = attrs.get('fecha_validez_hasta')
        if f_desde and f_hasta and f_desde > f_hasta:
            raise serializers.ValidationError("El rango temporal de validez es inconsistente.")
        return attrs


class CotizacionProductoOutputSerializer(serializers.Serializer):
    id_cotizacion_producto = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()
    precio_ofrecido = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""


class CotizacionOutputSerializer(serializers.Serializer):
    """Formato de salida estructurado para cotizaciones recibidas."""
    id_cotizacion = serializers.IntegerField(read_only=True)
    tiempo_promesa = serializers.IntegerField(read_only=True)
    archivo_adjunto = serializers.CharField(read_only=True, allow_null=True)
    estado_cotizacion = serializers.IntegerField(read_only=True)
    comentarios = serializers.CharField(read_only=True, allow_null=True)
    fecha_validez = serializers.DateField(read_only=True)
    id_solicitud = serializers.SerializerMethodField()
    cuit_prov = serializers.SerializerMethodField()
    nombre_proveedor = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()

    def get_id_solicitud(self, obj):
        if obj.id_invitacion and obj.id_invitacion.id_solicitud_id:
            return obj.id_invitacion.id_solicitud_id
        return None

    def get_cuit_prov(self, obj):
        if obj.id_invitacion and obj.id_invitacion.cuit_prov_id:
            return obj.id_invitacion.cuit_prov_id
        return None

    def get_nombre_proveedor(self, obj):
        if obj.id_invitacion and obj.id_invitacion.cuit_prov:
            return obj.id_invitacion.cuit_prov.nombre_proveedor
        return ""

    def get_items(self, obj):
        detalles = obj.cotizacionproducto_set.all()
        return CotizacionProductoOutputSerializer(detalles, many=True).data


# ==============================================================================
# CU-24: REGISTRAR PROVEEDOR Y CU-28: MODIFICAR PROVEEDOR (SERIALIZERS)
# ==============================================================================

class DireccionProveedorInputSerializer(serializers.Serializer):
    """La Aduana Geográfica: Valida los datos de ubicación física del proveedor."""
    calle = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={
            'required': 'La calle de la dirección es obligatoria.',
            'blank': 'La calle no puede estar vacía.'
        }
    )
    numero = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    ciudad = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={
            'required': 'El identificador de ciudad es obligatorio.',
            'invalid': 'El identificador de ciudad debe ser un número entero válido.'
        }
    )
    provincia = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    pais = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    barrio = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    piso = serializers.IntegerField(required=False, allow_null=True, default=None)
    dpto = serializers.CharField(max_length=50, required=False, allow_blank=True, default='')
    alias = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')

    def validate_ciudad(self, value):
        from geo_app.models import Ciudad
        if not Ciudad.objects.filter(id_ciudad=value).exists():
            raise serializers.ValidationError(f"La ciudad con ID {value} no existe en el sistema.")
        return value


class RegistrarProveedorInputSerializer(serializers.Serializer):
    """
    CU-24: La Aduana Administrativa para el empadronamiento de nuevos proveedores.
    """
    nombre = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={
            'required': 'El nombre del proveedor es obligatorio.',
            'blank': 'El nombre del proveedor no puede estar vacío.'
        }
    )
    cuit = serializers.CharField(
        max_length=20,
        required=True,
        error_messages={
            'required': 'El CUIT es obligatorio.',
            'blank': 'El CUIT no puede estar vacío.'
        }
    )
    correo = serializers.EmailField(
        max_length=255,
        required=True,
        error_messages={
            'required': 'El correo electrónico es obligatorio.',
            'invalid': 'Ingrese un formato de correo electrónico válido.'
        }
    )
    telefono = serializers.CharField(
        max_length=50,
        required=True,
        error_messages={
            'required': 'El teléfono de contacto es obligatorio.',
            'blank': 'El teléfono no puede estar vacío.'
        }
    )
    direccion = DireccionProveedorInputSerializer(
        required=True,
        error_messages={
            'required': 'Los datos de la dirección física son obligatorios.'
        }
    )
    ofrece_envio = serializers.BooleanField(required=False, default=True)
    indice_confiabilidad = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        default=Decimal('10.00')
    )
    tiempo_promedio_entrega = serializers.IntegerField(
        required=False,
        default=3,
        min_value=0
    )
    nivel = serializers.CharField(
        max_length=50,
        required=False,
        default='Estándar'
    )

    def validate_nombre(self, value):
        limpio = (value or '').strip()
        if not limpio:
            raise serializers.ValidationError("El nombre del proveedor no puede estar vacío.")
        return limpio

    def validate_cuit(self, value):
        limpio = (value or '').strip()
        if not limpio:
            raise serializers.ValidationError("El CUIT del proveedor no puede estar vacío.")
        return limpio

    def validate_correo(self, value):
        return (value or '').strip().lower()

    def validate_telefono(self, value):
        limpio = (value or '').strip()
        if not limpio:
            raise serializers.ValidationError("El teléfono de contacto no puede estar vacío.")
        return limpio


class ModificarProveedorInputSerializer(serializers.Serializer):
    """
    CU-28: La Aduana Administrativa para modificar datos fiscales, de contacto o estado (Soft Delete).
    """
    nombre = serializers.CharField(max_length=255, required=False, allow_blank=False)
    cuit = serializers.CharField(max_length=20, required=False, allow_blank=False)
    correo = serializers.EmailField(max_length=255, required=False, allow_blank=False)
    telefono = serializers.CharField(max_length=50, required=False, allow_blank=False)
    estado = serializers.BooleanField(required=False, help_text="Alternar estado operativo (Activo/Inactivo)")
    ofrece_envio = serializers.BooleanField(required=False)
    indice_confiabilidad = serializers.DecimalField(max_digits=10, decimal_places=2, required=False)
    tiempo_promedio_entrega = serializers.IntegerField(required=False, min_value=0)
    nivel = serializers.CharField(max_length=50, required=False)
    direccion = DireccionProveedorInputSerializer(required=False)

    def validate_nombre(self, value):
        if value is not None:
            limpio = value.strip()
            if not limpio:
                raise serializers.ValidationError("El nombre del proveedor no puede estar vacío.")
            return limpio
        return value

    def validate_cuit(self, value):
        if value is not None:
            limpio = value.strip()
            if not limpio:
                raise serializers.ValidationError("El CUIT no puede estar vacío.")
            return limpio
        return value

    def validate_correo(self, value):
        if value is not None:
            return value.strip().lower()
        return value

    def validate_telefono(self, value):
        if value is not None:
            limpio = value.strip()
            if not limpio:
                raise serializers.ValidationError("El teléfono no puede estar vacío.")
            return limpio
        return value


class DireccionDetalleOutputSerializer(serializers.Serializer):
    """Formato de salida enriquecido para la dirección de un proveedor."""
    id_direccion = serializers.IntegerField(read_only=True)
    calle_numero = serializers.CharField(source='nro_calle', read_only=True)
    nro_calle = serializers.CharField(read_only=True)
    barrio = serializers.CharField(source='nombre_barrio', read_only=True, allow_null=True)
    nombre_barrio = serializers.CharField(read_only=True, allow_null=True)
    piso = serializers.IntegerField(read_only=True, allow_null=True)
    dpto = serializers.CharField(source='nro_dpto', read_only=True, allow_null=True)
    nro_dpto = serializers.CharField(read_only=True, allow_null=True)
    alias = serializers.CharField(read_only=True, allow_null=True)
    id_ciudad = serializers.IntegerField(source='id_ciudad_id', read_only=True, allow_null=True)
    ciudad = serializers.SerializerMethodField()
    provincia = serializers.SerializerMethodField()
    pais = serializers.SerializerMethodField()

    def get_ciudad(self, obj):
        return obj.id_ciudad.nombre_ciudad if obj.id_ciudad else ""

    def get_provincia(self, obj):
        if obj.id_ciudad and obj.id_ciudad.id_provincia:
            return obj.id_ciudad.id_provincia.nombre_provincia
        return ""

    def get_pais(self, obj):
        if obj.id_ciudad and obj.id_ciudad.id_provincia and obj.id_ciudad.id_provincia.id_pais:
            return obj.id_ciudad.id_provincia.id_pais.nombre_pais
        return ""


class ProveedorDetalleOutputSerializer(serializers.Serializer):
    """Formato de salida completo para el expediente de un proveedor."""
    cuit_prov = serializers.CharField(read_only=True)
    cuit = serializers.CharField(source='cuit_prov', read_only=True)
    nombre_proveedor = serializers.CharField(read_only=True)
    nombre = serializers.CharField(source='nombre_proveedor', read_only=True)
    correo = serializers.CharField(read_only=True, allow_null=True)
    telefono = serializers.CharField(read_only=True, allow_null=True)
    estado = serializers.BooleanField(read_only=True)
    ofrece_envio = serializers.BooleanField(read_only=True)
    indice_confiabilidad = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    tiempo_promedio_entrega = serializers.IntegerField(read_only=True)
    nivel = serializers.CharField(read_only=True)
    id_direccion = serializers.IntegerField(source='id_direccion_id', read_only=True, allow_null=True)
    direccion = DireccionDetalleOutputSerializer(source='id_direccion', read_only=True, allow_null=True)


# ==============================================================================
# CU-14: GENERAR SOLICITUD DE COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class ProductoSolicitadoInputSerializer(serializers.Serializer):
    """La Aduana (CU-14): Valida cada producto solicitado y su cantidad requerida."""
    id_producto = serializers.IntegerField(min_value=1, help_text="Identificador único del producto en catálogo.")
    cantidad_requerida = serializers.IntegerField(min_value=1, help_text="Cantidad de unidades requeridas para cotizar.")


class GenerarSolicitudInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-14): Valida los parámetros de confección de la Solicitud de Cotización.
    Permite emitir inmediatamente a proveedores o guardar como borrador.
    """
    ids_proveedores = serializers.ListField(
        child=serializers.CharField(max_length=50),
        min_length=1,
        help_text="Lista de identificadores o CUITs de los proveedores destinatarios."
    )
    productos = ProductoSolicitadoInputSerializer(
        many=True,
        min_length=1,
        help_text="Lista de insumos/repuestos a cotizar."
    )
    guardar_como_borrador = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Si es True, persiste en estado 'Borrador' sin notificar a proveedores."
    )

    def validate_ids_proveedores(self, value):
        limpios = [str(x).strip() for x in value if x is not None and str(x).strip()]
        if not limpios:
            raise serializers.ValidationError("Debe especificar al menos un proveedor destinatario válido.")
        return limpios

    def validate_productos(self, value):
        if not value:
            raise serializers.ValidationError("Debe incluir al menos un producto a cotizar.")
        return value


# ==============================================================================
# CU-15: CONSULTAR SOLICITUD DE COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class SolicitudCotizacionListOutputSerializer(serializers.Serializer):
    """Formato de salida resumido para el listado histórico de solicitudes de cotización."""
    id_solicitud = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_solicitud = serializers.IntegerField(read_only=True)
    estado = serializers.SerializerMethodField()
    total_proveedores = serializers.SerializerMethodField()
    total_productos = serializers.SerializerMethodField()

    def get_estado(self, obj):
        return getattr(obj, 'estado_nombre', 'Borrador')

    def get_total_proveedores(self, obj):
        return obj.invitacioncotizar_set.count()

    def get_total_productos(self, obj):
        return obj.solicitudcotizacionproducto_set.count()


class ProductoSolicitadoOutputSerializer(serializers.Serializer):
    """Detalle de producto requerido dentro de una solicitud de cotización."""
    id_solicitud_producto = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()
    categoria = serializers.SerializerMethodField()
    cantidad_requerida = serializers.SerializerMethodField()

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""

    def get_categoria(self, obj):
        if obj.id_producto and obj.id_producto.id_categoria:
            return obj.id_producto.id_categoria.nombre
        return ""

    def get_cantidad_requerida(self, obj):
        return getattr(obj, 'cantidad', 1)


class CotizacionProveedorOutputSerializer(serializers.Serializer):
    """Propuesta económica recibida o pendiente de un proveedor invitado."""
    id_invitacion = serializers.IntegerField(read_only=True)
    id_cotizacion = serializers.SerializerMethodField()
    proveedor = serializers.SerializerMethodField()
    estado = serializers.SerializerMethodField()
    estado_cotizacion = serializers.SerializerMethodField()
    token_acceso = serializers.CharField(read_only=True, allow_null=True)
    link_acceso = serializers.SerializerMethodField()
    tiempo_promesa = serializers.SerializerMethodField()
    archivo_adjunto = serializers.SerializerMethodField()
    comentarios = serializers.SerializerMethodField()
    fecha_validez = serializers.SerializerMethodField()

    def _obtener_cotizacion(self, obj):
        cotizaciones = list(obj.cotizacion_set.all())
        return cotizaciones[0] if cotizaciones else None

    def get_id_cotizacion(self, obj):
        cot = self._obtener_cotizacion(obj)
        return cot.id_cotizacion if cot else None

    def get_proveedor(self, obj):
        p = obj.cuit_prov
        if not p:
            return None
        return {
            "cuit": p.cuit_prov,
            "cuit_prov": p.cuit_prov,
            "nombre": p.nombre_proveedor,
            "nombre_proveedor": p.nombre_proveedor,
            "correo": p.correo,
            "telefono": p.telefono,
            "nivel": p.nivel,
            "ofrece_envio": p.ofrece_envio,
            "indice_confiabilidad": str(p.indice_confiabilidad),
            "tiempo_promedio_entrega": p.tiempo_promedio_entrega
        }

    def get_estado(self, obj):
        cot = self._obtener_cotizacion(obj)
        if cot:
            return cot.estado_nombre
        return obj.estado_nombre

    def get_estado_cotizacion(self, obj):
        cot = self._obtener_cotizacion(obj)
        return cot.estado_cotizacion if cot else obj.estado_invitacion

    def get_link_acceso(self, obj):
        if obj.token_acceso:
            return f"/portal-proveedor/cotizar?token={obj.token_acceso}"
        return None

    def get_tiempo_promesa(self, obj):
        cot = self._obtener_cotizacion(obj)
        return cot.tiempo_promesa if cot else None

    def get_archivo_adjunto(self, obj):
        cot = self._obtener_cotizacion(obj)
        return cot.archivo_adjunto if cot else None

    def get_comentarios(self, obj):
        cot = self._obtener_cotizacion(obj)
        return cot.comentarios if cot else None

    def get_fecha_validez(self, obj):
        cot = self._obtener_cotizacion(obj)
        return str(cot.fecha_validez) if (cot and cot.fecha_validez) else None


class SolicitudCotizacionDetailOutputSerializer(serializers.Serializer):
    """Expediente completo de una Solicitud de Cotización, productos e invitaciones/cotizaciones."""
    id_solicitud = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_solicitud = serializers.IntegerField(read_only=True)
    estado = serializers.SerializerMethodField()
    productos = serializers.SerializerMethodField()
    cotizaciones = serializers.SerializerMethodField()
    matriz_ofertas = serializers.SerializerMethodField()

    def get_estado(self, obj):
        return getattr(obj, 'estado_nombre', 'Borrador')

    def get_productos(self, obj):
        items = obj.solicitudcotizacionproducto_set.all()
        return ProductoSolicitadoOutputSerializer(items, many=True).data

    def get_cotizaciones(self, obj):
        invitaciones = obj.invitacioncotizar_set.all()
        return CotizacionProveedorOutputSerializer(invitaciones, many=True).data

    def get_matriz_ofertas(self, obj):
        return self.get_cotizaciones(obj)


# ==============================================================================
# CU-16: MODIFICAR SOLICITUD DE COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class ModificarSolicitudInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-16): Valida la edición del padrón de proveedores y la lista de repuestos
    de una solicitud de cotización que se encuentre en estado 'Borrador'.
    Permite mantener el estado borrador o despachar formalmente al mercado ('Emitir').
    """
    ids_proveedores = serializers.ListField(
        child=serializers.CharField(max_length=50),
        min_length=1,
        help_text="Lista de identificadores o CUITs de los proveedores destinatarios."
    )
    productos = ProductoSolicitadoInputSerializer(
        many=True,
        min_length=1,
        help_text="Lista de insumos/repuestos a cotizar con sus cantidades requeridas."
    )
    emitir_solicitud = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Si es True, transiciona de 'Borrador' a 'Enviada a Proveedores' emitiendo invitaciones."
    )

    def validate_ids_proveedores(self, value):
        limpios = [str(x).strip() for x in value if x is not None and str(x).strip()]
        if not limpios:
            raise serializers.ValidationError("Debe especificar al menos un proveedor destinatario válido.")
        return limpios

    def validate_productos(self, value):
        if not value:
            raise serializers.ValidationError("Debe incluir al menos un producto a cotizar.")
        return value


# ==============================================================================
# CU-25: RESPONDER SOLICITUD DE COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class CotizacionProductoInputSerializer(serializers.Serializer):
    """La Aduana (CU-25): Valida el precio unitario exacto ofrecido por el proveedor para un ítem."""
    id_producto = serializers.IntegerField(min_value=1, help_text="Identificador único del producto.")
    precio_ofrecido = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.00"),
        help_text="Precio unitario en pesos ofrecido por el proveedor."
    )


class ResponderCotizacionInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-25): Procesa la respuesta del proveedor externo mediante enlace seguro.
    Permite enviar una oferta formal ('COTIZAR') o declinar la solicitud ('DECLINAR').
    """
    ACCION_CHOICES = ('COTIZAR', 'DECLINAR')

    accion = serializers.ChoiceField(
        choices=ACCION_CHOICES,
        help_text="Acción a ejecutar: 'COTIZAR' para enviar propuesta o 'DECLINAR' para rechazar."
    )
    plazo_entrega = serializers.IntegerField(
        required=False,
        min_value=1,
        help_text="Plazo estimado de entrega en días corridos."
    )
    fecha_validez = serializers.DateField(
        required=False,
        help_text="Fecha de vencimiento o caducidad de los precios ofrecidos."
    )
    archivo_adjunto = serializers.FileField(
        required=False,
        allow_null=True,
        help_text="Presupuesto formal en archivo PDF de respaldo contable."
    )
    comentarios = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        help_text="Comentarios generales o justificación obligatoria en caso de declinar."
    )
    items = serializers.JSONField(
        required=False,
        help_text="Listado estructurado de productos cotizados con sus precios unitarios."
    )

    def validate(self, attrs):
        accion = (attrs.get('accion') or '').upper()

        if accion == 'COTIZAR':
            # 1. Validar plazo de entrega
            if not attrs.get('plazo_entrega'):
                raise serializers.ValidationError({
                    "plazo_entrega": "El plazo de entrega estimado (días) es obligatorio al enviar una cotización."
                })

            # 2. Validar fecha límite de validez
            f_validez = attrs.get('fecha_validez')
            if not f_validez:
                raise serializers.ValidationError({
                    "fecha_validez": "La fecha límite de validez de la oferta es obligatoria."
                })
            if f_validez < timezone.now().date():
                raise serializers.ValidationError({
                    "fecha_validez": "La fecha de validez no puede ser anterior a la fecha actual."
                })

            # 3. Validar archivo adjunto PDF
            archivo = attrs.get('archivo_adjunto')
            if not archivo:
                raise serializers.ValidationError({
                    "archivo_adjunto": "Es obligatorio adjuntar el presupuesto formal en formato PDF."
                })
            if hasattr(archivo, 'name') and not archivo.name.lower().endswith('.pdf'):
                raise serializers.ValidationError({
                    "archivo_adjunto": "El archivo adjunto debe ser estrictamente un documento PDF."
                })

            # 4. Validar ítems cotizados
            raw_items = attrs.get('items')
            if not raw_items:
                raise serializers.ValidationError({
                    "items": "Debe cotizar al menos un producto."
                })

            if isinstance(raw_items, str):
                try:
                    parsed_items = json.loads(raw_items)
                except Exception:
                    raise serializers.ValidationError({
                        "items": "El formato de los ítems cotizados no es un JSON válido."
                    })
            elif isinstance(raw_items, list):
                parsed_items = raw_items
            else:
                raise serializers.ValidationError({
                    "items": "La lista de ítems debe ser una colección estructurada válida."
                })

            serializer_items = CotizacionProductoInputSerializer(data=parsed_items, many=True)
            serializer_items.is_valid(raise_exception=True)

            items_validos = serializer_items.validated_data
            if not any(item['precio_ofrecido'] > Decimal("0.00") for item in items_validos):
                raise serializers.ValidationError({
                    "items": "Al menos un producto debe ser cotizado con precio mayor a cero."
                })

            attrs['items'] = items_validos

        elif accion == 'DECLINAR':
            comentarios = (attrs.get('comentarios') or '').strip()
            if not comentarios:
                raise serializers.ValidationError({
                    "comentarios": "Debe ingresar una justificación o comentario obligatorio para declinar la solicitud."
                })
            attrs['comentarios'] = comentarios

        return attrs


class FichaCotizacionPortalOutputSerializer(serializers.Serializer):
    """Formato de salida seguro para la vista de carga del proveedor invitado (GET)."""
    id_solicitud = serializers.IntegerField(source='id_solicitud.id_solicitud', read_only=True)
    fecha_emision = serializers.DateField(source='id_solicitud.fecha_emision', read_only=True)
    estado_solicitud = serializers.CharField(source='id_solicitud.estado_nombre', read_only=True)
    proveedor = serializers.SerializerMethodField()
    productos_solicitados = serializers.SerializerMethodField()

    def get_proveedor(self, obj):
        p = obj.cuit_prov
        return {
            "cuit": p.cuit_prov,
            "nombre": p.nombre_proveedor,
            "correo": p.correo
        }

    def get_productos_solicitados(self, obj):
        items = obj.id_solicitud.solicitudcotizacionproducto_set.all()
        return [
            {
                "id_producto": item.id_producto_id,
                "nombre": item.id_producto.nombre if item.id_producto else "",
                "categoria": item.id_producto.id_categoria.nombre if (item.id_producto and item.id_producto.id_categoria) else "",
                "cantidad_requerida": item.cantidad
            }
            for item in items
        ]


# ==============================================================================
# CU-52: INSPECCIONAR COTIZACIONES (SERIALIZERS)
# ==============================================================================

class CotizacionItemOutputSerializer(serializers.Serializer):
    """Renglón individual de producto cotizado con subtotal calculado."""
    id_cotizacion_producto = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.SerializerMethodField()
    categoria = serializers.SerializerMethodField()
    cantidad = serializers.SerializerMethodField()
    precio_unitario = serializers.DecimalField(source='precio_ofrecido', max_digits=10, decimal_places=2, read_only=True)
    subtotal = serializers.SerializerMethodField()

    def _get_cantidad(self, obj):
        cotizacion = getattr(obj, 'id_cotizacion', None)
        if cotizacion and cotizacion.id_invitacion and cotizacion.id_invitacion.id_solicitud:
            solicitud = cotizacion.id_invitacion.id_solicitud
            for sp in solicitud.solicitudcotizacionproducto_set.all():
                if sp.id_producto_id == obj.id_producto_id:
                    return sp.cantidad
        return 1

    def get_nombre_producto(self, obj):
        return obj.id_producto.nombre if obj.id_producto else ""

    def get_categoria(self, obj):
        if obj.id_producto and obj.id_producto.id_categoria:
            return obj.id_producto.id_categoria.nombre
        return ""

    def get_cantidad(self, obj):
        return self._get_cantidad(obj)

    def get_subtotal(self, obj):
        cant = self._get_cantidad(obj)
        return Decimal(str(cant)) * obj.precio_ofrecido


class CotizacionResumenOutputSerializer(serializers.Serializer):
    """Formato resumen para la vista comparativa de ofertas en CU-52."""
    id_cotizacion = serializers.IntegerField(read_only=True)
    id_solicitud = serializers.SerializerMethodField()
    proveedor = serializers.SerializerMethodField()
    tiempo_promesa = serializers.IntegerField(read_only=True)
    monto_total_cotizado = serializers.SerializerMethodField()
    fecha_validez = serializers.DateField(read_only=True)
    estado_cotizacion = serializers.IntegerField(read_only=True)
    estado = serializers.SerializerMethodField()
    archivo_adjunto = serializers.CharField(read_only=True, allow_null=True)

    def get_id_solicitud(self, obj):
        return obj.id_invitacion.id_solicitud_id if obj.id_invitacion else None

    def get_proveedor(self, obj):
        p = obj.id_invitacion.cuit_prov if obj.id_invitacion else None
        if not p:
            return None
        return {
            "cuit": p.cuit_prov,
            "nombre": p.nombre_proveedor,
            "nombre_proveedor": p.nombre_proveedor,
            "correo": p.correo,
            "telefono": p.telefono,
            "ofrece_envio": p.ofrece_envio
        }

    def get_estado(self, obj):
        return obj.estado_nombre

    def get_monto_total_cotizado(self, obj):
        total = Decimal("0.00")
        cantidades_map = {}
        if obj.id_invitacion and obj.id_invitacion.id_solicitud:
            for sp in obj.id_invitacion.id_solicitud.solicitudcotizacionproducto_set.all():
                cantidades_map[sp.id_producto_id] = sp.cantidad

        for cp in obj.cotizacionproducto_set.all():
            cant = cantidades_map.get(cp.id_producto_id, 1)
            total += Decimal(str(cant)) * cp.precio_ofrecido
        return total


class CotizacionDetalleOutputSerializer(CotizacionResumenOutputSerializer):
    """Formato exhaustivo para el documento formal de la cotización en CU-52."""
    comentarios = serializers.CharField(read_only=True, allow_null=True)
    items = serializers.SerializerMethodField()
    monto_total = serializers.SerializerMethodField()

    def get_items(self, obj):
        items_qs = obj.cotizacionproducto_set.all()
        return CotizacionItemOutputSerializer(items_qs, many=True).data

    def get_monto_total(self, obj):
        return self.get_monto_total_cotizado(obj)


# ==============================================================================
# CU-53: EVALUAR COTIZACIÓN (SERIALIZERS)
# ==============================================================================

class EvaluarCotizacionInputSerializer(serializers.Serializer):
    """La Aduana (CU-53): Valida la decisión administrativa sobre una oferta recibida."""
    ACCION_CHOICES = ('ACEPTAR', 'RECHAZAR')

    accion = serializers.ChoiceField(
        choices=ACCION_CHOICES,
        help_text="Decisión sobre la oferta: 'ACEPTAR' para convalidar precios o 'RECHAZAR' para descartar."
    )
    comentarios = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        help_text="Observaciones de auditoría o justificación en caso de descarte."
    )


# ==============================================================================
# CU-54: GENERAR ORDEN DE COMPRA (SERIALIZERS)
# ==============================================================================

class ItemCalcularMejorCompraSerializer(serializers.Serializer):
    """Renglón de producto y cantidad requerida para el cálculo inteligente."""
    id_producto = serializers.IntegerField(min_value=1, help_text="Identificador único del producto en catálogo.")
    cantidad = serializers.IntegerField(min_value=1, help_text="Cantidad de unidades requeridas para comprar.")


class CalcularMejorCompraInputSerializer(serializers.Serializer):
    """La Aduana (CU-54): Parámetros de entrada para el cálculo algorítmico de mejor compra."""
    productos = ItemCalcularMejorCompraSerializer(many=True, min_length=1)
    requiere_envio = serializers.BooleanField(required=False, default=False)


class DetalleItemOrdenInputSerializer(serializers.Serializer):
    """Ítem confirmado a emitir dentro de una orden de compra."""
    id_producto = serializers.IntegerField(min_value=1)
    cantidad = serializers.IntegerField(min_value=1)
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))


class BorradorOrdenInputSerializer(serializers.Serializer):
    """Borrador confirmado para emisión formal de orden de compra hacia un proveedor."""
    cuit_prov = serializers.CharField(max_length=50)
    tipo_entrega = serializers.IntegerField(required=False, default=1)
    sol_tec = serializers.BooleanField(required=False, default=False)
    items = DetalleItemOrdenInputSerializer(many=True, min_length=1)


class EmitirOrdenesCompraInputSerializer(serializers.Serializer):
    """La Aduana (CU-54): Confirma la emisión de múltiples órdenes de compra hacia los proveedores."""
    borradores = BorradorOrdenInputSerializer(many=True, min_length=1)


class DetalleOrdenCompraOutputSerializer(serializers.Serializer):
    """Detalle de producto emitido en una orden de compra formal."""
    id_detalle_compra = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.CharField(source='id_producto.nombre', read_only=True)
    cantidad = serializers.IntegerField(read_only=True)
    cantidad_recibida = serializers.IntegerField(read_only=True, allow_null=True)
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    subtotal = serializers.SerializerMethodField()

    def get_subtotal(self, obj):
        cant = obj.cantidad_recibida if obj.cantidad_recibida is not None else obj.cantidad
        if cant is not None and obj.precio_unitario is not None:
            return Decimal(str(cant)) * obj.precio_unitario
        return Decimal("0.00")


class OrdenCompraCompletaOutputSerializer(serializers.Serializer):
    """Expediente completo de una Orden de Compra formal emitida."""
    id_orden = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_orden = serializers.IntegerField(read_only=True)
    estado = serializers.CharField(source='estado_nombre', read_only=True)
    tipo_entrega = serializers.IntegerField(read_only=True)
    tipo_entrega_nombre = serializers.CharField(read_only=True)
    sol_tec = serializers.BooleanField(read_only=True)
    nro_remito = serializers.CharField(read_only=True, allow_null=True)
    proveedor = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    monto_total = serializers.SerializerMethodField()

    def get_proveedor(self, obj):
        p = obj.cuit_prov
        return {
            "cuit": p.cuit_prov,
            "cuit_prov": p.cuit_prov,
            "nombre": p.nombre_proveedor,
            "correo": p.correo,
            "telefono": p.telefono,
            "ofrece_envio": p.ofrece_envio
        }

    def get_items(self, obj):
        return DetalleOrdenCompraOutputSerializer(obj.detalleordencompra_set.all(), many=True).data

    def get_monto_total(self, obj):
        return sum(
            Decimal(str(item.cantidad)) * item.precio_unitario
            for item in obj.detalleordencompra_set.all()
        )



# ==============================================================================
# CU-55: RECEPCIONAR COMPRA (SERIALIZERS)
# ==============================================================================

class ItemRecepcionInputSerializer(serializers.Serializer):
    """Línea individual de recepción física de mercadería contra un DetalleOrdenCompra."""
    id_detalle_compra = serializers.IntegerField(
        required=True,
        min_value=1,
        help_text="Identificador único del renglón en DetalleOrdenCompra."
    )
    cantidad_recibida = serializers.IntegerField(
        required=True,
        min_value=0,
        help_text="Cantidad física de unidades recibidas en el local (no puede ser negativa)."
    )


class RecepcionarCompraInputSerializer(serializers.Serializer):
    """Aduana de entrada para el registro formal del ingreso de mercadería."""
    nro_remito = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100,
        default='',
        help_text="Número o código del remito/comprobante de entrega provisto por el transportista/proveedor."
    )
    confirmar_excedente = serializers.BooleanField(
        required=False,
        default=False,
        help_text="Confirmación expresa del Administrador ante un excedente físico respecto a lo solicitado."
    )
    items = serializers.ListField(
        child=ItemRecepcionInputSerializer(),
        required=True,
        allow_empty=False,
        help_text="Lista de renglones con cantidades recibidas a contrastar contra la orden."
    )


class ChecklistItemRecepcionOutputSerializer(serializers.Serializer):
    """Renglón del formulario de conciliación previo a la confirmación de recepción."""
    id_detalle_compra = serializers.IntegerField(read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.CharField(source='id_producto.nombre', read_only=True)
    cantidad_esperada = serializers.IntegerField(source='cantidad', read_only=True)
    cantidad_recibida = serializers.IntegerField(read_only=True, allow_null=True)
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    subtotal = serializers.SerializerMethodField()

    def get_subtotal(self, obj):
        return Decimal(str(obj.cantidad)) * obj.precio_unitario


class ChecklistRecepcionOutputSerializer(serializers.Serializer):
    """Checklist completo de la orden en espera de entrega para el formulario de conciliación."""
    id_orden = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_orden = serializers.IntegerField(read_only=True)
    estado_nombre = serializers.CharField(read_only=True)
    tipo_entrega = serializers.IntegerField(read_only=True)
    tipo_entrega_nombre = serializers.CharField(read_only=True)
    sol_tec = serializers.BooleanField(read_only=True)
    nro_remito = serializers.CharField(read_only=True, allow_null=True)
    proveedor = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    total_esperado = serializers.SerializerMethodField()

    def get_proveedor(self, obj):
        p = obj.cuit_prov
        return {
            "cuit_prov": p.cuit_prov,
            "cuit": p.cuit_prov,
            "nombre": p.nombre_proveedor,
            "nombre_proveedor": p.nombre_proveedor,
            "correo": p.correo,
            "telefono": p.telefono
        }

    def get_items(self, obj):
        return ChecklistItemRecepcionOutputSerializer(obj.detalles.all(), many=True).data

    def get_total_esperado(self, obj):
        return sum(
            Decimal(str(item.cantidad)) * item.precio_unitario
            for item in obj.detalles.all()
        )


class RecepcionCompraOutputSerializer(serializers.Serializer):
    """Resultado formal del proceso de recepción de mercadería y conciliación."""
    id_orden = serializers.IntegerField(read_only=True)
    estado_orden = serializers.IntegerField(read_only=True)
    estado_nombre = serializers.CharField(read_only=True)
    nro_remito = serializers.CharField(read_only=True)
    fecha_recepcion = serializers.DateField(read_only=True)
    es_entrega_parcial = serializers.BooleanField(read_only=True)
    total_abonar = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    reparaciones_reactivadas = serializers.ListField(
        child=serializers.IntegerField(),
        read_only=True,
        default=[]
    )
    mensaje = serializers.CharField(read_only=True)


# ==============================================================================
# CU-57: CONSULTAR ORDEN DE COMPRA (SERIALIZERS)
# ==============================================================================

class ProveedorResumenOutputSerializer(serializers.Serializer):
    """Datos fiscales y de contacto del proveedor adjudicado (CU-57)."""
    cuit = serializers.CharField(source='cuit_prov', read_only=True)
    cuit_prov = serializers.CharField(read_only=True)
    razon_social = serializers.CharField(source='nombre_proveedor', read_only=True)
    nombre = serializers.CharField(source='nombre_proveedor', read_only=True)
    nombre_proveedor = serializers.CharField(read_only=True)
    correo = serializers.CharField(read_only=True, allow_null=True)
    telefono = serializers.CharField(read_only=True, allow_null=True)
    ofrece_envio = serializers.BooleanField(read_only=True)


class OrdenCompraDetailOutputSerializer(serializers.Serializer):
    """Vista de solo lectura del archivo digital inmutable de la Orden de Compra (CU-57)."""
    id_orden = serializers.IntegerField(read_only=True)
    fecha_emision = serializers.DateField(read_only=True)
    estado_orden = serializers.IntegerField(read_only=True)
    estado = serializers.CharField(source='estado_nombre', read_only=True)
    estado_nombre = serializers.CharField(read_only=True)
    tipo_entrega = serializers.IntegerField(read_only=True)
    tipo_entrega_nombre = serializers.CharField(read_only=True)
    fecha_recepcion = serializers.DateField(read_only=True, allow_null=True)
    nro_remito = serializers.CharField(read_only=True, allow_null=True)
    sol_tec = serializers.BooleanField(read_only=True)
    proveedor = serializers.SerializerMethodField()
    detalles = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    monto_total = serializers.SerializerMethodField()
    total_abonar = serializers.SerializerMethodField()

    def get_proveedor(self, obj):
        p = obj.cuit_prov
        return ProveedorResumenOutputSerializer(p).data if p else None

    def get_detalles(self, obj):
        detalles_qs = obj.detalles.all()
        return DetalleOrdenCompraOutputSerializer(detalles_qs, many=True).data

    def get_items(self, obj):
        return self.get_detalles(obj)

    def get_monto_total(self, obj):
        return sum(
            Decimal(str(d.cantidad_recibida if d.cantidad_recibida is not None else d.cantidad)) * d.precio_unitario
            for d in obj.detalles.all()
        )

    def get_total_abonar(self, obj):
        return self.get_monto_total(obj)


# ==============================================================================
# CU-31: REGISTRAR COMPRA DIRECTA (SERIALIZERS)
# ==============================================================================

class RegistrarCompraDirectaInputSerializer(serializers.Serializer):
    """
    Aduana de entrada para el registro administrativo de compras directas (CU-31).
    Valida campos obligatorios y la coherencia de cantidades con impacto en stock.
    """
    origen_vendedor = serializers.CharField(
        max_length=255,
        required=True,
        error_messages={
            'required': 'El origen o vendedor es obligatorio.',
            'blank': 'El origen o vendedor no puede estar vacío.'
        }
    )
    descripcion_articulo = serializers.CharField(
        max_length=1000,
        required=True,
        error_messages={
            'required': 'La descripción del artículo o servicio es obligatoria.',
            'blank': 'La descripción del artículo o servicio no puede estar vacía.'
        }
    )
    motivo = serializers.CharField(
        max_length=500,
        required=True,
        error_messages={
            'required': 'El motivo de la compra es obligatorio.',
            'blank': 'El motivo de la compra no puede estar vacío.'
        }
    )
    monto_pagado = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=True,
        error_messages={
            'required': 'El monto pagado es obligatorio.',
            'invalid': 'El monto pagado debe ser un número decimal válido.'
        }
    )
    impacto_stock = serializers.BooleanField(
        required=False,
        default=False
    )
    cantidad = serializers.IntegerField(
        required=False,
        default=0
    )

    def validate(self, attrs):
        monto_pagado = attrs.get('monto_pagado')
        if monto_pagado is None or monto_pagado <= 0:
            raise serializers.ValidationError("El monto pagado debe ser mayor a cero.")

        impacto_stock = attrs.get('impacto_stock', False)
        cantidad = attrs.get('cantidad', 0)

        if impacto_stock:
            if cantidad is None or cantidad <= 0:
                raise serializers.ValidationError("Debe especificar una cantidad válida para impactar en el stock.")
        else:
            attrs['cantidad'] = 0

        return attrs


class RegistroCompraOutputSerializer(serializers.Serializer):
    """
    Formato de salida para el registro administrativo de compra directa (CU-31).
    """
    id_compra = serializers.IntegerField(read_only=True)
    origen_vendedor = serializers.CharField(read_only=True)
    descripcion_articulo = serializers.CharField(read_only=True)
    motivo = serializers.CharField(read_only=True)
    monto_pagado = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    fecha_compra = serializers.TimeField(format='%H:%M:%S', read_only=True)
    impacto_stock = serializers.BooleanField(read_only=True)
    id_usuario = serializers.IntegerField(source='id_usuario_id', read_only=True)
    id_administrador = serializers.IntegerField(source='id_usuario_id', read_only=True)
    email_administrador = serializers.CharField(source='id_usuario.email', read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', allow_null=True, read_only=True)
    id_producto_generado = serializers.IntegerField(source='id_producto_id', allow_null=True, read_only=True)
    producto_nombre = serializers.CharField(source='id_producto.nombre', allow_null=True, read_only=True)


