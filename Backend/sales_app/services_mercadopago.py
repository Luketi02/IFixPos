from __future__ import annotations

import datetime
import logging
from decimal import Decimal
from typing import Dict, Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

from sales_app.models import Venta, Pago, MedioPago
from core_app.models import LogSistema
from core_app.constantes import CodigoMedioPago, EstadoVenta, venta_esta_pagada, venta_esta_cancelada
from users_app.models import Usuario

logger = logging.getLogger(__name__)


def _obtener_o_crear_medio_pago_mp() -> MedioPago:
    """
    Resuelve el medio de pago Mercado Pago por su código interno inmutable ('MP')
    antes de recurrir al nombre visible ('Mercado Pago'), garantizando inmunidad
    frente a renombres en el catálogo de medios de pago (§2.4).
    """
    medio = MedioPago.objects.filter(codigo__iexact=CodigoMedioPago.MERCADO_PAGO).first()
    if medio:
        return medio
    medio = MedioPago.objects.filter(nombre_medio_pago__iexact='Mercado Pago').first()
    if medio:
        if not medio.codigo:
            medio.codigo = CodigoMedioPago.MERCADO_PAGO
            medio.save(update_fields=['codigo'])
        return medio
    return MedioPago.objects.create(
        codigo=CodigoMedioPago.MERCADO_PAGO,
        nombre_medio_pago='Mercado Pago',
        estado=True,
        recargo=Decimal('0.00')
    )


def simulacion_mercadopago_habilitada() -> bool:
    """Indica si el entorno permite acreditar pagos simulados ('SIMULADO-<id_venta>')."""
    return bool(getattr(settings, 'MERCADOPAGO_PERMITIR_SIMULACION', False))


