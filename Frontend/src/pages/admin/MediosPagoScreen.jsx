import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import CatalogLayout from '../../components/catalogs/CatalogLayout';
import CatalogTable from '../../components/catalogs/CatalogTable';
import CatalogStatusConfirmModal from '../../components/catalogs/CatalogStatusConfirmModal';
import RegistrarMedioPagoModal from '../../components/sales/RegistrarMedioPagoModal';

import { API_BASE_URL } from '../../config/api';
/**
 * Pantalla de Gestión de Medios de Pago (Ventas y Facturación).
 * Implementa CU-82 (Registrar Medio de Pago) y CU-83 (Cambiar Estado de Medio de Pago).
 * Diseño Cyber-Tech Dark Mode (Tailwind CSS v4).
 */
export default function MediosPagoScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [mediosPago, setMediosPago] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState(''); // '' (todos), 'true', 'false'

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState([]);

  // Modales y Feedback
  const [modalRegistrarAbierto, setModalRegistrarAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [errorCreacion, setErrorCreacion] = useState('');
  const [reactivacionPendiente, setReactivacionPendiente] = useState(null);

  const [itemParaCambioEstado, setItemParaCambioEstado] = useState(null);
  const [bajaMasivaItems, setBajaMasivaItems] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [activandoTodos, setActivandoTodos] = useState(false);

  const [toastMensaje, setToastMensaje] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar alertas a los 6 segundos (Regla Global 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(''), 6000);
    return () => clearTimeout(t);
  }, [toastMensaje]);

  // Debounce para búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 300);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // Carga de Medios de Pago desde el Backend (consulta con 'todos=true' para ver inactivos)
  const cargarMediosPago = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/medios-pago/?todos=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMediosPago(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar medios de pago:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar los canales de cobro.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargarMediosPago();
  }, [cargarMediosPago]);

  // Filtrado local reactivo
  const mediosFiltrados = useMemo(() => {
    return mediosPago.filter((m) => {
      const nombre = (m.nombre_medio_pago || m.nombre || '').toLowerCase();
      const matchTexto = debouncedBusqueda.trim()
        ? nombre.includes(debouncedBusqueda.toLowerCase())
        : true;

      const estadoItem = Boolean(m.estado !== undefined ? m.estado : m.estado_activo);
      let matchEstado = true;
      if (estadoFiltro === 'true') matchEstado = estadoItem === true;
      if (estadoFiltro === 'false') matchEstado = estadoItem === false;

      return matchTexto && matchEstado;
    });
  }, [mediosPago, debouncedBusqueda, estadoFiltro]);

  // Métricas
  const stats = useMemo(() => {
    const total = mediosPago.length;
    const activos = mediosPago.filter((m) => m.estado !== undefined ? m.estado : m.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [mediosPago]);

  // CU-82: Registrar nuevo medio de pago
  const handleRegistrar = async ({ nombre, recargo }) => {
    setErrorCreacion('');
    setReactivacionPendiente(null);
    setCreando(true);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/sales/medios-pago/registrar/`,
        {
          nombre,
          recargo: parseFloat(recargo) || 0.00
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(res.data?.mensaje || 'Medio de pago registrado con éxito.');
      setModalRegistrarAbierto(false);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error al registrar medio de pago:', err);
      const data = err.response?.data;
      const detail = data?.detail;

      // Excepción Paso 4: Si el medio de pago ya existía pero estaba deshabilitado
      if (detail && typeof detail === 'object' && detail.confirmar_reactivacion) {
        setReactivacionPendiente({
          nombre,
          recargo: parseFloat(recargo) || 0.00,
          mensaje: detail.confirmar_reactivacion
        });
      } else {
        const msg =
          (typeof detail === 'string' ? detail : null) ||
          (Array.isArray(detail) ? detail.join(' ') : null) ||
          data?.error ||
          data?.nombre?.[0] ||
          'No se pudo registrar el canal de cobro. Verifique los datos ingresados.';
        setErrorCreacion(msg);
      }
    } finally {
      setCreando(false);
    }
  };

  // Confirmar Reactivación de un medio inactivo
  const handleConfirmarReactivacion = async () => {
    if (!reactivacionPendiente) return;
    setCreando(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/sales/medios-pago/registrar/`,
        {
          nombre: reactivacionPendiente.nombre,
          recargo: reactivacionPendiente.recargo,
          confirmar_reactivacion: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(res.data?.mensaje || 'Medio de pago reactivado con éxito.');
      setModalRegistrarAbierto(false);
      setReactivacionPendiente(null);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error al reactivar medio de pago:', err);
      const data = err.response?.data;
      const msg = data?.error || data?.detail || 'No fue posible reactivar el canal de cobro.';
      setErrorCreacion(msg);
    } finally {
      setCreando(false);
    }
  };

  // CU-83: Alternar estado individual
  const handleSolicitarToggleEstado = (item) => {
    const estadoActual = Boolean(item.estado !== undefined ? item.estado : item.estado_activo);
    if (!estadoActual) {
      // Activación directa inmediata (sin advertencia innecesaria)
      ejecutarCambioEstadoDirecto(item);
    } else {
      // Inhabilitación: advertencia de confirmación explícita
      setItemParaCambioEstado(item);
    }
  };

  const ejecutarCambioEstadoDirecto = async (item) => {
    const id = item.id_mediopago !== undefined ? item.id_mediopago : item.id;
    setCambiandoEstado(true);
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/sales/medios-pago/${id}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToastMensaje(res.data?.mensaje || 'Estado del canal de cobro actualizado.');
      await cargarMediosPago();
    } catch (err) {
      console.error('Error al alternar estado:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al actualizar el estado.';
      setErrorMessage(msg);
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleConfirmarDesactivacion = async () => {
    if (!itemParaCambioEstado) return;
    const id = itemParaCambioEstado.id_mediopago !== undefined ? itemParaCambioEstado.id_mediopago : itemParaCambioEstado.id;
    setCambiandoEstado(true);
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/sales/medios-pago/${id}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setToastMensaje(res.data?.mensaje || 'Medio de pago inhabilitado con éxito.');
      setItemParaCambioEstado(null);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error al inhabilitar medio de pago:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'Error al inhabilitar el medio de pago.';
      setErrorMessage(msg);
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Acciones Masivas
  const handleSolicitarBajaMasiva = () => {
    const itemsSeleccionados = mediosPago.filter((m) => {
      const id = m.id_mediopago !== undefined ? m.id_mediopago : m.id;
      return selectedIds.includes(id);
    });
    const activos = itemsSeleccionados.filter((m) => Boolean(m.estado !== undefined ? m.estado : m.estado_activo));
    if (activos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran inactivos.');
      return;
    }
    setBajaMasivaItems(activos);
  };

  const handleConfirmarBajaMasiva = async () => {
    if (!bajaMasivaItems || bajaMasivaItems.length === 0) return;
    setCambiandoEstado(true);
    try {
      await Promise.all(
        bajaMasivaItems.map((item) => {
          const id = item.id_mediopago !== undefined ? item.id_mediopago : item.id;
          return axios.patch(
            `${API_BASE_URL}/api/sales/medios-pago/${id}/estado/`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
        })
      );
      setToastMensaje(`${bajaMasivaItems.length} medio(s) de pago inhabilitado(s) correctamente.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error en baja masiva:', err);
      setErrorMessage('Ocurrió un error al procesar la inhabilitación masiva.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleActivarMasivo = async () => {
    const itemsSeleccionados = mediosPago.filter((m) => {
      const id = m.id_mediopago !== undefined ? m.id_mediopago : m.id;
      return selectedIds.includes(id);
    });
    const inactivos = itemsSeleccionados.filter((m) => !Boolean(m.estado !== undefined ? m.estado : m.estado_activo));
    if (inactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    setCambiandoEstado(true);
    try {
      await Promise.all(
        inactivos.map((item) => {
          const id = item.id_mediopago !== undefined ? item.id_mediopago : item.id;
          return axios.patch(
            `${API_BASE_URL}/api/sales/medios-pago/${id}/estado/`,
            {},
            { headers: { Authorization: `Bearer ${token}` } }
          );
        })
      );
      setToastMensaje(`${inactivos.length} canal(es) de cobro reactivado(s) correctamente.`);
      setSelectedIds([]);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error en activación masiva:', err);
      setErrorMessage('Ocurrió un error al reactivar los medios seleccionados.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  const handleActivarTodosInactivos = async () => {
    const inactivos = mediosPago.filter((m) => !(m.estado !== undefined ? m.estado : m.estado_activo));
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      for (const item of inactivos) {
        const id = item.id_mediopago !== undefined ? item.id_mediopago : item.id;
        await axios.patch(
          `${API_BASE_URL}/api/sales/medios-pago/${id}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      setToastMensaje(`Se activaron los ${inactivos.length} medios de pago correctamente.`);
      setSelectedIds([]);
      await cargarMediosPago();
    } catch (err) {
      console.error('Error al activar todos:', err);
      setErrorMessage('Error al reactivar la totalidad de los canales de cobro.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Columnas para la tabla
  const columns = [
    {
      key: 'id_mediopago',
      header: 'Código',
      render: (item) => (
        <span className="font-mono text-cyan-400 font-bold text-xs">
          CAN-{String(item.id_mediopago || item.id).padStart(3, '0')}
        </span>
      )
    },
    {
      key: 'nombre_medio_pago',
      header: 'Canal de Cobro',
      render: (item) => (
        <div className="flex items-center gap-2">
          <span className="text-base">💳</span>
          <span className="font-bold text-white text-xs">
            {item.nombre_medio_pago || item.nombre}
          </span>
        </div>
      )
    },
    {
      key: 'recargo',
      header: 'Recargo Financiero',
      render: (item) => {
        const num = parseFloat(item.recargo) || 0;
        return (
          <span className="font-mono text-xs text-slate-300">
            {num > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 font-semibold">
                +{num.toFixed(2)}%
              </span>
            ) : (
              <span className="text-slate-500">Sin recargo (0%)</span>
            )}
          </span>
        );
      }
    }
  ];

  return (
    <CatalogLayout
      category="Ventas & Facturación"
      title="Medios de Pago"
      subtitle="Configuración y habilitación de canales financieros de cobro para el mostrador y la tienda virtual."
      badgeText="Ventas & Facturación"
      activeMenu="sales-payments"
      onNew={() => {
        setErrorCreacion('');
        setReactivacionPendiente(null);
        setModalRegistrarAbierto(true);
      }}
      newButtonText="Nuevo Canal de Cobro"
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar canal por nombre..."
      stats={stats}
      extraFilters={
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">Filtrar:</span>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:border-cyan-400 transition-colors"
          >
            <option value="">Todos los Estados</option>
            <option value="true">Solo Habilitados</option>
            <option value="false">Solo Inactivos</option>
          </select>
        </div>
      }
      onActivateAll={handleActivarTodosInactivos}
      loadingActivateAll={activandoTodos}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
    >
      <CatalogTable
        columns={columns}
        data={mediosFiltrados}
        loading={cargando}
        idField="id_mediopago"
        statusField="estado"
        onToggleStatus={handleSolicitarToggleEstado}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkDeactivate={handleSolicitarBajaMasiva}
        onBulkActivate={handleActivarMasivo}
        emptyMessage="No se encontraron medios de pago registrados."
      />

      {/* Modal CU-82: Registrar Medio de Pago */}
      <RegistrarMedioPagoModal
        isOpen={modalRegistrarAbierto}
        onClose={() => {
          setModalRegistrarAbierto(false);
          setErrorCreacion('');
          setReactivacionPendiente(null);
        }}
        onSubmit={handleRegistrar}
        loading={creando}
        error={errorCreacion}
        reactivacionPendiente={reactivacionPendiente}
        onConfirmarReactivacion={handleConfirmarReactivacion}
      />

      {/* Modal CU-83: Confirmación para Inhabilitar Registro */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(itemParaCambioEstado)}
        onClose={() => setItemParaCambioEstado(null)}
        onConfirm={handleConfirmarDesactivacion}
        itemName={itemParaCambioEstado?.nombre_medio_pago || itemParaCambioEstado?.nombre || ''}
        currentStatus={Boolean(itemParaCambioEstado?.estado !== undefined ? itemParaCambioEstado?.estado : itemParaCambioEstado?.estado_activo)}
        entityTitle="Medio de Pago"
        implicationsText="Dejará de aparecer inmediatamente como opción al momento de facturar en la caja y en el checkout virtual."
        loading={cambiandoEstado}
      />

      {/* Modal Masivo: Confirmación de Baja Masiva */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems && bajaMasivaItems.length > 0)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} medios de pago seleccionados`}
        currentStatus={true}
        entityTitle="Medios de Pago en Lote"
        implicationsText="Se inhabilitarán los canales seleccionados para futuras ventas, protegiendo las facturas previas."
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}

