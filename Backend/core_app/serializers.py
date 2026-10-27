from rest_framework import serializers
from core_app.models import ConfiguracionSistema, Notificacion


class ConfiguracionUpdateInputSerializer(serializers.Serializer):
    """
    Serializador de entrada (La Aduana) para validar la actualización
    de parámetros globales del sistema (CU-42).
    """

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            raise serializers.ValidationError("Los datos deben ser un objeto JSON (pares clave-valor).")

        # Permitir tanto {"clave": "valor"} directo como {"configuraciones": {...}} si viniera anidado
        if 'configuraciones' in data and isinstance(data['configuraciones'], dict):
            datos_origen = data['configuraciones']
        else:
            datos_origen = data

        resultado = {}
        for clave, valor in datos_origen.items():
            if clave is not None:
                resultado[str(clave)] = valor
        return resultado

    def validate(self, attrs):
        # 1. Campos que requieren casteo numérico entero
        CAMPOS_ENTEROS = {
            'maxIntentosLogin',
            'tamanoMaxArchivoMB',
            'backupRetencionCopias',
            'frecuenciaGeneracionOC_dias',
            'diasEsperaCotizacion',
            'pesoEvaluacion_Confiabilidad',
            'pesoEvaluacion_Tiempo',
            'pesoEvaluacion_Nivel',
            'pesoEvaluacion_Economico',
            'pesoEvaluacion_Envio',
            'limitePromocionesMensual',
            'periodoRefrigerioCliente',
        }

        # Campos que requieren casteo numérico decimal / float
        CAMPOS_DECIMALES = {
            'tiempoSesionInactiva',
            'backupFrecuenciaHoras',
            'envioLocal',
            'envioRegional',
            'envioNacional',
            'porcentajeDescuentoMaximo',
            'vigenciaBeneficioDefecto',
            'costoManoDeObra',
        }

        # Campos booleanos que se almacenan como 'True' / 'False' en la BD
        CAMPOS_BOOLEANOS = {
            'backupAutomatico',
            'autoAbastecimientoActivo',
            'log_seguridad_accesos',
            'log_caja_anulaciones',
            'log_stock_ajustes_manuales',
            'log_roles_permisos',
            'log_operaciones_lectura',
            'motorBeneficiosActivo',
            'permitirCostoManoDeObraPropio',
        }

        for campo in CAMPOS_BOOLEANOS:
            if campo in attrs:
                raw_val = attrs[campo]
                if isinstance(raw_val, bool):
                    attrs[campo] = 'True' if raw_val else 'False'
                elif str(raw_val).strip().lower() in ('true', '1', 't', 'yes', 'si'):
                    attrs[campo] = 'True'
                else:
                    attrs[campo] = 'False'

        for campo, val in attrs.items():
            if val is None or val == "":
                continue

            if campo in CAMPOS_BOOLEANOS:
                continue

            if campo in CAMPOS_ENTEROS:
                try:
                    val_str = str(val).strip()
                    int(val_str)
                except (ValueError, TypeError):
                    raise serializers.ValidationError({
                        campo: f"El campo '{campo}' debe ser un número entero válido."
                    })

            elif campo in CAMPOS_DECIMALES:
                try:
                    val_str = str(val).strip()
                    float(val_str)
                except (ValueError, TypeError):
                    raise serializers.ValidationError({
                        campo: f"El campo '{campo}' debe ser un valor numérico válido."
                    })

        # 2. Descuentos: porcentajeDescuentoMaximo debe estar entre 0 y 100
        if 'porcentajeDescuentoMaximo' in attrs and attrs['porcentajeDescuentoMaximo'] is not None:
            try:
                num_desc = float(str(attrs['porcentajeDescuentoMaximo']).strip())
            except (ValueError, TypeError):
                raise serializers.ValidationError({
                    'porcentajeDescuentoMaximo': "El porcentaje de descuento máximo debe ser numérico."
                })

            if num_desc < 0 or num_desc > 100:
                raise serializers.ValidationError({
                    'porcentajeDescuentoMaximo': "El porcentaje de descuento máximo no puede ser menor a 0 ni mayor a 100."
                })

        # 3. Suma 100% del Algoritmo de Abastecimiento y Compras
        pesos_claves = [
            'pesoEvaluacion_Confiabilidad',
            'pesoEvaluacion_Tiempo',
            'pesoEvaluacion_Nivel',
            'pesoEvaluacion_Economico',
            'pesoEvaluacion_Envio'
        ]

        # Si alguna de las claves de ponderación del algoritmo está en la solicitud:
        tiene_pesos = any(k in attrs for k in pesos_claves)
        if tiene_pesos:
            suma_pesos = 0
            for k in pesos_claves:
                if k in attrs and attrs[k] is not None:
                    try:
                        val_peso = int(str(attrs[k]).strip())
                    except (ValueError, TypeError):
                        raise serializers.ValidationError({
                            k: f"El peso '{k}' debe ser un número entero válido."
                        })
                else:
                    # Si no se incluyó en la petición parcial, rescatar valor actual en BD
                    config_bd = ConfiguracionSistema.objects.filter(clave=k).first()
                    try:
                        val_peso = int(str(config_bd.valor).strip()) if config_bd and config_bd.valor else 0
                    except (ValueError, TypeError):
                        val_peso = 0

                if val_peso < 0:
                    raise serializers.ValidationError({
                        k: f"El peso '{k}' no puede ser un número negativo."
                    })

                suma_pesos += val_peso

            if suma_pesos != 100:
                raise serializers.ValidationError(
                    f"La suma de los pesos de evaluación ({', '.join(pesos_claves)}) DEBE ser exactamente 100%. "
                    f"Suma actual: {suma_pesos}%."
                )

        return attrs