def validar_firma_webhook_mercadopago(
    *,
    firma: str,
    request_id: str,
    data_id: Any,
    secreto: str
) -> bool:
    """
    Valida la cabecera 'x-signature' de Mercado Pago (HMAC-SHA256).
    Manifiesto firmado: 'id:<data.id>;request-id:<x-request-id>;ts:<ts>;'
    Retorna False si falta algún dato o si la firma no coincide.
    """
    import hashlib
    import hmac

    if not firma or not secreto:
        return False

    partes: Dict[str, str] = {}
    for fragmento in str(firma).split(','):
        clave, _, valor = fragmento.strip().partition('=')
        partes[clave.strip()] = valor.strip()

    ts = partes.get('ts')
    firma_recibida = partes.get('v1')
    if not ts or not firma_recibida:
        return False

    manifiesto = ''
    if data_id:
        manifiesto += f"id:{str(data_id).lower()};"
    if request_id:
        manifiesto += f"request-id:{request_id};"
    manifiesto += f"ts:{ts};"

    esperada = hmac.new(
        str(secreto).encode('utf-8'),
        manifiesto.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(esperada, firma_recibida)


def invalidar_preferencia_mercadopago(preference_id: str) -> bool:
    """
    Invalida de inmediato un link o preferencia de Mercado Pago
    estableciendo su expiración a tiempo presente/pasado mediante la API oficial.
    """
    if not preference_id or str(preference_id).startswith('SIMULADO'):
        return True

    from core_app.selectors import obtener_mercadopago_access_token
    access_token = obtener_mercadopago_access_token()
    if not access_token or 'TU_ACCESS_TOKEN' in access_token:
        return True

    try:
        import mercadopago
        sdk = mercadopago.SDK(access_token)
        ahora_utc = timezone.now().astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        sdk.preference().update(preference_id, {
            "expires": True,
            "expiration_date_to": ahora_utc
        })
        return True
    except Exception:
        return False


def crear_preferencia_mercadopago(
    *,
    venta: Venta,
    usuario: Usuario
) -> Dict[str, Any]:
    """
    Genera una Preferencia de Pago oficial en Mercado Pago (Checkout Pro / Transferencia).
    Devuelve los endpoints init_point y sandbox_init_point para que el cliente abone.
    Fija expiración estricta en UTC para invalidar automáticamente el link a los 30 minutos.
    Lee prioritariamente las credenciales configuradas en la BD (ConfiguracionSistema).
    """
    import mercadopago
    from core_app.selectors import (
        obtener_mercadopago_access_token,
        obtener_mercadopago_public_key
    )

    access_token = obtener_mercadopago_access_token()
    public_key = obtener_mercadopago_public_key()

    if not access_token or access_token.strip() == '' or 'TU_ACCESS_TOKEN' in access_token:
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
        return {
            "preference_id": f"SIMULADO-VENTA-{venta.id_venta}",
            "init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "sandbox_init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "public_key": public_key or "TEST-SIMULADA",
            "modo_simulacion": True,
            "mensaje": "Credenciales de prueba de Mercado Pago pendientes en la BD o en Backend/.env. Modo simulación activado."
        }

    ahora_dt = timezone.now()

    log_creacion = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Realizar Compra Virtual (CU-18)"
    ).first()

    if log_creacion and log_creacion.fecha_hora:
        hora_log = log_creacion.fecha_hora
        if isinstance(hora_log, datetime.datetime):
            dt_creacion = hora_log
        elif isinstance(hora_log, datetime.time):
            dt_creacion = datetime.datetime.combine(venta.fecha_venta, hora_log)
        else:
            dt_creacion = ahora_dt
        if timezone.is_naive(dt_creacion):
            dt_creacion = timezone.make_aware(dt_creacion, timezone.get_current_timezone())
        exp_dt = dt_creacion + datetime.timedelta(minutes=30)
    else:
        exp_dt = ahora_dt + datetime.timedelta(minutes=30)

    if ahora_dt >= exp_dt:
        raise ValidationError("El tiempo de reserva de 30 minutos para esta compra ha finalizado y el link de pago ha expirado.")

    log_pref = LogSistema.objects.filter(
        modulo_origen='sales_app',
        tabla_afectada='venta',
        id_registro_afectado=str(venta.id_venta),
        accion="Preferencia Mercado Pago Creada"
    ).first()

    if log_pref and log_pref.detalle:
        partes = log_pref.detalle.split('|')
        if len(partes) >= 2:
            pref_id_existente = partes[0]
            init_point_existente = partes[1]
            sandbox_init_point_existente = partes[2] if len(partes) > 2 else init_point_existente
            return {
                "preference_id": pref_id_existente,
                "init_point": init_point_existente,
                "sandbox_init_point": sandbox_init_point_existente,
                "public_key": public_key,
                "modo_simulacion": False
            }

    sdk = mercadopago.SDK(access_token)

    detalles = list(venta.detalleventa_set.select_related('id_producto').all())
    subtotal_detalles = sum(Decimal(str(det.subtotal)) for det in detalles)
    monto_subtotal_venta = Decimal(str(venta.monto_subtotal or 0))

    if subtotal_detalles > Decimal('0.00') and monto_subtotal_venta < subtotal_detalles:
        ratio = float(monto_subtotal_venta / subtotal_detalles)
    else:
        ratio = 1.0

    items = []
    acumulado_items = 0.0
    for det in detalles:
        prod = det.id_producto
        cant = int(det.cantidad)
        if ratio < 1.0:
            unit_price = round(float(det.precio_unitario) * ratio, 2)
        else:
            unit_price = float(det.precio_unitario)

        items.append({
            "id": str(prod.id_producto),
            "title": str(prod.nombre)[:250],
            "quantity": cant,
            "unit_price": unit_price,
            "currency_id": "ARS",
            "description": f"Repuesto/Accesorio IFixPos - {prod.nombre}"[:250]
        })
        acumulado_items += unit_price * cant

    if not items and monto_subtotal_venta > Decimal('0.00'):
        items.append({
            "id": f"DIAG-{venta.id_venta}",
            "title": "Servicio Técnico / Diagnóstico - Orden de Taller",
            "quantity": 1,
            "unit_price": float(monto_subtotal_venta),
            "currency_id": "ARS",
            "description": "Servicio técnico o diagnóstico asociado a la orden"
        })
        acumulado_items += float(monto_subtotal_venta)
    elif items and monto_subtotal_venta > subtotal_detalles:
        diferencia_mano_obra = round(float(monto_subtotal_venta - subtotal_detalles), 2)
        if diferencia_mano_obra > 0.01:
            items.append({
                "id": f"MO-{venta.id_venta}",
                "title": "Mano de Obra y Servicio Técnico",
                "quantity": 1,
                "unit_price": diferencia_mano_obra,
                "currency_id": "ARS",
                "description": "Mano de obra técnica presupuestada para la reparación"
            })
            acumulado_items += diferencia_mano_obra

    if ratio < 1.0 and items and monto_subtotal_venta > Decimal('0.00'):
        diferencia = round(float(monto_subtotal_venta) - acumulado_items, 2)
        if abs(diferencia) > 0.001 and abs(diferencia) < 5.0:
            cant_ultimo = items[-1]["quantity"]
            items[-1]["unit_price"] = round(items[-1]["unit_price"] + (diferencia / cant_ultimo), 2)

    if venta.costo_envio and venta.costo_envio > Decimal('0.00'):
        items.append({
            "id": "ENVIO-LOGISTICO",
            "title": "Costo de Envío Logístico a Domicilio",
            "quantity": 1,
            "unit_price": float(venta.costo_envio),
            "currency_id": "ARS"
        })

    perfil = getattr(usuario, 'perfilusuario', None)
    if not perfil:
        from users_app.models import PerfilUsuario
        perfil = PerfilUsuario.objects.filter(id_usuario=usuario).first()

    nombre_payer = getattr(usuario, 'nombre', '') or (getattr(perfil, 'nombre', '') if perfil else '')
    apellido_payer = getattr(usuario, 'apellido', '') or (getattr(perfil, 'apellido', '') if perfil else '')
    payer = {
        "name": nombre_payer or "Cliente",
        "surname": apellido_payer or "IFixPos",
        "email": usuario.email,
    }
    telefono_payer = getattr(usuario, 'telefono', None) or (getattr(perfil, 'telefono', None) if perfil else None)
    if telefono_payer:
        tel_limpio = str(telefono_payer).replace('+', '').replace(' ', '')
        if tel_limpio:
            payer["phone"] = {"number": tel_limpio[-10:]}
    dni_payer = getattr(usuario, 'dni', None) or (getattr(perfil, 'dni', None) if perfil else None)
    if dni_payer:
        dni_limpio = str(dni_payer).replace('.', '').replace('-', '').strip()
        if dni_limpio:
            payer["identification"] = {"type": "DNI", "number": dni_limpio}

    from core_app.selectors import obtener_url_frontend
    frontend_url = obtener_url_frontend()
    backend_url = str(getattr(settings, 'BACKEND_URL', '')).rstrip('/')

    back_urls = {
        "success": f"{frontend_url}/tienda?mp_status=approved&venta_id={venta.id_venta}",
        "pending": f"{frontend_url}/tienda?mp_status=pending&venta_id={venta.id_venta}",
        "failure": f"{frontend_url}/tienda?mp_status=failure&venta_id={venta.id_venta}"
    }

    notification_url = f"{backend_url}/api/sales/mercadopago/webhook/"

    ahora_utc_str = ahora_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    exp_utc_str = exp_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    preference_data = {
        "items": items,
        "payer": payer,
        "back_urls": back_urls,
        "notification_url": notification_url,
        "external_reference": str(venta.id_venta),
        "statement_descriptor": "IFIXPOS",
        "binary_mode": False,
        "expires": True,
        "expiration_date_from": ahora_utc_str,
        "expiration_date_to": exp_utc_str
    }

    preference_response = {}
    try:
        preference_response = sdk.preference().create(preference_data)
        response_data = preference_response.get("response", {})
        pref_id = response_data.get("id")
        init_point = response_data.get("init_point")
        sandbox_init_point = response_data.get("sandbox_init_point", init_point)
    except Exception as e:
        logger.warning(f"[MercadoPago] Excepción al invocar SDK de Mercado Pago: {e}")
        pref_id = None
        response_data = {"error": str(e)}

    if not pref_id:
        error_msg = str(preference_response.get("message") or response_data)
        logger.warning(f"[MercadoPago] Error al generar preferencia oficial: {error_msg}. Activando modo contingencia simulada.")
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')
        return {
            "preference_id": f"SIMULADO-VENTA-{venta.id_venta}",
            "init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "sandbox_init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "public_key": public_key or "TEST-SIMULADA",
            "modo_simulacion": True,
            "mensaje": f"Mercado Pago reportó: {error_msg}. Modo simulación activado."
        }

    LogSistema.objects.create(
        fecha_hora=timezone.now(),
        accion="Preferencia Mercado Pago Creada",
        detalle=f"{pref_id}|{init_point}|{sandbox_init_point}",
        tipo="MERCADOPAGO",
        modulo_origen="sales_app",
        tabla_afectada="venta",
        id_registro_afectado=str(venta.id_venta),
        id_usuario=usuario
    )

    return {
        "preference_id": pref_id,
        "init_point": init_point,
        "sandbox_init_point": sandbox_init_point,
        "public_key": public_key,
        "modo_simulacion": False
    }


