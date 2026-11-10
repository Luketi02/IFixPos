import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../../context/useAuth';
import CatalogLayout from '../../../components/catalogs/CatalogLayout';
import CatalogTable from '../../../components/catalogs/CatalogTable';
import CatalogCreateModal from '../../../components/catalogs/CatalogCreateModal';
import CatalogStatusConfirmModal from '../../../components/catalogs/CatalogStatusConfirmModal';

import { API_BASE_URL } from '../../../config/api';
/**
 * Pantalla de Gestión de Marcas Comerciales (Fabricantes).
 * Incorpora:
 * - Filtro de Estado (Todos, Solo Activas, Solo Inactivas).
 * - Selección múltiple y baja lógica masiva.
 * - "Activar Todos" y activación directa sin advertencia (Punto 5).
 * - Ordenamiento dinámico de columnas.
 */
export default function MarcasScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [marcas, setMarcas] = useState([]);
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
  const [bajaMasivaItems, setBajaMasivaItems] = useState(null); // array para confirmación masiva
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [activandoTodos, setActivandoTodos] = useState(false);

  const [toastMensaje, setToastMensaje] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-ocultar error a los 15 segundos (Regla Global 6)
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

  // Carga de Marcas
  const cargarMarcas = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    try {
      const params = {};
      if (debouncedBusqueda.trim()) {
        params.buscar = debouncedBusqueda.trim();
      }
      if (estadoFiltro !== '') {
        params.estado = estadoFiltro;
      }

      const res = await axios.get(`${API_BASE_URL}/api/catalog/marcas/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setMarcas(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar marcas:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar las marcas.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, debouncedBusqueda, estadoFiltro]);

  useEffect(() => {
    cargarMarcas();
  }, [cargarMarcas]);

  // Métricas
  const stats = useMemo(() => {
    const total = marcas.length;
    const activos = marcas.filter((m) => m.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [marcas]);

  // Registrar Marca
  const handleCrearMarca = async (formData) => {
    setCreando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/catalog/marcas/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mensaje = res.data?.mensaje || `Marca '${res.data?.nombre || formData.nombre}' guardada con éxito.`;
      setToastMensaje(mensaje);
      setModalCrearAbierto(false);
      cargarMarcas();
    } catch (err) {
      console.error('Error al registrar marca:', err);
      const data = err.response?.data;
      let msg = 'No se pudo registrar la marca.';
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
  // Regla Punto 5: SI SE VA A ACTIVAR, NO SE MUESTRA ADVERTENCIA (se activa directamente)
  // SI SE VA A DAR DE BAJA, se muestra modal de advertencia de auditoría
  const handleToggleIndividual = async (item) => {
    if (!item.estado_activo) {
      // Activar directamente sin modal de advertencia
      try {
        await axios.patch(
          `${API_BASE_URL}/api/catalog/marcas/${item.id_marca}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToastMensaje(`Marca '${item.nombre}' reactivada con éxito.`);
        cargarMarcas();
      } catch (err) {
        console.error('Error al activar marca:', err);
        setErrorMessage(err.response?.data?.error || 'No se pudo activar la marca.');
      }
    } else {
      // Dar de baja -> requiere confirmación y advertencia
      setItemParaCambioEstado(item);
    }
  };

  // Confirmar Baja Individual
  const handleConfirmarBajaIndividual = async () => {
    if (!itemParaCambioEstado) return;
    setCambiandoEstado(true);
    try {
      await axios.patch(
        `${API_BASE_URL}/api/catalog/marcas/${itemParaCambioEstado.id_marca}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(`Marca '${itemParaCambioEstado.nombre}' dada de baja exitosamente.`);
      setItemParaCambioEstado(null);
      cargarMarcas();
    } catch (err) {
      console.error('Error al dar de baja marca:', err);
      setErrorMessage(err.response?.data?.error || 'No se pudo actualizar el estado de la marca.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Activar Todos los registros inactivos (Punto 1 y 5: sin advertencia)
  const handleActivarTodos = async () => {
    const inactivos = marcas.filter((m) => !m.estado_activo);
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      await Promise.all(
        inactivos.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/marcas/${m.id_marca}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se activaron ${inactivos.length} marca(s) correctamente.`);
      cargarMarcas();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error al activar todas las marcas:', err);
      setErrorMessage('Ocurrió un error al intentar activar todos los registros.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Activar Masivo de Seleccionados (sin advertencia)
  const handleBulkActivate = async () => {
    const seleccionadosInactivos = marcas.filter(
      (m) => selectedIds.includes(m.id_marca) && !m.estado_activo
    );
    if (seleccionadosInactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    try {
      await Promise.all(
        seleccionadosInactivos.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/marcas/${m.id_marca}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se reactivaron ${seleccionadosInactivos.length} marca(s) seleccionada(s).`);
      setSelectedIds([]);
      cargarMarcas();
    } catch (err) {
      console.error('Error en activación masiva:', err);
      setErrorMessage('Error al reactivar las marcas seleccionadas.');
    }
  };

  // Preparar Baja Masiva (Punto 6: requiere confirmación)
  const handleBulkDeactivateRequest = () => {
    const seleccionadosActivos = marcas.filter(
      (m) => selectedIds.includes(m.id_marca) && m.estado_activo
    );
    if (seleccionadosActivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran inactivos.');
      return;
    }
    setBajaMasivaItems(seleccionadosActivos);
  };

  // Confirmar Baja Masiva
  const handleConfirmarBajaMasiva = async () => {
    if (!bajaMasivaItems || bajaMasivaItems.length === 0) return;
    setCambiandoEstado(true);
    try {
      await Promise.all(
        bajaMasivaItems.map((m) =>
          axios.patch(`${API_BASE_URL}/api/catalog/marcas/${m.id_marca}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se dieron de baja ${bajaMasivaItems.length} marca(s) exitosamente.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      cargarMarcas();
    } catch (err) {
      console.error('Error en baja masiva:', err);
      setErrorMessage('Ocurrió un error al procesar la baja masiva.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Definición de columnas
  const columnas = [
    {
      key: 'id_marca',
      label: 'ID',
      className: 'font-mono text-cyan-400 font-semibold w-20'
    },
    {
      key: 'nombre',
      label: 'Nombre Comercial de la Marca',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-violet-400" />
          <span className="font-semibold text-slate-100 text-sm">{item.nombre}</span>
        </div>
      )
    }
  ];

  // Campos para el modal de creación
  const camposCrear = [
    {
      name: 'nombre',
      label: 'Nombre de la Marca',
      type: 'text',
      placeholder: 'Ej. Apple, Samsung, Motorola, Xiaomi...',
      required: true,
      helperText: 'Ingrese la denominación oficial del fabricante. No se admiten nombres vacíos ni duplicados.'
    }
  ];

  // Filtro extra de Estado (Punto 4)
  const extraFilters = (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <label className="text-xs font-semibold text-slate-400 whitespace-nowrap">Estado:</label>
      <select
        value={estadoFiltro}
        onChange={(e) => setEstadoFiltro(e.target.value)}
        className="px-3 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
      >
        <option value="">Todos los estados</option>
        <option value="true">Solo Activas</option>
        <option value="false">Solo Inactivas (Baja)</option>
      </select>
    </div>
  );

  return (
    <CatalogLayout
      title="Gestión de Marcas"
      subtitle="Administración de fabricantes y marcas maestras para la jerarquía de hardware."
      badgeText="Catálogo Maestro"
      activeMenu="catalog-marcas"
      onNew={() => setModalCrearAbierto(true)}
      newButtonText="Nueva Marca"
      onActivateAll={handleActivarTodos}
      loadingActivateAll={activandoTodos}
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar marca por nombre comercial..."
      stats={stats}
      extraFilters={extraFilters}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
    >
      <CatalogTable
        columns={columnas}
        data={marcas}
        loading={cargando}
        idField="id_marca"
        statusField="estado_activo"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivateRequest}
        onToggleStatus={handleToggleIndividual}
        emptyMessage="No se encontraron marcas registradas con el criterio de búsqueda provisto."
      />

      {/* Modal de Creación */}
      <CatalogCreateModal
        isOpen={modalCrearAbierto}
        onClose={() => setModalCrearAbierto(false)}
        onSubmit={handleCrearMarca}
        title="Registrar Nueva Marca"
        subtitle="Complete los datos para incorporar una nueva firma comercial al catálogo."
        fields={camposCrear}
        loading={creando}
      />

      {/* Modal de Confirmación de Baja Individual (Solo para desactivar) */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(itemParaCambioEstado)}
        onClose={() => setItemParaCambioEstado(null)}
        onConfirm={handleConfirmarBajaIndividual}
        itemName={itemParaCambioEstado?.nombre || ''}
        currentStatus={true}
        entityTitle="Marca Comercial"
        implicationsText="Al inhabilitar la marca, todos sus modelos dependientes quedarán ocultos en los selectores de recepción técnica y registro de equipos, protegiendo las órdenes de reparación pasadas."
        loading={cambiandoEstado}
      />

      {/* Modal de Confirmación de Baja Masiva (Punto 6) */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} marcas seleccionadas`}
        currentStatus={true}
        entityTitle="Marcas Seleccionadas"
        implicationsText={`Dará de baja ${bajaMasivaItems?.length || 0} marcas en lote. Esto ocultará sus respectivos modelos en los selectores del sistema preservando la trazabilidad histórica.`}
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}
