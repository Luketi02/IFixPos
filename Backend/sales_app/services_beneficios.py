"""
Submódulo especializado del Motor Inteligente de Beneficios y Fidelización de `sales_app`
(Fase 3 - §3.6: Modularización de servicios).
"""
from decimal import Decimal
import datetime
from typing import Optional
from django.utils import timezone


def calcular_vencimiento_exacto_beneficio(fecha_emision: datetime.date, tiempo_disp_horas: Optional[Decimal]) -> Optional[datetime.datetime]:
    """
    Calcula la marca de fecha y hora exacta de vencimiento de un beneficio comercial
    a partir de su fecha de emisión y las horas de vigencia configuradas (§4.4).
    """
    if not fecha_emision or tiempo_disp_horas is None:
        return None
    horas = float(tiempo_disp_horas)
    if horas <= 0:
        return None
    inicio = datetime.datetime.combine(fecha_emision, datetime.time.min)
    if timezone.is_naive(inicio):
        inicio = timezone.make_aware(inicio, timezone.get_current_timezone())
    return inicio + datetime.timedelta(hours=horas)