def crear_preferencia_mercadopago_invitado(
    *,
    venta: Venta,
    nombre_contacto: str,
    email_contacto: str,
    telefono_contacto: str
) -> Dict[str, Any]:
    """
    Genera una Preferencia de Pago en Mercado Pago para una compra realizada por un invitado.
    Devuelve los endpoints init_point y sandbox_init_point y fija expiración estricta a 30 min.
    """
    import mercadopago
    from core_app.selectors import (
        obtener_mercadopago_access_token,
        obtener_mercadopago_public_key
    )

    access_token = obtener_mercadopago_access_token()
    public_key = obtener_mercadopago_public_key()
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')

    if not access_token or access_token.strip() == '' or 'TU_ACCESS_TOKEN' in access_token:
        return {
            "preference_id": f"SIMULADO-INVITADO-{venta.id_venta}",
            "init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "sandbox_init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "public_key": public_key or "TEST-SIMULADA",
            "modo_simulacion": True,
            "mensaje": "Credenciales de Mercado Pago simuladas para compra de invitado."
        }

    sdk = mercadopago.SDK(access_token)
    detalles = venta.detalleventa_set.select_related('id_producto').all()

    items_mp = []
    for d in detalles:
        items_mp.append({
            "id": str(d.id_producto.id_producto),
            "title": str(d.id_producto.nombre)[:255],
            "description": f"Repuesto/Insumo #{d.id_producto.id_producto}",
            "quantity": int(d.cantidad),
            "currency_id": "ARS",
            "unit_price": float(d.precio_unitario)
        })

    if venta.costo_envio and venta.costo_envio > Decimal('0.00'):
        items_mp.append({
            "id": "ENVIO-FLETE",
            "title": "Costo de Envío a Domicilio",
            "description": f"Flete logístico orden #{venta.id_venta}",
            "quantity": 1,
            "currency_id": "ARS",
            "unit_price": float(venta.costo_envio)
        })

    ahora_dt = timezone.now()
    exp_dt = ahora_dt + datetime.timedelta(minutes=30)
    exp_str = exp_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

    preference_data = {
        "items": items_mp,
        "payer": {
            "name": nombre_contacto[:100],
            "email": email_contacto[:100],
            "phone": {"number": telefono_contacto[:50]}
        },
        "back_urls": {
            "success": f"{frontend_url}/tienda?pago=aprobado&venta_id={venta.id_venta}",
            "failure": f"{frontend_url}/tienda?pago=rechazado&venta_id={venta.id_venta}",
            "pending": f"{frontend_url}/tienda?pago=pendiente&venta_id={venta.id_venta}"
        },
        "auto_return": "approved",
        "external_reference": str(venta.id_venta),
        "statement_descriptor": "IFIXPOS",
        "expires": True,
        "expiration_date_from": ahora_dt.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "expiration_date_to": exp_str
    }

    try:
        pref_response = sdk.preference().create(preference_data)
        res_json = pref_response.get("response", {})
        return {
            "preference_id": res_json.get("id"),
            "init_point": res_json.get("init_point"),
            "sandbox_init_point": res_json.get("sandbox_init_point"),
            "public_key": public_key,
            "modo_simulacion": False
        }
    except Exception as e:
        logger.warning("[MercadoPago Invitado] Advertencia al contactar API MP: %s", e)
        return {
            "preference_id": f"SIMULADO-INVITADO-{venta.id_venta}",
            "init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "sandbox_init_point": f"{frontend_url}/tienda?simulacion_mp=true&venta_id={venta.id_venta}",
            "public_key": public_key or "TEST-SIMULADA",
            "modo_simulacion": True,
            "error_mp": str(e)
        }