class NotificacionOutputSerializer(serializers.ModelSerializer):
    """
    Serializador de salida (La Aduana) para el centro de notificaciones.
    Expone los campos clave de la alerta para su consumo seguro en el frontend,
    incluyendo metadatos del equipo y enlace directo a la reparación.
    """
    id_reparacion = serializers.SerializerMethodField()
    datos_dispositivo = serializers.SerializerMethodField()
    url_destino = serializers.SerializerMethodField()

    class Meta:
        model = Notificacion
        fields = [
            'id_notificacion',
            'mensaje',
            'tipo',
            'fecha_envio',
            'leida',
            'id_dispositivo',
            'id_beneficio',
            'id_reparacion',
            'datos_dispositivo',
            'url_destino',
        ]

    def _obtener_reparacion(self, obj):
        if not hasattr(obj, '_reparacion_cache'):
            rep = None
            if obj.id_dispositivo:
                import re
                match = re.search(r'#(\d+)', obj.mensaje or '')
                if match:
                    id_rep = int(match.group(1))
                    rep = obj.id_dispositivo.reparacion_set.filter(pk=id_rep).first()
                if not rep:
                    rep = obj.id_dispositivo.reparacion_set.order_by('-id_reparacion').first()
            obj._reparacion_cache = rep
        return obj._reparacion_cache

    def get_id_reparacion(self, obj):
        reparacion = self._obtener_reparacion(obj)
        return reparacion.id_reparacion if reparacion else None

    def get_datos_dispositivo(self, obj):
        if not obj.id_dispositivo:
            return None
        disp = obj.id_dispositivo
        modelo = getattr(disp, 'id_modelo', None)
        reparacion = self._obtener_reparacion(obj)
        return {
            'id_dispositivo': disp.id_dispositivo,
            'marca': modelo.id_marca.nombre if modelo and modelo.id_marca else 'N/D',
            'modelo': modelo.nombre if modelo else 'N/D',
            'tipo': modelo.id_tipo_dispositivo.nombre if modelo and modelo.id_tipo_dispositivo else 'Dispositivo',
            'numero_serie': disp.numero_serie or 'S/N',
            'estado_reparacion': reparacion.etapa if reparacion else None,
        }

    def get_url_destino(self, obj):
        reparacion = self._obtener_reparacion(obj)
        usuario_dest = getattr(obj, 'id_usuario', None)
        rol_dest = ''
        if usuario_dest:
            rol_dest = getattr(getattr(usuario_dest, 'id_rol', None) or getattr(usuario_dest, 'rol', None), 'codigo', '').upper()

        if reparacion:
            if rol_dest in ('TECNICO', 'ADMIN'):
                return f"/tecnico/reparaciones/{reparacion.id_reparacion}"
            return f"/cliente/reparaciones/{reparacion.id_reparacion}"
        if obj.id_dispositivo:
            return f"/cliente/dispositivos/{obj.id_dispositivo.id_dispositivo}"
        return None


# ==============================================================================
# CU-40: FILTRAR LOGS DE AUDITORÍA (SERIALIZERS)
# ==============================================================================

class FiltrarLogsAuditoriaInputSerializer(serializers.Serializer):
    """La Aduana (CU-40): Valida parámetros de consulta para logs de auditoría."""
    buscar = serializers.CharField(required=False, allow_blank=True, max_length=255)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True, max_length=255)
    tipo = serializers.CharField(required=False, allow_blank=True, max_length=50)
    modulo_origen = serializers.CharField(required=False, allow_blank=True, max_length=50)
    tabla_afectada = serializers.CharField(required=False, allow_blank=True, max_length=50)
    id_usuario = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    usuario_query = serializers.CharField(required=False, allow_blank=True, max_length=150)


