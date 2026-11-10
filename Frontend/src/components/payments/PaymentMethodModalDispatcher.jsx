import { clasificarMedioPago, TIPOS_MODAL_PAGO } from '../../utils/mediosPago';
import MercadoPagoPaymentModal from './MercadoPagoPaymentModal';
import TransferenciaPaymentModal from './TransferenciaPaymentModal';
import TarjetaPaymentModal from './TarjetaPaymentModal';
import EfectivoPaymentModal from './EfectivoPaymentModal';

/**
 * Orquestador central de Modales de Pago (`PaymentMethodModalDispatcher`).
 *
 * Permite que cualquier flujo del cliente:
 * 1. Carrito de Compras (`CheckoutModal` / `GuestCheckoutModal`)
 * 2. Pago de Diagnóstico Inicial (`IniciarReparacionModal`)
 * 3. Confirmación de Presupuesto de Reparación (`ReparacionDetalle`)
 *
 * abra automáticamente el modal específico correspondiente al medio de pago
 * seleccionado desde la base de datos (`MERCADOPAGO`, `TRANSFERENCIA`, `TARJETA`, `EFECTIVO`).
 */
export default function PaymentMethodModalDispatcher({
  isOpen,
  onClose,
  medioPago,
  idVenta = null,
  montoTotal = 0,
  concepto = 'Operación en IFix',
  subtituloContexto,
  codigoSeguridad = null,
  expiraEn = null,
  segundosRestantes = null,
  urlPreferenciaInicial = '',
  permitirContinuarPendiente = true,
  textoBotonPendiente,
  textoBotonCancelar,
  textoConfirmar,
  procesando = false,
  onPagoConfirmado,
  onContinuarPendiente,
  onCancelarOperacion
}) {
  if (!isOpen || !medioPago) return null;

  const clasificacion = clasificarMedioPago(medioPago);
  const tipoModal = medioPago?.tipoModal || clasificacion.tipoModal;
  const nombreMedio =
    medioPago?.nombre_medio_pago ||
    medioPago?.nombreMostrar ||
    clasificacion.nombreMostrar;
  const recargoPorcentaje =
    medioPago?.recargoPorcentaje ?? clasificacion.recargoPorcentaje ?? 0;

  if (tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) {
    return (
      <MercadoPagoPaymentModal
        isOpen={isOpen}
        onClose={onClose}
        idVenta={idVenta}
        montoTotal={montoTotal}
        concepto={concepto}
        subtituloContexto={subtituloContexto}
        codigoSeguridad={codigoSeguridad}
        expiraEn={expiraEn}
        segundosRestantes={segundosRestantes}
        urlPreferenciaInicial={urlPreferenciaInicial}
        permitirContinuarPendiente={permitirContinuarPendiente}
        textoBotonPendiente={textoBotonPendiente}
        textoBotonCancelar={textoBotonCancelar}
        onPagoAcreditado={(payload) =>
          onPagoConfirmado?.({
            ...payload,
            tipoModal,
            medioPago
          })
        }
        onContinuarPendiente={() =>
          onContinuarPendiente?.({
            tipoModal,
            medioPago,
            idVenta
          })
        }
        onCancelarOperacion={() =>
          onCancelarOperacion?.({
            tipoModal,
            medioPago,
            idVenta
          })
        }
      />
    );
  }

  if (tipoModal === TIPOS_MODAL_PAGO.TRANSFERENCIA) {
    return (
      <TransferenciaPaymentModal
        isOpen={isOpen}
        onClose={onClose}
        montoTotal={montoTotal}
        concepto={concepto}
        codigoSeguridad={codigoSeguridad}
        textoConfirmar={textoConfirmar}
        procesando={procesando}
        onConfirmarTransferencia={(payload) =>
          onPagoConfirmado?.({
            ...payload,
            idVenta,
            tipoModal,
            medioPago
          })
        }
      />
    );
  }

  if (tipoModal === TIPOS_MODAL_PAGO.TARJETA) {
    return (
      <TarjetaPaymentModal
        isOpen={isOpen}
        onClose={onClose}
        nombreMedioPago={nombreMedio}
        montoTotal={montoTotal}
        recargoPorcentaje={recargoPorcentaje}
        concepto={concepto}
        codigoSeguridad={codigoSeguridad}
        textoConfirmar={textoConfirmar}
        procesando={procesando}
        onConfirmarTarjeta={(payload) =>
          onPagoConfirmado?.({
            ...payload,
            idVenta,
            tipoModal,
            medioPago
          })
        }
      />
    );
  }

  // Por defecto: EFECTIVO u OTRO medio presencial
  return (
    <EfectivoPaymentModal
      isOpen={isOpen}
      onClose={onClose}
      nombreMedioPago={nombreMedio}
      montoTotal={montoTotal}
      concepto={concepto}
      codigoSeguridad={codigoSeguridad}
      textoConfirmar={textoConfirmar}
      procesando={procesando}
      onConfirmarEfectivo={(payload) =>
        onPagoConfirmado?.({
          ...payload,
          idVenta,
          tipoModal,
          medioPago
        })
      }
    />
  );
}