@transaction.atomic
def procesar_webhook_mercadopago(
    *,
    data: Dict[str, Any],
    query_params: Dict[str, Any],
    firma: str = '',
    request_id: str = ''
) -> Dict[str, Any]:
    """
    Procesa notificaciones Webhook (IPN) de Mercado Pago de forma atómica.
    """
    from sales_app.services import (
        evaluar_beneficio_post_compra,
        generar_comprobante_fiscal,
        enviar_correo_confirmacion_compra
    )

    payment_id = None
    if data.get("data") and isinstance(data["data"], dict):
        payment_id = data["data"].get("id")

    if not payment_id:
        payment_id = query_params.get("data.id") or query_params.get("id")

    if not payment_id:
        return {"status": "ignored", "motivo": "Sin payment_id en la notificación"}

    if str(payment_id).startswith('SIMULADO-'):
        if not simulacion_mercadopago_habilitada():
            logger.warning(
                "[Webhook MP] Intento de acreditación simulada rechazado (simulación deshabilitada): %s",
                payment_id
            )
            return {
                "status": "forbidden",
                "motivo": "La acreditación simulada de pagos está deshabilitada en este entorno."
            }
        try:
            id_venta = int(str(payment_id).replace('SIMULADO-', ''))
            venta = Venta.objects.select_for_update().get(id_venta=id_venta)
        except (ValueError, Venta.DoesNotExist):
            return {"status": "error", "motivo": f"Venta simulada {payment_id} no encontrada"}

        if venta_esta_cancelada(venta.estado_venta):
            return {"status": "ignored_cancelled", "venta_id": venta.id_venta}

        medio_pago_mp = _obtener_o_crear_medio_pago_mp()
        subtotal_v = Decimal(str(venta.monto_subtotal or '0.00'))
        envio_v = Decimal(str(venta.costo_envio or '0.00'))
        monto_pagado = Decimal(str(getattr(venta, 'monto_total', None) or (subtotal_v + envio_v)))
        pago_existente = Pago.objects.filter(cod_operacion=str(payment_id)).first()
        pago = pago_existente
        if not pago:
            pago = Pago.objects.create(
                id_venta=venta,
                medio_pago=medio_pago_mp,
                monto_pagado=monto_pagado,
                fecha_pago=timezone.now().date(),
                cod_operacion=str(payment_id),
                detalle="Acreditación de prueba/mostrador Mercado Pago QR"
            )

        if not venta_esta_pagada(venta.estado_venta):
            venta.estado_venta = EstadoVenta.PAGADA
            venta.save(update_fields=["estado_venta"])

            try:
                evaluar_beneficio_post_compra(venta=venta)
            except Exception as e_post:
                logger.warning(f"[Motor Beneficios] Error post-compra MP manual: {e_post}")

            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Acreditación Mercado Pago Webhook",
                detalle=f"Venta #{venta.id_venta} pagada con éxito vía Mercado Pago (Mostrador/QR). Operación #{payment_id}, Monto: ${monto_pagado}.",
                tipo="AUDITORIA_VENTA",
                modulo_origen="sales_app",
                tabla_afectada="venta",
                id_registro_afectado=str(venta.id_venta),
                id_usuario=venta.id_usuario
            )

            try:
                ruta_pdf = generar_comprobante_fiscal(pago, venta)
                if venta.id_usuario and getattr(venta.id_usuario, 'email', None):
                    enviar_correo_confirmacion_compra(venta=venta, pago=pago, ruta_pdf=ruta_pdf)
            except Exception as e:
                logger.warning(f"[Webhook MP Simulado] Advertencia al generar comprobante: {e}")

        return {"status": "approved", "venta_id": venta.id_venta, "payment_id": payment_id}

    from core_app.selectors import obtener_mercadopago_webhook_secret
    secreto_webhook = obtener_mercadopago_webhook_secret()
    if secreto_webhook:
        if not validar_firma_webhook_mercadopago(
            firma=firma,
            request_id=request_id,
            data_id=payment_id,
            secreto=secreto_webhook
        ):
            logger.warning("[Webhook MP] Firma inválida o ausente para la notificación %s", payment_id)
            return {"status": "invalid_signature", "motivo": "Firma de la notificación inválida."}
    else:
        logger.warning(
            "[Webhook MP] No hay Webhook Secret configurado: no se valida la firma "
            "(el estado del pago se verifica igualmente contra la API de Mercado Pago)."
        )

    from core_app.selectors import obtener_mercadopago_access_token
    access_token = obtener_mercadopago_access_token()
    if not access_token or 'TU_ACCESS_TOKEN' in access_token:
        return {"status": "ignored", "motivo": "Access token de Mercado Pago no configurado en la BD ni en el entorno"}

    try:
        import mercadopago
        sdk = mercadopago.SDK(access_token)
        payment_info = sdk.payment().get(str(payment_id))
        payment = payment_info.get("response", {})
    except Exception as e:
        return {"status": "error", "motivo": f"Fallo al consultar API de MP: {str(e)}"}

    status_pago = payment.get("status")
    external_ref = payment.get("external_reference")

    if not external_ref:
        return {"status": "ignored", "motivo": f"El pago {payment_id} no posee external_reference"}

    try:
        id_venta = int(external_ref)
        venta = Venta.objects.select_for_update().get(id_venta=id_venta)
    except (ValueError, Venta.DoesNotExist):
        return {"status": "error", "motivo": f"Venta {external_ref} no encontrada"}

    if venta_esta_cancelada(venta.estado_venta):
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Alerta: Pago recibido en Venta Cancelada/Expirada",
            detalle=f"Se recibió notificación de pago #{payment_id} para la Venta #{venta.id_venta}, pero la orden ya fue cancelada y su reserva expiró.",
            tipo="ALERTA_VENTA",
            modulo_origen="sales_app",
            tabla_afectada="venta",
            id_registro_afectado=str(venta.id_venta),
            id_usuario=venta.id_usuario
        )
        return {"status": "ignored_cancelled", "venta_id": venta.id_venta}

    medio_pago_mp = _obtener_o_crear_medio_pago_mp()

    if status_pago == "approved":
        monto_pagado = Decimal(str(payment.get("transaction_amount") or (venta.monto_subtotal + venta.costo_envio)))
        tipo_operacion = payment.get("payment_type_id") or "mercadopago"
        medio_detalle = payment.get("payment_method_id") or "transferencia"

        pago_existente = Pago.objects.filter(cod_operacion=str(payment_id)).first()
        pago = pago_existente
        if not pago:
            pago = Pago.objects.create(
                id_venta=venta,
                medio_pago=medio_pago_mp,
                monto_pagado=monto_pagado,
                fecha_pago=timezone.now().date(),
                cod_operacion=str(payment_id),
                detalle=f"Acreditación automática Mercado Pago - Operación #{payment_id} ({medio_detalle} - {tipo_operacion})"
            )

        if not venta_esta_pagada(venta.estado_venta):
            venta.estado_venta = EstadoVenta.PAGADA
            venta.save(update_fields=["estado_venta"])

            try:
                evaluar_beneficio_post_compra(venta=venta)
            except Exception as e_post:
                logger.warning(f"[Motor Beneficios] Error post-compra MP manual: {e_post}")

            LogSistema.objects.create(
                fecha_hora=timezone.now(),
                accion="Acreditación Mercado Pago Webhook",
                detalle=f"Venta #{venta.id_venta} pagada con éxito vía Mercado Pago. Operación #{payment_id}, Monto: ${monto_pagado}.",
                tipo="AUDITORIA_VENTA",
                modulo_origen="sales_app",
                tabla_afectada="venta",
                id_registro_afectado=str(venta.id_venta),
                id_usuario=venta.id_usuario
            )

            try:
                ruta_pdf = generar_comprobante_fiscal(pago, venta)
                enviar_correo_confirmacion_compra(venta=venta, pago=pago, ruta_pdf=ruta_pdf)
            except Exception as e:
                logger.warning("[Webhook MP] Advertencia al generar comprobante o enviar correo: %s", e)

        return {"status": "approved", "venta_id": venta.id_venta, "payment_id": payment_id}

    elif status_pago in ["rejected", "cancelled"]:
        LogSistema.objects.create(
            fecha_hora=timezone.now(),
            accion="Pago Rechazado Mercado Pago",
            detalle=f"Pago #{payment_id} para Venta #{venta.id_venta} en estado: {status_pago}.",
            tipo="AUDITORIA_VENTA",
            modulo_origen="sales_app",
            tabla_afectada="venta",
            id_registro_afectado=str(venta.id_venta),
            id_usuario=venta.id_usuario
        )
        return {"status": status_pago, "venta_id": venta.id_venta}

    return {"status": status_pago or "pending", "venta_id": venta.id_venta}

