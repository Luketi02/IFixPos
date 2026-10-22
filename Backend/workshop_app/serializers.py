from decimal import Decimal
from rest_framework import serializers
from django.core.validators import RegexValidator
from users_app.serializers import dni_validator

codigo_sec_validator = RegexValidator(
    regex=r'^[a-zA-Z0-9_\-]+$',
    message="El formato del código de seguridad es inválido. Solo se permiten caracteres alfanuméricos y guiones."
)


class ImagenOArchivoField(serializers.Field):
    """
    Campo flexible que admite tanto URLs o rutas en string como archivos binarios subidos en multipart/form-data.
    """
    def to_internal_value(self, data):
        if data is None or data == '' or data == 'null':
            return None
        return data

    def to_representation(self, value):
        return str(value) if value else None


class DispositivoInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-06): Valida la carga de datos del nuevo dispositivo.
    Soporta selección de modelos del catálogo o ingreso manual ('Otro')
    con homologación inteligente y promoción automática a 8 usos.
    """
    id_cliente = serializers.IntegerField(required=True)
    id_modelo = serializers.IntegerField(required=False, allow_null=True)
    nro_serie = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    imagen = ImagenOArchivoField(required=False, allow_null=True, default=None)

    # Campos para opción "Otro" (Catálogo dinámico y homologación)
    es_otro = serializers.BooleanField(required=False, default=False)
    id_tipo = serializers.IntegerField(required=False, allow_null=True)
    nombre_tipo_otro = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    id_marca = serializers.IntegerField(required=False, allow_null=True)
    nombre_marca_otro = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)
    nombre_modelo_otro = serializers.CharField(max_length=150, required=False, allow_blank=True, allow_null=True)

    def to_internal_value(self, data):
        # Soporta aliases de nombres para compatibilidad total
        data_dict = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'nro_serie' not in data_dict and 'numero_serie' in data_dict:
            data_dict['nro_serie'] = data_dict.get('numero_serie')
        if 'id_cliente' not in data_dict and 'id_usuario' in data_dict:
            data_dict['id_cliente'] = data_dict.get('id_usuario')

        # Manejo de booleanos y valores nulos provenientes de FormData
        if 'es_otro' in data_dict:
            val = data_dict['es_otro']
            if isinstance(val, str):
                data_dict['es_otro'] = val.strip().lower() in ('true', '1', 'yes')

        for clave_entero in ['id_modelo', 'id_tipo', 'id_marca', 'id_cliente']:
            if clave_entero in data_dict and (data_dict[clave_entero] == '' or data_dict[clave_entero] == 'null' or data_dict[clave_entero] is None):
                data_dict[clave_entero] = None

        return super().to_internal_value(data_dict)

    def validate_id_cliente(self, value):
        from users_app.models import Usuario
        if not Usuario.objects.filter(id_usuario=value).exists():
            raise serializers.ValidationError("El cliente especificado no existe en el sistema.")
        return value

    def validate(self, attrs):
        from catalog_app.models import ModeloDispositivo, Marca, TipoDispositivo

        es_otro = attrs.get('es_otro', False) or bool(attrs.get('nombre_modelo_otro'))
        attrs['es_otro'] = es_otro

        if not es_otro:
            # Flujo estándar: debe venir id_modelo válido
            id_modelo = attrs.get('id_modelo')
            if not id_modelo:
                raise serializers.ValidationError({
                    "id_modelo": "Debe seleccionar un modelo de dispositivo de la lista o activar la opción 'Otro'."
                })
            if not ModeloDispositivo.objects.filter(id_modelo=id_modelo).exists():
                raise serializers.ValidationError({
                    "id_modelo": "El modelo de dispositivo especificado no existe."
                })
        else:
            # Flujo de Homologación Manual ("Otro")
            nombre_modelo = (attrs.get('nombre_modelo_otro') or '').strip()
            if not nombre_modelo:
                raise serializers.ValidationError({
                    "nombre_modelo_otro": "Debe especificar el nombre del modelo personalizado."
                })
            attrs['nombre_modelo_otro'] = nombre_modelo

            # Validación de Marca (ID existente o nombre personalizado)
            id_marca = attrs.get('id_marca')
            nombre_marca = (attrs.get('nombre_marca_otro') or '').strip()
            if id_marca:
                if not Marca.objects.filter(id_marca=id_marca).exists():
                    raise serializers.ValidationError({
                        "id_marca": "La marca de dispositivo especificada no existe."
                    })
            elif nombre_marca:
                attrs['nombre_marca_otro'] = nombre_marca
            else:
                raise serializers.ValidationError({
                    "marca": "Debe seleccionar una marca del catálogo o especificar una nueva."
                })

            # Validación de Tipo de Dispositivo (ID existente o nombre personalizado)
            id_tipo = attrs.get('id_tipo')
            nombre_tipo = (attrs.get('nombre_tipo_otro') or '').strip()
            if id_tipo:
                if not TipoDispositivo.objects.filter(id_tipo_dispositivo=id_tipo).exists():
                    raise serializers.ValidationError({
                        "id_tipo": "El tipo de dispositivo especificado no existe."
                    })
            elif nombre_tipo:
                attrs['nombre_tipo_otro'] = nombre_tipo

        return attrs


class TipoDispositivoOutputSerializer(serializers.Serializer):
    id_tipo_dispositivo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)


class MarcaOutputSerializer(serializers.Serializer):
    id_marca = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)


class ModeloDispositivoOutputSerializer(serializers.Serializer):
    id_modelo = serializers.IntegerField(read_only=True)
    nombre = serializers.CharField(read_only=True)
    estado_activo = serializers.BooleanField(read_only=True)
    id_marca = serializers.IntegerField(source='id_marca_id', read_only=True)
    id_tipo_dispositivo = serializers.IntegerField(source='id_tipo_dispositivo_id', read_only=True)


class DispositivoCreateInputSerializer(serializers.Serializer):
    id_usuario = serializers.IntegerField()
    id_modelo = serializers.IntegerField()
    numero_serie = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    imagen = serializers.CharField(max_length=500, required=False, allow_blank=True, allow_null=True)

class DispositivoOutputSerializer(serializers.Serializer):
    id_dispositivo = serializers.IntegerField(read_only=True)
    numero_serie = serializers.CharField(max_length=100, allow_null=True)
    fecha_registro = serializers.DateField()
    imagen = serializers.CharField(max_length=500, allow_null=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id')
    id_usuario = serializers.IntegerField(source='id_usuario_id')


class ModeloDispositivoAnidadoSerializer(serializers.Serializer):
    id_modelo = serializers.IntegerField()
    nombre = serializers.CharField()
    id_marca = serializers.IntegerField(source='id_marca_id', required=False)
    marca = serializers.CharField(source='id_marca.nombre', required=False)


class ReparacionAnidadoSerializer(serializers.Serializer):
    id_reparacion = serializers.IntegerField(required=False)
    etapa = serializers.CharField()
    codigo_sec = serializers.CharField(allow_null=True)
    fecha_inicio = serializers.DateField()
    fecha_entrega = serializers.DateField(required=False, allow_null=True)


class ClienteDispositivoOutputSerializer(serializers.Serializer):
    """CU-33: Información del cliente propietario del dispositivo."""
    id_usuario = serializers.IntegerField(read_only=True)
    email = serializers.CharField(read_only=True)
    dni = serializers.CharField(source='perfilusuario.dni', read_only=True, allow_null=True)
    nombre = serializers.CharField(source='perfilusuario.nombre', read_only=True, allow_null=True)
    apellido = serializers.CharField(source='perfilusuario.apellido', read_only=True, allow_null=True)
    nombre_completo = serializers.SerializerMethodField()
    telefono = serializers.CharField(source='perfilusuario.telefono', read_only=True, allow_null=True)

    def get_nombre_completo(self, obj):
        perfil = getattr(obj, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return obj.email


class TecnicoReparacionOutputSerializer(serializers.Serializer):
    """CU-33: Información del técnico asignado a la reparación."""
    id_usuario = serializers.IntegerField(read_only=True)
    email = serializers.CharField(read_only=True)
    nombre_completo = serializers.SerializerMethodField()

    def get_nombre_completo(self, obj):
        perfil = getattr(obj, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return obj.email


class ReparacionTallerOutputSerializer(serializers.Serializer):
    """CU-33: Detalle de reparaciones visible por administradores y técnicos."""
    id_reparacion = serializers.IntegerField(read_only=True)
    etapa = serializers.CharField(read_only=True)
    codigo_sec = serializers.CharField(read_only=True, allow_null=True)
    fecha_inicio = serializers.DateField(read_only=True)
    fecha_entrega = serializers.DateField(read_only=True, allow_null=True)
    desc_cliente = serializers.CharField(read_only=True, allow_null=True)
    tecnico_asignado = TecnicoReparacionOutputSerializer(source='id_usuario', read_only=True, allow_null=True)


class DispositivoTallerFiltradoOutputSerializer(serializers.Serializer):
    """
    CU-33: Salida del listado de dispositivos y reparaciones para Administrador y Técnico.
    Satisface los 5 conceptos requeridos:
    1. Dispositivo (id_dispositivo, numero_serie, fecha_registro, imagen)
    2. Reparación (id_reparacion, etapa, codigo_sec, fecha_inicio, etc.)
    3. Usuario (Cliente propietario y Técnico asignado en la reparación)
    4. Marca (id_marca, marca)
    5. Modelo (id_modelo, modelo, id_tipo, tipo)
    """
    id_dispositivo = serializers.IntegerField(read_only=True)
    numero_serie = serializers.CharField(read_only=True, allow_null=True)
    fecha_registro = serializers.DateField(read_only=True)
    imagen = serializers.CharField(read_only=True, allow_null=True)
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', read_only=True)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', read_only=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id', read_only=True)
    modelo = serializers.CharField(source='id_modelo.nombre', read_only=True)
    id_tipo = serializers.IntegerField(source='id_modelo.id_tipo_dispositivo_id', read_only=True)
    tipo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', read_only=True)
    cliente = ClienteDispositivoOutputSerializer(source='id_usuario', read_only=True)
    reparaciones = ReparacionTallerOutputSerializer(source='reparacion_set', many=True, read_only=True)


class DispositivoFiltradoOutputSerializer(serializers.Serializer):
    id_dispositivo = serializers.IntegerField()
    numero_serie = serializers.CharField()
    fecha_registro = serializers.DateField()
    modelo = ModeloDispositivoAnidadoSerializer(source='id_modelo', read_only=True)
    reparaciones = ReparacionAnidadoSerializer(source='reparacion_set', many=True, read_only=True)


class FiltrarDispositivosTallerInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-33): Validación de parámetros para filtrar dispositivos en taller.
    """
    dni_cliente = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        validators=[dni_validator]
    )
    codigo_sec_reparacion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100,
        validators=[codigo_sec_validator]
    )
    nro_serie = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    marca = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    id_marca = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1
    )
    modelo = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    id_modelo = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1
    )
    etapa_reparacion = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50
    )
    id_tecnico_asignado = serializers.IntegerField(
        required=False,
        allow_null=True,
        min_value=1
    )
    fecha_ingreso_desde = serializers.DateField(
        required=False,
        allow_null=True
    )
    fecha_ingreso_hasta = serializers.DateField(
        required=False,
        allow_null=True
    )
    excluir_reparaciones_activas = serializers.BooleanField(
        required=False,
        default=False
    )

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'excluir_reparaciones_activas' in mutable_data:
            val = mutable_data['excluir_reparaciones_activas']
            if isinstance(val, str):
                mutable_data['excluir_reparaciones_activas'] = val.strip().lower() in ('true', '1', 'yes')
        if 'dni' in mutable_data and not mutable_data.get('dni_cliente'):
            mutable_data['dni_cliente'] = mutable_data.get('dni')
        if 'codigo_sec' in mutable_data and not mutable_data.get('codigo_sec_reparacion'):
            mutable_data['codigo_sec_reparacion'] = mutable_data.get('codigo_sec')
        if 'numero_serie' in mutable_data and not mutable_data.get('nro_serie'):
            mutable_data['nro_serie'] = mutable_data.get('numero_serie')
        if 'etapa' in mutable_data and not mutable_data.get('etapa_reparacion'):
            mutable_data['etapa_reparacion'] = mutable_data.get('etapa')
        elif 'estado' in mutable_data and not mutable_data.get('etapa_reparacion'):
            mutable_data['etapa_reparacion'] = mutable_data.get('estado')
        if 'id_tecnico' in mutable_data and not mutable_data.get('id_tecnico_asignado'):
            mutable_data['id_tecnico_asignado'] = mutable_data.get('id_tecnico')
        elif 'tecnico' in mutable_data and not mutable_data.get('id_tecnico_asignado'):
            mutable_data['id_tecnico_asignado'] = mutable_data.get('tecnico')
        if 'fecha_desde' in mutable_data and not mutable_data.get('fecha_ingreso_desde'):
            mutable_data['fecha_ingreso_desde'] = mutable_data.get('fecha_desde')
        if 'fecha_hasta' in mutable_data and not mutable_data.get('fecha_ingreso_hasta'):
            mutable_data['fecha_ingreso_hasta'] = mutable_data.get('fecha_hasta')
        return super().to_internal_value(mutable_data)

    def validate(self, attrs):
        fecha_desde = attrs.get('fecha_ingreso_desde')
        fecha_hasta = attrs.get('fecha_ingreso_hasta')
        if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
            raise serializers.ValidationError({
                "fecha_ingreso_desde": "La fecha de ingreso desde no puede ser posterior a la fecha hasta."
            })
        return attrs



