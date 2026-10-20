import { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import useAuth from '../../../context/useAuth';
import CatalogLayout from '../../../components/catalogs/CatalogLayout';
import CatalogTable from '../../../components/catalogs/CatalogTable';
import CatalogCreateModal from '../../../components/catalogs/CatalogCreateModal';
import CatalogStatusConfirmModal from '../../../components/catalogs/CatalogStatusConfirmModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Pantalla de Gestión de Categorías de Producto (Inventario y Tienda).
 * Integra selección múltiple, baja masiva, "Activar Todos" y activación directa sin advertencia.
 */
export default function CategoriasProductoScreen() {
  const { token } = useAuth();

  // Estados de datos
  const [categorias, setCategorias] = useState([]);
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

  // Auto-ocultar error a los 6 segundos (Regla Global 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar toast a los 4.5 segundos
  useEffect(() => {
    if (!toastMensaje) return undefined;
    const t = setTimeout(() => setToastMensaje(''), 4500);
    return () => clearTimeout(t);
  }, [toastMensaje]);

  // Debounce para búsqueda
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedBusqueda(textoBusqueda);
    }, 400);
    return () => clearTimeout(handler);
  }, [textoBusqueda]);

  // Carga de Categorías
  const cargarCategorias = useCallback(async () => {
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

      const res = await axios.get(`${API_BASE_URL}/api/catalog/categorias/`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      });

      setCategorias(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Error al cargar categorías de producto:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No se pudieron cargar las categorías.';
      setErrorMessage(msg);
    } finally {
      setCargando(false);
    }
  }, [token, debouncedBusqueda, estadoFiltro]);

  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  // Métricas
  const stats = useMemo(() => {
    const total = categorias.length;
    const activos = categorias.filter((c) => c.estado_activo).length;
    const inactivos = total - activos;
    return { total, activos, inactivos };
  }, [categorias]);

  // Crear Categoría
  const handleCrearCategoria = async (formData) => {
    setCreando(true);
    try {
      const payload = {
        nombre: formData.nombre.trim(),
        descripcion: (formData.descripcion || '').trim()
      };

      const res = await axios.post(`${API_BASE_URL}/api/catalog/categorias/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const mensaje = `Categoría '${res.data?.nombre || formData.nombre}' agregada con éxito al catálogo.`;
      setToastMensaje(mensaje);
      setModalCrearAbierto(false);
      cargarCategorias();
    } catch (err) {
      console.error('Error al crear categoría de producto:', err);
      const data = err.response?.data;
      let msg = 'No se pudo crear la categoría.';
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
          `${API_BASE_URL}/api/catalog/categorias/${item.id_categoria}/estado/`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setToastMensaje(`Categoría '${item.nombre}' reactivada con éxito.`);
        cargarCategorias();
      } catch (err) {
        console.error('Error al activar categoría:', err);
        setErrorMessage(err.response?.data?.error || 'No se pudo activar la categoría.');
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
        `${API_BASE_URL}/api/catalog/categorias/${itemParaCambioEstado.id_categoria}/estado/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setToastMensaje(`Categoría '${itemParaCambioEstado.nombre}' dada de baja exitosamente.`);
      setItemParaCambioEstado(null);
      cargarCategorias();
    } catch (err) {
      console.error('Error al cambiar estado de categoría:', err);
      setErrorMessage(err.response?.data?.error || 'No se pudo actualizar el estado de la categoría.');
    } finally {
      setCambiandoEstado(false);
    }
  };

  // Activar Todos (Punto 1 y 5: sin advertencia)
  const handleActivarTodos = async () => {
    const inactivos = categorias.filter((c) => !c.estado_activo);
    if (inactivos.length === 0) return;

    setActivandoTodos(true);
    try {
      await Promise.all(
        inactivos.map((c) =>
          axios.patch(`${API_BASE_URL}/api/catalog/categorias/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se activaron ${inactivos.length} categoría(s) de producto.`);
      cargarCategorias();
      setSelectedIds([]);
    } catch (err) {
      console.error('Error al activar todas las categorías:', err);
      setErrorMessage('Ocurrió un error al activar todas las categorías.');
    } finally {
      setActivandoTodos(false);
    }
  };

  // Activar Seleccionados (sin advertencia)
  const handleBulkActivate = async () => {
    const inactivos = categorias.filter((c) => selectedIds.includes(c.id_categoria) && !c.estado_activo);
    if (inactivos.length === 0) {
      setToastMensaje('Todos los registros seleccionados ya se encuentran activos.');
      return;
    }

    try {
      await Promise.all(
        inactivos.map((c) =>
          axios.patch(`${API_BASE_URL}/api/catalog/categorias/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se reactivaron ${inactivos.length} categoría(s) seleccionada(s).`);
      setSelectedIds([]);
      cargarCategorias();
    } catch (err) {
      console.error('Error en activación masiva:', err);
      setErrorMessage('Error al reactivar las categorías seleccionadas.');
    }
  };

  // Solicitar Baja Masiva
  const handleBulkDeactivateRequest = () => {
    const activos = categorias.filter((c) => selectedIds.includes(c.id_categoria) && c.estado_activo);
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
        bajaMasivaItems.map((c) =>
          axios.patch(`${API_BASE_URL}/api/catalog/categorias/${c.id_categoria}/estado/`, {}, {
            headers: { Authorization: `Bearer ${token}` }
          })
        )
      );
      setToastMensaje(`Se dieron de baja ${bajaMasivaItems.length} categoría(s) en lote.`);
      setBajaMasivaItems(null);
      setSelectedIds([]);
      cargarCategorias();
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
      key: 'id_categoria',
      label: 'ID',
      className: 'font-mono text-cyan-400 font-semibold w-20'
    },
    {
      key: 'nombre',
      label: 'Denominación de la Categoría',
      render: (item) => (
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          <span className="font-semibold text-slate-100 text-sm">{item.nombre}</span>
        </div>
      )
    },
    {
      key: 'descripcion',
      label: 'Descripción / Observaciones',
      render: (item) => (
        <span className="text-slate-400 text-xs line-clamp-1">
          {item.descripcion || <span className="italic text-slate-600">Sin descripción</span>}
        </span>
      )
    }
  ];

  // Campos para el modal de creación
  const camposCrear = [
    {
      name: 'nombre',
      label: 'Nombre de la Categoría',
      type: 'text',
      placeholder: 'Ej. Repuestos de Pantalla, Accesorios, Baterías...',
      required: true,
      helperText: 'Denominación para clasificar productos e insumos en el inventario comercial.'
    },
    {
      name: 'descripcion',
      label: 'Descripción Breve (Opcional)',
      type: 'textarea',
      placeholder: 'Indique una reseña o alcance para esta categoría...',
      required: false,
      rows: 3
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
        <option value="true">Solo Activas</option>
        <option value="false">Solo Inactivas (Baja)</option>
      </select>
    </div>
  );

  return (
    <CatalogLayout
      title="Gestión de Categorías de Producto"
      subtitle="Estructuración taxonómica del inventario para repuestos, insumos y artículos comerciales."
      badgeText="Catálogo de Inventario"
      activeMenu="catalog-categorias-producto"
      onNew={() => setModalCrearAbierto(true)}
      newButtonText="Nueva Categoría"
      onActivateAll={handleActivarTodos}
      loadingActivateAll={activandoTodos}
      searchValue={textoBusqueda}
      onSearchChange={setTextoBusqueda}
      searchPlaceholder="Buscar categoría por nombre..."
      stats={stats}
      extraFilters={extraFilters}
      errorMessage={errorMessage}
      onDismissError={() => setErrorMessage('')}
      toastMessage={toastMensaje}
      onDismissToast={() => setToastMensaje('')}
    >
      <CatalogTable
        columns={columnas}
        data={categorias}
        loading={cargando}
        idField="id_categoria"
        statusField="estado_activo"
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        onBulkActivate={handleBulkActivate}
        onBulkDeactivate={handleBulkDeactivateRequest}
        onToggleStatus={handleToggleIndividual}
        emptyMessage="No se encontraron categorías de producto registradas con los criterios provistos."
      />

      {/* Modal de Creación */}
      <CatalogCreateModal
        isOpen={modalCrearAbierto}
        onClose={() => setModalCrearAbierto(false)}
        onSubmit={handleCrearCategoria}
        title="Registrar Nueva Categoría"
        subtitle="Complete los datos solicitados para dar de alta una nueva agrupación comercial."
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
        entityTitle="Categoría de Producto"
        implicationsText="Al inhabilitar la categoría, se ejecutará un borrado lógico que impedirá su asignación a nuevos productos, garantizando la inmutabilidad de reportes contables e inventario histórico."
        loading={cambiandoEstado}
      />

      {/* Modal de Confirmación de Baja Masiva */}
      <CatalogStatusConfirmModal
        isOpen={Boolean(bajaMasivaItems)}
        onClose={() => setBajaMasivaItems(null)}
        onConfirm={handleConfirmarBajaMasiva}
        itemName={`${bajaMasivaItems?.length || 0} categorías seleccionadas`}
        currentStatus={true}
        entityTitle="Categorías de Producto"
        implicationsText={`Dará de baja ${bajaMasivaItems?.length || 0} categorías en lote. Los productos que pertenezcan a estas categorías conservarán su historial contable pero no admitirán nuevas cargas.`}
        loading={cambiandoEstado}
      />
    </CatalogLayout>
  );
}
