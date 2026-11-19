from rest_framework import serializers
from core_app.models import ConfiguracionSistema, Notificacion


class ConfiguracionUpdateInputSerializer(serializers.Serializer):
    """
    Serializador de entrada para validar la actualización
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
            'diasValidezCotizacion',
            'pesoEvaluacion_Confiabilidad',
            'pesoEvaluacion_Tiempo',
            'pesoEvaluacion_Nivel',
            'pesoEvaluacion_Economico',
            'pesoEvaluacion_Envio',
            'limitePromocionesMensual',
            'periodoRefrigerioCliente',
            'esperaUrgenciaTecnicaHoras',
            'toleranciaHorasIncumplimientoUrgente',
            'diasToleranciaIncumplimientoProveedor',
            'pesoAsignacion_CargaLaboral',
            'pesoAsignacion_Calificacion',
            'pesoAsignacion_Rapidez',
            'pesoAsignacion_Especialidad',
            'pesoAsignacion_Efectividad',
            'diasGarantiaReparacion',
            'diasLimiteRetiroEquipo',
            'minutosReservaVentaPendiente',
            'longitudCodigoSeguridad',
            'minutosExpiracionPreferenciaMP',
            'minutosVidaAccessToken',
            'minutosVidaOtpRecuperacion',
            'minutosVidaOtpAdmin',
            'limiteResultadosBusquedaGeo',
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
            'costo_diagnostico_base',
            'costoDiagnosticoBase',
        }

        # Campos booleanos que se almacenan como 'True' / 'False' en la BD
        CAMPOS_BOOLEANOS = {
            'backupAutomatico',
            'backupDiarioActivo',
            'backupSemanalActivo',
            'backupQuincenalActivo',
            'backupMensualActivo',
            'autoAbastecimientoActivo',
            'log_seguridad_accesos',
            'log_caja_anulaciones',
            'log_stock_ajustes_manuales',
            'log_roles_permisos',
            'log_operaciones_lectura',
            'motorBeneficiosActivo',
            'permitirCostoManoDeObraPropio',
            'criterioObligatorio_Envio',
            'autoAsignacionTecnicosActiva',
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

        # 3. Validación de opciones del Motor de Abastecimiento
        if 'estrategiaLoteReposicion' in attrs and attrs['estrategiaLoteReposicion']:
            estrategias_validas = {'BRECHA_MINIMO', 'DOBLE_MINIMO', 'STOCK_MINIMO_FIJO'}
            val_est = str(attrs['estrategiaLoteReposicion']).strip().upper()
            if val_est not in estrategias_validas:
                raise serializers.ValidationError({
                    'estrategiaLoteReposicion': f"Estrategia inválida. Opciones permitidas: {', '.join(sorted(estrategias_validas))}."
                })
            attrs['estrategiaLoteReposicion'] = val_est

        if 'modoDisparadorAbastecimiento' in attrs and attrs['modoDisparadorAbastecimiento']:
            modos_validos = {'HIBRIDO', 'TRANSACCIONAL', 'PROGRAMADO'}
            val_modo = str(attrs['modoDisparadorAbastecimiento']).strip().upper()
            if val_modo not in modos_validos:
                raise serializers.ValidationError({
                    'modoDisparadorAbastecimiento': f"Modo inválido. Opciones permitidas: {', '.join(sorted(modos_validos))}."
                })
            attrs['modoDisparadorAbastecimiento'] = val_modo

        # 4. Suma 100% del Algoritmo de Abastecimiento y Compras (una sola consulta para valores previos)
        claves_a_verificar = [
            'pesoEvaluacion_Confiabilidad',
            'pesoEvaluacion_Tiempo',
            'pesoEvaluacion_Nivel',
            'pesoEvaluacion_Economico',
            'pesoEvaluacion_Envio',
            'criterioObligatorio_Envio'
        ]
        pesos_tecnicos_claves = [
            'pesoAsignacion_CargaLaboral',
            'pesoAsignacion_Calificacion',
            'pesoAsignacion_Rapidez',
            'pesoAsignacion_Especialidad',
            'pesoAsignacion_Efectividad',
        ]
        mapa_configs_bd = {
            c.clave: c.valor
            for c in ConfiguracionSistema.objects.filter(
                clave__in=claves_a_verificar + pesos_tecnicos_claves
            )
        }

        envio_obligatorio = False
        if 'criterioObligatorio_Envio' in attrs:
            envio_obligatorio = str(attrs['criterioObligatorio_Envio']).strip().lower() in ('true', '1')
        else:
            val_envio_bd = mapa_configs_bd.get('criterioObligatorio_Envio')
            if val_envio_bd:
                envio_obligatorio = str(val_envio_bd).strip().lower() in ('true', '1')

        pesos_claves = [
            'pesoEvaluacion_Confiabilidad',
            'pesoEvaluacion_Tiempo',
            'pesoEvaluacion_Nivel',
            'pesoEvaluacion_Economico'
        ]
        if not envio_obligatorio:
            pesos_claves.append('pesoEvaluacion_Envio')
        else:
            attrs['pesoEvaluacion_Envio'] = '0'

        tiene_pesos = any(k in attrs for k in claves_a_verificar)
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
                    raw_bd = mapa_configs_bd.get(k)
                    try:
                        val_peso = int(str(raw_bd).strip()) if raw_bd else 0
                    except (ValueError, TypeError):
                        val_peso = 0

                if val_peso < 0:
                    raise serializers.ValidationError({
                        k: f"El peso '{k}' no puede ser un número negativo."
                    })

                suma_pesos += val_peso

            if suma_pesos != 100:
                detalle_criterios = " (Envío marcado como Obligatorio, peso 100% distribuido entre los otros 4 criterios)" if envio_obligatorio else ""
                raise serializers.ValidationError(
                    f"La suma de los pesos de evaluación ({', '.join(pesos_claves)}) DEBE ser exactamente 100%{detalle_criterios}. "
                    f"Suma actual: {suma_pesos}%."
                )

        # 5. Suma 100% del Algoritmo de Asignación de Reparaciones a Técnicos
        tiene_pesos_tecnicos = any(k in attrs for k in pesos_tecnicos_claves)
        if tiene_pesos_tecnicos:
            suma_pesos_tec = 0
            for k in pesos_tecnicos_claves:
                if k in attrs and attrs[k] is not None:
                    try:
                        val_peso = int(str(attrs[k]).strip())
                    except (ValueError, TypeError):
                        raise serializers.ValidationError({
                            k: f"El peso '{k}' debe ser un número entero válido."
                        })
                else:
                    raw_bd = mapa_configs_bd.get(k)
                    try:
                        val_peso = int(str(raw_bd).strip()) if raw_bd else 0
                    except (ValueError, TypeError):
                        val_peso = 0

                if val_peso < 0:
                    raise serializers.ValidationError({
                        k: f"El peso '{k}' no puede ser un número negativo."
                    })

                suma_pesos_tec += val_peso

            if suma_pesos_tec != 100:
                raise serializers.ValidationError(
                    f"La suma de los pesos del Algoritmo de Asignación a Técnicos ({', '.join(pesos_tecnicos_claves)}) "
                    f"DEBE ser exactamente 100%. Suma actual: {suma_pesos_tec}%."
                )

        # 6. Validaciones de Configuración de Respaldos (Backups)
        from core_app.constantes import DIAS_SEMANA_VALIDOS, MODALIDADES_BACKUP_VALIDAS
        import re

        if 'backupModalidad' in attrs and attrs['backupModalidad']:
            val_mod = str(attrs['backupModalidad']).strip().upper()
            if val_mod not in MODALIDADES_BACKUP_VALIDAS:
                raise serializers.ValidationError({
                    'backupModalidad': f"Modalidad inválida. Opciones permitidas: {', '.join(MODALIDADES_BACKUP_VALIDAS)}."
                })
            attrs['backupModalidad'] = val_mod

        if 'backupDiaSemana' in attrs and attrs['backupDiaSemana']:
            val_dia = str(attrs['backupDiaSemana']).strip().upper()
            if val_dia not in DIAS_SEMANA_VALIDOS:
                raise serializers.ValidationError({
                    'backupDiaSemana': f"Día inválido. Opciones permitidas: {', '.join(DIAS_SEMANA_VALIDOS)}."
                })
            attrs['backupDiaSemana'] = val_dia

        regex_hora = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')
        campos_horarios = ['backupHoraEjecucion', 'backupHoraSemanal', 'backupHoraQuincenal', 'backupHoraMensual']
        for campo_hora in campos_horarios:
            if campo_hora in attrs and attrs[campo_hora]:
                val_h = str(attrs[campo_hora]).strip()
                if not regex_hora.match(val_h):
                    raise serializers.ValidationError({
                        campo_hora: f"El horario '{campo_hora}' debe tener el formato HH:MM de 24 horas (ej. 03:00)."
                    })
                attrs[campo_hora] = val_h

        if 'backupRetencionCopias' in attrs and attrs['backupRetencionCopias'] is not None:
            try:
                ret = int(str(attrs['backupRetencionCopias']).strip())
                if ret < 1 or ret > 100:
                    raise serializers.ValidationError({
                        'backupRetencionCopias': "La cantidad máxima de copias a conservar debe estar entre 1 y 100."
                    })
            except (ValueError, TypeError):
                pass

        return attrs


class NotificacionOutputSerializer(serializers.ModelSerializer):
    """
    Serializador de salida para el centro de notificaciones.
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
            'numero_serie': disp.numero_serie or 'Sin registrar',
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
    """ (CU-40): Valida parámetros de consulta para logs de auditoría."""
    buscar = serializers.CharField(required=False, allow_blank=True, max_length=255)
    texto_busqueda = serializers.CharField(required=False, allow_blank=True, max_length=255)
    tipo = serializers.CharField(required=False, allow_blank=True, max_length=50)
    modulo_origen = serializers.CharField(required=False, allow_blank=True, max_length=50)
    tabla_afectada = serializers.CharField(required=False, allow_blank=True, max_length=50)
    id_usuario = serializers.IntegerField(required=False, allow_null=True, min_value=1)
    usuario_query = serializers.CharField(required=False, allow_blank=True, max_length=150)
    fecha_desde = serializers.DateField(required=False, allow_null=True)
    fecha_hasta = serializers.DateField(required=False, allow_null=True)
    hora_desde = serializers.TimeField(required=False, allow_null=True)
    hora_hasta = serializers.TimeField(required=False, allow_null=True)
    accion_tipo = serializers.CharField(required=False, allow_blank=True, max_length=50)

    def validate(self, attrs):
        fecha_desde = attrs.get('fecha_desde')
        fecha_hasta = attrs.get('fecha_hasta')
        if fecha_desde and fecha_hasta and fecha_desde > fecha_hasta:
            raise serializers.ValidationError(
                "La fecha de inicio (Desde) no puede ser cronológicamente posterior a la fecha de fin (Hasta)."
            )

        hora_desde = attrs.get('hora_desde')
        hora_hasta = attrs.get('hora_hasta')
        if hora_desde and hora_hasta and hora_desde > hora_hasta:
            raise serializers.ValidationError(
                "La hora de inicio (Desde) no puede ser cronológicamente posterior a la hora de fin (Hasta)."
            )
        return attrs