class DispositivoListOutputSerializer(serializers.Serializer):
    """CU-34: Salida del listado filtrado de 'Mis Dispositivos'."""
    id_dispositivo = serializers.IntegerField(read_only=True)
    numero_serie = serializers.CharField(read_only=True, allow_null=True)
    fecha_registro = serializers.DateField(read_only=True)
    imagen = serializers.CharField(read_only=True, allow_null=True)
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', read_only=True)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', read_only=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id', read_only=True)
    modelo = serializers.CharField(source='id_modelo.nombre', read_only=True)
    id_tipo = serializers.IntegerField(source='id_modelo.id_tipo_dispositivo_id', read_only=True)
    tipo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', read_only=True)
    reparaciones = ReparacionAnidadoSerializer(source='reparacion_set', many=True, read_only=True)
    editable = serializers.SerializerMethodField()

    def get_editable(self, obj):
        # CU-07: un equipo con historial técnico o en proceso de reparación no puede editarse.
        return not obj.reparacion_set.exists()


class DispositivoUpdateInputSerializer(serializers.Serializer):
    """La Aduana (CU-07): Solo permite editar nro_serie, imagen, marca y modelo."""
    nro_serie = serializers.CharField(max_length=100, required=False, allow_blank=True, allow_null=True)
    imagen = ImagenOArchivoField(required=False, allow_null=True)
    id_marca = serializers.IntegerField()
    id_modelo = serializers.IntegerField()

    def validate(self, attrs):
        from catalog_app.models import ModeloDispositivo, Marca

        if not Marca.objects.filter(id_marca=attrs['id_marca']).exists():
            raise serializers.ValidationError({"id_marca": "La marca especificada no existe."})
        modelo = ModeloDispositivo.objects.filter(id_modelo=attrs['id_modelo']).first()
        if not modelo:
            raise serializers.ValidationError({"id_modelo": "El modelo especificado no existe."})
        if modelo.id_marca_id != attrs['id_marca']:
            raise serializers.ValidationError({"id_modelo": "El modelo no pertenece a la marca seleccionada."})
        return attrs


