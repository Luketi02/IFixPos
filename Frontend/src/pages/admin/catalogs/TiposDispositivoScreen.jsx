import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../../context/useAuth';
import CatalogLayout from '../../../components/catalogs/CatalogLayout';
import CatalogTable from '../../../components/catalogs/CatalogTable';
import CatalogCreateModal from '../../../components/catalogs/CatalogCreateModal';
import CatalogStatusConfirmModal from '../../../components/catalogs/CatalogStatusConfirmModal';

import { API_BASE_URL } from '../../../config/api';
/**
 * Pantalla de Gestión de Tipos de Dispositivo (Familias Tecnológicas).
 * Integra selección múltiple, baja masiva, "Activar Todos" y activación directa sin advertencia.
 */
export default function TiposDispositivoScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [tipos, setTipos] = useState([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [debouncedBusqueda, setDebouncedBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState(''); // '' (todos), 'true', 'false'

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState([]);

  // Modales y Feedback
  const [modalCrearAbierto, setModalCrearAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [itemParaCambioEstado, setItemParaCambioEstado] = useState(null);
  const [bajaMasivaItems, setBajaMasivaItems] = useState(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [activandoTodos, setActivandoTodos] = useState(false);

  const [toastMensaje, setToastMensaje] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar alerta de error a los 15 segundos (Regla Global 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 15000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar toast a los 15 segundos
  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(''), 15000);
    return () => clearTimeout(t);
  }, [toastMensaje]);

  // Debounce para búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 400);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // Carga de Tipos de Dispositivo
  const cargarTipos = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const params = { solo_activos: false };
      if (estadoFiltro !== '') {
        params.estado = estadoFiltro;
      }

      const res = await axios.get(`${API_BASE_URL}/api/catalog/tipos-dispositivos/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setTipos(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar tipos de dispositivos:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar los tipos de dispositivo.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, estadoFiltro]);

  useEffect(() => {
    cargarTipos();
  }, [cargarTipos]);

  // Filtrado reactivo de texto
  const tiposFiltrados = useMemo(() => {
    if (!debouncedBusqueda.trim()) return tipos;
    const termino = debouncedBusqueda.toLowerCase();
    return tipos.filter((t) => t.nombre?.toLowerCase().includes(termino));
  }, [tipos, debouncedBusqueda]);

  // Métricas
  const stats = useMemo(() => {
    const total = tipos.length;
    const activos = tipos.filter((t) => t.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [tipos]);

  // Crear Tipo de Dispositivo
  const handleCrearTipo = async (formData) => {
    setCreando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/catalog/tipos-dispositivos/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mensaje = `Tipo de dispositivo '${res.data?.nombre || formData.nombre}' registrado con éxito.`;
      setToastMensaje(mensaje);
      setModalCrearAbierto(false);
      cargarTipos();
    } catch (err) {
      console.error('Error al crear tipo de dispositivo:', err);
      const data = err.response?.data;
      let msg = 'No se pudo crear el tipo de dispositivo.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (typeof data?.detail === 'string') {
        msg = data.detail;
      } else if (data?.nombre) {
        msg = Array.isArray(data.nombre) ? data.nombre[0] : String(data.nombre);
      }
      setErrorMessage(msg);
    } finally {
      setCreando(false);
    }
  };

  // Manejador del Switch individual
  // Regla Punto 5: SI SE ACTIVA, NO HAY ADVERTENCIA; SI SE DA DE BAJA, REQUIERE MODAL
  const handleToggleIndividual = async (item) => {
    if (!item.estado_activo) {
      try {
        await axios.patch(
          `${API_BASE_URL}/api/catalog/tipos-dispositivos/${item.id_tipo_dispositivo}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToastMensaje(`Tipo de dispositivo '${item.nombre}' reactivado con éxito.`);
        cargarTipos();
      } catch (err) {
        console.error('Error al activar tipo de dispositivo:', err);
        setErrorMessage(err.response?.data?.error || 'No se pudo activar el tipo de dispositivo.');
      }
    } else {
      setItemParaCambioEstado(item);
    }
  };

  // Confirmar Baja Individual
  const handleConfirmarBajaIndividual = async () => {
    if (!itemParaCambioEstado) return;
    setCambiandoEstado(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/catalog/tipos-dispositivos/${itemParaCambioEstado.id_tipo_dispositivo}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(`Tipo de dispositivo '${itemParaCambioEstado.nombre}' dado de baja exitosamente.`);
      setItemParaCambioEstado(null);
      cargarTipos();
    } catch (err) {
      console.error('Error al dar de baja tipo de dispositivo:', err);
      setErrorMessage(err.response?.data?.error || 'No se pudo actualizar el estado del tipo de dispositivo.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Activar Todos (Punto 1 y 5: sin advertencia)
  const handleActivarTodos = async () => {
    const inactivos = tipos.filter((t) => !t.estado_activo);
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      await Promise.all(
        inactivos.map((t) =>
          axios.patch(`${API_BASE_URL}/api/catalog/tipos-dispositivos/${t.id_tipo_dispositivo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se activaron ${inactivos.length} tipo(s) de dispositivo correctamente.`);
      cargarTipos();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error al activar todos los tipos:', err);
      setErrorMessage('Ocurrió un error al activar todos los tipos de dispositivo.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Activar Seleccionados (sin advertencia)
  const handleBulkActivate = async () => {
    const inactivos = tipos.filter((t) => selectedIds.includes(t.id_tipo_dispositivo) && !t.estado_activo);
    if (inactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    try {
      await Promise.all(
        inactivos.map((t) =>
          axios.patch(`${API_BASE_URL}/api/catalog/tipos-dispositivos/${t.id_tipo_dispositivo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se reactivaron ${inactivos.length} tipo(s) de dispositivo.`);
      setSelectedIds([]);
      cargarTipos();
    } catch (err) {
      console.error('Error al reactivar tipos seleccionados:', err);
      setErrorMessage('Error al reactivar los elementos seleccionados.');
    }
  };

  // Solicitar Baja Masiva
  const handleBulkDeactivateRequest = () => {
    const activos = tipos.filter((t) => selectedIds.includes(t.id_tipo_dispositivo) && t.estado_activo);
    if (activos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran inactivos.');
      return;
    }
    setBajaMasivaItems(activos);
  };

  // Confirmar Baja Masiva
  const handleConfirmarBajaMasiva = async () => {
    if (!bajaMasivaItems || bajaMasivaItems.length === 0) return;
    setCambiandoEstado(true);
    try {
      await Promise.all(
        bajaMasivaItems.map((t) =>
          axios.patch(`${API_BASE_URL}/api/catalog/tipos-dispositivos/${t.id_tipo_dispositivo}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se dieron de baja ${bajaMasivaItems.length} tipo(s) de dispositivo.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      cargarTipos();
    } catch (err) {
      console.error('Error en baja masiva:', err);
      setErrorMessage('Ocurrió un error al procesar la baja masiva.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Columnas de la grilla
  const columnas = [
    {
      key: 'id_tipo_dispositivo',
      label: 'ID',
      className: 'font-mono text-cyan-400 font-semibold w-20'
    },
    {
      key: 'nombre',
      label: 'Familia Tecnológica (Tipo de Dispositivo)',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="font-semibold text-slate-100 text-sm">{item.nombre}</span>
        </div>
      )
    }
  ];

  // Campos para el modal de creación
  const camposCrear = [
    {
      name: 'nombre',
      label: 'Nombre del Tipo de Dispositivo',
      type: 'text',
      placeholder: 'Ej. Smartphone, Tablet, Notebook, Consola Portátil...',
      required: true,
      helperText: 'Estandariza la taxonomía de la plataforma impidiendo la proliferación de categorías duplicadas.'
    }
  ];

  // Filtro extra de Estado
  const extraFilters = (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">Estado:</label>
      <select
        value={estadoFiltro}
        onChange={(e) => setEstadoFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todos los estados</option>
        <option value="true">Solo Activos</option>
        <option value="false">Solo Inactivos (Baja)</option>
      </select>
    </div>
  );

  return (
    <CatalogLayout
      title="Gestión de Tipos de Dispositivo"
      subtitle="Definición de familias y categorías de hardware para clasificar los ingresos técnicos."
      badgeText="Familias Tecnológicas"
      activeMenu="catalog-tipos-dispositivo"
      onNew={() => setModalCrearAbierto(true)}
      newButtonText="Nuevo Tipo"
      onActivateAll={handleActivarTodos}
      loadingActivateAll={activandoTodos}
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar tipo de dispositivo..."
      stats={stats}
      extraFilters={extraFilters}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
    >
      <CatalogTable
        columns={columnas}
        data={tiposFiltrados}
        loading={cargando}
        idField="id_tipo_dispositivo"
        statusField="estado_activo"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivateRequest}
        onToggleStatus={handleToggleIndividual}
        emptyMessage="No se encontraron tipos de dispositivo que coincidan con la búsqueda."
      />

      {/* Modal de Creación */}
      <CatalogCreateModal
        isOpen={modalCrearAbierto}
        onClose={() => setModalCrearAbierto(false)}
        onSubmit={handleCrearTipo}
        title="Crear Tipo de Dispositivo"
        subtitle="Especifique el nombre de la nueva categoría tecnológica."
        fields={camposCrear}
        loading={creando}
      />

      {/* Modal de Confirmación de Baja Individual */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(itemParaCambioEstado)}
        onClose={() => setItemParaCambioEstado(null)}
        onConfirm={handleConfirmarBajaIndividual}
        itemName={itemParaCambioEstado?.nombre || ''}
        currentStatus={true}
        entityTitle="Tipo de Dispositivo"
        implicationsText="Inhabilitar una categoría previene su selección en nuevos registros y diagnósticos técnicos, preservando inmutablemente el historial de reparaciones asociadas."
        loading={cambiandoEstado}
      />

      {/* Modal de Confirmación de Baja Masiva */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} tipos seleccionados`}
        currentStatus={true}
        entityTitle="Tipos de Dispositivo"
        implicationsText={`Dará de baja ${bajaMasivaItems?.length || 0} categorías tecnológicas en lote. Estas familias no podrán seleccionarse en nuevos registros técnicos.`}
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}
