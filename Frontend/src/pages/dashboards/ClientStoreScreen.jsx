import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import { formatearNombreConInicial } from '../../utils/roleRoutes';
import { obtenerImagenProducto, obtenerGaleriaImagenes, formatearMoneda } from '../../utils/productImages';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';
import CheckoutModal from '../../components/cart/CheckoutModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// =============================================================================
// SUBCOMPONENTE AISLADO: BANNER DE ORDEN PENDIENTE (0 RE-RENDERS A LA TIENDA)
// Sincronizado estrictamente con la hora oficial del sistema (Wall-Clock Time)
// =============================================================================
function BannerOrdenPendiente({ compra, onRetomar, onCancelar, onExpirado }) {
  const tiempoFinRef = useRef(Date.now() + Math.max(0, compra?.segundos_restantes || 0) * 1000);
  const [segundos, setSegundos] = useState(Math.max(0, compra?.segundos_restantes || 0));

  useEffect(() => {
    tiempoFinRef.current = Date.now() + Math.max(0, compra?.segundos_restantes || 0) * 1000;
    setSegundos(Math.max(0, compra?.segundos_restantes || 0));
  }, [compra?.segundos_restantes, compra?.id_venta]);

  useEffect(() => {
    const calcularRestante = () => {
      const difMs = tiempoFinRef.current - Date.now();
      return Math.max(0, Math.ceil(difMs / 1000));
    };

    const sincronizarTiempo = () => {
      const segs = calcularRestante();
      setSegundos(segs);
      if (segs <= 0 && onExpirado) {
        onExpirado();
      }
    };

    sincronizarTiempo();
    const t = setInterval(sincronizarTiempo, 1000);

    const handleVisibilidad = () => {
      if (document.visibilityState === 'visible') {
        sincronizarTiempo();
      }
    };
    const handleFocus = () => {
      sincronizarTiempo();
    };

    document.addEventListener('visibilitychange', handleVisibilidad);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', handleVisibilidad);
      window.removeEventListener('focus', handleFocus);
    };
  }, [onExpirado]);

  if (!compra || segundos <= 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-gradient-to-r from-cyan-950/95 via-[#1E293B] to-slate-900 border-b border-cyan-500/40 px-4 sm:px-6 lg:px-8 py-3 shadow-lg shadow-cyan-950/30 sticky top-16 z-20"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <span className="text-base">⏱️</span>
          </div>
          <div>
            <p className="text-xs font-bold text-white flex items-center gap-2">
              <span>Tienes una orden de compra en curso con repuestos reservados</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono text-[11px] font-black">
                {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')}
              </span>
            </p>
            <p className="text-[11px] text-slate-400">
              Total a abonar: <span className="text-cyan-400 font-mono font-bold">{formatearMoneda(compra.total)}</span> • Puedes retomar el pago o cancelar para liberar el stock a tu carrito.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onRetomar(compra)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 font-black text-xs shadow-md shadow-cyan-500/25 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>⚡ Retomar Pago</span>
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:border-rose-400 text-xs font-medium transition-all cursor-pointer"
          >
            <span>✕ Cancelar Reserva</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}

export default function ClientStoreScreen() {
  const { user, token } = useAuth();

  // ---------------------------------------------------------------------------
  // Estados de Datos
  // ---------------------------------------------------------------------------
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);

  // ---------------------------------------------------------------------------
  // Estados de Filtros y Búsqueda (con Debounce de 500ms)
  // ---------------------------------------------------------------------------
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');

  // ---------------------------------------------------------------------------
  // Estados del Carrito y Feedback UX
  // ---------------------------------------------------------------------------
  const [agregandoId, setAgregandoId] = useState(null);
  const [quitandoId, setQuitandoId] = useState(null);
  const [resumenCarrito, setResumenCarrito] = useState({ total_articulos: 0, items: [], monto_subtotal: 0 });
  const [carritoDrawerAbierto, setCarritoDrawerAbierto] = useState(false);
  const [checkoutModalAbierto, setCheckoutModalAbierto] = useState(false);
  const [toastNotificacion, setToastNotificacion] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // ---------------------------------------------------------------------------
  // Estado para Órdenes Pendientes de Pago en Curso (Reserva TTL de 30 min)
  // ---------------------------------------------------------------------------
  const [compraPendiente, setCompraPendiente] = useState(null);
  const [ordenParaRetomar, setOrdenParaRetomar] = useState(null);
  const [sincronizandoCheckout, setSincronizandoCheckout] = useState(false);
  const sincronizacionesPendientesRef = useRef({});

  // ---------------------------------------------------------------------------
  // Estado para Vista Grande / Modal de Especificaciones del Producto
  // ---------------------------------------------------------------------------
  const [productoDetalle, setProductoDetalle] = useState(null);
  const [fotoActivaIndex, setFotoActivaIndex] = useState(0);
  const [cantidadDetalle, setCantidadDetalle] = useState(1);

  // Auto-ocultar alerta de error temporal a los 15 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const timer = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(timer);
  }, [errorMessage]);

  // Auto-ocultar Toast de éxito a los 15 segundos
  useEffect(() => {
    if (!toastNotificacion) return undefined;
    const timer = setTimeout(() => setToastNotificacion(null), 15000);
    return () => clearTimeout(timer);
  }, [toastNotificacion]);

  // Debounce de 500ms para el input de búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 500);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // ---------------------------------------------------------------------------
  // Carga de Categorías
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const cargarCategorias = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/catalog/categorias/activas/`);
        setCategorias(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error al cargar categorías:', err);
      }
    };
    cargarCategorias();
  }, []);

  // ---------------------------------------------------------------------------
  // Consulta de Resumen del Carrito Activo
  // ---------------------------------------------------------------------------
  const refrescarCarrito = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/carrito/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setResumenCarrito(res.data || { total_articulos: 0, items: [], monto_subtotal: 0 });
    } catch (err) {
      console.warn('No se pudo cargar el resumen del carrito:', err);
    }
  }, [token]);

  useEffect(() => {
    refrescarCarrito();
  }, [refrescarCarrito]);

  // ---------------------------------------------------------------------------
  // Carga y Filtrado de Productos de la Tienda
  // ---------------------------------------------------------------------------
  const cargarProductos = useCallback(async () => {
    setCargando(true);
    try {
      const params = {};
      if (debouncedBusqueda.trim()) {
        params.search = debouncedBusqueda.trim();
      }
      if (categoriaSeleccionada) {
        params.id_categoria = categoriaSeleccionada;
      }

      const res = await axios.get(`${API_BASE_URL}/api/catalog/productos/`, { params });
      setProductos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar productos de la tienda:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
      setErrorMessage(msg || 'No fue posible cargar el catálogo de productos. Intente nuevamente.');
    } finally {
      setCargando(false);
    }
  }, [debouncedBusqueda, categoriaSeleccionada]);

  useEffect(() => {
    cargarProductos();
  }, [cargarProductos]);

  // ---------------------------------------------------------------------------
  // Sincronización Atómica del Carrito con Cantidad Absoluta y Debounce
  // ---------------------------------------------------------------------------
  const forzarSincronizacionCarrito = useCallback(async () => {
    const tareas = Object.values(sincronizacionesPendientesRef.current);
    if (tareas.length > 0) {
      await Promise.allSettled(tareas.map((t) => t.ejecutarAhora()));
      sincronizacionesPendientesRef.current = {};
    }
    await refrescarCarrito();
  }, [refrescarCarrito]);

  const actualizarCantidadItem = useCallback((idProducto, nuevaCantidad, productoInfo = null) => {
    if (!token) {
      setErrorMessage('Debes iniciar sesión para administrar tu carrito de compras.');
      return;
    }

    const cantidadObjetivo = Math.max(0, parseInt(nuevaCantidad, 10) || 0);

    // 1. Actualización Optimista Instantánea (0ms de latencia visual, sin trabas)
    setResumenCarrito((prev) => {
      const itemsPrev = Array.isArray(prev?.items) ? prev.items : [];
      let itemsCopia = [...itemsPrev];
      const idx = itemsCopia.findIndex((i) => i.id_producto === idProducto);

      if (cantidadObjetivo <= 0) {
        itemsCopia = itemsCopia.filter((i) => i.id_producto !== idProducto);
      } else if (idx >= 0) {
        const itemActual = itemsCopia[idx];
        const sub = cantidadObjetivo * Number(itemActual.precio_unitario || 0);
        itemsCopia[idx] = {
          ...itemActual,
          cantidad: cantidadObjetivo,
          subtotal: sub
        };
      } else if (productoInfo) {
        const precioUnitario = Number(
          productoInfo.tiene_descuento ? productoInfo.precio_final : productoInfo.precio_venta
        ) || 0;
        itemsCopia.push({
          id_item: `temp-${Date.now()}`,
          id_producto: idProducto,
          producto_nombre: productoInfo.nombre,
          producto_codigo: productoInfo.codigo_barras || '',
          cantidad: cantidadObjetivo,
          precio_unitario: precioUnitario,
          subtotal: cantidadObjetivo * precioUnitario,
          imagen_url: productoInfo.imagen_url || null
        });
      }

      const nuevoSubtotal = itemsCopia.reduce((acc, i) => acc + Number(i.subtotal || 0), 0);
      const nuevaCantTotal = itemsCopia.reduce((acc, i) => acc + Number(i.cantidad || 0), 0);

      return {
        ...prev,
        items: itemsCopia,
        monto_subtotal: nuevoSubtotal,
        total_articulos: nuevaCantTotal
      };
    });

    // 2. Control de Debounce de Red (250ms) por cada producto
    // Si el usuario clica varias veces rápido (+ o -), solo se envía el valor final
    if (sincronizacionesPendientesRef.current[idProducto]?.timerId) {
      clearTimeout(sincronizacionesPendientesRef.current[idProducto].timerId);
    }

    const ejecutarPeticion = async () => {
      delete sincronizacionesPendientesRef.current[idProducto];
      try {
        const res = await axios.post(
          `${API_BASE_URL}/api/sales/carrito/actualizar/`,
          {
            id_producto: idProducto,
            cantidad: cantidadObjetivo
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );
        return res.data;
      } catch (err) {
        console.error('Error al sincronizar cantidad en carrito:', err);
        const dataErr = err.response?.data;
        const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail;
        setErrorMessage(msg || 'No pudimos sincronizar la cantidad solicitada. Verificando disponibilidad...');
        await refrescarCarrito();
        throw err;
      }
    };

    const timerId = setTimeout(() => {
      ejecutarPeticion();
    }, 250);

    sincronizacionesPendientesRef.current[idProducto] = {
      timerId,
      cantidad: cantidadObjetivo,
      ejecutarAhora: () => {
        clearTimeout(timerId);
        return ejecutarPeticion();
      }
    };
  }, [token, refrescarCarrito]);

  const handleAgregarAlCarrito = async (producto, cantidadDeseada = 1) => {
    if (!producto || !producto.en_stock) return;

    if (!token) {
      setErrorMessage('Debes iniciar sesión para añadir productos a tu carrito.');
      return;
    }

    const cantidadFinal = Math.max(1, parseInt(cantidadDeseada, 10) || 1);
    const idProd = producto.id_producto;
    const precioUnitario = Number(producto.tiene_descuento ? producto.precio_final : producto.precio_venta) || 0;

    const itemsActuales = Array.isArray(resumenCarrito?.items) ? resumenCarrito.items : [];
    const itemExistente = itemsActuales.find((i) => i.id_producto === idProd);
    const cantidadPrevia = Number(itemExistente?.cantidad || 0);
    const nuevaCantidad = cantidadPrevia + cantidadFinal;

    actualizarCantidadItem(idProd, nuevaCantidad, producto);

    if (cantidadDeseada === 1 && !carritoDrawerAbierto) {
      setToastNotificacion({
        nombre: producto.nombre,
        mensaje: `¡${producto.nombre} agregado al carrito!`,
        precio: precioUnitario,
        cantidad: cantidadFinal
      });
    }
  };

  const handleQuitarDelCarrito = (idProducto, cantidadAQuitar = null) => {
    if (!token) return;

    if (cantidadAQuitar === null || cantidadAQuitar === undefined) {
      // Eliminar por completo
      actualizarCantidadItem(idProducto, 0);
      return;
    }

    const itemsActuales = Array.isArray(resumenCarrito?.items) ? resumenCarrito.items : [];
    const itemExistente = itemsActuales.find((i) => i.id_producto === idProducto);
    const cantidadPrevia = Number(itemExistente?.cantidad || 1);
    const nuevaCantidad = Math.max(0, cantidadPrevia - Number(cantidadAQuitar));

    actualizarCantidadItem(idProducto, nuevaCantidad);
  };

  // ---------------------------------------------------------------------------
  // Monitoreo de Compra Pendiente Activa (Reserva TTL de 30 min)
  // ---------------------------------------------------------------------------
  const consultarCompraPendiente = useCallback(async () => {
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/compras/virtual/pendiente-activa/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data?.tiene_pendiente && res.data?.venta) {
        setCompraPendiente(res.data.venta);
      } else {
        setCompraPendiente(null);
      }
    } catch (err) {
      // Silencioso
    }
  }, [token]);

  useEffect(() => {
    consultarCompraPendiente();
    const interval = setInterval(consultarCompraPendiente, 15000);
    return () => clearInterval(interval);
  }, [consultarCompraPendiente]);

  const handleCancelarOrdenDesdeBanner = async () => {
    if (!compraPendiente?.id_venta || !token) return;
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/compras/virtual/${compraPendiente.id_venta}/cancelar/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCompraPendiente(null);
      setOrdenParaRetomar(null);
      await refrescarCarrito();
      await cargarProductos();
      setToastNotificacion({
        nombre: 'Reserva Cancelada',
        mensaje: 'La orden fue cancelada y tus repuestos han vuelto a tu carrito.'
      });
      setCarritoDrawerAbierto(true);
    } catch (err) {
      setErrorMessage('No pudimos cancelar la reserva en este momento.');
    }
  };

  const handleCompraExitosa = async (datosVenta) => {
    setCompraPendiente(null);
    setOrdenParaRetomar(null);
    await refrescarCarrito();
    await cargarProductos();
    setToastNotificacion({
      nombre: 'Compra Confirmada',
      mensaje: '¡Tu orden virtual ha sido registrada con éxito!',
      precio: datosVenta?.total || datosVenta?.monto_subtotal
    });
  };

  const nombreCliente = useMemo(() => formatearNombreConInicial(user, 'Cliente'), [user]);

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra de Navegación Lateral (Rol Cliente) */}
      <AdminSidebar activeMenu="client-store" role="cliente" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        
        {/* Header Superior Cyber-Tech */}
        <header className="border-b border-slate-800 bg-[#1E293B]/85 backdrop-blur-md sticky top-0 z-30 shadow-md shadow-slate-950/20">
          <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            
            {/* Logo y Marca Oficial */}
            <div className="flex items-center gap-3">
              <img
                src={logoEmpresa}
                alt="Logo IFixPos"
                className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
              />
              <div>
                <span className="font-extrabold text-lg tracking-tight text-white">
                  IFix<span className="text-[#06B6D4]">Pos</span>
                </span>
                <span className="text-[10px] ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 uppercase font-mono tracking-widest hidden sm:inline-block">
                  Tienda Oficial
                </span>
              </div>
            </div>

            {/* Acciones de Cabecera: Botón de Carrito y Menú de Perfil */}
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Botón Carrito con Badge Reactivo */}
              <button
                type="button"
                onClick={() => setCarritoDrawerAbierto(true)}
                className="relative p-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 hover:border-cyan-500/40 text-slate-200 hover:text-cyan-400 transition-all active:scale-95 group"
                title="Ver carrito de compras"
              >
                <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>

                {resumenCarrito.total_articulos > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-lg shadow-cyan-500/40"
                  >
                    {resumenCarrito.total_articulos > 99 ? '99+' : resumenCarrito.total_articulos}
                  </motion.span>
                )}
              </button>

              {/* Menú Desplegable de Perfil */}
              <UserProfileDropdown align="right" />
            </div>

          </div>
        </header>

        {/* Banner Informativo y de Acción: Orden Pendiente de Pago Activa (TTL 30 Minutos) */}
        <AnimatePresence>
          {compraPendiente && (
            <BannerOrdenPendiente
              compra={compraPendiente}
              onRetomar={(c) => {
                setOrdenParaRetomar(c);
                setCheckoutModalAbierto(true);
              }}
              onCancelar={handleCancelarOrdenDesdeBanner}
              onExpirado={async () => {
                setCompraPendiente(null);
                setOrdenParaRetomar(null);
                await consultarCompraPendiente();
                await refrescarCarrito();
                await cargarProductos();
              }}
            />
          )}
        </AnimatePresence>

        {/* Sistema de Alertas Temporales de Error (Regla 6: 6 segundos con fade-out) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-4"
            >
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm flex items-center justify-between gap-3 shadow-lg shadow-rose-950/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage('')}
                  className="text-rose-400 hover:text-rose-200 transition-colors p-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Principal de la Tienda */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
          
          {/* Banner de Bienvenida Cyber-Tech */}
          <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-xl shadow-cyan-950/20">
            <div className="relative z-10 max-w-3xl">
              <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono border border-cyan-500/30 mb-3">
                Catálogo de Insumos & Repuestos Originales
              </span>
              <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight mb-2">
                ¡Hola, <span className="text-[#06B6D4]">{nombreCliente}</span>! <span className="text-cyan-400 font-normal">^-^</span>
              </h1>
              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Descubre repuestos originales con garantía certificada para tus dispositivos. Añade los productos a tu carrito virtual y coordina el retiro o envío asegurado a tu domicilio.
              </p>
            </div>
            <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-gradient-to-br from-cyan-500/15 to-violet-600/15 rounded-full blur-3xl pointer-events-none" />
          </div>

          {/* Barra Superior de Filtros Azul Pizarra (#1E293B) */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-xl relative backdrop-blur-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              
              {/* Buscador de Texto con Debounce de 500ms y Foco en Púrpura Eléctrico (#8B5CF6) */}
              <div className="md:col-span-7 relative">
                <label htmlFor="input-busqueda-tienda" className="sr-only">
                  Buscar producto
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    id="input-busqueda-tienda"
                    type="text"
                    value={textoBusqueda}
                    onChange={(e) => setTextoBusqueda(e.target.value)}
                    placeholder="Buscar por repuesto, pantalla, modelo o especificación técnica..."
                    className="w-full pl-11 pr-10 py-3 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all shadow-inner"
                  />
                  {textoBusqueda && (
                    <button
                      type="button"
                      onClick={() => setTextoBusqueda('')}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                      title="Limpiar búsqueda"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Selector de Categoría con Foco en Púrpura Eléctrico (#8B5CF6) */}
              <div className="md:col-span-3">
                <label htmlFor="select-categoria-tienda" className="sr-only">
                  Filtrar por categoría
                </label>
                <select
                  id="select-categoria-tienda"
                  value={categoriaSeleccionada}
                  onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer shadow-inner"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat.id_categoria} value={cat.id_categoria}>
                      {cat.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Botón Reset / Estado de Resultados */}
              <div className="md:col-span-2 flex items-center justify-between md:justify-end gap-2">
                {(textoBusqueda || categoriaSeleccionada) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTextoBusqueda('');
                      setCategoriaSeleccionada('');
                    }}
                    className="px-3.5 py-3 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 transition-all"
                  >
                    Limpiar
                  </button>
                )}
                <span className="text-xs font-mono text-cyan-400/90 whitespace-nowrap">
                  {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
                </span>
              </div>

            </div>
          </section>

          {/* Grilla Principal de Productos (Responsive Grid) */}
          {cargando ? (
            /* Skeleton Loading Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[...Array(8)].map((_, idx) => (
                <div
                  key={idx}
                  className="bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden animate-pulse flex flex-col"
                >
                  <div className="h-48 bg-slate-800/80 w-full" />
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-slate-800 rounded-full" />
                      <div className="h-5 w-3/4 bg-slate-800 rounded-md" />
                      <div className="h-3 w-full bg-slate-800/60 rounded" />
                    </div>
                    <div className="space-y-3 pt-3 border-t border-slate-800/60">
                      <div className="h-6 w-28 bg-slate-800 rounded" />
                      <div className="h-10 w-full bg-slate-800 rounded-xl" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : productos.length === 0 ? (
            /* Estado Vacío cuando no coinciden filtros */
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-[#1E293B]/70 border border-slate-700/80 rounded-2xl p-12 text-center max-w-xl mx-auto shadow-2xl backdrop-blur-sm"
            >
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">No se encontraron productos</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">
                No hay coincidencias para los filtros aplicados. Intenta buscar con otros términos o seleccionar otra categoría.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTextoBusqueda('');
                  setCategoriaSeleccionada('');
                }}
                className="px-5 py-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-sm font-semibold transition-all"
              >
                Restablecer Filtros
              </button>
            </motion.div>
          ) : (
            /* Grid Responsivo de Tarjetas de Producto - Vista Pequeña */
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {productos.map((prod) => {
                const imagenSrc = obtenerImagenProducto(prod);
                const estaAgotado = !prod.en_stock;

                return (
                  <motion.div
                    key={prod.id_producto}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    onClick={() => {
                      setProductoDetalle(prod);
                      setFotoActivaIndex(0);
                      setCantidadDetalle(1);
                    }}
                    className={`bg-[#1E293B] border border-slate-700/70 hover:border-cyan-400/80 rounded-2xl overflow-hidden flex flex-col justify-between transition-all duration-300 hover:shadow-[0_12px_32px_rgba(6,182,212,0.22)] hover:-translate-y-1.5 cursor-pointer group ${
                      estaAgotado ? 'opacity-65 grayscale-[25%]' : ''
                    }`}
                  >
                    {/* Foto representativa única (1 sola foto) */}
                    <div className="relative h-56 w-full bg-slate-900 overflow-hidden">
                      <img
                        src={imagenSrc}
                        alt={prod.nombre}
                        loading="lazy"
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80';
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1E293B] via-transparent to-black/20 pointer-events-none" />

                      {/* Badge discreto si el producto cuenta con descuento especial */}
                      {prod.tiene_descuento && (
                        <div className="absolute top-3 left-3">
                          <span className="px-2.5 py-1 rounded-full bg-violet-600/50 backdrop-blur-md text-violet-200 border border-violet-400/60 text-[11px] font-black tracking-wide shadow-lg animate-pulse">
                            -{Math.round(prod.porcentaje_descuento)}% OFF
                          </span>
                        </div>
                      )}

                      {/* Estado de stock en esquina */}
                      <div className="absolute top-3 right-3">
                        {prod.en_stock ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-950/70 backdrop-blur-md text-emerald-400 text-[10px] font-medium border border-emerald-500/30 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Disponible
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-950/70 backdrop-blur-md text-rose-400 text-[10px] font-medium border border-rose-500/30">
                            Agotado
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Título o nombre del producto */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <h2 className="text-[#F8FAFC] font-bold text-base line-clamp-2 group-hover:text-cyan-300 transition-colors leading-snug">
                        {prod.nombre}
                      </h2>
                      <div className="pt-2 border-t border-slate-700/50 flex items-center justify-between text-xs text-cyan-400/90 font-medium">
                        <span className="group-hover:text-cyan-300 transition-colors">Ver especificaciones</span>
                        <svg className="w-4 h-4 transform group-hover:translate-x-1 transition-transform text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

        </main>
      </div>

      {/* ===================================================================== */}
      {/* Modal Expandido de Especificaciones Técnicas y Galería de Producto   */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {productoDetalle && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-5 md:p-8 selection:bg-cyan-500/30 selection:text-cyan-200">
            {/* Backdrop oscuro con desenfoque */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setProductoDetalle(null)}
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
            />

            {/* Contenedor del Modal Expandido */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.25 }}
              className="relative w-full max-w-5xl bg-[#1E293B] border border-cyan-500/40 rounded-3xl shadow-2xl shadow-cyan-950/60 overflow-hidden my-auto z-10 flex flex-col lg:flex-row max-h-[92vh]"
            >
              {/* Botón de Cierre Flotante en Esquina Superior Derecha */}
              <button
                type="button"
                onClick={() => setProductoDetalle(null)}
                className="absolute top-4 right-4 z-20 p-2.5 rounded-2xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 transition-colors shadow-lg cursor-pointer"
                title="Cerrar vista detallada"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              {/* Columna Izquierda: Galería de Imágenes vinculadas */}
              <div className="lg:w-1/2 bg-slate-900/90 p-5 sm:p-6 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-700/80 overflow-y-auto">
                {(() => {
                  const galeria = obtenerGaleriaImagenes(productoDetalle);
                  const fotoActiva = galeria[fotoActivaIndex] || galeria[0] || obtenerImagenProducto(productoDetalle);

                  return (
                    <div className="space-y-4">
                      {/* Imagen Principal Activa */}
                      <div className="relative w-full h-64 sm:h-80 md:h-96 rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group shadow-inner">
                        <img
                          src={fotoActiva}
                          alt={productoDetalle.nombre}
                          className="w-full h-full object-contain p-2 transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80';
                          }}
                        />

                        {/* Indicador de Descuento si aplica */}
                        {productoDetalle.tiene_descuento && (
                          <div className="absolute top-3 left-3">
                            <span className="px-3 py-1 rounded-full bg-violet-600/90 text-white font-black text-xs shadow-lg shadow-violet-900/40 border border-violet-400/50 animate-pulse">
                              -{Math.round(productoDetalle.porcentaje_descuento)}% OFF
                            </span>
                          </div>
                        )}

                        {/* Contador de Fotos */}
                        {galeria.length > 1 && (
                          <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-slate-950/80 backdrop-blur-md text-[11px] font-mono text-cyan-300 border border-cyan-500/30">
                            {fotoActivaIndex + 1} / {galeria.length} fotos
                          </div>
                        )}
                      </div>

                      {/* Miniaturas de la Galería (si hay más de 1 imagen) */}
                      {galeria.length > 1 && (
                        <div>
                          <p className="text-xs font-mono text-slate-400 mb-2">Galería de fotos del producto:</p>
                          <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                            {galeria.map((imgUrl, idx) => {
                              const estaSeleccionada = idx === fotoActivaIndex;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => setFotoActivaIndex(idx)}
                                  className={`relative w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer bg-slate-950 ${
                                    estaSeleccionada
                                      ? 'border-cyan-400 ring-2 ring-cyan-500/40 scale-105 shadow-md shadow-cyan-950/40'
                                      : 'border-slate-700/80 hover:border-slate-500 opacity-70 hover:opacity-100'
                                  }`}
                                >
                                  <img
                                    src={imgUrl}
                                    alt={`Miniatura ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.target.onerror = null;
                                      e.target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80';
                                    }}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Columna Derecha: Especificaciones Técnicas, Detalle del Administrador y Compra */}
              <div className="lg:w-1/2 p-6 sm:p-8 flex flex-col justify-between overflow-y-auto space-y-6">
                <div className="space-y-5">
                  {/* Categoría y Estado de Stock */}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-medium">
                      {productoDetalle.categoria_nombre || 'General'}
                    </span>
                    {productoDetalle.en_stock ? (
                      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        En stock ({productoDetalle.stock_disponible} disponibles)
                      </span>
                    ) : (
                      <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-400" />
                        Agotado temporalmente
                      </span>
                    )}
                  </div>

                  {/* Título Principal */}
                  <h1 className="text-xl sm:text-2xl font-black text-[#F8FAFC] tracking-tight leading-snug">
                    {productoDetalle.nombre}
                  </h1>

                  {/* Grilla de Especificaciones Técnicas (Marca, Modelo, Tipo de Dispositivo) */}
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700/70 space-y-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-bold block">
                      Especificaciones Técnicas
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      {/* Marca */}
                      <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">Marca</span>
                        <span className="text-white font-semibold text-sm truncate block mt-0.5">
                          {productoDetalle.marca_nombre || 'No especificada'}
                        </span>
                      </div>

                      {/* Modelo */}
                      <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">Modelo</span>
                        <span className="text-cyan-300 font-semibold text-sm truncate block mt-0.5">
                          {productoDetalle.modelo_nombre || 'Universal / Compatible'}
                        </span>
                      </div>

                      {/* Tipo de Dispositivo */}
                      <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                        <span className="text-slate-400 text-[10px] uppercase font-mono block">Tipo Dispositivo</span>
                        <span className="text-violet-300 font-semibold text-sm truncate block mt-0.5">
                          {productoDetalle.tipo_dispositivo_nombre || 'No especificado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Detalle colocado por el Administrador */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold block">
                      Detalle y Observaciones
                    </span>
                    <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-300 text-xs sm:text-sm leading-relaxed whitespace-pre-line">
                      {productoDetalle.descripcion ? productoDetalle.descripcion : 'Este artículo cuenta con garantía oficial y certificación de calidad de IFixPos.'}
                    </div>
                  </div>

                  {/* Precio y Descuento */}
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900/90 to-slate-900/40 border border-slate-700/70 space-y-2">
                    <div className="flex items-baseline justify-between gap-4 flex-wrap">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono block">
                          Precio de Venta
                        </span>
                        {productoDetalle.tiene_descuento ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 line-through text-sm sm:text-base font-semibold">
                                {formatearMoneda(productoDetalle.precio_venta)}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-violet-600/30 text-violet-300 border border-violet-500/40 text-[10px] font-bold">
                                -{Math.round(productoDetalle.porcentaje_descuento)}% OFF
                              </span>
                            </div>
                            <span className="text-2xl sm:text-3xl font-black text-[#06B6D4] tracking-tight block">
                              {formatearMoneda(productoDetalle.precio_final)}
                            </span>
                            {productoDetalle.motivo_descuento && (
                              <p className="text-[11px] text-cyan-300/80 font-mono">
                                ✨ {productoDetalle.motivo_descuento}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-2xl sm:text-3xl font-black text-[#06B6D4] tracking-tight block">
                            {formatearMoneda(productoDetalle.precio_venta)}
                          </span>
                        )}
                      </div>

                      {/* Selector de Cantidad */}
                      {productoDetalle.en_stock && (
                        <div className="space-y-1">
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono block text-right">
                            Cantidad
                          </span>
                          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-xl p-1 shadow-inner">
                            <button
                              type="button"
                              onClick={() => setCantidadDetalle((prev) => Math.max(1, prev - 1))}
                              disabled={cantidadDetalle <= 1}
                              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                            >
                              -
                            </button>
                            <span className="w-10 text-center font-bold text-white text-sm font-mono">
                              {cantidadDetalle}
                            </span>
                            <button
                              type="button"
                              onClick={() => setCantidadDetalle((prev) => Math.min(productoDetalle.stock_disponible, prev + 1))}
                              disabled={cantidadDetalle >= productoDetalle.stock_disponible}
                              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold flex items-center justify-center transition-colors cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Acciones de Compra */}
                <div className="pt-4 border-t border-slate-700/60 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setProductoDetalle(null)}
                    className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold text-sm transition-all cursor-pointer"
                  >
                    Cerrar
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      await handleAgregarAlCarrito(productoDetalle, cantidadDetalle);
                      setProductoDetalle(null);
                    }}
                    disabled={!productoDetalle.en_stock || agregandoId === productoDetalle.id_producto}
                    className={`flex-1 py-3 px-6 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer ${
                      !productoDetalle.en_stock
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                        : 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/25 active:scale-[0.98]'
                    }`}
                  >
                    {agregandoId === productoDetalle.id_producto ? (
                      <>
                        <svg className="animate-spin w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span>Añadiendo al carrito...</span>
                      </>
                    ) : !productoDetalle.en_stock ? (
                      <span>Artículo Agotado</span>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <span>Añadir al Carrito ({cantidadDetalle})</span>
                      </>
                    )}
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* Drawer Lateral del Carrito de Compras (Slide-over Cyber-Tech)          */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {carritoDrawerAbierto && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop oscuro */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setCarritoDrawerAbierto(false)}
              className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            />

            <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                className="w-screen max-w-md bg-[#1E293B] border-l border-slate-700 shadow-2xl flex flex-col justify-between"
              >
                {/* Cabecera del Drawer */}
                <div className="p-6 border-b border-slate-700/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Mi Carrito de Compras</h2>
                      <span className="text-xs text-slate-400 font-mono">
                        {resumenCarrito.total_articulos} {resumenCarrito.total_articulos === 1 ? 'artículo' : 'artículos'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCarritoDrawerAbierto(false)}
                    className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Lista de Ítems en el Carrito */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  {resumenCarrito.items.length === 0 ? (
                    <div className="text-center py-16 space-y-3">
                      <div className="w-16 h-16 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-500">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <p className="text-slate-300 font-medium">Tu carrito está vacío</p>
                      <p className="text-slate-400 text-xs">
                        Explora los productos de la tienda y agrégalos con un clic.
                      </p>
                    </div>
                  ) : (
                    resumenCarrito.items.map((item) => {
                      const estaProcesando = quitandoId === item.id_producto || agregandoId === item.id_producto;
                      return (
                        <div
                          key={item.id_carrito_producto}
                          className="p-4 rounded-xl bg-slate-900/70 border border-slate-700/60 flex items-center justify-between gap-3 shadow-inner hover:border-slate-600 transition-all"
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <h3 className="text-white text-sm font-semibold truncate" title={item.producto_nombre}>
                              {item.producto_nombre}
                            </h3>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                              <span>{formatearMoneda(item.precio_unitario)} c/u</span>
                              <span>•</span>
                              <span className="text-white font-mono font-bold">
                                Subtotal: {formatearMoneda(item.subtotal)}
                              </span>
                            </div>

                            {/* Controles de Cantidad (+ / -) con Optimistic UI */}
                            <div className="flex items-center gap-2 pt-1">
                              <div className="inline-flex items-center bg-slate-950/80 rounded-lg border border-slate-800 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => actualizarCantidadItem(item.id_producto, Math.max(0, Number(item.cantidad || 1) - 1), item)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-bold active:scale-95 cursor-pointer"
                                  title="Disminuir una unidad"
                                >
                                  -
                                </button>
                                <span className="w-8 text-center font-mono font-bold text-xs text-cyan-300">
                                  {item.cantidad}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => actualizarCantidadItem(item.id_producto, Number(item.cantidad || 1) + 1, item)}
                                  className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs font-bold active:scale-95 cursor-pointer"
                                  title="Añadir una unidad"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Botón Quitar Totalmente del Carrito */}
                          <div className="flex flex-col items-end justify-between h-full shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => actualizarCantidadItem(item.id_producto, 0, item)}
                              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all active:scale-90 cursor-pointer"
                              title="Quitar producto del carrito"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                            <span className="text-xs font-black text-cyan-400 font-mono">
                              {formatearMoneda(item.subtotal)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Pie del Drawer con Subtotal y Botón de Checkout */}
                {resumenCarrito.items.length > 0 && (
                  <div className="p-6 border-t border-slate-700/80 bg-slate-900/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300 font-medium">Subtotal Estimado:</span>
                      <span className="text-xl font-black text-[#06B6D4]">
                        {formatearMoneda(resumenCarrito.monto_subtotal)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-tight">
                      * El costo de flete se determinará en el paso de checkout si optas por entrega a domicilio.
                    </p>

                    <button
                      type="button"
                      disabled={sincronizandoCheckout}
                      onClick={async () => {
                        setSincronizandoCheckout(true);
                        try {
                          await forzarSincronizacionCarrito();
                          setCarritoDrawerAbierto(false);
                          setCheckoutModalAbierto(true);
                        } catch (err) {
                          console.error('Error al preparar orden:', err);
                        } finally {
                          setSincronizandoCheckout(false);
                        }
                      }}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {sincronizandoCheckout ? (
                        <>
                          <svg className="animate-spin w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Verificando tu carrito...</span>
                        </>
                      ) : (
                        <>
                          <span>Continuar con la Compra</span>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </>
                      )}
                    </button>

                  </div>
                )}

              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* Toast / Notificación Flotante Elegante (Fade-in/out solicitado)       */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {toastNotificacion && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className="bg-[#1E293B] border border-cyan-500/40 rounded-2xl p-4 shadow-2xl shadow-cyan-950/40 backdrop-blur-md flex items-center gap-3.5 text-left">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-bold truncate">
                  {toastNotificacion.mensaje}
                </p>
                {toastNotificacion.precio && (
                  <p className="text-xs text-cyan-400 font-mono font-medium">
                    {formatearMoneda(toastNotificacion.precio)}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => setToastNotificacion(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1"
                title="Cerrar notificación"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* Modal de Checkout Virtual (CU-18)                                     */}
      {/* ===================================================================== */}
      <CheckoutModal
        isOpen={checkoutModalAbierto}
        onClose={() => {
          setCheckoutModalAbierto(false);
          setOrdenParaRetomar(null);
        }}
        itemsCarrito={resumenCarrito.items || []}
        montoSubtotal={resumenCarrito.monto_subtotal || 0}
        onCompraCompletada={handleCompraExitosa}
        onOrdenCancelada={async (abrirCarrito = false) => {
          setCompraPendiente(null);
          setSegundosPendiente(0);
          setOrdenParaRetomar(null);
          await refrescarCarrito();
          await cargarProductos();
          if (abrirCarrito) {
            setCarritoDrawerAbierto(true);
            setToastNotificacion({
              nombre: 'Retorno al Carrito',
              mensaje: 'La reserva fue cancelada. Tus artículos siguen en el carrito para que sigas comprando.'
            });
          }
        }}
        onRetornarAlCarrito={() => {
          setCarritoDrawerAbierto(true);
        }}
        ordenParaRetomar={ordenParaRetomar}
        onOrdenCerradaConPendiente={(venta) => {
          setOrdenParaRetomar(venta);
          consultarCompraPendiente();
        }}
      />

    </div>
  );
}

