from typing import Optional
from users_app.models import Usuario
from catalog_app.models import ModeloDispositivo

def obtener_usuario_por_id(id_usuario: int) -> Optional[Usuario]:
    return Usuario.objects.filter(pk=id_usuario).first()

def obtener_modelo_por_id(id_modelo: int) -> Optional[ModeloDispositivo]:
    return ModeloDispositivo.objects.filter(pk=id_modelo).first()