# ==============================================================================
# SERIALIZERS PARA CU-11 (Detalles del Dispositivo) Y CU-61 (Detalle de Reparación)
# ==============================================================================

class BitacoraOutputSerializer(serializers.Serializer):
    """CU-61: Formato de eventos cronológicos en la bitácora técnica."""
    id_bitacora = serializers.IntegerField(read_only=True)
    fecha_hora = serializers.SerializerMethodField()
    estado_alcanzado = serializers.IntegerField(read_only=True)
    estado_nombre = serializers.SerializerMethodField()
    comentario = serializers.CharField(read_only=True)
    tecnico = serializers.SerializerMethodField()
    rol_usuario = serializers.SerializerMethodField()

    def get_fecha_hora(self, obj):
        if not obj.fecha_hora:
            return ""
        if hasattr(obj.fecha_hora, 'strftime'):
            return obj.fecha_hora.strftime("%H:%M:%S")
        val_str = str(obj.fecha_hora)
        return val_str.split('.')[0] if '.' in val_str else val_str

    def get_estado_nombre(self, obj):
        MAPA = {
            1: 'Esperando Dispositivo',
            2: 'Esperando Diagnóstico',
            3: 'En Diagnóstico',
            4: 'Esperando Confirmación',
            5: 'En Reparación',
            6: 'Finalizada',
            7: 'Entregada',
            8: 'Cancelada',
            9: 'Esperando Repuestos'
        }
        return MAPA.get(obj.estado_alcanzado, f"Estado {obj.estado_alcanzado}")

    def get_tecnico(self, obj):
        usuario = obj.id_usuario
        if not usuario:
            return None
        perfil = getattr(usuario, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return usuario.email

    def get_rol_usuario(self, obj):
        usuario = obj.id_usuario
        if not usuario:
            return ""
        rol = getattr(usuario, 'id_rol', None) or getattr(usuario, 'rol', None)
        if rol:
            return getattr(rol, 'nombre_rol', getattr(rol, 'codigo', ''))
        return ""


class DetalleInsumoOutputSerializer(serializers.Serializer):
    """CU-61: Materiales e insumos consumidos en la reparación."""
    id_detalle_insumo = serializers.IntegerField(read_only=True)
    cantidad = serializers.IntegerField(read_only=True)
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    id_producto = serializers.IntegerField(source='id_producto_id', read_only=True)
    nombre_producto = serializers.CharField(source='id_producto.nombre', read_only=True)
    subtotal = serializers.SerializerMethodField()

    def get_subtotal(self, obj):
        if obj.cantidad is not None and obj.precio_unitario is not None:
            return float(obj.cantidad * obj.precio_unitario)
        return 0.0


class DiagnosticoOutputSerializer(serializers.Serializer):
    """CU-61 y CU-11: Diagnósticos técnicos aplicados."""
    id_diagnostico = serializers.IntegerField(read_only=True)
    descripcion_falla = serializers.CharField(read_only=True)
    fecha_diagnostico = serializers.DateField(read_only=True)
    costo_diagnostico = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, allow_null=True)


class CalificacionOutputSerializer(serializers.Serializer):
    """CU-61 y CU-11: Calificación emitida por el cliente."""
    id_calificacion = serializers.IntegerField(read_only=True)
    puntuacion = serializers.IntegerField(read_only=True)
    comentario = serializers.CharField(read_only=True, allow_null=True)
    fecha = serializers.DateField(read_only=True)


class DispositivoCabeceraOutputSerializer(serializers.Serializer):
    """Cabecera resumida del dispositivo para CU-61."""
    id_dispositivo = serializers.IntegerField(read_only=True)
    imagen = serializers.CharField(read_only=True, allow_null=True)
    numero_serie = serializers.CharField(read_only=True, allow_null=True)
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', read_only=True)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', read_only=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id', read_only=True)
    modelo = serializers.CharField(source='id_modelo.nombre', read_only=True)
    tipo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', read_only=True)


