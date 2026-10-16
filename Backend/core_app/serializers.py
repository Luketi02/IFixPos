from rest_framework import serializers
from core_app.models import ConfiguracionSistema


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
