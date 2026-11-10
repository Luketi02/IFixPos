import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

import { API_BASE_URL } from '../../config/api';
export default function GenerarOrdenCompraModal({
  isOpen,
  onClose,
  onOrdenesEmitidas
}) {
  const { token } = useAuth();
  const navigate = useNavigate();

  // Catálogo de productos disponible para agregar a la lista de compras
  const [catalogoProductos, setCatalogoProductos] = useState([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [busquedaProducto, setBusquedaProducto] = useState('');

  // Paso 2: Lista de insumos seleccionados, cantidades y preferencia de envío
  const [insumosSeleccionados, setInsumosSeleccionados] = useState([]);
  const [requiereEnvio, setRequiereEnvio] = useState(false);
  const [esUrgenciaTecnica, setEsUrgenciaTecnica] = useState(false);

  // Estado del cálculo algorítmico (Pasos 3, 4 y 5)
  const [calculando, setCalculando] = useState(false);
  const [etapaActual, setEtapaActual] = useState('FORMULARIO'); // 'FORMULARIO' | 'BORRADORES' | 'EXITO'
  const [borradores, setBorradores] = useState([]);
  const [borradoresDescartados, setBorradoresDescartados] = useState([]);
  const [productosHuerfanos, setProductosHuerfanos] = useState([]);

  // Estado de emisión de órdenes (Pasos 6, 7 y 8)
  const [emitiendoGlobal, setEmitiendoGlobal] = useState(false);
  const [cuitEmitiendoIndividual, setCuitEmitiendoIndividual] = useState(null);
  const [ordenesEmitidasResultado, setOrdenesEmitidasResultado] = useState([]);

  // Alertas suaves con auto-cierre a los 6 segundos (Regla 6)
  const [errorAlerta, setErrorAlerta] = useState('');
  const [mensajeInfo, setMensajeInfo] = useState('');

  useEffect(() => {
    if (!errorAlerta) return undefined;
    const timer = setTimeout(() => setErrorAlerta(''), 6000);
    return () => clearTimeout(timer);
  }, [errorAlerta]);

  useEffect(() => {
    if (!mensajeInfo) return undefined;
    const timer = setTimeout(() => setMensajeInfo(''), 6000);
    return () => clearTimeout(timer);
  }, [mensajeInfo]);

  // Reiniciar estado al abrir/cerrar
  useEffect(() => {
    if (!isOpen) {
      setBusquedaProducto('');
      setInsumosSeleccionados([]);
      setRequiereEnvio(false);
      setEsUrgenciaTecnica(false);
      setEtapaActual('FORMULARIO');
      setBorradores([]);
      setBorradoresDescartados([]);
      setProductosHuerfanos([]);
      setOrdenesEmitidasResultado([]);
      setErrorAlerta('');
      setMensajeInfo('');
      return;
    }

    const cargarProductos = async () => {
      setCargandoCatalogo(true);
      try {
        const activeToken = token || localStorage.getItem('access_token');
        const config = {
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {}
        };
        const resp = await axios.get(`${API_BASE_URL}/api/catalog/productos/`, config);
        const lista = Array.isArray(resp.data)
          ? resp.data
          : Array.isArray(resp.data?.results)
          ? resp.data.results
          : [];
        setCatalogoProductos(lista.filter((p) => p.estado !== false));
      } catch {
        setErrorAlerta('No se pudo cargar el catálogo de productos e insumos.');
      } finally {
        setCargandoCatalogo(false);
      }
    };

    cargarProductos();
  }, [isOpen, token]);

  // Filtrado reactivo del buscador de catálogo
  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    const idsYaAgregados = new Set(insumosSeleccionados.map((i) => i.id_producto));

    return catalogoProductos
      .filter((p) => !idsYaAgregados.has(p.id_producto))
      .filter((p) => {
        if (!q) return true;
        const nombre = String(p.nombre || '').toLowerCase();
        const cat = String(p.nombre_categoria || p.categoria_nombre || '').toLowerCase();
        const desc = String(p.descripcion || '').toLowerCase();
        return nombre.includes(q) || cat.includes(q) || desc.includes(q);
      })
      .slice(0, 12);
  }, [catalogoProductos, busquedaProducto, insumosSeleccionados]);

  // Mapa rápido de IDs huérfanos para resaltarlos en la lista de insumos (Excepción Paso 3)
  const mapaHuerfanos = useMemo(() => {
    const map = {};
    productosHuerfanos.forEach((h) => {
      map[h.id_producto] = h;
    });
    return map;
  }, [productosHuerfanos]);

  if (!isOpen) return null;

  const formatMoneda = (valor) => {
    const num = Number(valor) || 0;
    return `$ ${num.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Agregar insumo a la lista de solicitud
  const handleAgregarInsumo = (prod) => {
    setErrorAlerta('');
    setInsumosSeleccionados((prev) => [
      ...prev,
      {
        id_producto: prod.id_producto,
        nombre: prod.nombre,
        categoria: prod.nombre_categoria || prod.categoria_nombre || 'Insumo de Catálogo',
        cantidad: 1
      }
    ]);
    setBusquedaProducto('');
  };

  // Cambiar cantidad de un insumo
  const handleCambiarCantidad = (idProd, nuevaCantidad) => {
    const num = parseInt(nuevaCantidad, 10);
    setInsumosSeleccionados((prev) =>
      prev.map((item) =>
        item.id_producto === idProd
          ? { ...item, cantidad: Number.isNaN(num) || num < 1 ? 1 : num }
          : item
      )
    );
    // Si estaba marcado como huérfano, mantener o limpiar al recalcular
  };

  const handleQuitarInsumo = (idProd) => {
    setInsumosSeleccionados((prev) => prev.filter((i) => i.id_producto !== idProd));
    setProductosHuerfanos((prev) => prev.filter((h) => h.id_producto !== idProd));
  };

  const handleQuitarTodosLosHuerfanos = () => {
    const idsHuerfanos = new Set(productosHuerfanos.map((h) => h.id_producto));
    const restantes = insumosSeleccionados.filter((i) => !idsHuerfanos.has(i.id_producto));
    setInsumosSeleccionados(restantes);
    setProductosHuerfanos([]);
    if (borradores.length > 0 && restantes.length > 0) {
      setEtapaActual('BORRADORES');
    }
  };

  // Paso 3 y 4: Ejecutar "Calcular Mejor Compra"
  const handleCalcularMejorCompra = async (e) => {
    if (e) e.preventDefault();
    setErrorAlerta('');
    setMensajeInfo('');

    if (insumosSeleccionados.length === 0) {
      setErrorAlerta('Debe agregar al menos un insumo o repuesto a la lista antes de calcular la mejor compra.');
      return;
    }

    const cantidadInvalida = insumosSeleccionados.some(
      (i) => !Number.isInteger(Number(i.cantidad)) || Number(i.cantidad) < 1
    );
    if (cantidadInvalida) {
      setErrorAlerta('Todas las cantidades solicitadas deben ser números enteros mayores o iguales a 1.');
      return;
    }

    setCalculando(true);
    try {
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
        }
      };

      const payload = {
        productos: insumosSeleccionados.map((i) => ({
          id_producto: Number(i.id_producto),
          cantidad: Number(i.cantidad)
        })),
        requiere_envio: Boolean(requiereEnvio)
      };

      const resp = await axios.post(
        `${API_BASE_URL}/api/purchases/ordenes-compra/calcular-mejor-compra/`,
        payload,
        config
      );

      const data = resp.data || {};
      const listaBorradores = Array.isArray(data.borradores) ? data.borradores : [];
      const listaHuerfanos = Array.isArray(data.productos_huerfanos) ? data.productos_huerfanos : [];

      setBorradores(
        listaBorradores.map((b) => ({
          ...b,
          sol_tec: esUrgenciaTecnica
        }))
      );
      setBorradoresDescartados([]);
      setProductosHuerfanos(listaHuerfanos);

      // Excepción Paso 3: Si hay productos sin cotización aceptada vigente, resaltarlos y notificar
      if (listaHuerfanos.length > 0) {
        setErrorAlerta(
          `Atención: ${listaHuerfanos.length} insumo(s) solicitado(s) no posee(n) ningún precio histórico vigente en cotizaciones aceptadas. Revise los ítems resaltados o inicie una Solicitud de Cotización previa.`
        );
        if (listaBorradores.length === 0) {
          // Interrumpe el avance si ningún ítem pudo cotizarse
          setEtapaActual('FORMULARIO');
          return;
        }
      }

      setEtapaActual('BORRADORES');
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'No se pudo ejecutar el cálculo de mejor compra.';
      setErrorAlerta(msg);
    } finally {
      setCalculando(false);
    }
  };

  // Excepción Paso 5: Descartar un borrador específico sin afectar al resto
  const handleDescartarBorrador = (borrador) => {
    setBorradores((prev) => prev.filter((b) => b.cuit_prov !== borrador.cuit_prov));
    setBorradoresDescartados((prev) => [...prev, borrador]);
    setMensajeInfo(
      `Se descartó el borrador del proveedor "${borrador.nombre_proveedor}" sin afectar al resto de las órdenes.`
    );
  };

  const handleRestaurarBorrador = (borrador) => {
    setBorradoresDescartados((prev) => prev.filter((b) => b.cuit_prov !== borrador.cuit_prov));
    setBorradores((prev) => [...prev, borrador]);
  };

  // Cambiar tipo de entrega en un borrador individual
  const handleCambiarTipoEntregaBorrador = (cuitProv, nuevoTipo) => {
    const tipoNum = Number(nuevoTipo);
    setBorradores((prev) =>
      prev.map((b) =>
        b.cuit_prov === cuitProv
          ? {
              ...b,
              tipo_entrega: tipoNum,
              tipo_entrega_nombre: tipoNum === 2 ? 'Envío a Domicilio' : 'Retiro en Sucursal'
            }
          : b
      )
    );
  };

  // Paso 6, 7 y 8: Emitir una orden específica o emitir todas las órdenes activas
  const ejecutarEmision = async (listaAEmitir, esIndividual = false, cuitTarget = null) => {
    if (!Array.isArray(listaAEmitir) || listaAEmitir.length === 0) {
      setErrorAlerta('No hay borradores activos seleccionados para emitir.');
      return;
    }

    setErrorAlerta('');
    if (esIndividual) {
      setCuitEmitiendoIndividual(cuitTarget);
    } else {
      setEmitiendoGlobal(true);
    }

    try {
      const activeToken = token || localStorage.getItem('access_token');
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {})
        }
      };

      const payload = {
        borradores: listaAEmitir.map((b) => ({
          cuit_prov: b.cuit_prov,
          tipo_entrega: Number(b.tipo_entrega) || 1,
          sol_tec: Boolean(b.sol_tec ?? esUrgenciaTecnica),
          items: (b.items || []).map((it) => ({
            id_producto: Number(it.id_producto),
            cantidad: Number(it.cantidad),
            precio_unitario: String(it.precio_unitario)
          }))
        }))
      };

      const resp = await axios.post(
        `${API_BASE_URL}/api/purchases/ordenes-compra/emitir/`,
        payload,
        config
      );

      const creadas = Array.isArray(resp.data?.ordenes) ? resp.data.ordenes : [];
      setOrdenesEmitidasResultado((prev) => [...prev, ...creadas]);

      if (esIndividual && cuitTarget) {
        const restantes = borradores.filter((b) => b.cuit_prov !== cuitTarget);
        setBorradores(restantes);
        if (onOrdenesEmitidas) onOrdenesEmitidas(creadas);

        if (restantes.length === 0) {
          setEtapaActual('EXITO');
        } else {
          setMensajeInfo(
            `Orden de Compra emitida y despachada exitosamente a "${listaAEmitir[0].nombre_proveedor}". Quedan ${restantes.length} borrador(es) por revisar.`
          );
        }
      } else {
        setBorradores([]);
        if (onOrdenesEmitidas) onOrdenesEmitidas(creadas);
        setEtapaActual('EXITO');
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.detail ||
        'Ocurrió un error al intentar emitir la(s) orden(es) de compra.';
      setErrorAlerta(msg);
    } finally {
      setEmitiendoGlobal(false);
      setCuitEmitiendoIndividual(null);
    }
  };

  const montoTotalBorradoresActivos = borradores.reduce(
    (acc, b) => acc + (Number(b.monto_total) || 0),
    0
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-5xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[92vh]"
        >
          {/* Barra superior Cyber-Tech */}
          <div className="h-1.5 w-full bg-gradient-to-r from-cyan-400 via-violet-500 to-emerald-400" />

          {/* Cabecera */}
          <div className="px-6 py-5 bg-[#0F172A]/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                  Nueva Orden de Compra · Motor de Mejor Compra
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Selección algorítmica de proveedores ganadores según cotizaciones aceptadas vigentes y emisión legal en PDF
                </p>
              </div>
            </div>

            {/* Indicador de Pasos */}
            <div className="flex items-center gap-2 text-xs">
              <span
                className={`px-3 py-1 rounded-full font-bold border ${
                  etapaActual === 'FORMULARIO'
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                1. Insumos y Parámetros
              </span>
              <span className="text-slate-600">→</span>
              <span
                className={`px-3 py-1 rounded-full font-bold border ${
                  etapaActual === 'BORRADORES'
                    ? 'bg-violet-500/20 text-violet-300 border-violet-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                2. Borradores por Proveedor
              </span>
              <span className="text-slate-600">→</span>
              <span
                className={`px-3 py-1 rounded-full font-bold border ${
                  etapaActual === 'EXITO'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                3. Emisión y Despacho
              </span>

              <button
                type="button"
                onClick={onClose}
                className="ml-2 w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Cuerpo Desplazable */}
          <div className="p-6 overflow-y-auto space-y-6 flex-1">
            {/* Alertas de Error e Información */}
            <AnimatePresence>
              {errorAlerta && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{errorAlerta}</span>
                  </div>
                  <button type="button" onClick={() => setErrorAlerta('')} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </motion.div>
              )}

              {mensajeInfo && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="p-4 bg-cyan-500/15 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5">
                    <svg className="w-5 h-5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">{mensajeInfo}</span>
                  </div>
                  <button type="button" onClick={() => setMensajeInfo('')} className="text-slate-400 hover:text-white">
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Panel de Excepción Paso 3: Ítems Huérfanos sin Precio Histórico Vigente */}
            {productosHuerfanos.length > 0 && etapaActual !== 'EXITO' && (
              <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/40 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-5 h-5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                      Insumos sin Cotización Aceptada Vigente ({productosHuerfanos.length})
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        navigate('/admin/cotizaciones');
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors"
                    >
                      Iniciar Solicitud de Cotización Previa
                    </button>
                    {insumosSeleccionados.length > productosHuerfanos.length && (
                      <button
                        type="button"
                        onClick={handleQuitarTodosLosHuerfanos}
                        className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                      >
                        Quitar Ítems Huérfanos
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-amber-200/90">
                  Los siguientes repuestos no registran ningún precio histórico vigente que cumpla las condiciones solicitadas. Es necesario emitir primero una Solicitud de Cotización hacia los proveedores:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {productosHuerfanos.map((h) => (
                    <div
                      key={h.id_producto}
                      className="p-3 rounded-xl bg-[#0F172A]/90 border border-amber-500/30 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <span className="font-bold text-amber-300 block">{h.nombre_producto}</span>
                        <span className="text-[11px] text-slate-400">{h.motivo}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px] shrink-0">
                        Cant: {h.cantidad_solicitada}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ETAPA 1: FORMULARIO DE INSUMOS, CANTIDADES Y PARÁMETROS LOGÍSTICOS (Paso 2) */}
            {/* ========================================================================= */}
            {etapaActual === 'FORMULARIO' && (
              <div className="space-y-6">
                {/* Parámetros de Envío y Origen */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        ¿Desea recibir la compra con envío a domicilio?
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Si se activa, el motor priorizará y filtrará únicamente proveedores que realicen envíos.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRequiereEnvio((prev) => !prev)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                        requiereEnvio
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 shadow-[0_0_12px_rgba(139,92,246,0.2)]'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {requiereEnvio ? 'Con Envío a Domicilio' : 'Retiro Presencial / Indistinto'}
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#0F172A]/80 border border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-white block">
                        Prioridad Operativa del Pedido
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Indique si la orden responde a una urgencia técnica de taller o a reposición normal.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEsUrgenciaTecnica((prev) => !prev)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all shrink-0 ${
                        esUrgenciaTecnica
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {esUrgenciaTecnica ? 'Urgencia Técnica Taller' : 'Reposición de Stock'}
                    </button>
                  </div>
                </div>

                {/* Buscador y Selector de Insumos del Catálogo */}
                <div className="p-5 rounded-2xl bg-[#0F172A]/70 border border-slate-800 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white mb-1">
                      1. Seleccionar Insumos o Repuestos a Adquirir
                    </label>
                    <p className="text-[11px] text-slate-400 mb-3">
                      Busque en el catálogo general y haga clic en un artículo para incorporarlo a la lista de evaluación
                    </p>
                    <input
                      type="text"
                      value={busquedaProducto}
                      onChange={(e) => setBusquedaProducto(e.target.value)}
                      placeholder="Buscar repuesto o insumo por nombre o categoría..."
                      className="w-full px-4 py-2.5 rounded-xl bg-[#1E293B] border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  {cargandoCatalogo ? (
                    <div className="text-xs text-slate-400 py-4 text-center">
                      Cargando catálogo de insumos...
                    </div>
                  ) : productosFiltrados.length === 0 ? (
                    <div className="text-xs text-slate-500 py-3 text-center">
                      No hay más productos coincidentes disponibles para agregar.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-52 overflow-y-auto pr-1">
                      {productosFiltrados.map((prod) => (
                        <button
                          key={prod.id_producto}
                          type="button"
                          onClick={() => handleAgregarInsumo(prod)}
                          className="p-3 rounded-xl bg-[#1E293B] hover:bg-cyan-500/15 border border-slate-700/80 hover:border-cyan-500/40 text-left transition-all flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-white truncate group-hover:text-cyan-300">
                              {prod.nombre}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {prod.nombre_categoria || prod.categoria_nombre || 'Catálogo General'}
                            </div>
                          </div>
                          <span className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-bold text-xs shrink-0">
                            +
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lista de Insumos Seleccionados y Cantidades */}
                <div className="rounded-2xl bg-[#0F172A]/80 border border-slate-800 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      2. Lista de Insumos y Cantidades Requeridas ({insumosSeleccionados.length})
                    </h3>
                    {insumosSeleccionados.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setInsumosSeleccionados([]);
                          setProductosHuerfanos([]);
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold"
                      >
                        Vaciar Lista
                      </button>
                    )}
                  </div>

                  {insumosSeleccionados.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Aún no ha agregado insumos a la lista. Seleccione uno o más artículos arriba para comenzar.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-800">
                      {insumosSeleccionados.map((item) => {
                        const esHuerfano = Boolean(mapaHuerfanos[item.id_producto]);
                        return (
                          <div
                            key={item.id_producto}
                            className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 transition-colors ${
                              esHuerfano
                                ? 'bg-amber-500/10 border-l-4 border-l-amber-400'
                                : 'hover:bg-slate-800/30'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-white">{item.nombre}</span>
                                {esHuerfano && (
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Sin Cotización Aceptada Vigente
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block">{item.categoria}</span>
                              {esHuerfano && (
                                <span className="text-[11px] text-amber-300/90 block mt-0.5">
                                  {mapaHuerfanos[item.id_producto].motivo}
                                </span>
                              )}
                            </div>

                            {/* Control de Cantidad */}
                            <div className="flex items-center gap-3">
                              <div className="flex items-center rounded-xl bg-[#1E293B] border border-slate-700 overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleCambiarCantidad(item.id_producto, item.cantidad - 1)}
                                  className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-xs"
                                >
                                  −
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.cantidad}
                                  onChange={(e) => handleCambiarCantidad(item.id_producto, e.target.value)}
                                  className="w-16 text-center bg-transparent text-xs font-bold text-white focus:outline-none font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleCambiarCantidad(item.id_producto, item.cantidad + 1)}
                                  className="px-3 py-1.5 text-slate-300 hover:bg-slate-700 font-bold text-xs"
                                >
                                  +
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleQuitarInsumo(item.id_producto)}
                                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors"
                                title="Quitar insumo"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* ETAPA 2: BORRADORES DE ÓRDENES AGRUPADOS POR PROVEEDOR GANADOR (Pasos 5 y 6) */}
            {/* ========================================================================= */}
            {etapaActual === 'BORRADORES' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0F172A]/80 p-4 rounded-2xl border border-slate-800">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Borradores de Órdenes de Compra Generados ({borradores.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Insumos ganadores agrupados por proveedor con precios unitarios históricos bloqueados. Puede emitir cada orden individualmente, descartar un borrador si su monto no justifica el pedido, o emitir todas las órdenes juntas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEtapaActual('FORMULARIO')}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                  >
                    ← Modificar Insumos Solicitados
                  </button>
                </div>

                {borradores.length === 0 ? (
                  <div className="py-12 text-center bg-[#0F172A]/60 rounded-2xl border border-slate-800 p-6">
                    <p className="text-sm font-bold text-slate-200 mb-1">
                      No quedan borradores activos para emitir
                    </p>
                    <p className="text-xs text-slate-400 mb-4">
                      Ha descartado todos los borradores propuestos. Puede restaurarlos abajo o volver al formulario de insumos.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {borradores.map((borrador) => {
                      const estaEmitiendoEste = cuitEmitiendoIndividual === borrador.cuit_prov;

                      return (
                        <div
                          key={borrador.cuit_prov}
                          className="rounded-2xl bg-[#0F172A]/90 border border-slate-700/80 overflow-hidden shadow-lg"
                        >
                          {/* Cabecera del Borrador del Proveedor */}
                          <div className="px-5 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2.5">
                                <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                                  Proveedor Ganador
                                </span>
                                <h4 className="text-sm font-extrabold text-white">
                                  {borrador.nombre_proveedor}
                                </h4>
                                <span className="text-xs font-mono text-slate-400">
                                  (CUIT: {borrador.cuit_prov})
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                                <span>Correo: {borrador.correo || 'No especificado'}</span>
                                {borrador.telefono && <span>· Tel: {borrador.telefono}</span>}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                              {/* Selector de Modalidad de Recepción del Borrador */}
                              <select
                                value={borrador.tipo_entrega}
                                onChange={(e) =>
                                  handleCambiarTipoEntregaBorrador(borrador.cuit_prov, e.target.value)
                                }
                                className="px-3 py-1.5 rounded-xl bg-[#1E293B] border border-slate-700 text-xs text-white font-semibold focus:outline-none focus:border-cyan-400"
                              >
                                <option value={1}>Retiro en Sucursal (Presencial)</option>
                                {borrador.ofrece_envio && (
                                  <option value={2}>Envío a Domicilio</option>
                                )}
                              </select>

                              {/* Excepción Paso 5: Botón para descartar este borrador específico */}
                              <button
                                type="button"
                                onClick={() => handleDescartarBorrador(borrador)}
                                disabled={estaEmitiendoEste || emitiendoGlobal}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors"
                              >
                                Descartar Borrador
                              </button>

                              {/* Paso 6: Emitir Orden Individual */}
                              <button
                                type="button"
                                onClick={() => ejecutarEmision([borrador], true, borrador.cuit_prov)}
                                disabled={estaEmitiendoEste || emitiendoGlobal}
                                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-[0_0_12px_rgba(6,182,212,0.25)] transition-all"
                              >
                                {estaEmitiendoEste ? 'Emitiendo...' : 'Emitir Orden'}
                              </button>
                            </div>
                          </div>

                          {/* Tabla de Renglones con Precios Unitarios Históricos Bloqueados */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-950/50 text-slate-400 uppercase text-[11px] border-b border-slate-800">
                                <tr>
                                  <th className="px-5 py-2.5">Insumo Adjudicado</th>
                                  <th className="px-4 py-2.5 text-center">Cantidad</th>
                                  <th className="px-4 py-2.5 text-right">Precio Unitario Bloqueado</th>
                                  <th className="px-5 py-2.5 text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/70 text-slate-200">
                                {(borrador.items || []).map((it) => (
                                  <tr key={it.id_producto}>
                                    <td className="px-5 py-3 font-semibold text-white">
                                      {it.nombre_producto}
                                      {it.id_cotizacion && (
                                        <span className="ml-2 text-[10px] font-mono text-slate-400">
                                          (Cotización #{it.id_cotizacion})
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-center font-mono">
                                      {it.cantidad} unid.
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                      <span className="inline-flex items-center gap-1 text-slate-200">
                                        <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                        {formatMoneda(it.precio_unitario)}
                                      </span>
                                    </td>
                                    <td className="px-5 py-3 text-right font-mono font-bold text-cyan-300">
                                      {formatMoneda(it.subtotal)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* Pie del Borrador */}
                          <div className="px-5 py-3 bg-slate-900/70 border-t border-slate-800 flex items-center justify-between text-xs">
                            <span className="text-slate-400">
                              Modalidad seleccionada:{' '}
                              <strong className="text-slate-200">{borrador.tipo_entrega_nombre}</strong>
                            </span>
                            <div>
                              <span className="text-slate-400 mr-2">Monto de esta Orden:</span>
                              <span className="text-sm font-black text-emerald-300 font-mono">
                                {formatMoneda(borrador.monto_total)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Borradores Descartados (Opción de Restaurar) */}
                {borradoresDescartados.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Borradores Descartados ({borradoresDescartados.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {borradoresDescartados.map((bd) => (
                        <div
                          key={bd.cuit_prov}
                          className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center gap-3 text-xs"
                        >
                          <span className="text-slate-300">
                            {bd.nombre_proveedor} ({formatMoneda(bd.monto_total)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRestaurarBorrador(bd)}
                            className="text-cyan-400 hover:text-cyan-300 font-bold"
                          >
                            Restaurar
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* ETAPA 3: CONFIRMACIÓN DE ÓRDENES EMITIDAS Y DESPACHADAS (Paso 8)           */}
            {/* ========================================================================= */}
            {etapaActual === 'EXITO' && (
              <div className="py-8 px-4 text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto text-emerald-400">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>

                <div>
                  <h3 className="text-lg font-extrabold text-white">
                    ¡Órdenes de Compra Emitidas y Despachadas Exitosamente!
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xl mx-auto mt-1">
                    Se han instanciado los contratos comerciales en estado &ldquo;Esperando Entrega&rdquo;, generado los documentos legales en formato PDF con respaldo institucional y despachado por correo electrónico a cada proveedor adjudicado.
                  </p>
                </div>

                <div className="max-w-2xl mx-auto space-y-2.5 text-left">
                  {ordenesEmitidasResultado.map((ord) => (
                    <div
                      key={ord.id_orden}
                      className="p-4 rounded-xl bg-[#0F172A] border border-emerald-500/30 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-cyan-400 text-sm">
                          Orden #{ord.id_orden}
                        </span>
                        <span className="ml-2 font-semibold text-white">
                          · {ord.proveedor?.nombre || 'Proveedor Adjudicado'}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Modalidad: {ord.tipo_entrega_nombre} · Estado: {ord.estado || 'Esperando Entrega'}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-black text-emerald-300 text-sm block">
                          {formatMoneda(ord.monto_total)}
                        </span>
                        <span className="text-[10px] text-emerald-400">PDF Legal Enviado por Email</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pie del Modal */}
          <div className="px-6 py-4 bg-[#0F172A]/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            {etapaActual === 'FORMULARIO' && (
              <>
                <div className="text-xs text-slate-400">
                  {insumosSeleccionados.length} insumo(s) preparado(s) para evaluación algorítmica
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCalcularMejorCompra}
                    disabled={calculando || insumosSeleccionados.length === 0}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-2"
                  >
                    {calculando ? (
                      <span>Calculando Mejor Compra...</span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        <span>Calcular Mejor Compra</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {etapaActual === 'BORRADORES' && (
              <>
                <div className="text-xs text-slate-300">
                  Total consolidado ({borradores.length} orden/es):{' '}
                  <strong className="text-emerald-300 font-mono text-sm">
                    {formatMoneda(montoTotalBorradoresActivos)}
                  </strong>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEtapaActual('FORMULARIO')}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  >
                    Volver a Insumos
                  </button>
                  <button
                    type="button"
                    onClick={() => ejecutarEmision(borradores, false, null)}
                    disabled={emitiendoGlobal || borradores.length === 0}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all flex items-center gap-2"
                  >
                    {emitiendoGlobal ? (
                      <span>Emitiendo y Despachando PDFs...</span>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span>Emitir Órdenes ({borradores.length})</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}

            {etapaActual === 'EXITO' && (
              <div className="w-full flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold bg-cyan-400 hover:bg-cyan-300 text-slate-950 transition-colors"
                >
                  Finalizar y Ver Listado de Órdenes
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