class ReparacionHistorialOutputSerializer(serializers.Serializer):
    """CU-11: Fila resumida de historial de reparaciones previas."""
    id_reparacion = serializers.IntegerField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    fecha_entrega = serializers.DateField(read_only=True, allow_null=True)
    etapa = serializers.CharField(read_only=True)
    tecnico = serializers.SerializerMethodField()
    resumen_diagnostico = serializers.SerializerMethodField()
    calificacion = serializers.SerializerMethodField()
    bitacora = serializers.SerializerMethodField()

    def get_tecnico(self, obj):
        usuario = obj.id_usuario
        if not usuario:
            return None
        perfil = getattr(usuario, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return usuario.email

    def get_resumen_diagnostico(self, obj):
        diag = obj.diagnostico_set.first()
        return diag.descripcion_falla if diag else None

    def get_calificacion(self, obj):
        calif = obj.calificacion_set.first()
        if not calif:
            return None
        return CalificacionOutputSerializer(calif).data

    def get_bitacora(self, obj):
        items = obj.bitacorareparacion_set.all().order_by('id_bitacora')
        return BitacoraOutputSerializer(items, many=True).data


class ReparacionActivaOutputSerializer(serializers.Serializer):
    """CU-11: Datos de la reparación actualmente en curso sobre el equipo."""
    id_reparacion = serializers.IntegerField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    etapa = serializers.CharField(read_only=True)
    codigo_sec = serializers.CharField(read_only=True, allow_null=True)
    desc_cliente = serializers.CharField(read_only=True, allow_null=True)
    diagnostico = serializers.SerializerMethodField()
    bitacora = serializers.SerializerMethodField()

    def get_diagnostico(self, obj):
        diag = obj.diagnostico_set.first()
        if not diag:
            return None
        return DiagnosticoOutputSerializer(diag).data

    def get_bitacora(self, obj):
        items = obj.bitacorareparacion_set.all().order_by('id_bitacora')
        return BitacoraOutputSerializer(items, many=True).data


class DispositivoDetalleOutputSerializer(serializers.Serializer):
    """
    CU-11: Ficha técnica completa del dispositivo junto a su reparación activa e historial.
    """
    id_dispositivo = serializers.IntegerField(read_only=True)
    imagen = serializers.CharField(read_only=True, allow_null=True)
    numero_serie = serializers.CharField(read_only=True, allow_null=True)
    fecha_registro = serializers.DateField(read_only=True)
    id_marca = serializers.IntegerField(source='id_modelo.id_marca_id', read_only=True)
    marca = serializers.CharField(source='id_modelo.id_marca.nombre', read_only=True)
    id_modelo = serializers.IntegerField(source='id_modelo_id', read_only=True)
    modelo = serializers.CharField(source='id_modelo.nombre', read_only=True)
    id_tipo = serializers.IntegerField(source='id_modelo.id_tipo_dispositivo_id', read_only=True)
    tipo = serializers.CharField(source='id_modelo.id_tipo_dispositivo.nombre', read_only=True)
    reparacion_activa = serializers.SerializerMethodField()
    historial_reparaciones = serializers.SerializerMethodField()

    def get_reparacion_activa(self, obj):
        from workshop_app.selectors import obtener_reparacion_activa
        activa = obtener_reparacion_activa(obj.id_dispositivo)
        if not activa:
            return None
        return ReparacionActivaOutputSerializer(activa).data

    def get_historial_reparaciones(self, obj):
        from workshop_app.selectors import obtener_historial_reparaciones
        historial = obtener_historial_reparaciones(obj.id_dispositivo)
        return ReparacionHistorialOutputSerializer(historial, many=True).data


class ReparacionDetalleOutputSerializer(serializers.Serializer):
    """
    CU-61: Radiografía completa de una orden de reparación.
    Aplica Seguridad Vertical: campos privados (credencial_acceso, codigo_sec)
    solo se exponen a ADMIN y TECNICO.
    """
    id_reparacion = serializers.IntegerField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    hora_recepcion = serializers.TimeField(read_only=True, allow_null=True)
    fecha_entrega = serializers.DateField(read_only=True, allow_null=True)
    etapa = serializers.CharField(read_only=True)
    desc_cliente = serializers.CharField(read_only=True, allow_null=True)
    observaciones_fisicas = serializers.SerializerMethodField()
    tecnico = serializers.SerializerMethodField()

    # Seguridad Vertical: Condicional por rol
    credencial_acceso = serializers.SerializerMethodField()
    codigo_sec = serializers.SerializerMethodField()

    # Secciones anidadas
    dispositivo = DispositivoCabeceraOutputSerializer(source='id_dispositivo', read_only=True)
    cliente = serializers.SerializerMethodField()
    diagnostico = serializers.SerializerMethodField()
    bitacora = serializers.SerializerMethodField()
    insumos = serializers.SerializerMethodField()
    calificacion = serializers.SerializerMethodField()
    historial_reparaciones = serializers.SerializerMethodField()

    def _es_personal_autorizado(self):
        usuario = self.context.get('usuario') or (self.context.get('request').user if self.context.get('request') else None)
        if not usuario:
            return False
        rol_codigo = ''
        if hasattr(usuario, 'id_rol') and usuario.id_rol:
            rol_codigo = (usuario.id_rol.codigo or '').upper()
        elif hasattr(usuario, 'rol') and usuario.rol:
            rol_codigo = (usuario.rol.codigo or '').upper()
        return rol_codigo in ('ADMIN', 'TECNICO')

    def get_credencial_acceso(self, obj):
        if self._es_personal_autorizado():
            return obj.credencial_acceso
        return None

    def get_codigo_sec(self, obj):
        # El código de seguridad interno solo se exhibe para personal técnico/admin en CU-61
        if self._es_personal_autorizado():
            return obj.codigo_sec
        return None

    def get_cliente(self, obj):
        cliente = getattr(obj.id_dispositivo, 'id_usuario', None)
        if not cliente:
            return None
        perfil = getattr(cliente, 'perfilusuario', None)
        nombre = getattr(perfil, 'nombre', '') or ''
        apellido = getattr(perfil, 'apellido', '') or ''
        nombre_completo = f"{nombre} {apellido}".strip() or cliente.email
        return {
            'id_cliente': cliente.id_usuario,
            'nombre': nombre,
            'apellido': apellido,
            'nombre_completo': nombre_completo,
            'dni': getattr(perfil, 'dni', None),
            'email': cliente.email,
            'telefono': getattr(perfil, 'telefono', None)
        }

    def get_tecnico(self, obj):
        usuario = obj.id_usuario
        if not usuario:
            return None
        perfil = getattr(usuario, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return usuario.email

    def get_diagnostico(self, obj):
        diag = obj.diagnostico_set.first()
        if not diag:
            return None
        return DiagnosticoOutputSerializer(diag).data

    def get_bitacora(self, obj):
        items = obj.bitacorareparacion_set.all().order_by('id_bitacora')
        return BitacoraOutputSerializer(items, many=True).data

    def get_insumos(self, obj):
        items = obj.detalleinsumoreparacion_set.all()
        return DetalleInsumoOutputSerializer(items, many=True).data

    def get_calificacion(self, obj):
        calif = obj.calificacion_set.first()
        if not calif:
            return None
        return CalificacionOutputSerializer(calif).data

    def get_historial_reparaciones(self, obj):
        disp = obj.id_dispositivo
        if not disp:
            return []
        reps = disp.reparacion_set.exclude(id_reparacion=obj.id_reparacion).order_by('-fecha_inicio', '-id_reparacion')
        resultado = []
        for r in reps:
            diag = r.diagnostico_set.first()
            calif = r.calificacion_set.first()
            tecnico = r.id_usuario
            tec_nombre = tecnico.email if tecnico else 'N/A'
            if tecnico and getattr(tecnico, 'perfilusuario', None):
                p = tecnico.perfilusuario
                if p.nombre or p.apellido:
                    tec_nombre = f"{p.nombre or ''} {p.apellido or ''}".strip()
            
            bitacoras_data = BitacoraOutputSerializer(
                r.bitacorareparacion_set.all().order_by('id_bitacora'),
                many=True
            ).data

            resultado.append({
                'id_reparacion': r.id_reparacion,
                'fecha_inicio': r.fecha_inicio,
                'fecha_entrega': r.fecha_entrega,
                'etapa': r.etapa,
                'codigo_sec': r.codigo_sec if self._es_personal_autorizado() else None,
                'tecnico': tec_nombre,
                'desc_cliente': r.desc_cliente,
                'diagnostico': DiagnosticoOutputSerializer(diag).data if diag else None,
                'calificacion': CalificacionOutputSerializer(calif).data if calif else None,
                'bitacoras': bitacoras_data
            })
        return resultado

    def get_observaciones_fisicas(self, obj):
        bitacora = obj.bitacorareparacion_set.filter(estado_alcanzado=2).order_by('-id_bitacora').first()
        if bitacora and bitacora.comentario:
            if "Estado físico: " in bitacora.comentario:
                return bitacora.comentario.split("Estado físico: ", 1)[1]
            return bitacora.comentario
        return None


# ==============================================================================
# CATEGORÍAS DE REPARACIÓN (CU-62, CU-63, CU-64)
# ==============================================================================

class CategoriaReparacionOutputSerializer(serializers.Serializer):
    """
    Serializador de salida para CategoriaReparacion.
    Expone id_categoria (e id_categoria_reparacion como alias), nombre y estado_activo.
    """
    id_categoria = serializers.IntegerField(read_only=True)
    id_categoria_reparacion = serializers.IntegerField(source='id_categoria', read_only=True)
    nombre = serializers.CharField()
    estado_activo = serializers.BooleanField()


class CategoriaReparacionCreateInputSerializer(serializers.Serializer):
    """
    La Aduana para el registro de una nueva Categoría de Reparación (CU-62).
    """
    nombre = serializers.CharField(
        max_length=150,
        required=True,
        error_messages={'required': 'El nombre de la categoría de reparación es obligatorio.'}
    )

    def validate_nombre(self, value):
        from workshop_app.models import CategoriaReparacion

        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError('El nombre de la categoría no puede estar vacío.')

        if CategoriaReparacion.objects.filter(nombre__iexact=val).exists():
            raise serializers.ValidationError("Ya existe una categoría con ese nombre. Por favor, ingrese un nombre distinto")

        return val


# ==============================================================================
# CU-26: INICIAR REPARACIÓN (LA ADUANA)
# ==============================================================================

class IniciarReparacionInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-26): Validación de entrada para iniciar un proceso de servicio técnico.
    """
    id_dispositivo = serializers.IntegerField(
        required=True,
        min_value=1,
        error_messages={'required': 'El identificador del dispositivo es obligatorio.'}
    )
    descripcion_problema = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
        error_messages={
            'required': 'La descripción del problema es obligatoria.',
            'blank': 'La descripción del problema no puede estar vacía.'
        }
    )
    credencial_acceso = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=255,
        error_messages={
            'required': 'La credencial de acceso es obligatoria (puede ser "Ninguna").',
            'blank': 'La credencial de acceso no puede estar vacía.'
        }
    )
    ids_categorias = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=True,
        allow_empty=False,
        error_messages={
            'required': 'Debe seleccionar al menos una categoría de reparación.',
            'empty': 'Debe seleccionar al menos una categoría de reparación.'
        }
    )

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'desc_cliente' in mutable_data and not mutable_data.get('descripcion_problema'):
            mutable_data['descripcion_problema'] = mutable_data.get('desc_cliente')
        if 'categorias' in mutable_data and not mutable_data.get('ids_categorias'):
            mutable_data['ids_categorias'] = mutable_data.get('categorias')
        return super().to_internal_value(mutable_data)

    def validate_descripcion_problema(self, value):
        val = str(value or '').strip()
        if len(val) < 10:
            raise serializers.ValidationError("La descripción es muy corta, por favor brinde más detalles")
        return val

    def validate_credencial_acceso(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError("Debe especificar una credencial de acceso (o indicar 'Ninguna').")
        return val

    def validate_ids_categorias(self, value):
        if not value or len(value) == 0:
            raise serializers.ValidationError("Debe seleccionar al menos una categoría de reparación.")
        return value

    def validate(self, attrs):
        from workshop_app.models import CategoriaReparacion

        desc = attrs.get('descripcion_problema')
        if desc and len(desc.strip()) < 10:
            raise serializers.ValidationError({
                "descripcion_problema": "La descripción es muy corta, por favor brinde más detalles"
            })

        cats = attrs.get('ids_categorias')
        if not cats or len(cats) == 0:
            raise serializers.ValidationError({
                "ids_categorias": "Debe seleccionar al menos una categoría de reparación."
            })

        existentes = set(
            CategoriaReparacion.objects.filter(id_categoria__in=cats).values_list('id_categoria', flat=True)
        )
        inexistentes = set(cats) - existentes
        if inexistentes:
            raise serializers.ValidationError({
                "ids_categorias": f"Las siguientes categorías de reparación no existen: {sorted(list(inexistentes))}."
            })

        return attrs


class ReparacionIniciadaOutputSerializer(serializers.Serializer):
    """
    CU-26: Formato de salida tras instanciar exitosamente una nueva reparación.
    """
    id_reparacion = serializers.IntegerField(read_only=True)
    codigo_seguridad = serializers.CharField(source='codigo_sec', read_only=True)
    etapa = serializers.CharField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    desc_cliente = serializers.CharField(read_only=True)
    credencial_acceso = serializers.CharField(read_only=True)
    id_dispositivo = serializers.IntegerField(source='id_dispositivo_id', read_only=True)


class RecepcionarDispositivoInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-45: Recepcionar Dispositivo).
    Valida la edición de datos funcionales y exige la constatación del estado estético/físico
    del equipo al momento exacto del ingreso al mostrador comercial.
    """
    descripcion_problema = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
        error_messages={
            'required': 'La descripción del problema es obligatoria.',
            'blank': 'La descripción del problema no puede estar vacía.'
        }
    )
    credencial_acceso = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=255,
        default='Ninguna'
    )
    ids_categorias = serializers.ListField(
        child=serializers.IntegerField(min_value=1),
        required=True,
        allow_empty=False,
        error_messages={
            'required': 'Debe seleccionar al menos una categoría de reparación.',
            'empty': 'Debe seleccionar al menos una categoría de reparación.'
        }
    )
    observaciones_fisicas = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
        error_messages={
            'required': 'Debe detallar el estado físico y estético del equipo para salvaguardar la responsabilidad del local.',
            'blank': 'Debe detallar el estado físico y estético del equipo para salvaguardar la responsabilidad del local.'
        }
    )

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)
        if 'desc_cliente' in mutable_data and not mutable_data.get('descripcion_problema'):
            mutable_data['descripcion_problema'] = mutable_data.get('desc_cliente')
        if 'categorias' in mutable_data and not mutable_data.get('ids_categorias'):
            mutable_data['ids_categorias'] = mutable_data.get('categorias')
        if 'observaciones_recepcion' in mutable_data and not mutable_data.get('observaciones_fisicas'):
            mutable_data['observaciones_fisicas'] = mutable_data.get('observaciones_recepcion')
        return super().to_internal_value(mutable_data)

    def validate_observaciones_fisicas(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError(
                "Debe detallar el estado físico y estético del equipo para salvaguardar la responsabilidad del local."
            )
        return val

    def validate_descripcion_problema(self, value):
        val = str(value or '').strip()
        if not val:
            raise serializers.ValidationError("La descripción del problema no puede estar vacía.")
        return val

    def validate_credencial_acceso(self, value):
        val = str(value or '').strip()
        return val if val else 'Ninguna'

    def validate(self, attrs):
        from workshop_app.models import CategoriaReparacion

        # Validar observaciones físicas no vacías
        obs = str(attrs.get('observaciones_fisicas') or '').strip()
        if not obs:
            raise serializers.ValidationError({
                "observaciones_fisicas": "Debe detallar el estado físico y estético del equipo para salvaguardar la responsabilidad del local."
            })
        attrs['observaciones_fisicas'] = obs

        # Validar categorías existentes
        cats = attrs.get('ids_categorias')
        if not cats:
            raise serializers.ValidationError({
                "ids_categorias": "Debe seleccionar al menos una categoría de reparación."
            })

        existentes = set(
            CategoriaReparacion.objects.filter(id_categoria__in=cats).values_list('id_categoria', flat=True)
        )
        inexistentes = set(cats) - existentes
        if inexistentes:
            raise serializers.ValidationError({
                "ids_categorias": f"Las siguientes categorías de reparación no existen: {sorted(list(inexistentes))}."
            })

        return attrs


class ReparacionRecepcionadaOutputSerializer(serializers.Serializer):
    """
    CU-45: Formato de salida tras recepcionar formalmente una reparación en mostrador.
    """
    id_reparacion = serializers.IntegerField(read_only=True)
    codigo_seguridad = serializers.CharField(source='codigo_sec', read_only=True)
    etapa = serializers.CharField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    hora_recepcion = serializers.TimeField(read_only=True, allow_null=True)
    desc_cliente = serializers.CharField(read_only=True)
    credencial_acceso = serializers.CharField(read_only=True)
    observaciones_fisicas = serializers.SerializerMethodField()
    id_dispositivo = serializers.IntegerField(source='id_dispositivo_id', read_only=True)

    def get_observaciones_fisicas(self, obj):
        bitacora = obj.bitacorareparacion_set.filter(estado_alcanzado=2).order_by('-id_bitacora').first()
        if bitacora and bitacora.comentario:
            if "Estado físico: " in bitacora.comentario:
                return bitacora.comentario.split("Estado físico: ", 1)[1]
            return bitacora.comentario
        return None


# ==============================================================================
# CU-58: FILTRAR REPARACIONES (SERIALIZADORES DE ENTRADA Y SALIDA)
# ==============================================================================

class FiltroReparacionesInputSerializer(serializers.Serializer):
    """
    La Aduana (CU-58: Filtrar Reparaciones).
    Valida los parámetros de consulta recibidos vía GET.
    """
    id_dispositivo = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    etapa = serializers.CharField(required=False, allow_blank=True, max_length=50)
    id_categoria = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)

    # Campos exclusivos para personal autorizado (ADMIN / TECNICO)
    cliente_query = serializers.CharField(required=False, allow_blank=True, max_length=150)
    id_tecnico = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    codigo_seguridad = serializers.CharField(required=False, allow_blank=True, max_length=100)

    def to_internal_value(self, data):
        mutable_data = data.copy() if hasattr(data, 'copy') else dict(data)
        # Soporte de aliases comunes en query params
        if 'codigo_sec' in mutable_data and not mutable_data.get('codigo_seguridad'):
            mutable_data['codigo_seguridad'] = mutable_data.get('codigo_sec')
        if 'id_categoria_reparacion' in mutable_data and not mutable_data.get('id_categoria'):
            mutable_data['id_categoria'] = mutable_data.get('id_categoria_reparacion')
        if 'categoria' in mutable_data and not mutable_data.get('id_categoria'):
            try:
                mutable_data['id_categoria'] = int(mutable_data.get('categoria'))
            except (ValueError, TypeError):
                pass
        if 'fecha_inicio_desde' in mutable_data and not mutable_data.get('fecha_desde'):
            mutable_data['fecha_desde'] = mutable_data.get('fecha_inicio_desde')
        if 'fecha_inicio_hasta' in mutable_data and not mutable_data.get('fecha_hasta'):
            mutable_data['fecha_hasta'] = mutable_data.get('fecha_inicio_hasta')
        if 'buscar' in mutable_data and not mutable_data.get('cliente_query'):
            mutable_data['cliente_query'] = mutable_data.get('buscar')
        if 'q' in mutable_data and not mutable_data.get('cliente_query'):
            mutable_data['cliente_query'] = mutable_data.get('q')

        # Limpiar vacíos
        for clave in ['id_dispositivo', 'id_categoria', 'id_tecnico', 'fecha_desde', 'fecha_hasta']:
            if clave in mutable_data and (mutable_data[clave] == '' or mutable_data[clave] == 'null' or mutable_data[clave] is None):
                mutable_data[clave] = None

        return super().to_internal_value(mutable_data)

    def validate(self, attrs):
        f_desde = attrs.get('fecha_desde')
        f_hasta = attrs.get('fecha_hasta')
        if f_desde and f_hasta and f_desde > f_hasta:
            raise serializers.ValidationError({
                "fecha_desde": "La fecha de inicio desde no puede ser posterior a la fecha hasta."
            })
        return attrs


