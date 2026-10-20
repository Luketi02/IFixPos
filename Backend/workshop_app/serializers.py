from rest_framework import serializers

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

class ReparacionAnidadoSerializer(serializers.Serializer):
    etapa = serializers.CharField()
    codigo_sec = serializers.CharField()
    fecha_inicio = serializers.DateField()

class DispositivoFiltradoOutputSerializer(serializers.Serializer):
    id_dispositivo = serializers.IntegerField()
    numero_serie = serializers.CharField()
    fecha_registro = serializers.DateField()
    modelo = ModeloDispositivoAnidadoSerializer(source='id_modelo', read_only=True)
    reparaciones = ReparacionAnidadoSerializer(source='reparacion_set', many=True, read_only=True)


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
        # CU-07: un equipo con historial técnico no puede editarse.
        return not obj.reparacion_set.all()


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
    fecha_hora = serializers.TimeField(read_only=True)
    estado_alcanzado = serializers.IntegerField(read_only=True)
    comentario = serializers.CharField(read_only=True)
    tecnico = serializers.SerializerMethodField()

    def get_tecnico(self, obj):
        usuario = obj.id_usuario
        if not usuario:
            return None
        perfil = getattr(usuario, 'perfilusuario', None)
        if perfil and (perfil.nombre or perfil.apellido):
            return f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
        return usuario.email


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


class ReparacionActivaOutputSerializer(serializers.Serializer):
    """CU-11: Datos de la reparación actualmente en curso sobre el equipo."""
    id_reparacion = serializers.IntegerField(read_only=True)
    fecha_inicio = serializers.DateField(read_only=True)
    etapa = serializers.CharField(read_only=True)
    codigo_sec = serializers.CharField(read_only=True, allow_null=True)
    desc_cliente = serializers.CharField(read_only=True, allow_null=True)
    diagnostico = serializers.SerializerMethodField()

    def get_diagnostico(self, obj):
        diag = obj.diagnostico_set.first()
        if not diag:
            return None
        return DiagnosticoOutputSerializer(diag).data


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
    tecnico = serializers.SerializerMethodField()

    # Seguridad Vertical: Condicional por rol
    credencial_acceso = serializers.SerializerMethodField()
    codigo_sec = serializers.SerializerMethodField()

    # Secciones anidadas
    dispositivo = DispositivoCabeceraOutputSerializer(source='id_dispositivo', read_only=True)
    diagnostico = serializers.SerializerMethodField()
    bitacora = serializers.SerializerMethodField()
    insumos = serializers.SerializerMethodField()
    calificacion = serializers.SerializerMethodField()

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
        items = obj.bitacorareparacion_set.all().order_by('fecha_hora', 'id_bitacora')
        return BitacoraOutputSerializer(items, many=True).data

    def get_insumos(self, obj):
        items = obj.detalleinsumoreparacion_set.all()
        return DetalleInsumoOutputSerializer(items, many=True).data

    def get_calificacion(self, obj):
        calif = obj.calificacion_set.first()
        if not calif:
            return None
        return CalificacionOutputSerializer(calif).data


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
