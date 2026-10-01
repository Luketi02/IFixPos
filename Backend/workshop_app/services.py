from datetime import datetime, timezone
from django.db import transaction
from rest_framework.exceptions import ValidationError
from .models import Dispositivo
from core_app.models import LogSistema
from .selectors import obtener_usuario_por_id, obtener_modelo_por_id

def crear_dispositivo(
    *, 
    id_ejecutor: int, 
    id_usuario: int, 
    id_modelo: int, 
    numero_serie: str = None, 
    imagen: str = None
) -> Dispositivo:
    
    # Validar usuario propietario
    usuario = obtener_usuario_por_id(id_usuario)
    if not usuario:
        raise ValidationError("El usuario especificado no existe.")
        
    # Validar modelo
    modelo = obtener_modelo_por_id(id_modelo)
    if not modelo:
        raise ValidationError("El modelo de dispositivo especificado no existe.")
        
    # Validar ejecutor
    ejecutor = obtener_usuario_por_id(id_ejecutor)
    if not ejecutor:
        raise ValidationError("El usuario ejecutor de la acción no existe.")

    with transaction.atomic():
        # Crear dispositivo con la fecha actual generada en el servidor
        fecha_actual = datetime.now(timezone.utc).date()
        dispositivo = Dispositivo.objects.create(
            id_usuario=usuario,
            id_modelo=modelo,
            numero_serie=numero_serie,
            imagen=imagen,
            fecha_registro=fecha_actual
        )
        
        # Generar fecha y hora para el log
        hora_actual = datetime.now(timezone.utc).time()

        # Registrar evento en la bitácora del sistema de forma atómica
        LogSistema.objects.create(
            fecha_hora=hora_actual,
            accion="Alta de dispositivo",
            tipo="INFO",
            modulo_origen="Dispositivos",
            tabla_afectada="dispositivo",
            id_registro_afectado=str(dispositivo.id_dispositivo),
            id_usuario=ejecutor
        )

    return dispositivo