class LogSistemaOutputSerializer(serializers.Serializer):
    """Formato estructurado de salida para eventos de auditoría."""
    id_log = serializers.IntegerField(read_only=True)
    fecha_hora = serializers.DateTimeField(read_only=True)
    fecha = serializers.SerializerMethodField()
    hora = serializers.SerializerMethodField()
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

    def get_fecha(self, obj):
        if obj.fecha_hora and hasattr(obj.fecha_hora, 'strftime'):
            return obj.fecha_hora.strftime("%d/%m/%Y")
        return "N/D"

    def get_hora(self, obj):
        if obj.fecha_hora and hasattr(obj.fecha_hora, 'strftime'):
            return obj.fecha_hora.strftime("%H:%M:%S")
        return "N/D"

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
    hora_creacion = serializers.SerializerMethodField()
    automatico = serializers.BooleanField(read_only=True)
    ubicacion_archivo = serializers.CharField(read_only=True)
    nombre_archivo = serializers.SerializerMethodField()
    version = serializers.CharField(read_only=True)
    id_usuario = serializers.IntegerField(source='id_usuario_id', read_only=True, allow_null=True)
    email_usuario = serializers.SerializerMethodField()
    nombre_usuario = serializers.SerializerMethodField()
    tamano_bytes = serializers.SerializerMethodField()
    tamano_mb = serializers.SerializerMethodField()
    tamano_formateado = serializers.SerializerMethodField()
    archivo_existe = serializers.SerializerMethodField()
    categoria_backup = serializers.SerializerMethodField()
    carpeta_relativa = serializers.SerializerMethodField()

    def get_hora_creacion(self, obj):
        import os
        import datetime
        if obj.ubicacion_archivo and os.path.exists(obj.ubicacion_archivo):
            try:
                mtime = os.path.getmtime(obj.ubicacion_archivo)
                return datetime.datetime.fromtimestamp(mtime).strftime("%H:%M:%S")
            except OSError:
                pass
        if obj.ubicacion_archivo:
            import os
            base = os.path.basename(obj.ubicacion_archivo)
            parts = base.replace('.sql', '').split('_')
            if len(parts) >= 3 and len(parts[2]) == 6:
                hhmmss = parts[2]
                return f"{hhmmss[:2]}:{hhmmss[2:4]}:{hhmmss[4:6]}"
        return "N/D"

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

    def get_tamano_formateado(self, obj):
        tamano_bytes = self.get_tamano_bytes(obj)
        if tamano_bytes <= 0:
            return "0 B"
        if tamano_bytes < 1024:
            return f"{tamano_bytes} B"
        elif tamano_bytes < 1024 * 1024:
            return f"{round(tamano_bytes / 1024, 1)} KB"
        else:
            return f"{round(tamano_bytes / (1024 * 1024), 2)} MB"

    def get_archivo_existe(self, obj):
        import os
        return bool(obj.ubicacion_archivo and os.path.exists(obj.ubicacion_archivo))

    def get_categoria_backup(self, obj):
        ruta = (obj.ubicacion_archivo or '').replace('\\', '/').lower()
        if '/diarios/' in ruta or 'diario' in ruta:
            return 'DIARIO'
        if '/semanales/' in ruta or 'semanal' in ruta:
            return 'SEMANAL'
        if '/quincenales/' in ruta or 'quincenal' in ruta:
            return 'QUINCENAL'
        if '/mensuales/' in ruta or 'mensual' in ruta:
            return 'MENSUAL'
        if '/manuales/' in ruta or 'manual' in ruta:
            return 'MANUAL'
        return 'DIARIO' if obj.automatico else 'MANUAL'

    def get_carpeta_relativa(self, obj):
        import os
        from django.conf import settings
        if not obj.ubicacion_archivo:
            return "N/D"
        try:
            carpeta = os.path.dirname(obj.ubicacion_archivo)
            rel = os.path.relpath(carpeta, settings.BASE_DIR).replace('\\', '/')
            if rel.startswith('..'):
                return f"backups/{self.get_categoria_backup(obj).lower()}s/"
            return f"{rel.rstrip('/')}/"
        except Exception:
            return "backups/"


class RestaurarBackupInputSerializer(serializers.Serializer):
    """
    (CU-23): Valida las credenciales y el token OTP
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

