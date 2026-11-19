import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import SupplierModal from '../../components/purchases/SupplierModal';
import DetalleSolicitudModal from '../../components/purchases/DetalleSolicitudModal';
import ModificarSolicitudModal from '../../components/purchases/ModificarSolicitudModal';
import ConfirmarEliminacionSolicitudModal from '../../components/purchases/ConfirmarEliminacionSolicitudModal';
import RegistrarProductoModal from '../../components/inventory/RegistrarProductoModal';

import { API_BASE_URL } from '../../config/api';
export default function AdminQuotationsScreen() {
  const { token } = useAuth();
  const navigate = useNavigate();

  // ---------------------------------------------------------------------------
  // Estados principales (Listado e Historial de Solicitudes)
  // ---------------------------------------------------------------------------
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);

  // CU-41: Parámetros y Filtros de Búsqueda de Solicitudes de Cotización
  const [filtroIdSolicitud, setFiltroIdSolicitud] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('');
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');

  // CU-15: Consultar Solicitud de Cotización
  const [solicitudDetalle, setSolicitudDetalle] = useState(null);
  const [modalDetalleAbierto, setModalDetalleAbierto] = useState(false);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  // CU-16: Modificar Solicitud de Cotización
  const [solicitudEditando, setSolicitudEditando] = useState(null);
  const [modalModificarAbierto, setModalModificarAbierto] = useState(false);

  // CU-17: Eliminar Solicitud de Cotización
  const [solicitudAEliminar, setSolicitudAEliminar] = useState(null);
  const [eliminandoSolicitud, setEliminandoSolicitud] = useState(false);

  // Catálogos auxiliares para confección de solicitud
  const [proveedoresPadron, setProveedoresPadron] = useState([]);
  const [productosCatalogo, setProductosCatalogo] = useState([]);
  const [paises, setPaises] = useState([]);
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(false);

  // ---------------------------------------------------------------------------
  // Estados del Modal de Nueva Solicitud de Cotización (Wizard 2 pasos + Confirmación)
  // ---------------------------------------------------------------------------
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pasoModalSolicitud, setPasoModalSolicitud] = useState(1); // 1: Insumos | 2: Proveedores
  const [confirmandoEmision, setConfirmandoEmision] = useState(false);
  const [procesandoEnvio, setProcesandoEnvio] = useState(false);

  // Selección de Proveedores Destinatarios (Paso 2)
  const [busquedaProveedorModal, setBusquedaProveedorModal] = useState('');
  const [filtroEstadoProveedorModal, setFiltroEstadoProveedorModal] = useState('ACTIVOS'); // 'ACTIVOS' | 'TODOS'
  const [proveedoresSeleccionados, setProveedoresSeleccionados] = useState([]); // Array de cuit_prov

  // Selección de Insumos / Repuestos (Paso 1)
  const [busquedaInsumoModal, setBusquedaInsumoModal] = useState('');
  const [filtroCategoriaInsumoModal, setFiltroCategoriaInsumoModal] = useState('');
  const [filtroStockInsumoModal, setFiltroStockInsumoModal] = useState('TODOS'); // 'TODOS' | 'BAJO' | 'SIN_STOCK'
  const [insumoSeleccionadoId, setInsumoSeleccionadoId] = useState('');
  const [itemsSolicitados, setItemsSolicitados] = useState([]);

  // Excepción Paso 4: Carga manual de datos técnicos básicos (Marca, Modelo, Descripción)
  const [mostrarCargaManual, setMostrarCargaManual] = useState(false);
  const [manualMarca, setManualMarca] = useState('');
  const [manualModelo, setManualModelo] = useState('');
  const [manualDescripcion, setManualDescripcion] = useState('');

  // Excepción Paso 4: Derivación a modales formales (Registrar Producto / Registrar Proveedor)
  const [modalNuevoProductoAbierto, setModalNuevoProductoAbierto] = useState(false);
  const [modalNuevoProveedorAbierto, setModalNuevoProveedorAbierto] = useState(false);
  const [nombreProveedorSugerido, setNombreProveedorSugerido] = useState('');

  // Alertas y notificaciones (Auto-cierre en 6 segundos según Regla 6)
  const [errorBanner, setErrorBanner] = useState('');
  const [errorModal, setErrorModal] = useState('');
  const [exitoBanner, setExitoBanner] = useState('');

  useEffect(() => {
    if (!errorBanner) return undefined;
    const timer = setTimeout(() => setErrorBanner(''), 6000);
    return () => clearTimeout(timer);
  }, [errorBanner]);

  useEffect(() => {
    if (!errorModal) return undefined;
    const timer = setTimeout(() => setErrorModal(''), 6000);
    return () => clearTimeout(timer);
  }, [errorModal]);

  useEffect(() => {
    if (!exitoBanner) return undefined;
    const timer = setTimeout(() => setExitoBanner(''), 6000);
    return () => clearTimeout(timer);
  }, [exitoBanner]);

  // CU-41: Verificación de filtros activos
  const hayFiltrosActivos = useMemo(() => {
    return (
      filtroIdSolicitud.trim() !== '' ||
      filtroEstado !== 'TODOS' ||
      filtroFechaDesde.trim() !== '' ||
      filtroFechaHasta.trim() !== '' ||
      busquedaProducto.trim() !== ''
    );
  }, [filtroIdSolicitud, filtroEstado, filtroFechaDesde, filtroFechaHasta, busquedaProducto]);

  // ---------------------------------------------------------------------------
  // Carga y Filtrado de Solicitudes de Cotización (CU-41)
  // ---------------------------------------------------------------------------
  const cargarSolicitudes = useCallback(async (filtrosOverride = null) => {
    if (!token) return;

    const idSolVal = filtrosOverride?.idSolicitud !== undefined ? filtrosOverride.idSolicitud : filtroIdSolicitud;
    const estVal = filtrosOverride?.estado !== undefined ? filtrosOverride.estado : filtroEstado;
    const fDesdeVal = filtrosOverride?.fechaDesde !== undefined ? filtrosOverride.fechaDesde : filtroFechaDesde;
    const fHastaVal = filtrosOverride?.fechaHasta !== undefined ? filtrosOverride.fechaHasta : filtroFechaHasta;
    const prodVal = filtrosOverride?.producto !== undefined ? filtrosOverride.producto : busquedaProducto;

    // Paso 4 y Excepción Paso 4: Validación lógica de parámetros
    if (idSolVal && idSolVal.trim()) {
      const limpioId = idSolVal.trim();
      if (!/^\d+$/.test(limpioId) || parseInt(limpioId, 10) <= 0) {
        setErrorBanner('El Número de Solicitud debe ser un valor numérico entero positivo.');
        return;
      }
    }

    if (fDesdeVal && fHastaVal && fDesdeVal > fHastaVal) {
      setErrorBanner('La fecha inicial (Desde) no puede ser posterior a la fecha final (Hasta).');
      return;
    }

    setCargando(true);
    try {
      const params = {};
      if (idSolVal && idSolVal.trim()) {
        params.id_solicitud = parseInt(idSolVal.trim(), 10);
      }
      if (estVal !== 'TODOS') {
        params.estado_solicitud = Number(estVal);
      }
      if (fDesdeVal) {
        params.fecha_desde = fDesdeVal;
      }
      if (fHastaVal) {
        params.fecha_hasta = fHastaVal;
      }
      if (prodVal && prodVal.trim()) {
        params.buscar_producto = prodVal.trim();
      }

      const res = await axios.get(`${API_BASE_URL}/api/purchases/solicitudes-cotizacion/filtrar/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      setSolicitudes(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No se pudo cargar el listado de solicitudes de cotización.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (Array.isArray(data?.error)) {
        msg = data.error[0];
      } else if (data?.detail) {
        msg = data.detail;
      } else if (data && typeof data === 'object') {
        const firstVal = Object.values(data)[0];
        if (Array.isArray(firstVal)) msg = firstVal[0];
        else if (typeof firstVal === 'string') msg = firstVal;
      }
      setErrorBanner(msg);
    } finally {
      setCargando(false);
    }
  }, [token, filtroIdSolicitud, filtroEstado, filtroFechaDesde, filtroFechaHasta, busquedaProducto]);

  useEffect(() => {
    cargarSolicitudes();
  }, [token]);

  const handleLimpiarFiltros = () => {
    setFiltroIdSolicitud('');
    setFiltroEstado('TODOS');
    setFiltroFechaDesde('');
    setFiltroFechaHasta('');
    setBusquedaProducto('');
    setErrorBanner('');
    cargarSolicitudes({
      idSolicitud: '',
      estado: 'TODOS',
      fechaDesde: '',
      fechaHasta: '',
      producto: ''
    });
  };

  const handleAplicarFiltros = (e) => {
    if (e) e.preventDefault();
    setErrorBanner('');
    cargarSolicitudes();
  };

  // ---------------------------------------------------------------------------
  // Carga de Padrón de Proveedores y Catálogo de Productos
  // ---------------------------------------------------------------------------
  const cargarDatosAuxiliares = useCallback(async () => {
    if (!token) return;
    setCargandoAuxiliares(true);
    try {
      const [resProveedores, resProductos, resPaises] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/purchases/proveedores/`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/inventory/stock/`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_BASE_URL}/api/geo/paises/`, {
          headers: { Authorization: `Bearer ${token}` }
        }).catch(() => ({ data: [] }))
      ]);

      setProveedoresPadron(Array.isArray(resProveedores.data) ? resProveedores.data : []);
      setProductosCatalogo(Array.isArray(resProductos.data) ? resProductos.data : []);
      setPaises(Array.isArray(resPaises.data) ? resPaises.data : []);
    } catch {
      setErrorModal('No fue posible cargar el catálogo de productos o el padrón de proveedores.');
    } finally {
      setCargandoAuxiliares(false);
    }
  }, [token]);

  // ---------------------------------------------------------------------------
  // Apertura y Reinicio del Formulario de Confección (Paso 1 y 2)
  // ---------------------------------------------------------------------------
  const abrirModalNuevaSolicitud = () => {
    setPasoModalSolicitud(1);
    setProveedoresSeleccionados([]);
    setBusquedaProveedorModal('');
    setFiltroEstadoProveedorModal('ACTIVOS');
    setItemsSolicitados([]);
    setBusquedaInsumoModal('');
    setFiltroCategoriaInsumoModal('');
    setFiltroStockInsumoModal('TODOS');
    setInsumoSeleccionadoId('');
    setMostrarCargaManual(false);
    setManualMarca('');
    setManualModelo('');
    setManualDescripcion('');
    setConfirmandoEmision(false);
    setErrorModal('');
    setModalAbierto(true);
    cargarDatosAuxiliares();
  };

  const cerrarModalNuevaSolicitud = () => {
    if (procesandoEnvio) return;
    setModalAbierto(false);
    setPasoModalSolicitud(1);
    setConfirmandoEmision(false);
    setErrorModal('');
  };

  // ---------------------------------------------------------------------------
  // Lógica de Selección y Validación de Proveedores (Paso 2)
  // ---------------------------------------------------------------------------
  const proveedoresFiltradosModal = useMemo(() => {
    const q = busquedaProveedorModal.trim().toLowerCase();
    return proveedoresPadron.filter((p) => {
      if (filtroEstadoProveedorModal === 'ACTIVOS' && !p.estado) return false;
      if (!q) return true;
      return (
        (p.nombre_proveedor || '').toLowerCase().includes(q) ||
        (p.cuit_prov || '').toLowerCase().includes(q) ||
        (p.correo || '').toLowerCase().includes(q)
      );
    });
  }, [proveedoresPadron, busquedaProveedorModal, filtroEstadoProveedorModal]);

  const seleccionarTodosProveedoresActivos = () => {
    const cuitsActivos = proveedoresFiltradosModal
      .filter((p) => p.estado)
      .map((p) => p.cuit_prov);
    setProveedoresSeleccionados((prev) => Array.from(new Set([...prev, ...cuitsActivos])));
  };

  const objetosProveedoresSeleccionados = useMemo(() => {
    return proveedoresSeleccionados
      .map((cuit) => proveedoresPadron.find((p) => p.cuit_prov === cuit))
      .filter(Boolean);
  }, [proveedoresSeleccionados, proveedoresPadron]);

  const proveedoresInactivosSeleccionados = useMemo(() => {
    return objetosProveedoresSeleccionados.filter((p) => !p.estado);
  }, [objetosProveedoresSeleccionados]);

  const toggleSeleccionProveedor = (cuitProv) => {
    setErrorModal('');
    setProveedoresSeleccionados((prev) =>
      prev.includes(cuitProv) ? prev.filter((c) => c !== cuitProv) : [...prev, cuitProv]
    );
  };

  const quitarProveedoresInactivos = () => {
    const inactivosCuits = new Set(proveedoresInactivosSeleccionados.map((p) => p.cuit_prov));
    setProveedoresSeleccionados((prev) => prev.filter((cuit) => !inactivosCuits.has(cuit)));
    setErrorModal('');
  };

  // ---------------------------------------------------------------------------
  // Lógica de Selección y Carga de Insumos / Repuestos (Paso 1)
  // ---------------------------------------------------------------------------
  const categoriasInsumosModal = useMemo(() => {
    const setCats = new Set();
    productosCatalogo.forEach((p) => {
      if (p.estado !== false) {
        const cat = p.nombre_categoria || p.categoria;
        if (cat) setCats.add(cat);
      }
    });
    return Array.from(setCats).sort((a, b) => a.localeCompare(b));
  }, [productosCatalogo]);

  const productosFiltradosModal = useMemo(() => {
    const q = busquedaInsumoModal.trim().toLowerCase();
    return productosCatalogo.filter((p) => {
      if (p.estado === false) return false;
      const cat = p.nombre_categoria || p.categoria || '';
      if (filtroCategoriaInsumoModal && cat !== filtroCategoriaInsumoModal) return false;
      const stockAct = Number(p.cantidad_actual ?? 0);
      const stockMin = Number(p.stock_minimo ?? 5);
      if (filtroStockInsumoModal === 'SIN_STOCK' && stockAct > 0) return false;
      if (filtroStockInsumoModal === 'BAJO' && stockAct > stockMin) return false;
      if (!q) return true;
      return (
        (p.nombre || '').toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q)
      );
    });
  }, [productosCatalogo, busquedaInsumoModal, filtroCategoriaInsumoModal, filtroStockInsumoModal]);

  const agregarInsumoDeCatalogo = (productoObj) => {
    setErrorModal('');
    if (!productoObj) {
      setErrorModal('Seleccione un insumo o repuesto válido del catálogo.');
      return;
    }

    const idProd = productoObj.id_producto;
    setItemsSolicitados((prev) => {
      const yaExiste = prev.some((item) => !item.es_manual && item.id_producto === idProd);
      if (yaExiste) {
        return prev;
      }
      return [
        ...prev,
        {
          uid: `cat-${idProd}`,
          es_manual: false,
          id_producto: idProd,
          nombre_mostrar: productoObj.nombre,
          detalle_mostrar: productoObj.nombre_categoria || productoObj.categoria || 'Catálogo General'
        }
      ];
    });

    setInsumoSeleccionadoId('');
  };

  const agregarInsumoManualSondeo = () => {
    setErrorModal('');
    const marcaLimpia = manualMarca.trim();
    const modeloLimpio = manualModelo.trim();
    const descLimpia = manualDescripcion.trim();

    if (!marcaLimpia || !modeloLimpio || !descLimpia) {
      setErrorModal(
        'Para la carga manual del insumo debe completar obligatoriamente Marca, Modelo y Descripción técnica.'
      );
      return;
    }

    setItemsSolicitados((prev) => [
      ...prev,
      {
        uid: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        es_manual: true,
        marca: marcaLimpia,
        modelo: modeloLimpio,
        descripcion: descLimpia,
        nombre_mostrar: `${marcaLimpia} ${modeloLimpio} — ${descLimpia}`,
        detalle_mostrar: `Sondeo Manual • Marca: ${marcaLimpia} | Modelo: ${modeloLimpio}`
      }
    ]);

    setManualMarca('');
    setManualModelo('');
    setManualDescripcion('');
    setMostrarCargaManual(false);
  };

  const eliminarItemSolicitado = (uid) => {
    setItemsSolicitados((prev) => prev.filter((item) => item.uid !== uid));
  };

  // ---------------------------------------------------------------------------
  // Validación del Formulario (Paso 4 y Excepciones Paso 4)
  // ---------------------------------------------------------------------------
  const validarConfeccionSolicitud = () => {
    if (proveedoresSeleccionados.length === 0) {
      setErrorModal('Debe seleccionar al menos un proveedor destinatario para la solicitud.');
      return false;
    }

    if (proveedoresInactivosSeleccionados.length > 0) {
      const nombresInactivos = proveedoresInactivosSeleccionados
        .map((p) => p.nombre_proveedor)
        .join(', ');
      setErrorModal(
        `Operación bloqueada: Los siguientes proveedores seleccionados se encuentran inactivos (${nombresInactivos}). Debe quitarlos o seleccionar únicamente proveedores activos.`
      );
      return false;
    }

    if (itemsSolicitados.length === 0) {
      setErrorModal('Debe agregar al menos un insumo o repuesto a la lista de productos requeridos.');
      return false;
    }

    return true;
  };

  // Paso 5 -> Paso 6: Avanzar al Resumen Final y Confirmación de Emisión
  const handleAvanzarConfirmacion = (e) => {
    if (e) e.preventDefault();
    setErrorModal('');
    if (!validarConfeccionSolicitud()) return;
    setConfirmandoEmision(true);
  };

  // ---------------------------------------------------------------------------
  // Persistencia: Guardar como Borrador (Excepción Paso 5) o Emitir (Paso 7-10)
  // ---------------------------------------------------------------------------
  const ejecutarGuardadoSolicitud = async (comoBorrador = false) => {
    setErrorModal('');
    if (!validarConfeccionSolicitud()) return;

    setProcesandoEnvio(true);
    try {
      const payload = {
        ids_proveedores: proveedoresSeleccionados,
        productos: itemsSolicitados.map((item) =>
          item.es_manual
            ? {
                es_manual: true,
                marca: item.marca,
                modelo: item.modelo,
                descripcion: item.descripcion
              }
            : {
                id_producto: item.id_producto
              }
        ),
        guardar_como_borrador: Boolean(comoBorrador)
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/purchases/solicitudes-cotizacion/generar/`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const solicitudCreada = res.data?.solicitud;
      setModalAbierto(false);
      setConfirmandoEmision(false);

      if (comoBorrador) {
        setExitoBanner(
          'La Solicitud de Cotización fue guardada en estado "Borrador" correctamente (sin notificar a proveedores).'
        );
      } else {
        setExitoBanner(
          `Solicitud de Cotización emitida en estado "Enviada a Proveedores". Se generaron ${proveedoresSeleccionados.length} invitaciones con enlaces seguros y se despacharon las notificaciones por correo.`
        );
        if (solicitudCreada) {
          setSolicitudDetalle(solicitudCreada);
          setModalDetalleAbierto(true);
        }
      }

      cargarSolicitudes();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Error al procesar la solicitud de cotización.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (Array.isArray(data?.error)) {
        msg = data.error[0];
      } else if (data && typeof data === 'object') {
        const firstVal = Object.values(data)[0];
        if (Array.isArray(firstVal)) msg = firstVal[0];
        else if (typeof firstVal === 'string') msg = firstVal;
      }
      setErrorModal(msg);
    } finally {
      setProcesandoEnvio(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CU-15: Consultar Solicitud de Cotización (Detalle Inmutable y Matriz)
  // ---------------------------------------------------------------------------
  const abrirDetalleSolicitud = async (idSolicitud) => {
    if (!token || !idSolicitud) return;
    setCargandoDetalle(true);
    setModalDetalleAbierto(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/purchases/solicitudes-cotizacion/${idSolicitud}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSolicitudDetalle(res.data);
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No fue posible consultar el detalle de la solicitud de cotización.';
      if (typeof data?.error === 'string') msg = data.error;
      else if (data?.detail) msg = data.detail;
      setErrorBanner(msg);
      setModalDetalleAbierto(false);
    } finally {
      setCargandoDetalle(false);
    }
  };

  // ---------------------------------------------------------------------------
  // CU-16: Modificar Solicitud de Cotización (Estricto para Borradores)
  // ---------------------------------------------------------------------------
  const abrirModalModificarSolicitud = async (sol) => {
    if (!sol) return;

    // Regla de Negocio CU-16 (Paso 1 y Excepción): Bloquear alteración si no está en Borrador
    if (Number(sol.estado_solicitud) !== 0) {
      setErrorBanner(
        'Operación bloqueada: Un sondeo en curso o ya enviado a proveedores no puede ser alterado. Redirigiendo a la vista de solo lectura.'
      );
      abrirDetalleSolicitud(sol.id_solicitud);
      return;
    }

    // Cerrar detalle si estuviera abierto
    setModalDetalleAbierto(false);

    // Obtener la versión completa y fresca de la solicitud
    try {
      const res = await axios.get(`${API_BASE_URL}/api/purchases/solicitudes-cotizacion/${sol.id_solicitud}/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSolicitudEditando(res.data);
    } catch {
      setSolicitudEditando(sol);
    }

    cargarDatosAuxiliares();
    setModalModificarAbierto(true);
  };

  const handleGuardadoModificacionExitoso = (comoBorrador, solActualizada) => {
    setModalModificarAbierto(false);
    setSolicitudEditando(null);
    cargarSolicitudes();

    if (comoBorrador) {
      setExitoBanner(
        'Los cambios en el borrador de la Solicitud de Cotización fueron guardados exitosamente.'
      );
    } else {
      setExitoBanner(
        'Solicitud de Cotización emitida formalmente. Se despacharon las invitaciones con tokens criptográficos y los correos a los proveedores.'
      );
      if (solActualizada?.id_solicitud) {
        abrirDetalleSolicitud(solActualizada.id_solicitud);
      }
    }
  };

  // ---------------------------------------------------------------------------
  // CU-17: Eliminar Solicitud de Cotización (Exclusivo Borrador y Libre de Taller)
  // ---------------------------------------------------------------------------
  const iniciarEliminacionSolicitud = (sol) => {
    if (!sol) return;

    // Regla restrictiva 1 / Excepción Paso 2: Estado diferente a Borrador
    if (Number(sol.estado_solicitud) !== 0) {
      setErrorBanner(
        'Los documentos que ya han interactuado con agentes externos no pueden ser eliminados.'
      );
      return;
    }

    // Regla restrictiva 2 / Excepción Paso 2: Dependencia crítica de taller (sol_tec = True)
    if (sol.sol_tec) {
      setErrorBanner(
        'Imposible eliminar: Insumos requeridos por el área técnica.'
      );
      return;
    }

    setSolicitudAEliminar(sol);
  };

  const ejecutarEliminacionDefinitiva = async (sol) => {
    if (!token || !sol) return;

    setEliminandoSolicitud(true);
    try {
      await axios.delete(
        `${API_BASE_URL}/api/purchases/solicitudes-cotizacion/${sol.id_solicitud}/eliminar/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setExitoBanner(
        `La Solicitud de Cotización #${sol.id_solicitud} ha sido eliminada permanentemente del sistema.`
      );
      setSolicitudAEliminar(null);

      // Si el detalle estaba abierto para esta solicitud, cerrarlo
      if (solicitudDetalle?.id_solicitud === sol.id_solicitud) {
        setModalDetalleAbierto(false);
        setSolicitudDetalle(null);
      }

      cargarSolicitudes();
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No fue posible eliminar la solicitud de cotización.';
      if (typeof data?.error === 'string') msg = data.error;
      else if (Array.isArray(data?.error)) msg = data.error[0];
      else if (data?.detail) msg = data.detail;
      setErrorBanner(msg);
    } finally {
      setEliminandoSolicitud(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Métricas Ejecutivas (KPIs)
  // ---------------------------------------------------------------------------
  const metricas = useMemo(() => {
    const total = solicitudes.length;
    const enviadas = solicitudes.filter((s) => s.estado_solicitud === 1).length;
    const borradores = solicitudes.filter((s) => s.estado_solicitud === 0).length;
    const cotizadasOCerradas = solicitudes.filter((s) =>
      [2, 4].includes(s.estado_solicitud)
    ).length;
    return { total, enviadas, borradores, cotizadasOCerradas };
  }, [solicitudes]);

  const obtenerBadgeEstado = (estadoNum, estadoTexto) => {
    switch (Number(estadoNum)) {
      case 0:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            {estadoTexto || 'Borrador'}
          </span>
        );
      case 1:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
            {estadoTexto || 'Enviada a Proveedores'}
          </span>
        );
      case 2:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {estadoTexto || 'Cotizada'}
          </span>
        );
      case 3:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            {estadoTexto || 'Rechazada'}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-violet-500/15 text-violet-300 border border-violet-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {estadoTexto || 'Cerrada/Evaluada'}
          </span>
        );
    }
  };

  const copiarEnlaceProveedor = (linkRelativo) => {
    if (!linkRelativo) return;
    const urlCompleta = `${window.location.origin}${linkRelativo}`;
    navigator.clipboard.writeText(urlCompleta);
    setTokenCopiado(linkRelativo);
    setTimeout(() => setTokenCopiado(''), 3000);
  };

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* BARRA LATERAL PERSISTENTE */}
      <AdminSidebar
        activeMenu="purchases-quotes"
        onSelectMenu={(val, item) => {
          if (item?.route) {
            navigate(item.route);
            return;
          }
          navigate('/admin/dashboard', { state: { activeMenu: val } });
        }}
      />

      {/* ÁREA DE CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Compras & Abastecimiento"
          pageName="Solicitudes de Cotización"
          title="Solicitudes de Cotización"
        />

        {/* Contenedor Principal */}
        <div className="p-6 sm:p-8 space-y-6 flex-1">
          {/* Cabecera Operativa con Botón de Creación */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Pliegos de Solicitud</h2>
            </div>
            <button
              type="button"
              onClick={abrirModalNuevaSolicitud}
              className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <span className="text-base leading-none font-black">+</span>
              <span>Nueva Solicitud de Cotización</span>
            </button>
          </div>
          {/* Alertas Flotantes Cyber-Tech en esquina inferior izquierda (Fixed, Zero CLS) */}
          <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-2 pointer-events-none max-w-md">
            <AnimatePresence>
              {errorBanner && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto bg-rose-950/90 border border-rose-500/50 text-rose-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md text-xs sm:text-sm font-medium"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-rose-400 text-base">⚠️</span>
                    <span className="leading-relaxed">{errorBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorBanner('')}
                    className="text-rose-300 hover:text-white p-1 ml-2 text-xs font-mono cursor-pointer"
                    aria-label="Cerrar error"
                  >
                    ✕
                  </button>
                </motion.div>
              )}

              {exitoBanner && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 15, scale: 0.95 }}
                  transition={{ duration: 0.25 }}
                  className="pointer-events-auto bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-2xl backdrop-blur-md text-xs sm:text-sm font-medium"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-emerald-400 text-base">⚡</span>
                    <span className="leading-relaxed">{exitoBanner}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExitoBanner('')}
                    className="text-emerald-300 hover:text-white p-1 ml-2 text-xs font-mono cursor-pointer"
                    aria-label="Cerrar éxito"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Tarjetas de Resumen (KPIs) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#1E293B] p-5 rounded-2xl border border-slate-700/80 shadow-lg">
              <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Total Solicitudes
              </span>
              <p className="text-3xl font-black text-white mt-1">{metricas.total}</p>
              <p className="text-xs text-slate-400 mt-1">Pliegos de sondeo registrados</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-cyan-500/30 shadow-lg">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                Enviadas a Proveedores
              </span>
              <p className="text-3xl font-black text-cyan-300 mt-1">{metricas.enviadas}</p>
              <p className="text-xs text-slate-400 mt-1">Con tokens activos de respuesta</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-amber-500/30 shadow-lg">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400">
                En Borrador
              </span>
              <p className="text-3xl font-black text-amber-300 mt-1">{metricas.borradores}</p>
              <p className="text-xs text-slate-400 mt-1">Guardadas sin emitir invitación</p>
            </div>

            <div className="bg-[#1E293B] p-5 rounded-2xl border border-emerald-500/30 shadow-lg">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                Cotizadas / Evaluadas
              </span>
              <p className="text-3xl font-black text-emerald-300 mt-1">{metricas.cotizadasOCerradas}</p>
              <p className="text-xs text-slate-400 mt-1">Con ofertas recibidas del mercado</p>
            </div>
          </div>

          {/* Barra de Filtros (CU-41: Filtrar Solicitud de Cotización) */}
          <form
            onSubmit={handleAplicarFiltros}
            className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 text-sm">🔍</span>
                <h3 className="text-xs font-mono uppercase tracking-wider text-slate-300 font-bold">
                  Filtros de Búsqueda y Auditoría
                </h3>
              </div>
              {hayFiltrosActivos && (
                <span className="text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  Filtros aplicados
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 items-end">
              {/* Búsqueda exacta: N° de Solicitud */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  N° Solicitud (Exacto)
                </label>
                <input
                  type="text"
                  value={filtroIdSolicitud}
                  onChange={(e) => setFiltroIdSolicitud(e.target.value)}
                  placeholder="Ej. 14"
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                />
              </div>

              {/* Filtro categórico: Estado de la Solicitud */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Estado de Solicitud
                </label>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4] cursor-pointer"
                >
                  <option value="TODOS">Todos los estados</option>
                  <option value="0">Borrador</option>
                  <option value="1">Enviada a Proveedores</option>
                  <option value="2">Cotizada</option>
                  <option value="3">Rechazada</option>
                  <option value="4">Cerrada / Evaluada</option>
                </select>
              </div>

              {/* Búsqueda por contenido: Insumo / Producto Requerido */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Insumo / Repuesto
                </label>
                <input
                  type="text"
                  value={busquedaProducto}
                  onChange={(e) => setBusquedaProducto(e.target.value)}
                  placeholder="Ej. Módulo OLED, Batería..."
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                />
              </div>

              {/* Filtro cronológico: Fecha Desde */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Fecha Desde
                </label>
                <input
                  type="date"
                  value={filtroFechaDesde}
                  onChange={(e) => setFiltroFechaDesde(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4] cursor-pointer"
                />
              </div>

              {/* Filtro cronológico: Fecha Hasta */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  value={filtroFechaHasta}
                  onChange={(e) => setFiltroFechaHasta(e.target.value)}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4] cursor-pointer"
                />
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/80">
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                >
                  Limpiar Filtros
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer font-mono"
              >
                <span>⚡</span>
                <span>Filtrar</span>
              </button>
            </div>
          </form>

          {/* Tabla de Solicitudes de Cotización */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">
                Bandeja de Solicitudes de Cotización
              </h2>
              <span className="text-xs font-mono text-slate-400">
                {solicitudes.length} {solicitudes.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>

            {cargando ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-400 font-mono">
                  Consultando solicitudes de cotización...
                </p>
              </div>
            ) : solicitudes.length === 0 ? (
              /* Excepción Paso 5: Mensaje específico si no hay coincidencias */
              <div className="p-12 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center text-xl mx-auto">
                  🔍
                </div>
                {hayFiltrosActivos ? (
                  <>
                    <p className="text-slate-200 font-bold text-base">
                      No se encontraron resultados para su búsqueda.
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                      Ninguna solicitud coincide con los criterios especificados (N° de solicitud, estado, rango de fechas o producto). Intente ajustar o limpiar los filtros para ver todos los registros.
                    </p>
                    <button
                      type="button"
                      onClick={handleLimpiarFiltros}
                      className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer"
                    >
                      Limpiar Filtros de Búsqueda
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-slate-300 font-semibold text-base">
                      Aún no se han emitido solicitudes de cotización
                    </p>
                    <p className="text-xs text-slate-400 max-w-md mx-auto">
                      Utilice el botón &ldquo;Nueva Solicitud de Cotización&rdquo; para confeccionar un nuevo sondeo de precios hacia sus proveedores activos.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0F172A]/70 text-slate-400 text-xs font-mono uppercase border-b border-slate-800">
                      <th className="py-3.5 px-6">N° Solicitud</th>
                      <th className="py-3.5 px-6">Fecha de Emisión</th>
                      <th className="py-3.5 px-6">Insumos / Repuestos Solicitados</th>
                      <th className="py-3.5 px-6">Proveedores Invitados</th>
                      <th className="py-3.5 px-6">Estado</th>
                      <th className="py-3.5 px-6 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {solicitudes.map((sol, idx) => {
                      const listaProds = Array.isArray(sol.productos) ? sol.productos : [];
                      const listaCots = Array.isArray(sol.cotizaciones) ? sol.cotizaciones : [];
                      const totalProvs =
                        typeof sol.total_proveedores === 'number'
                          ? sol.total_proveedores
                          : listaCots.length;

                      return (
                        <tr
                          key={sol.id_solicitud || idx}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-4 px-6 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-lg bg-cyan-500/10 text-cyan-300 font-mono font-bold text-xs border border-cyan-500/25">
                              #{sol.id_solicitud}
                            </span>
                          </td>

                          <td className="py-4 px-6 whitespace-nowrap">
                            <div className="font-semibold text-white">{sol.fecha_emision}</div>
                            <div className="text-xs text-slate-400 font-mono">
                              {sol.sol_tec ? 'Requerimiento Técnico Taller' : 'Abastecimiento de Stock'}
                            </div>
                          </td>

                          <td className="py-4 px-6">
                            {listaProds.length === 0 ? (
                              <span className="text-xs text-slate-500 italic">Sin insumos detallados</span>
                            ) : (
                              <div className="space-y-1">
                                {listaProds.slice(0, 3).map((prod, pIdx) => (
                                  <div
                                    key={prod.id_solicitud_producto || pIdx}
                                    className="flex items-center gap-2 text-xs text-slate-200"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                    <span className="font-medium truncate max-w-xs">
                                      {prod.nombre_producto}
                                    </span>
                                    {prod.es_manual && (
                                      <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-mono border border-violet-500/30">
                                        Sondeo Manual
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {listaProds.length > 3 && (
                                  <span className="text-xs text-cyan-400 font-mono">
                                    + {listaProds.length - 3} insumo(s) adicional(es)
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-6">
                            { Number(sol.estado_solicitud) === 0 ? (
                              <span className="text-xs text-amber-300/90 font-mono">
                                Pendiente de emisión (Borrador)
                              </span>
                            ) : listaCots.length > 0 ? (
                              <div className="space-y-1">
                                {listaCots.slice(0, 2).map((cot, cIdx) => (
                                  <div
                                    key={cot.id_invitacion || cIdx}
                                    className="text-xs text-slate-200 flex items-center gap-2"
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                    <span className="font-medium">
                                      {cot.proveedor?.nombre_proveedor || 'Proveedor invitado'}
                                    </span>
                                    <span className="text-[11px] text-slate-400 font-mono">
                                      ({cot.estado || 'Pendiente de Evaluación'})
                                    </span>
                                  </div>
                                ))}
                                {listaCots.length > 2 && (
                                  <span className="text-xs text-slate-400 font-mono">
                                    + {listaCots.length - 2} proveedor(es) más
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-300 font-mono">
                                {totalProvs} proveedor(es) invitado(s)
                              </span>
                            )}
                          </td>

                          <td className="py-4 px-6 whitespace-nowrap">
                            {obtenerBadgeEstado(sol.estado_solicitud, sol.estado)}
                          </td>

                          <td className="py-4 px-6 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => abrirDetalleSolicitud(sol.id_solicitud)}
                                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                              >
                                <span>👁</span>
                                <span>Ver Detalle</span>
                              </button>
                              {Number(sol.estado_solicitud) === 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => abrirModalModificarSolicitud(sol)}
                                    className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold border border-amber-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                                  >
                                    <span>✏</span>
                                    <span>Modificar</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => iniciarEliminacionSolicitud(sol)}
                                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-bold border border-rose-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                                    title="Eliminar solicitud en borrador"
                                  >
                                    <span>🗑</span>
                                    <span>Eliminar</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* =====================================================================
          MODAL PRINCIPAL: CONFECCIÓN EN 2 PASOS + CONFIRMACIÓN (ZERO STACKING)
         ===================================================================== */}
      {modalAbierto && !modalNuevoProductoAbierto && !modalNuevoProveedorAbierto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 overflow-y-auto">
          <div className="bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
            {/* Cabecera del Modal */}
            <div className="px-6 py-4 border-b border-slate-800 bg-[#0F172A]/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
                  {confirmandoEmision
                    ? 'Paso Final • Confirmación de Emisión'
                    : pasoModalSolicitud === 1
                    ? 'Paso 1 de 2 • Selección de Insumos y Repuestos'
                    : 'Paso 2 de 2 • Selección de Proveedores Destinatarios'}
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  {confirmandoEmision
                    ? 'Resumen Final del Pedido de Cotización'
                    : 'Nueva Solicitud de Cotización'}
                </h2>
              </div>

              <div className="flex items-center gap-3">
                {/* Indicador visual de pasos */}
                {!confirmandoEmision && (
                  <div className="hidden sm:flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setPasoModalSolicitud(1)}
                      className={`px-3 py-1 rounded-full font-bold border transition-colors cursor-pointer ${
                        pasoModalSolicitud === 1
                          ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      1. Insumos ({itemsSolicitados.length})
                    </button>
                    <span className="text-slate-600">→</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (itemsSolicitados.length > 0) setPasoModalSolicitud(2);
                      }}
                      className={`px-3 py-1 rounded-full font-bold border transition-colors ${
                        pasoModalSolicitud === 2
                          ? 'bg-violet-500/20 text-violet-300 border-violet-500/40 cursor-pointer'
                          : itemsSolicitados.length > 0
                          ? 'bg-slate-800 text-slate-300 border-slate-700 cursor-pointer'
                          : 'bg-slate-800/50 text-slate-500 border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      2. Proveedores ({proveedoresSeleccionados.length})
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={cerrarModalNuevaSolicitud}
                  disabled={procesandoEnvio}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  title="Cerrar"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Alerta de Error dentro del Modal */}
              {errorModal && (
                <div className="bg-rose-500/15 border border-rose-500/40 text-rose-200 px-4 py-3 rounded-xl text-xs sm:text-sm flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-rose-400 text-base">⚠</span>
                    <span>{errorModal}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorModal('')}
                    className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}

              {!confirmandoEmision && pasoModalSolicitud === 1 ? (
                /* =========================================================
                   PASO 1: SELECCIÓN RÁPIDA DE INSUMOS + FILTROS
                   ========================================================= */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        1. Seleccione los Insumos o Repuestos a Cotizar
                      </h3>
                      <p className="text-xs text-slate-400">
                        Filtre por nombre, categoría o nivel de stock y haga clic para añadirlos al pedido.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setMostrarCargaManual((prev) => !prev)}
                        className="px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 text-xs font-bold border border-violet-500/30 transition-colors cursor-pointer"
                      >
                        {mostrarCargaManual ? 'Ocultar Carga Manual' : '+ Carga Manual (Sondeo)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalNuevoProductoAbierto(true)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-colors cursor-pointer"
                      >
                        + Registrar en Catálogo
                      </button>
                    </div>
                  </div>

                  {/* Carga Manual colapsable */}
                  {mostrarCargaManual && (
                    <div className="bg-violet-950/25 border border-violet-500/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-violet-300">
                          Carga Manual de Insumo para Sondeo (Sin alterar el catálogo general)
                        </span>
                        <span className="text-[11px] font-mono text-violet-400">Texto Libre Técnico</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">Marca *</label>
                          <input
                            type="text"
                            value={manualMarca}
                            onChange={(e) => setManualMarca(e.target.value)}
                            placeholder="Ej. Samsung / Apple"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">Modelo *</label>
                          <input
                            type="text"
                            value={manualModelo}
                            onChange={(e) => setManualModelo(e.target.value)}
                            placeholder="Ej. Galaxy S23 Ultra"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <label className="block text-[11px] font-mono text-slate-300 mb-1">Descripción Técnica *</label>
                          <input
                            type="text"
                            value={manualDescripcion}
                            onChange={(e) => setManualDescripcion(e.target.value)}
                            placeholder="Ej. Flex placa sub-carga original"
                            className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setMostrarCargaManual(false)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={agregarInsumoManualSondeo}
                          className="px-4 py-1.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/25 cursor-pointer"
                        >
                          Añadir Ítem Manual al Sondeo
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Barra de Filtrado Rápido de Insumos */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#0F172A]/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Buscar por nombre o descripción
                      </label>
                      <input
                        type="text"
                        value={busquedaInsumoModal}
                        onChange={(e) => setBusquedaInsumoModal(e.target.value)}
                        placeholder="Ej. Pantalla, Batería, Flux..."
                        className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Categoría
                      </label>
                      <select
                        value={filtroCategoriaInsumoModal}
                        onChange={(e) => setFiltroCategoriaInsumoModal(e.target.value)}
                        className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                      >
                        <option value="">Todas las categorías</option>
                        {categoriasInsumosModal.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Nivel de Stock
                      </label>
                      <select
                        value={filtroStockInsumoModal}
                        onChange={(e) => setFiltroStockInsumoModal(e.target.value)}
                        className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                      >
                        <option value="TODOS">Todos</option>
                        <option value="BAJO">Stock Bajo / Crítico</option>
                        <option value="SIN_STOCK">Sin Stock (0)</option>
                      </select>
                    </div>
                  </div>

                  {/* Grilla de Selección Directa + Carrito de Renglones */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Catálogo filtrable (7 cols) */}
                    <div className="lg:col-span-7 bg-[#0F172A]/70 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-mono uppercase text-slate-400">
                          Catálogo ({productosFiltradosModal.length} resultados)
                        </span>
                        {(busquedaInsumoModal || filtroCategoriaInsumoModal || filtroStockInsumoModal !== 'TODOS') && (
                          <button
                            type="button"
                            onClick={() => {
                              setBusquedaInsumoModal('');
                              setFiltroCategoriaInsumoModal('');
                              setFiltroStockInsumoModal('TODOS');
                            }}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                          >
                            Limpiar filtros
                          </button>
                        )}
                      </div>

                      {cargandoAuxiliares ? (
                        <div className="py-10 text-center text-xs text-slate-400 font-mono">
                          Cargando catálogo de insumos...
                        </div>
                      ) : productosFiltradosModal.length === 0 ? (
                        <div className="py-8 text-center space-y-3">
                          <p className="text-xs text-amber-300">
                            No hay insumos que coincidan con la búsqueda o filtros aplicados.
                          </p>
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setManualDescripcion(busquedaInsumoModal.trim());
                                setMostrarCargaManual(true);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-violet-500/20 text-violet-200 border border-violet-500/40 text-xs font-semibold cursor-pointer"
                            >
                              + Carga Manual (Sondeo)
                            </button>
                            <button
                              type="button"
                              onClick={() => setModalNuevoProductoAbierto(true)}
                              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 text-xs font-semibold cursor-pointer"
                            >
                              + Registrar en Catálogo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                          {productosFiltradosModal.map((prod) => {
                            const yaAgregado = itemsSolicitados.some(
                              (it) => !it.es_manual && it.id_producto === prod.id_producto
                            );
                            const stockActual = Number(prod.cantidad_actual ?? 0);
                            return (
                              <button
                                key={prod.id_producto}
                                type="button"
                                onClick={() =>
                                  yaAgregado
                                    ? eliminarItemSolicitado(`cat-${prod.id_producto}`)
                                    : agregarInsumoDeCatalogo(prod)
                                }
                                className={`w-full p-2.5 rounded-xl border text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                                  yaAgregado
                                    ? 'bg-cyan-500/15 border-cyan-400/60'
                                    : 'bg-[#1E293B]/90 border-slate-800 hover:border-slate-600'
                                }`}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-white truncate">{prod.nombre}</div>
                                  <div className="text-[11px] text-slate-400 truncate">
                                    {prod.nombre_categoria || prod.categoria || 'Catálogo General'} •{' '}
                                    <span className={stockActual === 0 ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                                      Stock: {stockActual}
                                    </span>
                                  </div>
                                </div>
                                <span
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                                    yaAgregado
                                      ? 'bg-cyan-400 text-slate-950'
                                      : 'bg-slate-800 text-cyan-300 border border-cyan-500/30'
                                  }`}
                                >
                                  {yaAgregado ? '✓ Agregado' : '+ Agregar'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Insumos agregados al pedido (5 cols) */}
                    <div className="lg:col-span-5 bg-[#0F172A]/70 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
                      <div className="px-4 py-2.5 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between">
                        <span className="text-xs font-mono uppercase text-cyan-300 font-bold">
                          Seleccionados ({itemsSolicitados.length})
                        </span>
                        {itemsSolicitados.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setItemsSolicitados([])}
                            className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                          >
                            Vaciar
                          </button>
                        )}
                      </div>

                      {itemsSolicitados.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500 my-auto">
                          Haz clic en los insumos de la izquierda para sumarlos a la solicitud.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-800 max-h-72 overflow-y-auto">
                          {itemsSolicitados.map((item) => (
                            <div
                              key={item.uid}
                              className="px-3.5 py-2.5 flex items-center justify-between gap-2 hover:bg-slate-800/30"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-white truncate">{item.nombre_mostrar}</div>
                                <div className="text-[10px] text-slate-400 truncate">
                                  {item.es_manual ? 'Sondeo Manual' : item.detalle_mostrar}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => eliminarItemSolicitado(item.uid)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs cursor-pointer shrink-0"
                                title="Quitar ítem"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : !confirmandoEmision && pasoModalSolicitud === 2 ? (
                /* =========================================================
                   PASO 2: SELECCIÓN RÁPIDA DE PROVEEDORES + FILTROS
                   ========================================================= */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        2. Seleccione los Proveedores Destinatarios ({proveedoresSeleccionados.length} seleccionado/s)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Filtre el padrón por nombre, CUIT o estado y elija quiénes recibirán el sondeo.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={seleccionarTodosProveedoresActivos}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 cursor-pointer"
                      >
                        ✓ Seleccionar Activos Visibles
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNombreProveedorSugerido(busquedaProveedorModal.trim());
                          setModalNuevoProveedorAbierto(true);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-bold border border-cyan-500/30 cursor-pointer"
                      >
                        + Registrar Proveedor
                      </button>
                    </div>
                  </div>

                  {/* Barra de búsqueda y filtro de proveedores */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#0F172A]/80 border border-slate-800 rounded-xl p-3.5">
                    <div className="sm:col-span-8">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Buscar por nombre, CUIT o correo
                      </label>
                      <input
                        type="text"
                        value={busquedaProveedorModal}
                        onChange={(e) => setBusquedaProveedorModal(e.target.value)}
                        placeholder="Ej. TechParts, 30-71234567-9..."
                        className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">
                        Mostrar
                      </label>
                      <select
                        value={filtroEstadoProveedorModal}
                        onChange={(e) => setFiltroEstadoProveedorModal(e.target.value)}
                        className="w-full bg-[#1E293B] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                      >
                        <option value="ACTIVOS">Solo Proveedores Activos</option>
                        <option value="TODOS">Todos (Activos e Inactivos)</option>
                      </select>
                    </div>
                  </div>

                  {proveedoresInactivosSeleccionados.length > 0 && (
                    <div className="bg-amber-500/15 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="text-amber-300">⚠ Proveedor(es) inactivo(s) seleccionado(s): </strong>
                        El sistema bloquea la emisión hacia proveedores inactivos.
                      </div>
                      <button
                        type="button"
                        onClick={quitarProveedoresInactivos}
                        className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold border border-amber-400/40 cursor-pointer"
                      >
                        Quitar inactivos
                      </button>
                    </div>
                  )}

                  {/* Grid de Proveedores */}
                  <div className="max-h-80 overflow-y-auto pr-1">
                    {cargandoAuxiliares ? (
                      <div className="py-10 text-center text-xs text-slate-400 font-mono">
                        Cargando padrón de proveedores...
                      </div>
                    ) : proveedoresFiltradosModal.length === 0 ? (
                      <div className="bg-[#0F172A] border border-amber-500/30 rounded-xl p-6 text-center space-y-3">
                        <p className="text-xs text-amber-300 font-semibold">
                          No se encontraron proveedores con esos criterios.
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setNombreProveedorSugerido(busquedaProveedorModal.trim());
                              setModalNuevoProveedorAbierto(true);
                            }}
                            className="px-3.5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer"
                          >
                            Registrar Nuevo Proveedor
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setBusquedaProveedorModal('');
                              setFiltroEstadoProveedorModal('ACTIVOS');
                            }}
                            className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
                          >
                            Limpiar filtros
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {proveedoresFiltradosModal.map((prov) => {
                          const seleccionado = proveedoresSeleccionados.includes(prov.cuit_prov);
                          return (
                            <div
                              key={prov.cuit_prov}
                              onClick={() => toggleSeleccionProveedor(prov.cuit_prov)}
                              className={`p-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                                seleccionado
                                  ? prov.estado
                                    ? 'bg-cyan-500/10 border-[#06B6D4]'
                                    : 'bg-rose-500/15 border-rose-500/60'
                                  : 'bg-[#0F172A]/80 border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-white truncate">
                                    {prov.nombre_proveedor}
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                      prov.estado
                                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                    }`}
                                  >
                                    {prov.estado ? 'Activo' : 'Inactivo'}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                                  CUIT: {prov.cuit_prov} • {prov.correo || 'Sin correo'}
                                </div>
                              </div>

                              <input
                                type="checkbox"
                                checked={seleccionado}
                                onChange={() => {}}
                                className="w-4 h-4 accent-[#06B6D4] rounded cursor-pointer"
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* =========================================================
                   VISTA FINAL: RESUMEN Y CONFIRMACIÓN DE EMISIÓN
                   ========================================================= */
                <div className="space-y-6">
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-2xl p-5 flex items-start gap-4">
                    <span className="text-2xl">📨</span>
                    <div className="space-y-1 text-sm">
                      <h3 className="font-bold text-white">
                        Verifique los datos antes de despachar la Solicitud de Cotización
                      </h3>
                      <p className="text-slate-300 text-xs leading-relaxed">
                        Al confirmar, el sistema instanciará la cabecera en estado{' '}
                        <span className="text-cyan-300 font-semibold">&ldquo;Enviada a Proveedores&rdquo;</span>,
                        generará una cotización hija en estado{' '}
                        <span className="text-cyan-300 font-semibold">&ldquo;Pendiente de Evaluación&rdquo;</span>{' '}
                        con un token criptográfico único por cada proveedor elegido y despachará los correos electrónicos individuales.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Resumen de Proveedores Destinatarios */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                      <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                        Proveedores Destinatarios ({objetosProveedoresSeleccionados.length})
                      </h4>
                      <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                        {objetosProveedoresSeleccionados.map((p) => (
                          <div key={p.cuit_prov} className="py-2.5 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-sm font-bold text-white">{p.nombre_proveedor}</div>
                              <div className="text-xs text-slate-400 font-mono">
                                CUIT: {p.cuit_prov} • {p.correo || 'Sin correo'}
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              Activo
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Resumen de Insumos Requeridos */}
                    <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-5 space-y-3">
                      <h4 className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                        Insumos / Repuestos a Cotizar ({itemsSolicitados.length})
                      </h4>
                      <div className="divide-y divide-slate-800 max-h-60 overflow-y-auto">
                        {itemsSolicitados.map((item) => (
                          <div key={item.uid} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-bold text-white truncate">
                                {item.nombre_mostrar}
                              </div>
                              <div className="text-xs text-slate-400">{item.detalle_mostrar}</div>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono shrink-0 ${
                                item.es_manual
                                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                                  : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                              }`}
                            >
                              {item.es_manual ? 'Sondeo Manual' : 'Catálogo'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Pie del Modal */}
            <div className="px-6 py-4 border-t border-slate-800 bg-[#0F172A]/90 flex flex-wrap items-center justify-between gap-3">
              {!confirmandoEmision && pasoModalSolicitud === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={cerrarModalNuevaSolicitud}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (itemsSolicitados.length === 0) {
                        setErrorModal('Agrega al menos un insumo o repuesto antes de continuar a los proveedores.');
                        return;
                      }
                      setErrorModal('');
                      setPasoModalSolicitud(2);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 cursor-pointer"
                  >
                    Siguiente: Seleccionar Proveedores ({itemsSolicitados.length}) →
                  </button>
                </>
              ) : !confirmandoEmision && pasoModalSolicitud === 2 ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorModal('');
                      setPasoModalSolicitud(1);
                    }}
                    disabled={procesandoEnvio}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    ← Volver a Insumos
                  </button>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => ejecutarGuardadoSolicitud(true)}
                      disabled={procesandoEnvio}
                      className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs sm:text-sm font-bold border border-amber-500/40 transition-colors cursor-pointer"
                    >
                      {procesandoEnvio ? 'Guardando...' : 'Guardar como Borrador'}
                    </button>

                    <button
                      type="button"
                      onClick={handleAvanzarConfirmacion}
                      disabled={procesandoEnvio}
                      className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 cursor-pointer"
                    >
                      Enviar Cotización →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmandoEmision(false)}
                    disabled={procesandoEnvio}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors cursor-pointer"
                  >
                    ← Volver a Proveedores
                  </button>

                  <button
                    type="button"
                    onClick={() => ejecutarGuardadoSolicitud(false)}
                    disabled={procesandoEnvio}
                    className="px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 cursor-pointer"
                  >
                    {procesandoEnvio
                      ? 'Despachando Solicitud y Tokens...'
                      : 'Confirmar y Emitir Solicitud'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CU-15: MODAL DE DETALLE Y CONSULTA DE SOLICITUD DE COTIZACIÓN
         ===================================================================== */}
      {modalDetalleAbierto && (
        <DetalleSolicitudModal
          isOpen={modalDetalleAbierto}
          onClose={() => {
            setModalDetalleAbierto(false);
            setSolicitudDetalle(null);
          }}
          solicitud={solicitudDetalle}
          cargando={cargandoDetalle}
          onModificar={(sol) => abrirModalModificarSolicitud(sol)}
          onEliminar={(sol) => iniciarEliminacionSolicitud(sol)}
        />
      )}

      {/* =====================================================================
          CU-16: MODAL DE MODIFICACIÓN DE SOLICITUD DE COTIZACIÓN (BORRADOR)
         ===================================================================== */}
      {modalModificarAbierto && !modalNuevoProductoAbierto && !modalNuevoProveedorAbierto && (
        <ModificarSolicitudModal
          isOpen={modalModificarAbierto}
          onClose={() => {
            setModalModificarAbierto(false);
            setSolicitudEditando(null);
          }}
          solicitud={solicitudEditando}
          token={token}
          proveedoresPadron={proveedoresPadron}
          productosCatalogo={productosCatalogo}
          cargandoAuxiliares={cargandoAuxiliares}
          onGuardadoExitoso={handleGuardadoModificacionExitoso}
          onAbrirNuevoProveedor={(sug) => {
            setNombreProveedorSugerido(sug);
            setModalNuevoProveedorAbierto(true);
          }}
          onAbrirNuevoProducto={() => setModalNuevoProductoAbierto(true)}
        />
      )}

      {/* =====================================================================
          CU-17: MODAL DE CONFIRMACIÓN CRÍTICA DE ELIMINACIÓN DE SOLICITUD
         ===================================================================== */}
      {Boolean(solicitudAEliminar) && (
        <ConfirmarEliminacionSolicitudModal
          isOpen={Boolean(solicitudAEliminar)}
          onClose={() => setSolicitudAEliminar(null)}
          solicitud={solicitudAEliminar}
          onConfirmar={ejecutarEliminacionDefinitiva}
          eliminando={eliminandoSolicitud}
        />
      )}

      {/* Excepción Paso 4: Modal para Registrar Nuevo Proveedor (CU-24) sin perder el progreso */}
      {modalNuevoProveedorAbierto && (
        <SupplierModal
          isOpen={modalNuevoProveedorAbierto}
          onClose={() => setModalNuevoProveedorAbierto(false)}
          proveedor={null}
          nombreSugerido={nombreProveedorSugerido}
          paises={paises}
          onSaved={(nuevoProv) => {
            setModalNuevoProveedorAbierto(false);
            cargarDatosAuxiliares();
            if (nuevoProv?.cuit_prov) {
              setProveedoresSeleccionados((prev) =>
                prev.includes(nuevoProv.cuit_prov) ? prev : [...prev, nuevoProv.cuit_prov]
              );
              setBusquedaProveedorModal('');
            }
          }}
        />
      )}

      {/* Excepción Paso 4: Modal para Registrar Producto Formal en Catálogo (CU-12) sin perder el progreso */}
      {modalNuevoProductoAbierto && (
        <RegistrarProductoModal
          isOpen={modalNuevoProductoAbierto}
          onClose={() => setModalNuevoProductoAbierto(false)}
          onSuccess={(msg, nuevoProd) => {
            setModalNuevoProductoAbierto(false);
            cargarDatosAuxiliares();
            if (nuevoProd && nuevoProd.id_producto) {
              agregarInsumoDeCatalogo(nuevoProd);
            }
          }}
        />
      )}
    </div>
  );
}
