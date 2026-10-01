from typing import Optional
from .models import Marca, ModeloDispositivo, TipoDispositivo

def obtener_marca_por_nombre(nombre: str) -> Optional[Marca]:
    """Obtiene una marca por nombre ignorando mayúsculas/minúsculas."""
    return Marca.objects.filter(nombre__iexact=nombre).first()

def obtener_marca_por_id(id_marca: int) -> Optional[Marca]:
    """Obtiene una marca por su ID."""
    return Marca.objects.filter(id_marca=id_marca).first()

def obtener_tipo_dispositivo_por_id(id_tipo_dispositivo: int) -> Optional[TipoDispositivo]:
    """Obtiene un tipo de dispositivo por su ID."""
    return TipoDispositivo.objects.filter(id_tipo_dispositivo=id_tipo_dispositivo).first()

def obtener_modelo_por_nombre_y_marca(nombre: str, id_marca: int) -> Optional[ModeloDispositivo]:
    """Obtiene un modelo por su nombre exacto y su marca asociada."""
    return ModeloDispositivo.objects.filter(nombre=nombre, id_marca_id=id_marca).first()