class ReparacionListOutputSerializer(serializers.Serializer):
    """
    CU-58: Formato de salida resumido para el listado y filtrado de reparaciones.
    Aplica Seguridad Vertical: oculta codigo_seguridad si el solicitante no es personal de taller.
    """
    id_reparacion = serializers.IntegerField(read_only=True)
    etapa = serializers.CharField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    hora_recepcion = serializers.TimeField(read_only=True, allow_null=True)
    fecha_entrega = serializers.DateField(read_only=True, allow_null=True)
    desc_cliente = serializers.CharField(read_only=True, allow_null=True)
    observaciones_fisicas = serializers.SerializerMethodField()

    # Seguridad Vertical: Código de seguridad y credenciales sensibles
    codigo_seguridad = serializers.SerializerMethodField()
    codigo_sec = serializers.SerializerMethodField()
    credencial_acceso = serializers.SerializerMethodField()

    # Datos básicos relacionados
    dispositivo = serializers.SerializerMethodField()
    cliente = serializers.SerializerMethodField()
    tecnico = serializers.SerializerMethodField()
    categorias = serializers.SerializerMethodField()

    def _es_personal_autorizado(self):
        usuario = self.context.get('usuario') or (self.context.get('request').user if self.context.get('request') else None)
        if not usuario:
            return False
        rol_codigo = ''
        if hasattr(usuario, 'id_rol') and usuario.id_rol:
            rol_codigo = (usuario.id_rol.codigo or '').upper()
        elif hasattr(usuario, 'rol') and usuario.rol:
            rol_codigo = (usuario.rol.codigo or '').upper()
        return rol_codigo in ('ADMIN', 'TECNICO')

    def get_credencial_acceso(self, obj):
        if self._es_personal_autorizado():
            return obj.credencial_acceso
        return None

    def get_codigo_seguridad(self, obj):
        if self._es_personal_autorizado():
            return obj.codigo_sec
        return None

    def get_codigo_sec(self, obj):
        if self._es_personal_autorizado():
            return obj.codigo_sec
        return None

    def get_observaciones_fisicas(self, obj):
        bitacora = obj.bitacorareparacion_set.filter(estado_alcanzado=2).order_by('-id_bitacora').first()
        if bitacora and bitacora.comentario:
            if "Estado físico: " in bitacora.comentario:
                return bitacora.comentario.split("Estado físico: ", 1)[1]
            return bitacora.comentario
        return None

    def get_dispositivo(self, obj):
        disp = obj.id_dispositivo
        if not disp:
            return None
        modelo = getattr(disp, 'id_modelo', None)
        marca = getattr(modelo, 'id_marca', None) if modelo else None
        tipo = getattr(modelo, 'id_tipo_dispositivo', None) if modelo else None
        return {
            'id_dispositivo': disp.id_dispositivo,
            'numero_serie': disp.numero_serie,
            'modelo': getattr(modelo, 'nombre', 'N/D') if modelo else 'N/D',
            'marca': getattr(marca, 'nombre', 'N/D') if marca else 'N/D',
            'tipo': getattr(tipo, 'nombre', 'N/D') if tipo else 'N/D',
            'imagen': disp.imagen
        }

    def get_cliente(self, obj):
        cliente = getattr(obj.id_dispositivo, 'id_usuario', None)
        if not cliente:
            return None
        perfil = getattr(cliente, 'perfilusuario', None)
        nombre = getattr(perfil, 'nombre', '') or ''
        apellido = getattr(perfil, 'apellido', '') or ''
        nombre_completo = f"{nombre} {apellido}".strip() or cliente.email
        return {
            'id_cliente': cliente.id_usuario,
            'nombre': nombre,
            'apellido': apellido,
            'nombre_completo': nombre_completo,
            'dni': getattr(perfil, 'dni', None),
            'email': cliente.email,
            'telefono': getattr(perfil, 'telefono', None)
        }

    def get_tecnico(self, obj):
        tecnico = obj.id_usuario
        if not tecnico:
            return None
        perfil = getattr(tecnico, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return tecnico.email

    def get_categorias(self, obj):
        return [
            {
                'id_categoria': cat.id_categoria,
                'nombre': cat.nombre
            }
            for cat in obj.categorias.all()
        ]


# ==============================================================================
# CU-08: CARGAR DIAGNÓSTICO TÉCNICO (LA ADUANA COMERCIAL Y DE EVALUACIÓN)
# ==============================================================================

class InsumoDiagnosticoInputSerializer(serializers.Serializer):
    """
    CU-08: Entrada de un insumo o repuesto individual seleccionado del inventario.
    """
    id_producto = serializers.IntegerField(
        required=True,
        help_text="Identificador único del producto/insumo en el catálogo."
    )
    cantidad = serializers.IntegerField(
        required=True,
        min_value=1,
        help_text="Cantidad de unidades requeridas (debe ser mayor a cero)."
    )

    def validate_id_producto(self, value):
        from catalog_app.models import Producto
        try:
            producto = Producto.objects.get(pk=value)
        except Producto.DoesNotExist:
            raise serializers.ValidationError(f"El producto con ID {value} no existe en el catálogo.")
        return value


class CargarDiagnosticoInputSerializer(serializers.Serializer):
    """
    CU-08: Entrada formal para el registro del diagnóstico y generación del presupuesto.
    Valida el detalle de la falla, costo de mano de obra y el listado de insumos.
    """
    descripcion_falla = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        trim_whitespace=True,
        help_text="Descripción detallada de la evaluación técnica y problemas detectados."
    )
    falla_detectada = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=1000,
        trim_whitespace=True,
        help_text="Alias alternativo para descripcion_falla."
    )
    costo_mano_obra = serializers.DecimalField(
        required=True,
        max_digits=10,
        decimal_places=2,
        min_value=0,
        help_text="Costo estimado de la mano de obra del técnico (mayor o igual a cero)."
    )
    insumos = InsumoDiagnosticoInputSerializer(
        many=True,
        required=False,
        default=list,
        help_text="Listado opcional de insumos requeridos del inventario."
    )

    def validate(self, attrs):
        desc = (attrs.get('descripcion_falla') or attrs.get('falla_detectada') or '').strip()
        if len(desc) < 5:
            raise serializers.ValidationError({
                "descripcion_falla": "La descripción de la falla debe contener al menos 5 caracteres."
            })
        attrs['descripcion_falla'] = desc

        insumos = attrs.get('insumos', [])
        ids_vistos = set()
        for item in insumos:
            id_prod = item['id_producto']
            if id_prod in ids_vistos:
                raise serializers.ValidationError({
                    "insumos": f"El producto con ID {id_prod} se encuentra duplicado en el listado de insumos."
                })
            ids_vistos.add(id_prod)
        return attrs