class LogSistemaOutputSerializer(serializers.Serializer):
    """Formato estructurado de salida para eventos de auditoría."""
    id_log = serializers.IntegerField(read_only=True)
    fecha_hora = serializers.TimeField(read_only=True)
    accion = serializers.CharField(read_only=True)
    detalle = serializers.CharField(read_only=True, allow_null=True)
    tipo = serializers.CharField(read_only=True)
    modulo_origen = serializers.CharField(read_only=True, allow_null=True)
    tabla_afectada = serializers.CharField(read_only=True, allow_null=True)
    id_registro_afectado = serializers.CharField(read_only=True, allow_null=True)
    id_usuario = serializers.IntegerField(source='id_usuario_id', read_only=True, allow_null=True)
    email_usuario = serializers.SerializerMethodField()
    nombre_usuario = serializers.SerializerMethodField()
    rol_usuario = serializers.SerializerMethodField()

    def get_email_usuario(self, obj):
        return obj.id_usuario.email if obj.id_usuario else "Sistema / Desconocido"

    def get_nombre_usuario(self, obj):
        if obj.id_usuario and hasattr(obj.id_usuario, 'perfilusuario'):
            perfil = obj.id_usuario.perfilusuario
            nom = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
            return nom if nom else obj.id_usuario.email
        return "Sistema"

    def get_rol_usuario(self, obj):
        if obj.id_usuario and obj.id_usuario.id_rol:
            return obj.id_usuario.id_rol.nombre_rol
        return "N/A"


# ==============================================================================
# CU-22 & CU-23: COPIAS DE SEGURIDAD Y RESTAURACIÓN (SERIALIZERS)
# ==============================================================================

class CopiaSeguridadOutputSerializer(serializers.Serializer):
    """
    Formato estructurado de salida para copias de seguridad (CU-22 / CU-23).
    Expone metadatos del archivo de respaldo, tamaño real en disco e integridad física.
    """
    id_backup = serializers.IntegerField(read_only=True)
    fecha_creacion = serializers.DateField(read_only=True)
    automatico = serializers.BooleanField(read_only=True)
    ubicacion_archivo = serializers.CharField(read_only=True)
    nombre_archivo = serializers.SerializerMethodField()
    version = serializers.CharField(read_only=True)
    id_usuario = serializers.IntegerField(source='id_usuario_id', read_only=True, allow_null=True)
    email_usuario = serializers.SerializerMethodField()
    nombre_usuario = serializers.SerializerMethodField()
    tamano_bytes = serializers.SerializerMethodField()
    tamano_mb = serializers.SerializerMethodField()
    archivo_existe = serializers.SerializerMethodField()

    def get_nombre_archivo(self, obj):
        import os
        return os.path.basename(obj.ubicacion_archivo) if obj.ubicacion_archivo else "N/D"

    def get_email_usuario(self, obj):
        return obj.id_usuario.email if obj.id_usuario else "Automático / Sistema"

    def get_nombre_usuario(self, obj):
        if obj.id_usuario and hasattr(obj.id_usuario, 'perfilusuario'):
            perfil = obj.id_usuario.perfilusuario
            nombre_completo = f"{perfil.nombre or ''} {perfil.apellido or ''}".strip()
            return nombre_completo if nombre_completo else obj.id_usuario.email
        return "Sistema"

    def get_tamano_bytes(self, obj):
        import os
        if obj.ubicacion_archivo and os.path.exists(obj.ubicacion_archivo):
            try:
                return os.path.getsize(obj.ubicacion_archivo)
            except OSError:
                return 0
        return 0

    def get_tamano_mb(self, obj):
        bytes_totales = self.get_tamano_bytes(obj)
        return round(bytes_totales / (1024 * 1024), 2)

    def get_archivo_existe(self, obj):
        import os
        return bool(obj.ubicacion_archivo and os.path.exists(obj.ubicacion_archivo))


class RestaurarBackupInputSerializer(serializers.Serializer):
    """
    La Aduana de Seguridad (CU-23): Valida las credenciales y el token OTP
    exigidos de forma estricta para autorizar la restauración del sistema.
    """
    password = serializers.CharField(
        write_only=True,
        required=True,
        min_length=1,
        error_messages={'required': 'Debe ingresar su contraseña de administrador.'}
    )
    otp_token = serializers.CharField(
        required=True,
        min_length=4,
        max_length=20,
        error_messages={'required': 'Debe ingresar el código OTP de seguridad de un solo uso.'}
    )

