import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatearMoneda } from '../../utils/productImages';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';
import { obtenerCatalogoCacheado } from '../../utils/cacheCatalogos';

/**
 * Modal Reutilizable para pagos por Transferencia Bancaria (CBU / CVU / Alias).
 *
 * Muestra los datos bancarios oficiales del comercio configurados en la base de datos
 * (/api/core/config/datos-publicos/ - CU-42) y permite registrar el comprobante.
 */
export default function TransferenciaPaymentModal({
  isOpen,
  onClose,
  montoTotal = 0,
  concepto = 'Operación en IFix',
  codigoSeguridad = null,
  datosBancarios: datosBancariosProp = null,
  requiereComprobante = false,
  textoConfirmar = 'Confirmar y registrar operación',
  procesando = false,
  onConfirmarTransferencia
}) {
  const [datosBancariosApi, setDatosBancariosApi] = useState(null);
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [copiadoCampo, setCopiadoCampo] = useState('');
  const [errorValidacion, setErrorValidacion] = useState('');

  const { contenedorRef } = useAccesibilidadModal(isOpen, onClose, procesando);

  // Cargar datos bancarios oficiales directamente desde ConfiguracionSistema (CU-42)
  useEffect(() => {
    if (!isOpen) return;

    let cancelado = false;
    const cargarDatos = async () => {
      try {
        const data = await obtenerCatalogoCacheado(
          'core:datos-publicos',
          '/api/core/config/datos-publicos/',
          { ttlMs: 60 * 1000 }
        );
        if (!cancelado && data?.datosBancarios) {
          setDatosBancariosApi(data.datosBancarios);
        }
      } catch (err) {
        console.warn('Inconveniente al cargar datos bancarios desde la API:', err);
      }
    };

    cargarDatos();
    return () => {
      cancelado = true;
    };
  }, [isOpen]);

  const datosBancarios = useMemo(() => {
    return (
      datosBancariosProp ||
      datosBancariosApi || {
        banco: 'Banco Nación / Billeteras Virtuales',
        titular: 'IFix Servicio Técnico & Store',
        alias: 'IFIX.TALLER.POS',
        cbu: '0110599540000012345678'
      }
    );
  }, [datosBancariosProp, datosBancariosApi]);

  useEffect(() => {
    if (!isOpen) {
      setNumeroOperacion('');
      setCopiadoCampo('');
      setErrorValidacion('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!errorValidacion) return undefined;
    const timer = setTimeout(() => setErrorValidacion(''), 6000);
    return () => clearTimeout(timer);
  }, [errorValidacion]);

  const copiarAlPortapapeles = async (texto, etiqueta) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoCampo(etiqueta);
      setTimeout(() => setCopiadoCampo(''), 2500);
    } catch {
      setCopiadoCampo('');
    }
  };

  const manejarConfirmacion = (e) => {
    e.preventDefault();
    const limpio = numeroOperacion.trim();
    if (requiereComprobante && limpio.length < 4) {
      setErrorValidacion('Por favor, ingresá los últimos dígitos o el número de comprobante de tu transferencia.');
      return;
    }
    onConfirmarTransferencia?.({
      metodoPago: 'TRANSFERENCIA',
      numeroOperacion: limpio || null
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
        <motion.div
          ref={contenedorRef}
          role="dialog"
          aria-modal="true"
          aria-label="Instrucciones de pago por transferencia bancaria"
          tabIndex={-1}
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-[#1E293B] border border-cyan-500/30 shadow-2xl p-6 text-slate-100 focus:outline-none"
        >
          {/* Encabezado */}
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-700/70">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black text-lg">
                🏦
              </div>
              <div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  Transferencia Inmediata • CBU / Alias
                </span>
                <h3 className="text-lg font-extrabold text-white mt-0.5">
                  Pago por Transferencia Bancaria
                </h3>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                disabled={procesando}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer"
                aria-label="Cerrar modal de transferencia"
              >
                ✕
              </button>
            )}
          </div>

          {/* Resumen de monto */}
          <div className="mt-4 p-4 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Concepto
              </p>
              <p className="text-sm font-bold text-white mt-0.5">{concepto}</p>
              {codigoSeguridad && (
                <p className="text-xs text-cyan-400 font-mono mt-1">
                  Token de seguridad: <span className="font-bold">{codigoSeguridad}</span>
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Importe a transferir
              </p>
              <p className="text-xl font-black text-cyan-400">
                {formatearMoneda(montoTotal)}
              </p>
            </div>
          </div>

          {/* Datos bancarios copiables */}
          <form onSubmit={manejarConfirmacion} className="mt-4 space-y-4">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-700/80 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Entidad:</span>
                <span className="font-bold text-slate-200">{datosBancarios.banco}</span>
              </div>
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Titular:</span>
                <span className="font-bold text-slate-200">{datosBancarios.titular}</span>
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div>
                  <span className="text-slate-400 block">Alias Bancario:</span>
                  <span className="font-mono font-bold text-cyan-300 text-sm">
                    {datosBancarios.alias}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copiarAlPortapapeles(datosBancarios.alias, 'ALIAS')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-300 font-semibold transition-colors cursor-pointer"
                >
                  {copiadoCampo === 'ALIAS' ? '✓ Copiado' : 'Copiar Alias'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-slate-400 block">CBU / CVU:</span>
                  <span className="font-mono font-bold text-slate-200 text-xs">
                    {datosBancarios.cbu}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copiarAlPortapapeles(datosBancarios.cbu, 'CBU')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold transition-colors cursor-pointer"
                >
                  {copiadoCampo === 'CBU' ? '✓ Copiado' : 'Copiar CBU'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Número de comprobante u operación {requiereComprobante ? '*' : '(Opcional)'}
              </label>
              <input
                type="text"
                value={numeroOperacion}
                onChange={(e) => setNumeroOperacion(e.target.value)}
                placeholder="Ej: 0048291042 (podés informarlo ahora o al retirar)"
                maxLength={80}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 focus:outline-none text-sm text-white placeholder-slate-500"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Tu orden quedará registrada y vinculada al canal de Transferencia Bancaria.
              </p>
            </div>

            {errorValidacion && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {errorValidacion}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={procesando}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                >
                  Volver
                </button>
              )}
              <button
                type="submit"
                disabled={procesando}
                className="flex-1 py-2.5 px-5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-cyan-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {procesando ? 'Procesando...' : textoConfirmar}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

