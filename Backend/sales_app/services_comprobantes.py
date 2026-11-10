"""
Submódulo especializado de Comprobantes Fiscales, Facturación PDF y Despacho de Correos
de `sales_app` (Fase 3 - §3.6: Modularización de servicios).
Expone una interfaz cohesiva y desacoplada para las operaciones de facturación y notificación.
"""
from typing import Optional
from django.core.mail import EmailMultiAlternatives
from core_app.correos import despachar_correo_en_commit


def enviar_email_message_en_commit(
    email_msg: EmailMultiAlternatives,
    *,
    contexto: str = "Comprobante Comercial"
) -> None:
    """
    Envía una instancia de `EmailMultiAlternatives` delegando al despachador
    transaccional con `transaction.on_commit` (§3.5).
    """
    despachar_correo_en_commit(
        lambda: email_msg.send(fail_silently=False),
        contexto=contexto
    )


def obtener_funciones_comprobantes():
    """Acceso perezoso a los generadores de comprobantes de sales_app."""
    from sales_app.services import (
        generar_comprobante_fiscal,
        enviar_correo_confirmacion_compra,
        enviar_correo_instrucciones_pago_presencial,
    )
    return {
        'generar_comprobante_fiscal': generar_comprobante_fiscal,
        'enviar_correo_confirmacion_compra': enviar_correo_confirmacion_compra,
        'enviar_correo_instrucciones_pago_presencial': enviar_correo_instrucciones_pago_presencial,
    }