# ==============================================================================
# CU-56 Y CU-09: DIAGNÓSTICO Y DECISIÓN DE REPARACIÓN (LA ADUANA COMERCIAL)
# ==============================================================================

class InsumoPresupuestadoOutputSerializer(serializers.Serializer):
    """
    CU-56: Representación serializada de un insumo presupuestado para la reparación.
    """
    id_detalle_insumo = serializers.IntegerField()
    id_producto = serializers.IntegerField(source='id_producto.id_producto')
    nombre_producto = serializers.CharField(source='id_producto.nombre')
    codigo_producto = serializers.CharField(source='id_producto.codigo', default='')
    cantidad = serializers.IntegerField()
    precio_unitario = serializers.DecimalField(max_digits=10, decimal_places=2)
    subtotal = serializers.SerializerMethodField()

    def get_subtotal(self, obj):
        cant = obj.cantidad or 0
        precio = obj.precio_unitario or Decimal('0.00')
        return round(Decimal(str(cant)) * Decimal(str(precio)), 2)


class DiagnosticoClienteOutputSerializer(serializers.Serializer):
    """
    CU-56: Salida formal del informe técnico (Diagnóstico) y presupuesto para el cliente.
    Mapea fecha del diagnóstico, técnico asignado, descripción detallada de la falla,
    lista de insumos presupuestados y costo total estimado (mano de obra + repuestos).
    """
    id_diagnostico = serializers.IntegerField()
    id_reparacion = serializers.IntegerField(source='id_reparacion.id_reparacion')
    fecha_diagnostico = serializers.DateField()
    tecnico_asignado = serializers.SerializerMethodField()
    descripcion_falla = serializers.CharField()
    costo_mano_obra = serializers.SerializerMethodField()
    costo_diagnostico = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    insumos_utilizados = serializers.SerializerMethodField()
    costo_insumos = serializers.SerializerMethodField()
    costo_total = serializers.SerializerMethodField()
    etapa_reparacion = serializers.CharField(source='id_reparacion.etapa')
    permite_decision = serializers.SerializerMethodField()
    dispositivo = serializers.SerializerMethodField()

    def get_tecnico_asignado(self, obj):
        tecnico = obj.id_reparacion.id_usuario
        if not tecnico:
            return "No asignado"
        perfil = getattr(tecnico, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return tecnico.email or str(tecnico)

    def get_costo_mano_obra(self, obj):
        return obj.costo_diagnostico or Decimal('0.00')

    def get_insumos_utilizados(self, obj):
        insumos = obj.id_reparacion.detalleinsumoreparacion_set.all()
        return InsumoPresupuestadoOutputSerializer(insumos, many=True).data

    def get_costo_insumos(self, obj):
        insumos = obj.id_reparacion.detalleinsumoreparacion_set.all()
        total = sum(
            (Decimal(str(i.cantidad or 0)) * Decimal(str(i.precio_unitario or 0)))
            for i in insumos
        )
        return round(Decimal(str(total)), 2)

    def get_costo_total(self, obj):
        mano_obra = obj.costo_diagnostico or Decimal('0.00')
        insumos = obj.id_reparacion.detalleinsumoreparacion_set.all()
        total_insumos = sum(
            (Decimal(str(i.cantidad or 0)) * Decimal(str(i.precio_unitario or 0)))
            for i in insumos
        )
        return round(Decimal(str(mano_obra)) + Decimal(str(total_insumos)), 2)

    def get_permite_decision(self, obj):
        etapa = (obj.id_reparacion.etapa or '').strip().upper()
        return etapa in ('ESPERANDO_CONFIRMACION', 'ESPERANDO CONFIRMACION')

    def get_dispositivo(self, obj):
        disp = getattr(obj.id_reparacion, 'id_dispositivo', None)
        if not disp:
            return None
        modelo = getattr(disp, 'id_modelo', None)
        marca = getattr(modelo, 'id_marca', None) if modelo else None
        return {
            'id_dispositivo': disp.id_dispositivo,
            'numero_serie': disp.numero_serie or '',
            'modelo': modelo.nombre if modelo else '',
            'marca': marca.nombre if marca else ''
        }


class DecisionReparacionInputSerializer(serializers.Serializer):
    """
    CU-09: Aduana de Entrada para la decisión comercial del cliente sobre la reparación.
    - decision: 'ACEPTAR' o 'RECHAZAR' (o booleanos equivalentes).
    - comentarios_cliente: observaciones opcionales del cliente.
    - metodo_entrega: obligatorio únicamente si decision es 'ACEPTAR'.
    - metodo_pago: obligatorio únicamente si decision es 'ACEPTAR'.
    - id_direccion_envio: ID opcional de dirección de entrega.
    """
    decision = serializers.CharField(
        required=True,
        help_text="Decisión comercial del cliente: 'ACEPTAR' o 'RECHAZAR'."
    )
    comentarios_cliente = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        default='',
        max_length=1000,
        help_text="Comentarios u observaciones adicionales del cliente."
    )
    metodo_entrega = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100,
        help_text="Método de entrega (ej: 'RETIRO' o 'ENVIO'). Requerido si decision es 'ACEPTAR'."
    )
    metodo_pago = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100,
        help_text="Método o medio de pago (ej: 'EFECTIVO', 'TRANSFERENCIA'). Requerido si decision es 'ACEPTAR'."
    )
    id_direccion_envio = serializers.IntegerField(
        required=False,
        allow_null=True,
        default=None,
        help_text="Identificador único de la dirección de entrega asignada."
    )

    def to_internal_value(self, data):
        data_dict = data.copy() if hasattr(data, 'copy') else dict(data)
        
        # Soporte amigable para booleanos en decision: True -> 'ACEPTAR', False -> 'RECHAZAR'
        dec = data_dict.get('decision')
        if isinstance(dec, bool):
            data_dict['decision'] = 'ACEPTAR' if dec else 'RECHAZAR'
        elif isinstance(dec, str):
            dec_clean = dec.strip().upper()
            if dec_clean in ('ACEPTAR', 'ACEPTADA', 'CONFIRMAR', 'CONFIRMADA', 'TRUE', '1'):
                data_dict['decision'] = 'ACEPTAR'
            elif dec_clean in ('RECHAZAR', 'RECHAZADA', 'CANCELAR', 'CANCELADA', 'FALSE', '0'):
                data_dict['decision'] = 'RECHAZAR'

        return super().to_internal_value(data_dict)

    def validate_decision(self, value):
        val_norm = str(value).strip().upper()
        if val_norm not in ('ACEPTAR', 'RECHAZAR'):
            raise serializers.ValidationError("La decisión debe ser 'ACEPTAR' o 'RECHAZAR'.")
        return val_norm

    def validate(self, attrs):
        decision = attrs.get('decision')
        if decision == 'ACEPTAR':
            metodo_entrega = (attrs.get('metodo_entrega') or '').strip()
            if not metodo_entrega:
                raise serializers.ValidationError({
                    "metodo_entrega": "El método de entrega es obligatorio cuando se acepta la reparación."
                })
            attrs['metodo_entrega'] = metodo_entrega

            metodo_pago = (attrs.get('metodo_pago') or '').strip()
            if not metodo_pago:
                raise serializers.ValidationError({
                    "metodo_pago": "El método de pago es obligatorio cuando se acepta la reparación."
                })
            attrs['metodo_pago'] = metodo_pago

            # Regla de Negocio: Los envíos a domicilio no admiten pago en efectivo en mostrador
            if metodo_entrega.upper() == 'ENVIO':
                metodo_pago_upper = metodo_pago.upper()
                if 'EFECTIVO' in metodo_pago_upper or metodo_pago_upper in ('MOSTRADOR', 'EFECTIVO_MOSTRADOR'):
                    raise serializers.ValidationError({
                        "metodo_pago": "El método de pago en efectivo en mostrador no está disponible para envíos a domicilio."
                    })
        return attrs


