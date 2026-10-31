import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function DetalleOrdenCompraModal({
  isOpen,
  onClose,
  idOrden,
  ordenInicial = null,
  onRecepcionar = null
}) {
  const { token } = useAuth();
  const [cargando, setCargando] = useState(false);
  const [errorNoDisponible, setErrorNoDisponible] = useState('');
  const [errorGeneral, setErrorGeneral] = useState('');
  const [ordenDetalle, setOrdenDetalle] = useState(null);
  const [copiadoExito, setCopiadoExito] = useState(false);

  // Auto-cierre de alerta de error general a los 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorGeneral) return undefined;
    const timer = setTimeout(() => setErrorGeneral(''), 6000);
    return () => clearTimeout(timer);
  }, [errorGeneral]);

  // Consulta del expediente inmutable desde el servidor
  useEffect(() => {
    if (!isOpen) {
      setOrdenDetalle(null);
      setErrorNoDisponible('');
      setErrorGeneral('');
      setCopiadoExito(false);
      return;
    }

    const targetId = idOrden ?? ordenInicial?.id_orden;
    if (targetId === undefined || targetId === null || String(targetId).trim() === '') {
      setErrorNoDisponible('El documento solicitado no existe o no está disponible');
      return;
    }

    // Validar que el ID sea numérico antes de consultar
    if (!/^\d+$/.test(String(targetId).trim()) || Number(targetId) <= 0) {
      setErrorNoDisponible('El documento solicitado no existe o no está disponible');
      return;
    }

    const consultarExpediente = async () => {
      setCargando(true);
      setErrorNoDisponible('');
      setErrorGeneral('');

      try {
        const activeToken = token || localStorage.getItem('access_token') || localStorage.getItem('token');
        const config = {
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
        };
        const resp = await axios.get(
          `${API_BASE_URL}/api/purchases/ordenes-compra/${String(targetId).trim()}/`,
          config
        );
        setOrdenDetalle(resp.data);
      } catch (err) {
        const status = err?.response?.status;
        if (status === 404) {
          // Excepción Paso 2: bloqueo con mensaje exacto
          setOrdenDetalle(null);
          setErrorNoDisponible('El documento solicitado no existe o no está disponible');
        } else if (ordenInicial) {
          setOrdenDetalle(ordenInicial);
        } else {
          const msg =
            err?.response?.data?.error ||
            err?.response?.data?.detail ||
            'El documento solicitado no existe o no está disponible';
          setErrorNoDisponible(msg);
        }
      } finally {
        setCargando(false);
      }
    };

    consultarExpediente();
  }, [isOpen, idOrden, ordenInicial, token]);

  if (!isOpen) return null;

  const data = ordenDetalle || (!errorNoDisponible ? ordenInicial : null);

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatFecha = (fechaIso) => {
    if (!fechaIso) return '—';
    const partes = String(fechaIso).split('-');
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    return fechaIso;
  };

  const renderBadgeEstado = (estadoOrden) => {
    switch (Number(estadoOrden)) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-500/15 text-slate-300 border border-slate-500/30">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Borrador
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            Esperando Entrega
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Entregada
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            Cancelada / Anulada
          </span>
        );
      case 4:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            Entregada Parcialmente
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-700/40 text-slate-300 border border-slate-600">
            Desconocido
          </span>
        );
    }
  };

  const proveedor = data?.proveedor || {
    razon_social: data?.nombre_proveedor || 'Proveedor Adjudicado',
    nombre_proveedor: data?.nombre_proveedor || 'Proveedor Adjudicado',
    cuit: data?.cuit_prov || '—',
    cuit_prov: data?.cuit_prov || '—',
    correo: null,
    telefono: null,
    direccion: null
  };

  const renglones = Array.isArray(data?.detalles)
    ? data.detalles
    : Array.isArray(data?.items)
    ? data.items
    : [];

  const totalSolicitado =
    data?.monto_solicitado !== undefined
      ? Number(data.monto_solicitado)
      : renglones.reduce(
          (acc, r) => acc + (Number(r.cantidad) || 0) * (Number(r.precio_unitario) || 0),
          0
        );

  const totalAbonar =
    data?.total_abonar !== undefined
      ? Number(data.total_abonar)
      : data?.monto_total !== undefined
      ? Number(data.monto_total)
      : renglones.reduce((acc, r) => {
          const cant =
            r.cantidad_recibida !== null && r.cantidad_recibida !== undefined
              ? Number(r.cantidad_recibida)
              : Number(r.cantidad) || 0;
          return acc + cant * (Number(r.precio_unitario) || 0);
        }, 0);

  const handleCopiarResumenContable = async () => {
    if (!data) return;
    const lineasProductos = renglones
      .map(
        (r, idx) =>
          `${idx + 1}. ${r.nombre_producto} | Solicitado: ${r.cantidad} | Recibido: ${
            r.cantidad_recibida ?? 'Pendiente'
          } | P. Unitario: ${formatMoneda(r.precio_unitario)} | Subtotal: ${formatMoneda(r.subtotal)}`
      )
      .join('\n');

    const resumenTexto = [
      `ORDEN DE COMPRA #${data.id_orden}`,
      `Fecha de Emisión: ${formatFecha(data.fecha_emision)}`,
      `Estado Actual: ${data.estado_nombre || data.estado || '—'}`,
      `Proveedor: ${proveedor.razon_social || proveedor.nombre_proveedor} (CUIT: ${proveedor.cuit || proveedor.cuit_prov})`,
      `Contacto: ${proveedor.correo || 'S/D'} | Tel: ${proveedor.telefono || 'S/D'}`,
      `Modalidad Logística: ${data.tipo_entrega_nombre || (Number(data.tipo_entrega) === 2 ? 'Envío a Domicilio' : 'Retiro en Sucursal')}`,
      `N° de Remito: ${data.nro_remito || 'Sin remito registrado'}`,
      `Urgencia Técnica de Taller: ${data.sol_tec ? 'Sí (Prioridad Taller)' : 'No (Reposición de Stock)'}`,
      `----------------------------------------`,
      `DETALLE ECONÓMICO:`,
      lineasProductos,
      `----------------------------------------`,
      `TOTAL A ABONAR: ${formatMoneda(totalAbonar)}`
    ].join('\n');

    try {
      await navigator.clipboard.writeText(resumenTexto);
      setCopiadoExito(true);
      setTimeout(() => setCopiadoExito(false), 3000);
    } catch {
      setErrorGeneral('No se pudo copiar el resumen al portapapeles.');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]"
        >
          {/* Barra superior de identidad Cyber-Tech */}
          <div className="h-1.5 w-full bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500" />

          {/* Cabecera del Modal */}
          <div className="px-6 py-5 bg-[#0F172A]/80 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                    {data ? `Orden de Compra #${data.id_orden}` : 'Archivo Digital de Orden de Compra'}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/30">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Solo Lectura · Archivo Contable Inmutable
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Documento comercial definitivo con precios unitarios históricos congelados y trazabilidad logística
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {data && renderBadgeEstado(data.estado_orden)}
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 flex items-center justify-center transition-colors"
                title="Cerrar documento"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Cuerpo Desplazable */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Alerta general temporal */}
            <AnimatePresence>
              {errorGeneral && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between"
                >
                  <span>{errorGeneral}</span>
                  <button type="button" onClick={() => setErrorGeneral('')} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {cargando ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                <svg className="w-9 h-9 text-cyan-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-xs text-slate-400">Abriendo documento comercial protegido...</p>
              </div>
            ) : errorNoDisponible || !data ? (
              /* Excepción Paso 2: Bloqueo cuando la orden no existe o fue eliminada */
              <div className="py-14 px-6 text-center bg-[#0F172A]/70 border border-rose-500/30 rounded-2xl max-w-lg mx-auto my-4">
                <div className="w-14 h-14 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white mb-1.5">
                  El documento solicitado no existe o no está disponible
                </h3>
                <p className="text-xs text-slate-400 mb-5">
                  El acceso ha sido bloqueado debido a que el identificador consultado no corresponde a ninguna orden de compra activa o histórica en la base de datos.
                </p>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors"
                >
                  Volver al Listado de Órdenes
                </button>
              </div>
            ) : (
              <>
                {/* 1. CABECERA DEL DOCUMENTO (ID, Fecha Emisión, Estado Actual) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                      Identificador de la Orden
                    </span>
                    <span className="text-lg font-black text-cyan-400 font-mono mt-1 block">
                      OC-#{data.id_orden}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                      Fecha de Emisión Oficial
                    </span>
                    <span className="text-base font-bold text-white mt-1 block">
                      {formatFecha(data.fecha_emision)}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-[#0F172A]/80 border border-slate-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                      Estado Logístico Actual
                    </span>
                    <div className="mt-1.5">
                      {renderBadgeEstado(data.estado_orden)}
                    </div>
                  </div>
                </div>

                {/* 2. DATOS DEL PROVEEDOR ADJUDICADO Y LOGÍSTICA */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Tarjeta Datos del Proveedor */}
                  <div className="p-5 rounded-2xl bg-[#0F172A]/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                        Datos del Proveedor Adjudicado
                      </h3>
                      {proveedor.nivel && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {proveedor.nivel}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Razón Social / Nombre Comercial</span>
                        <span className="font-bold text-white text-sm">
                          {proveedor.razon_social || proveedor.nombre_proveedor || '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">CUIT Fiscal</span>
                        <span className="font-mono font-bold text-cyan-300 text-sm">
                          {proveedor.cuit || proveedor.cuit_prov || '—'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">Correo Electrónico de Contacto</span>
                        <span className="text-slate-200 break-all">
                          {proveedor.correo || 'No registrado'}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">Teléfono Comercial</span>
                        <span className="text-slate-200 font-mono">
                          {proveedor.telefono || 'No registrado'}
                        </span>
                      </div>

                      {proveedor.direccion && (
                        <div className="sm:col-span-2 pt-1 border-t border-slate-800/60">
                          <span className="text-slate-500 block text-[11px]">Domicilio Comercial</span>
                          <span className="text-slate-300">
                            {[
                              proveedor.direccion.calle,
                              proveedor.direccion.barrio,
                              proveedor.direccion.ciudad,
                              proveedor.direccion.provincia
                            ]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Tarjeta Información Logística y Urgencia Técnica */}
                  <div className="p-5 rounded-2xl bg-[#0F172A]/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1" />
                        </svg>
                        Trazabilidad Logística y Origen
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Número de Remito Asociado</span>
                        {data.nro_remito ? (
                          <span className="font-mono font-bold text-emerald-300 text-sm">
                            {data.nro_remito}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">
                            Sin remito asociado (pendiente de entrega)
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">Indicador de Urgencia Técnica</span>
                        {data.sol_tec ? (
                          <span className="inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                            Urgencia Técnica de Taller
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 mt-0.5 px-2.5 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-medium">
                            Reposición de Stock General
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">Modalidad de Recepción</span>
                        <span className="font-semibold text-slate-200">
                          {data.tipo_entrega_nombre ||
                            (Number(data.tipo_entrega) === 2 ? 'Envío a Domicilio' : 'Retiro en Sucursal')}
                        </span>
                      </div>

                      <div>
                        <span className="text-slate-500 block text-[11px]">Fecha Efectiva de Recepción</span>
                        <span className="font-medium text-slate-200">
                          {data.fecha_recepcion
                            ? formatFecha(data.fecha_recepcion)
                            : 'Mercadería aún en tránsito / espera'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. DETALLE ECONÓMICO (Grilla Contable de Repuestos y Precios Congelados) */}
                <div className="rounded-2xl bg-[#0F172A]/80 border border-slate-800 overflow-hidden">
                  <div className="px-5 py-3.5 bg-[#0F172A] border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
                      <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      Detalle Económico de Repuestos e Insumos Adquiridos
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      {renglones.length} artículo(s) en contrato · Precios históricos congelados
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                        <tr>
                          <th className="px-5 py-3">Repuesto / Insumo</th>
                          <th className="px-4 py-3 text-center">Cant. Solicitada</th>
                          <th className="px-4 py-3 text-center">Cant. Realmente Recibida</th>
                          <th className="px-4 py-3 text-right">Precio Unitario Exacto</th>
                          <th className="px-5 py-3 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 text-slate-200">
                        {renglones.map((item) => {
                          const recibidaDefinida =
                            item.cantidad_recibida !== null && item.cantidad_recibida !== undefined;
                          const cantSolicitada = Number(item.cantidad) || 0;
                          const cantRecibida = recibidaDefinida ? Number(item.cantidad_recibida) : null;

                          let badgeConciliacion = null;
                          if (recibidaDefinida) {
                            if (cantRecibida === cantSolicitada) {
                              badgeConciliacion = (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  Completa
                                </span>
                              );
                            } else if (cantRecibida < cantSolicitada) {
                              badgeConciliacion = (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Parcial
                                </span>
                              );
                            } else {
                              badgeConciliacion = (
                                <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  Excedente
                                </span>
                              );
                            }
                          }

                          return (
                            <tr key={item.id_detalle_compra || item.id_producto} className="hover:bg-slate-800/30">
                              <td className="px-5 py-3.5">
                                <div className="font-bold text-white">
                                  {item.nombre_producto || `Insumo #${item.id_producto}`}
                                </div>
                                {(item.categoria || item.descripcion_producto) && (
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    {[item.categoria, item.descripcion_producto].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-center font-mono font-semibold text-slate-200">
                                {cantSolicitada} unid.
                              </td>

                              <td className="px-4 py-3.5 text-center font-mono">
                                {recibidaDefinida ? (
                                  <div className="inline-flex items-center justify-center">
                                    <span className="font-bold text-emerald-300">{cantRecibida} unid.</span>
                                    {badgeConciliacion}
                                  </div>
                                ) : (
                                  <span className="text-slate-500 italic">Pendiente de recepción</span>
                                )}
                              </td>

                              <td className="px-4 py-3.5 text-right font-mono text-slate-200">
                                {formatMoneda(item.precio_unitario)}
                              </td>

                              <td className="px-5 py-3.5 text-right font-mono font-bold text-cyan-300">
                                {formatMoneda(item.subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pie de Resumen Contable y Total a Abonar */}
                  <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="text-xs text-slate-400">
                      {totalSolicitado !== totalAbonar && (
                        <div>
                          Monto original solicitado:{' '}
                          <span className="font-mono text-slate-300">{formatMoneda(totalSolicitado)}</span>
                        </div>
                      )}
                      <div>
                        El importe total a abonar se calcula sobre las unidades efectivamente conciliadas o pactadas en la orden.
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400 block">
                          Total a Abonar
                        </span>
                        <span className="text-xl font-black text-emerald-300 font-mono">
                          {formatMoneda(totalAbonar)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Pie de Acciones de Solo Lectura */}
          <div className="px-6 py-4 bg-[#0F172A]/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>Resguardo de auditoría contable · Los precios unitarios se encuentran congelados</span>
            </div>

            <div className="flex items-center gap-3">
              {data && (
                <>
                  {Number(data.estado_orden) === 1 && typeof onRecepcionar === 'function' && (
                    <button
                      type="button"
                      onClick={() => onRecepcionar(data)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>Recepcionar Mercadería</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleCopiarResumenContable}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{copiadoExito ? '¡Resumen Copiado!' : 'Copiar Resumen Contable'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    <span>Imprimir Comprobante</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
              >
                Cerrar Expediente
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
