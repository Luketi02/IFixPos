from rest_framework.exceptions import ValidationError
from .models import Marca, ModeloDispositivo
from .selectors import (
    obtener_marca_por_nombre,
    obtener_marca_por_id,
    obtener_tipo_dispositivo_por_id,
    obtener_modelo_por_nombre_y_marca
)

def crear_o_reactivar_marca(nombre: str) -> Marca:
    """
    Crea una nueva marca o reactiva una existente.
    CU-77: Registrar Marca
    """
    marca_existente = obtener_marca_por_nombre(nombre)
    
    if marca_existente:
        if marca_existente.estado_activo:
            raise ValidationError("La marca ya existe")
        else:
            marca_existente.estado_activo = True
            marca_existente.save(update_fields=['estado_activo'])
            return marca_existente
            
    # Si no existe, la creamos
    nueva_marca = Marca.objects.create(
        nombre=nombre,
        estado_activo=True
    )
    return nueva_marca


def crear_o_reactivar_modelo(nombre: str, id_marca: int, id_tipo_dispositivo: int) -> ModeloDispositivo:
    """
    Crea un nuevo modelo o reactiva uno existente.
    CU-79: Registrar Modelo
    """
    modelo_existente = obtener_modelo_por_nombre_y_marca(nombre, id_marca)
    
    if modelo_existente:
        if modelo_existente.estado_activo:
            raise ValidationError("El modelo ya existe para esta marca")
        else:
            modelo_existente.estado_activo = True
            modelo_existente.save(update_fields=['estado_activo'])
            return modelo_existente
            
    # Validar que la marca exista y esté activa
    marca = obtener_marca_por_id(id_marca)
    if not marca or not marca.estado_activo:
        raise ValidationError("La marca especificada no existe o no está activa")
        
    # Validar que el tipo de dispositivo exista y esté activo
    tipo_dispositivo = obtener_tipo_dispositivo_por_id(id_tipo_dispositivo)
    if not tipo_dispositivo or not tipo_dispositivo.estado_activo:
        raise ValidationError("El tipo de dispositivo especificado no existe o no está activo")
        
    # Si no existe y todo es válido, lo creamos
    nuevo_modelo = ModeloDispositivo.objects.create(
        nombre=nombre,
        id_marca=marca,
        id_tipo_dispositivo=tipo_dispositivo,
        estado_activo=True
    )
    return nuevo_modelo