class CambiarEstadoReparacionInputSerializer(serializers.Serializer):
    """
    CU-10: Validación de entrada para actualizar el estado operativo de una reparación.
    - nuevo_estado: Requerido, string normalizado contra estados válidos del sistema.
    - comentario: Requerido, string no vacío para justificación técnica de auditoría.
    """
    nuevo_estado = serializers.CharField(
        max_length=50,
        required=True,
        error_messages={
            "required": "El nuevo estado de la reparación es obligatorio.",
            "blank": "El nuevo estado de la reparación no puede estar en blanco."
        }
    )
    comentario = serializers.CharField(
        max_length=1000,
        required=True,
        error_messages={
            "required": "El comentario técnico es obligatorio.",
            "blank": "El comentario técnico no puede estar en blanco."
        }
    )

    ESTADOS_VALIDOS = {
        'ESPERANDO_REPUESTOS': 'ESPERANDO_REPUESTOS',
        'ESPERANDO_REPUESTO': 'ESPERANDO_REPUESTOS',
        'ESPERANDO_INSUMO': 'ESPERANDO_REPUESTOS',
        'ESPERANDO_INSUMOS': 'ESPERANDO_REPUESTOS',
        'EN_REPARACION': 'EN_REPARACION',
        'REPARACION_EN_CURSO': 'EN_REPARACION',
        'FINALIZADO': 'FINALIZADO',
        'FINALIZADA': 'FINALIZADO',
        'ESPERANDO_DIAGNOSTICO': 'ESPERANDO_DIAGNOSTICO',
        'ESPERANDO_CONFIRMACION': 'ESPERANDO_CONFIRMACION'
    }

    def validate_nuevo_estado(self, value):
        val_norm = str(value or '').strip().upper().replace(' ', '_')
        if val_norm not in self.ESTADOS_VALIDOS:
            validos_legibles = ", ".join(sorted(set(self.ESTADOS_VALIDOS.values())))
            raise serializers.ValidationError(
                f"Estado '{value}' inválido. Los estados permitidos son: {validos_legibles}."
            )
        return self.ESTADOS_VALIDOS[val_norm]

        return comentario_limpio


# ==============================================================================
# CU-46: Entregar Dispositivo (La Aduana Comercial)
# ==============================================================================

class EntregarDispositivoInputSerializer(serializers.Serializer):
    """
    CU-46: Entregar Dispositivo (La Aduana Comercial).
    Valida los datos de entrada para autorizar la liberación física del hardware.
    Exige obligatoriamente código de seguridad o DNI del cliente.
    """
    codigo_seguridad = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=100
    )
    dni_cliente = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=50
    )
    comentarios_entrega = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True,
        max_length=1000
    )

    def validate(self, attrs):
        codigo = (attrs.get('codigo_seguridad') or '').strip()
        dni = (attrs.get('dni_cliente') or '').strip()

        if not codigo and not dni:
            raise serializers.ValidationError(
                "Debe proporcionar el código de seguridad o el DNI del cliente para autorizar la entrega."
            )

        attrs['codigo_seguridad'] = codigo if codigo else None
        attrs['dni_cliente'] = dni if dni else None
        attrs['comentarios_entrega'] = (attrs.get('comentarios_entrega') or '').strip()
        return attrs



