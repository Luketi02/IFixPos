import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { normalizarUrlImagen } from '../../utils/productImages';
import CyberNumberInput from '../common/CyberNumberInput';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function RegistrarProductoModal({ isOpen, onClose, onSuccess }) {
  const { token } = useAuth();

  // Control de partes del formulario (1: Datos del Insumo, 2: Configuración, 3: Imágenes)
  const [pasoActual, setPasoActual] = useState(1);

  // Estados de datos maestros
  const [categorias, setCategorias] = useState([]);
  const [cargandoCategorias, setCargandoCategorias] = useState(false);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [tiposDispositivo, setTiposDispositivo] = useState([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estados de carga de archivos de imagen
  const [subiendoPortada, setSubiendoPortada] = useState(false);
  const [subiendoGaleria, setSubiendoGaleria] = useState(false);

  // Estados para el sub-modal de creación rápida de modelo al vuelo
  const [modalNuevoModeloAbierto, setModalNuevoModeloAbierto] = useState(false);
  const [nuevoModeloNombre, setNuevoModeloNombre] = useState('');
  const [nuevoModeloTipo, setNuevoModeloTipo] = useState('');
  const [guardandoNuevoModelo, setGuardandoNuevoModelo] = useState(false);
  const [errorNuevoModelo, setErrorNuevoModelo] = useState('');

  // Estados para el sub-modal de creación rápida de nueva categoría al vuelo
  const [modalNuevaCategoriaAbierto, setModalNuevaCategoriaAbierto] = useState(false);
  const [nuevaCategoriaNombre, setNuevaCategoriaNombre] = useState('');
  const [nuevaCategoriaDescripcion, setNuevaCategoriaDescripcion] = useState('');
  const [guardandoNuevaCategoria, setGuardandoNuevaCategoria] = useState(false);
  const [errorNuevaCategoria, setErrorNuevaCategoria] = useState('');

  // Estados para el sub-modal de creación rápida de nueva marca al vuelo
  const [modalNuevaMarcaAbierto, setModalNuevaMarcaAbierto] = useState(false);
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('');
  const [guardandoNuevaMarca, setGuardandoNuevaMarca] = useState(false);
  const [errorNuevaMarca, setErrorNuevaMarca] = useState('');

  // Estados visuales para Drag & Drop de imágenes
  const [isDraggingPortada, setIsDraggingPortada] = useState(false);
  const [isDraggingGaleria, setIsDraggingGaleria] = useState(false);

  // Referencias a inputs de archivo ocultos
  const inputPortadaRef = useRef(null);
  const inputGaleriaRef = useRef(null);

  // Formulario reactivo
  const [formData, setFormData] = useState({
    nombre: '',
    id_categoria: '',
    ids_categorias: [],
    id_marca: '',
    id_modelo: '',
    id_tipo_dispositivo: '',
    imagen_principal: '',
    imagenes: [],
    descripcion: '',
    precio: '',
    stock_inicial: '0',
    stock_minimo: '0',
    apto_venta: true,
    apto_reparacion: false,
    consumible: false,
    modulo_automatico: false
  });

  // Auto-ocultar error temporal tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorMessage) return undefined;
    const t = setTimeout(() => setErrorMessage(''), 6000);
    return () => clearTimeout(t);
  }, [errorMessage]);

  // Auto-ocultar error de creación de nuevo modelo tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorNuevoModelo) return undefined;
    const t = setTimeout(() => setErrorNuevoModelo(''), 6000);
    return () => clearTimeout(t);
  }, [errorNuevoModelo]);

  // Auto-ocultar error de creación de nueva categoría tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorNuevaCategoria) return undefined;
    const t = setTimeout(() => setErrorNuevaCategoria(''), 6000);
    return () => clearTimeout(t);
  }, [errorNuevaCategoria]);

  // Auto-ocultar error de creación de nueva marca tras 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorNuevaMarca) return undefined;
    const t = setTimeout(() => setErrorNuevaMarca(''), 6000);
    return () => clearTimeout(t);
  }, [errorNuevaMarca]);

  // Cargar categorías, marcas y tipos de dispositivo al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    // Resetear formulario y paso al abrir
    setPasoActual(1);
    setFormData({
      nombre: '',
      id_categoria: '',
      ids_categorias: [],
      id_marca: '',
      id_modelo: '',
      id_tipo_dispositivo: '',
      imagen_principal: '',
      imagenes: [],
      descripcion: '',
      precio: '',
      stock_inicial: '0',
      stock_minimo: '0',
      apto_venta: true,
      apto_reparacion: false,
      consumible: false,
      modulo_automatico: false
    });
    setErrorMessage('');
    setModelos([]);

    const fetchDatosIniciales = async () => {
      setCargandoCategorias(true);
      try {
        const [resCat, resMarcas, resTipos] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/catalog/categorias/`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          }),
          axios.get(`${API_BASE_URL}/api/catalog/marcas/`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            params: { solo_activas: true }
          }),
          axios.get(`${API_BASE_URL}/api/catalog/tipos-dispositivos/`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            params: { solo_activos: true }
          })
        ]);

        const dataCat = Array.isArray(resCat.data) ? resCat.data : [];
        setCategorias(dataCat);
        if (dataCat.length > 0) {
          setFormData((prev) => ({
            ...prev,
            id_categoria: String(dataCat[0].id_categoria),
            ids_categorias: prev.ids_categorias.length > 0 ? prev.ids_categorias : [String(dataCat[0].id_categoria)]
          }));
        }

        const dataMarcas = Array.isArray(resMarcas.data) ? resMarcas.data : [];
        setMarcas(dataMarcas);

        const dataTipos = Array.isArray(resTipos.data) ? resTipos.data : [];
        setTiposDispositivo(dataTipos);
      } catch (err) {
        console.error('Error al cargar dependencias para registro de producto:', err);
        setErrorMessage('No fue posible cargar las dependencias del catálogo. Intente nuevamente.');
      } finally {
        setCargandoCategorias(false);
      }
    };

    fetchDatosIniciales();
  }, [isOpen, token]);

  // Cargar modelos dependientes de la marca seleccionada
  useEffect(() => {
    if (!formData.id_marca) {
      setModelos([]);
      setFormData((prev) => ({ ...prev, id_modelo: '' }));
      return;
    }

    const fetchModelos = async () => {
      setCargandoModelos(true);
      try {
        const res = await axios.get(`${API_BASE_URL}/api/catalog/modelos/`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          params: { id_marca: formData.id_marca, estado_activo: true }
        });
        setModelos(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error('Error al cargar modelos de la marca:', err);
      } finally {
        setCargandoModelos(false);
      }
    };

    fetchModelos();
  }, [formData.id_marca, token]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // Abrir sub-modal para crear una nueva categoría de producto al vuelo
  const abrirModalNuevaCategoria = () => {
    setNuevaCategoriaNombre('');
    setNuevaCategoriaDescripcion('');
    setErrorNuevaCategoria('');
    setModalNuevaCategoriaAbierto(true);
  };

  // Guardar nueva categoría de producto en la BD y asociarla al producto de inmediato
  const handleCrearNuevaCategoria = async (e) => {
    if (e) e.preventDefault();
    const nombreLimpio = nuevaCategoriaNombre.trim();
    if (!nombreLimpio) {
      setErrorNuevaCategoria('El nombre de la categoría es obligatorio.');
      return;
    }

    setGuardandoNuevaCategoria(true);
    setErrorNuevaCategoria('');

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/catalog/categorias/`,
        {
          nombre: nombreLimpio,
          descripcion: nuevaCategoriaDescripcion.trim()
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );

      const catCreada = res.data?.categoria || res.data;
      const nuevoId = String(catCreada.id_categoria);

      // Actualizar listado de categorías locales
      setCategorias((prev) => {
        const existe = prev.some((c) => String(c.id_categoria) === nuevoId);
        if (existe) {
          return prev.map((c) => (String(c.id_categoria) === nuevoId ? { ...c, ...catCreada, estado_activo: true } : c));
        }
        return [...prev, catCreada];
      });

      // Vincular de inmediato al formulario del producto
      setFormData((prev) => {
        const nuevosIds = prev.ids_categorias.includes(nuevoId)
          ? prev.ids_categorias
          : [...prev.ids_categorias, nuevoId];
        return {
          ...prev,
          ids_categorias: nuevosIds,
          id_categoria: prev.id_categoria || nuevoId
        };
      });

      setModalNuevaCategoriaAbierto(false);
    } catch (err) {
      console.error('Error al registrar nueva categoría:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string'
        ? dataErr
        : dataErr?.error || dataErr?.detail || dataErr?.nombre?.[0] || 'Error al guardar la nueva categoría.';
      setErrorNuevaCategoria(msg);
    } finally {
      setGuardandoNuevaCategoria(false);
    }
  };

  // Abrir sub-modal para crear una nueva marca al vuelo
  const abrirModalNuevaMarca = () => {
    setNuevaMarcaNombre('');
    setErrorNuevaMarca('');
    setModalNuevaMarcaAbierto(true);
  };

  // Guardar nueva marca en la BD y seleccionarla de inmediato
  const handleCrearNuevaMarca = async (e) => {
    if (e) e.preventDefault();
    const nombreLimpio = nuevaMarcaNombre.trim();
    if (!nombreLimpio) {
      setErrorNuevaMarca('El nombre de la marca es obligatorio.');
      return;
    }

    setGuardandoNuevaMarca(true);
    setErrorNuevaMarca('');

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/catalog/marcas/`,
        { nombre: nombreLimpio },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );

      const marcaCreada = res.data?.marca || res.data;
      const nuevoIdMarca = String(marcaCreada.id_marca);

      setMarcas((prev) => {
        const existe = prev.some((m) => String(m.id_marca) === nuevoIdMarca);
        if (existe) {
          return prev.map((m) => (String(m.id_marca) === nuevoIdMarca ? { ...m, ...marcaCreada, estado_activo: true } : m));
        }
        return [...prev, marcaCreada];
      });

      setFormData((prev) => ({
        ...prev,
        id_marca: nuevoIdMarca
      }));

      setModalNuevaMarcaAbierto(false);
    } catch (err) {
      console.error('Error al registrar nueva marca:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string'
        ? dataErr
        : dataErr?.error || dataErr?.detail || dataErr?.nombre?.[0] || 'Error al guardar la nueva marca.';
      setErrorNuevaMarca(msg);
    } finally {
      setGuardandoNuevaMarca(false);
    }
  };

  // Abrir sub-modal para crear un nuevo modelo vinculado a la marca seleccionada
  const abrirModalNuevoModelo = () => {
    if (!formData.id_marca) {
      setErrorMessage('Por favor seleccione una Marca Comercial primero para vincular el nuevo modelo.');
      return;
    }
    setNuevoModeloNombre('');
    setErrorNuevoModelo('');
    // Usar el tipo de dispositivo ya seleccionado en el formulario, o el primero disponible
    const tipoDefecto = formData.id_tipo_dispositivo || (tiposDispositivo.length > 0 ? String(tiposDispositivo[0].id_tipo_dispositivo) : '');
    setNuevoModeloTipo(tipoDefecto);
    setModalNuevoModeloAbierto(true);
  };

  // Guardar nuevo modelo en la BD y asociarlo de inmediato al producto
  const handleCrearNuevoModelo = async (e) => {
    if (e) e.preventDefault();
    if (!nuevoModeloNombre.trim()) {
      setErrorNuevoModelo('El nombre del modelo es obligatorio.');
      return;
    }
    if (!nuevoModeloTipo) {
      setErrorNuevoModelo('Debe seleccionar un tipo de dispositivo.');
      return;
    }

    setGuardandoNuevoModelo(true);
    setErrorNuevoModelo('');

    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/catalog/modelos/`,
        {
          nombre: nuevoModeloNombre.trim(),
          id_marca: Number(formData.id_marca),
          id_tipo_dispositivo: Number(nuevoModeloTipo)
        },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );

      const modeloCreado = res.data?.modelo || res.data;
      const nuevoIdModelo = String(modeloCreado.id_modelo);

      // Actualizar listado de modelos locales
      setModelos((prev) => {
        const existe = prev.some((m) => String(m.id_modelo) === nuevoIdModelo);
        if (existe) {
          return prev.map((m) => (String(m.id_modelo) === nuevoIdModelo ? { ...m, ...modeloCreado, estado_activo: true } : m));
        }
        return [...prev, modeloCreado];
      });

      // Vincular de inmediato al formulario del producto y sincronizar tipo de dispositivo si está vacío
      setFormData((prev) => ({
        ...prev,
        id_modelo: nuevoIdModelo,
        id_tipo_dispositivo: prev.id_tipo_dispositivo || String(modeloCreado.id_tipo_dispositivo || nuevoModeloTipo)
      }));

      setModalNuevoModeloAbierto(false);
    } catch (err) {
      console.error('Error al registrar nuevo modelo:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string'
        ? dataErr
        : dataErr?.error || dataErr?.detail || dataErr?.nombre?.[0] || dataErr?.id_marca?.[0] || dataErr?.id_tipo_dispositivo?.[0] || 'Error al guardar el nuevo modelo.';
      setErrorNuevoModelo(msg);
    } finally {
      setGuardandoNuevoModelo(false);
    }
  };

  // Manejar selección de modelo en el select con detección de '+ Agregar nuevo'
  const handleModeloChange = (e) => {
    const val = e.target.value;
    if (val === '__crear_nuevo__') {
      abrirModalNuevoModelo();
      return;
    }
    const modeloSeleccionado = modelos.find((m) => String(m.id_modelo) === String(val));
    setFormData((prev) => ({
      ...prev,
      id_modelo: val,
      id_tipo_dispositivo: (!prev.id_tipo_dispositivo && modeloSeleccionado?.id_tipo_dispositivo)
        ? String(modeloSeleccionado.id_tipo_dispositivo)
        : prev.id_tipo_dispositivo
    }));
  };

  // Función genérica para subir un archivo de imagen al backend
  const subirArchivoServidor = async (file) => {
    const data = new FormData();
    data.append('imagen', file);

    const res = await axios.post(
      `${API_BASE_URL}/api/catalog/productos/subir-imagen/`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );
    return res.data?.url_imagen;
  };

  // Subir imagen de portada desde el dispositivo
  const handleSubirPortada = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoPortada(true);
    setErrorMessage('');
    try {
      const urlSubida = await subirArchivoServidor(file);
      if (urlSubida) {
        setFormData((prev) => ({ ...prev, imagen_principal: urlSubida }));
      }
    } catch (err) {
      console.error('Error al subir imagen de portada:', err);
      const msg = err.response?.data?.error || 'Error al subir la imagen seleccionada. Verifique que sea menor a 5MB y en formato JPG, PNG o WebP.';
      setErrorMessage(msg);
    } finally {
      setSubiendoPortada(false);
      if (inputPortadaRef.current) inputPortadaRef.current.value = '';
    }
  };

  // Subir una o varias fotos a la galería desde el dispositivo
  const handleSubirGaleria = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setSubiendoGaleria(true);
    setErrorMessage('');
    try {
      const urlsNuevas = [];
      for (const file of files) {
        const url = await subirArchivoServidor(file);
        if (url) urlsNuevas.push(url);
      }

      setFormData((prev) => ({
        ...prev,
        imagenes: [...prev.imagenes, ...urlsNuevas]
      }));
    } catch (err) {
      console.error('Error al subir imágenes a la galería:', err);
      const msg = err.response?.data?.error || 'Ocurrió un error al cargar algunas de las imágenes.';
      setErrorMessage(msg);
    } finally {
      setSubiendoGaleria(false);
      if (inputGaleriaRef.current) inputGaleriaRef.current.value = '';
    }
  };

  // Handlers para Drag & Drop de Portada Principal
  const handleDropPortada = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingPortada(false);
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      setErrorMessage('El archivo soltado debe ser una imagen válida (JPG, PNG, WebP).');
      return;
    }
    setSubiendoPortada(true);
    setErrorMessage('');
    try {
      const urlSubida = await subirArchivoServidor(file);
      if (urlSubida) {
        setFormData((prev) => ({ ...prev, imagen_principal: urlSubida }));
      }
    } catch (err) {
      console.error('Error al subir imagen de portada arrastrada:', err);
      const msg = err.response?.data?.error || 'Error al subir la imagen. Verifique que sea menor a 5MB y formato válido.';
      setErrorMessage(msg);
    } finally {
      setSubiendoPortada(false);
    }
  };

  // Handlers para Drag & Drop de Galería Complementaria
  const handleDropGaleria = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGaleria(false);
    const droppedFiles = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'));
    if (droppedFiles.length === 0) {
      setErrorMessage('No se encontraron imágenes válidas para añadir a la galería.');
      return;
    }
    setSubiendoGaleria(true);
    setErrorMessage('');
    try {
      const urlsNuevas = [];
      for (const file of droppedFiles) {
        const url = await subirArchivoServidor(file);
        if (url) urlsNuevas.push(url);
      }
      setFormData((prev) => ({
        ...prev,
        imagenes: [...prev.imagenes, ...urlsNuevas]
      }));
    } catch (err) {
      console.error('Error al subir imágenes arrastradas a galería:', err);
      setErrorMessage('Ocurrió un error al procesar las imágenes soltadas.');
    } finally {
      setSubiendoGaleria(false);
    }
  };

  const handleEliminarFotoGaleria = (indexAEliminar) => {
    setFormData((prev) => ({
      ...prev,
      imagenes: prev.imagenes.filter((_, idx) => idx !== indexAEliminar)
    }));
  };

  const handleEliminarPortada = () => {
    setFormData((prev) => ({ ...prev, imagen_principal: '' }));
  };

  // Validación de Propósito Funcional: Al menos uno entre apto_venta, apto_reparacion y consumible debe ser True
  const tieneProposito = formData.apto_venta || formData.apto_reparacion || formData.consumible;

  // Validaciones por pasos
  const tieneCategoria = (formData.ids_categorias && formData.ids_categorias.length > 0) || Boolean(formData.id_categoria);
  const paso1Valido =
    formData.nombre.trim() !== '' &&
    tieneCategoria &&
    formData.precio !== '' &&
    Number(formData.precio) >= 0;

  const paso2Valido =
    Number(formData.stock_inicial) >= 0 &&
    Number(formData.stock_minimo) >= 0 &&
    tieneProposito;

  const formularioValido = paso1Valido && paso2Valido && !enviando;

  const avanzarPaso = (e) => {
    if (e) e.preventDefault();
    if (pasoActual === 1) {
      if (!paso1Valido) {
        setErrorMessage('Por favor complete los campos obligatorios del insumo (Nombre, Categoría y Precio válido).');
        return;
      }
      setPasoActual(2);
    } else if (pasoActual === 2) {
      if (!paso2Valido) {
        setErrorMessage('Verifique los parámetros de stock y asegúrese de habilitar al menos un propósito funcional.');
        return;
      }
      setPasoActual(3);
    }
  };

  const retrocederPaso = () => {
    if (pasoActual > 1) {
      setPasoActual(pasoActual - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formularioValido) {
      if (!paso1Valido) {
        setPasoActual(1);
        setErrorMessage('Complete los datos obligatorios del insumo antes de guardar.');
        return;
      }
      if (!paso2Valido) {
        setPasoActual(2);
        setErrorMessage('Verifique los parámetros operativos antes de guardar.');
        return;
      }
      return;
    }

    setEnviando(true);
    setErrorMessage('');

    try {
      const imagenesLimpias = (formData.imagenes || []).map((u) => u.trim()).filter(Boolean);
      const imagenPrincipalLimpia = formData.imagen_principal.trim() || (imagenesLimpias.length > 0 ? imagenesLimpias[0] : null);

      const listaIdsCategorias = (formData.ids_categorias && formData.ids_categorias.length > 0)
        ? formData.ids_categorias.map(Number)
        : formData.id_categoria ? [Number(formData.id_categoria)] : [];

      const payload = {
        nombre: formData.nombre.trim(),
        id_categoria: listaIdsCategorias[0] || null,
        ids_categorias: listaIdsCategorias,
        id_marca: formData.id_marca ? Number(formData.id_marca) : null,
        id_modelo: formData.id_modelo ? Number(formData.id_modelo) : null,
        id_tipo_dispositivo: formData.id_tipo_dispositivo ? Number(formData.id_tipo_dispositivo) : null,
        imagen_principal: imagenPrincipalLimpia,
        imagenes: imagenesLimpias,
        descripcion: formData.descripcion.trim(),
        precio: parseFloat(formData.precio),
        stock_inicial: parseInt(formData.stock_inicial, 10) || 0,
        stock_minimo: parseInt(formData.stock_minimo, 10) || 0,
        apto_venta: Boolean(formData.apto_venta),
        apto_reparacion: Boolean(formData.apto_reparacion),
        consumible: Boolean(formData.consumible),
        modulo_automatico: Boolean(formData.modulo_automatico)
      };

      const res = await axios.post(
        `${API_BASE_URL}/api/catalog/productos/registrar/`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const msg = res.data?.mensaje || `Producto '${formData.nombre}' registrado con éxito.`;
      if (onSuccess) onSuccess(msg);
      onClose();
    } catch (err) {
      console.error('Error al registrar producto:', err);
      const dataErr = err.response?.data;
      const msg = typeof dataErr === 'string' ? dataErr : dataErr?.error || dataErr?.detail || (Array.isArray(dataErr?.non_field_errors) ? dataErr.non_field_errors[0] : null);
      setErrorMessage(msg || 'Error al guardar el producto. Verifique los datos ingresados.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-3 sm:p-5 selection:bg-cyan-500/30 selection:text-cyan-200">
          {/* Backdrop con desenfoque */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
          />

          {/* Contenedor del Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 14 }}
            transition={{ duration: 0.22 }}
            className="relative w-full max-w-3xl bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden my-6 z-10 flex flex-col max-h-[92vh]"
          >
            {/* Cabecera del Modal */}
            <div className="px-6 py-4 border-b border-slate-700/80 bg-slate-900/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">Registrar Nuevo Producto</h2>
                  <p className="text-xs text-slate-400 font-mono">Alta en catálogo comercial y parámetros operativos</p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                title="Cerrar modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Barra de Pasos / Pestañas (3 Partes Estructuradas) */}
            <div className="px-6 py-3 border-b border-slate-700/70 bg-slate-900/40 grid grid-cols-3 gap-2 shrink-0">
              {/* Parte 1 */}
              <button
                type="button"
                onClick={() => setPasoActual(1)}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  pasoActual === 1
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  pasoActual === 1 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  1
                </span>
                <span className="truncate">Datos del Insumo</span>
              </button>

              {/* Parte 2 */}
              <button
                type="button"
                onClick={() => {
                  if (paso1Valido) setPasoActual(2);
                  else setErrorMessage('Complete los datos obligatorios del paso 1 primero.');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  pasoActual === 2
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  pasoActual === 2 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  2
                </span>
                <span className="truncate">Configuración</span>
              </button>

              {/* Parte 3 */}
              <button
                type="button"
                onClick={() => {
                  if (paso1Valido && paso2Valido) setPasoActual(3);
                  else setErrorMessage('Complete los datos de insumo y configuración antes de ir a imágenes.');
                }}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  pasoActual === 3
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm shadow-cyan-900/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  pasoActual === 3 ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  3
                </span>
                <span className="truncate">Imágenes y Galería</span>
              </button>
            </div>

            {/* Alerta de Error Temporal (6 segundos) */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="px-6 pt-4 shrink-0"
                >
                  <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-2 shadow-inner">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>{errorMessage}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setErrorMessage('')}
                      className="text-rose-400 hover:text-rose-200 cursor-pointer"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Contenido del Formulario por Partes */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-5">
              
              {/* ========================================================= */}
              {/* PARTE 1: DATOS DEL INSUMO                                 */}
              {/* ========================================================= */}
              {pasoActual === 1 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Nombre del Producto */}
                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="nombre-producto" className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Nombre del Producto / Insumo <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        id="nombre-producto"
                        type="text"
                        name="nombre"
                        value={formData.nombre}
                        onChange={handleChange}
                        placeholder="Ej. Pantalla OLED iPhone 13 Pro Max"
                        required
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                      />
                    </div>

                    {/* Categorías (Soporte Múltiple N a M) */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                          Categorías Asociadas <span className="text-cyan-400">*</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-cyan-400 font-mono">
                            {formData.ids_categorias.length} seleccionada{formData.ids_categorias.length !== 1 ? 's' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={abrirModalNuevaCategoria}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                            title="Crear una nueva categoría de producto al vuelo"
                          >
                            <span>+</span>
                            <span>Nueva Categoría</span>
                          </button>
                        </div>
                      </div>

                      {/* Chips / Badges de Categorías Seleccionadas */}
                      <div className="flex flex-wrap gap-1.5 min-h-[42px] p-2 rounded-xl bg-[#0F172A] border border-slate-700">
                        {formData.ids_categorias.length === 0 ? (
                          <span className="text-xs text-slate-500 italic py-1 px-1">
                            Selecciona una o más categorías abajo...
                          </span>
                        ) : (
                          formData.ids_categorias.map((idCat) => {
                            const catObj = categorias.find((c) => String(c.id_categoria) === String(idCat));
                            return (
                              <span
                                key={idCat}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500/20 to-cyan-500/10 text-purple-300 border border-purple-500/40 shadow-sm"
                              >
                                <span>{catObj ? catObj.nombre : `Cat #${idCat}`}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => {
                                      const nuevos = prev.ids_categorias.filter((c) => String(c) !== String(idCat));
                                      return {
                                        ...prev,
                                        ids_categorias: nuevos,
                                        id_categoria: nuevos[0] || ''
                                      };
                                    });
                                  }}
                                  className="text-purple-400 hover:text-white rounded-full p-0.5 hover:bg-purple-500/30 transition-colors ml-0.5"
                                  title="Quitar categoría"
                                >
                                  ✕
                                </button>
                              </span>
                            );
                          })
                        )}
                      </div>

                      {/* Dropdown para Añadir Categorías Adicionales */}
                      <select
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          if (val === '__crear_nueva_categoria__') {
                            abrirModalNuevaCategoria();
                            return;
                          }
                          if (!formData.ids_categorias.includes(val)) {
                            setFormData((prev) => {
                              const nuevos = [...prev.ids_categorias, val];
                              return {
                                ...prev,
                                ids_categorias: nuevos,
                                id_categoria: nuevos[0] || ''
                              };
                            });
                          }
                        }}
                        disabled={cargandoCategorias}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                      >
                        <option value="">+ Asignar otra categoría (ej. Pantallas, Periféricos, Gamer...)</option>
                        {categorias
                          .filter((cat) => !formData.ids_categorias.includes(String(cat.id_categoria)))
                          .map((cat) => (
                            <option key={cat.id_categoria} value={cat.id_categoria}>
                              {cat.nombre}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Precio de Venta */}
                    <div className="space-y-1.5">
                      <label htmlFor="precio-producto" className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Precio de Venta ($ ARS) <span className="text-cyan-400">*</span>
                      </label>
                      <CyberNumberInput
                        id="precio-producto"
                        name="precio"
                        step="0.01"
                        min="0"
                        prefix="$"
                        value={formData.precio}
                        onChange={handleChange}
                        placeholder="0.00"
                        required
                        inputClassName="!text-cyan-300 font-semibold"
                      />
                    </div>

                    {/* Marca Comercial */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="id-marca-producto" className="text-xs font-semibold text-slate-300">
                          Marca Comercial
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={abrirModalNuevaMarca}
                            className="text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors text-cyan-400 hover:text-cyan-300 hover:underline active:scale-95"
                            title="Registrar y vincular una nueva marca comercial al vuelo"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Nueva Marca</span>
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono">Opcional</span>
                        </div>
                      </div>
                      <select
                        id="id-marca-producto"
                        name="id_marca"
                        value={formData.id_marca}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__crear_nueva_marca__') {
                            abrirModalNuevaMarca();
                            return;
                          }
                          handleChange(e);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                      >
                        <option value="">Sin marca / Genérico</option>
                        {marcas.map((m) => (
                          <option key={m.id_marca} value={m.id_marca}>
                            {m.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Modelo Compatible */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="id-modelo-producto" className="text-xs font-semibold text-slate-300">
                          Modelo Compatible
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={abrirModalNuevoModelo}
                            className={`text-[11px] font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                              formData.id_marca
                                ? 'text-cyan-400 hover:text-cyan-300 hover:underline'
                                : 'text-slate-500 hover:text-cyan-400'
                            }`}
                            title={formData.id_marca ? 'Registrar y vincular nuevo modelo para esta marca' : 'Seleccione primero una marca comercial'}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Nuevo Modelo</span>
                          </button>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {cargandoModelos ? 'Cargando...' : 'Opcional'}
                          </span>
                        </div>
                      </div>
                      <select
                        id="id-modelo-producto"
                        name="id_modelo"
                        value={formData.id_modelo}
                        onChange={handleModeloChange}
                        disabled={!formData.id_marca || cargandoModelos}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer disabled:opacity-50"
                      >
                        <option value="">
                          {!formData.id_marca ? 'Seleccione marca primero...' : 'No específico / Todos los modelos'}
                        </option>
                        {modelos.map((mod) => (
                          <option key={mod.id_modelo} value={mod.id_modelo}>
                            {mod.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Tipo de Dispositivo */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <label htmlFor="id-tipo-dispositivo-producto" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                        <span>Tipo de Dispositivo</span>
                        <span className="text-[10px] text-slate-500 font-mono">Opcional / Universal</span>
                      </label>
                      <select
                        id="id-tipo-dispositivo-producto"
                        name="id_tipo_dispositivo"
                        value={formData.id_tipo_dispositivo}
                        onChange={handleChange}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                      >
                        <option value="">Selección automática por modelo o no especificado</option>
                        {tiposDispositivo.map((t) => (
                          <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Descripción Técnica */}
                    <div className="sm:col-span-2 space-y-1.5">
                      <label htmlFor="desc-producto" className="text-xs font-semibold text-slate-300">
                        Descripción Técnica o Comercial
                      </label>
                      <textarea
                        id="desc-producto"
                        name="descripcion"
                        rows={3}
                        value={formData.descripcion}
                        onChange={handleChange}
                        placeholder="Detalles sobre compatibilidad de pines, calidad de display, precauciones de instalación..."
                        className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all resize-none"
                      />
                    </div>

                  </div>
                </motion.div>
              )}

              {/* ========================================================= */}
              {/* PARTE 2: OPCIONES DE CONFIGURACIÓN                        */}
              {/* ========================================================= */}
              {pasoActual === 2 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-4"
                >
                  {/* Parámetros de Existencias */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-3">
                    <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold block">
                      Parámetros de Existencias
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Stock Inicial */}
                      <div className="space-y-1.5">
                        <label htmlFor="stock-inicial-producto" className="text-xs font-medium text-slate-300">
                          Stock Inicial
                        </label>
                        <CyberNumberInput
                          id="stock-inicial-producto"
                          name="stock_inicial"
                          min="0"
                          step="1"
                          value={formData.stock_inicial}
                          onChange={handleChange}
                          required
                        />
                        <p className="text-[10px] text-slate-400">Cantidad física disponible al dar de alta el producto.</p>
                      </div>

                      {/* Stock Mínimo */}
                      <div className="space-y-1.5">
                        <label htmlFor="stock-minimo-producto" className="text-xs font-medium text-slate-300">
                          Stock Mínimo (Punto de Alerta)
                        </label>
                        <CyberNumberInput
                          id="stock-minimo-producto"
                          name="stock_minimo"
                          min="0"
                          step="1"
                          value={formData.stock_minimo}
                          onChange={handleChange}
                          required
                        />
                        <p className="text-[10px] text-slate-400">Umbral para disparar alertas de reposición automática.</p>
                      </div>
                    </div>
                  </div>

                  {/* Directivas Operativas (Toggles Cyber-Tech) */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold">
                        Directivas Operativas y Disponibilidad
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Mínimo 1 propósito activo
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      
                      {/* Apto para Venta */}
                      <label className="flex items-center justify-between p-3 rounded-xl bg-[#0F172A] border border-slate-700/80 hover:border-cyan-500/40 cursor-pointer transition-all">
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">Apto para Venta</span>
                          <span className="text-[10px] text-slate-400">Visible en tienda y catálogo virtual</span>
                        </div>
                        <input
                          type="checkbox"
                          name="apto_venta"
                          checked={formData.apto_venta}
                          onChange={handleChange}
                          className="w-4 h-4 accent-[#06B6D4] rounded cursor-pointer"
                        />
                      </label>

                      {/* Apto para Reparación */}
                      <label className="flex items-center justify-between p-3 rounded-xl bg-[#0F172A] border border-slate-700/80 hover:border-cyan-500/40 cursor-pointer transition-all">
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">Apto para Reparación</span>
                          <span className="text-[10px] text-slate-400">Seleccionable como repuesto en taller</span>
                        </div>
                        <input
                          type="checkbox"
                          name="apto_reparacion"
                          checked={formData.apto_reparacion}
                          onChange={handleChange}
                          className="w-4 h-4 accent-[#06B6D4] rounded cursor-pointer"
                        />
                      </label>

                      {/* Consumible Interno */}
                      <label className="flex items-center justify-between p-3 rounded-xl bg-[#0F172A] border border-slate-700/80 hover:border-cyan-500/40 cursor-pointer transition-all">
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">Consumible Interno</span>
                          <span className="text-[10px] text-slate-400">Material gastable en procesos técnicos</span>
                        </div>
                        <input
                          type="checkbox"
                          name="consumible"
                          checked={formData.consumible}
                          onChange={handleChange}
                          className="w-4 h-4 accent-[#8B5CF6] rounded cursor-pointer"
                        />
                      </label>

                      {/* Módulo Automático */}
                      <label className="flex items-center justify-between p-3 rounded-xl bg-[#0F172A] border border-slate-700/80 hover:border-cyan-500/40 cursor-pointer transition-all">
                        <div>
                          <span className="text-xs font-semibold text-slate-200 block">Módulo Automático</span>
                          <span className="text-[10px] text-slate-400">Genera solicitud de cotización al escasear</span>
                        </div>
                        <input
                          type="checkbox"
                          name="modulo_automatico"
                          checked={formData.modulo_automatico}
                          onChange={handleChange}
                          className="w-4 h-4 accent-[#8B5CF6] rounded cursor-pointer"
                        />
                      </label>

                    </div>

                    {/* Advertencia si no tiene propósito funcional */}
                    {!tieneProposito && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>El artículo debe tener al menos un propósito funcional asignado.</span>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ========================================================= */}
              {/* PARTE 3: IMÁGENES (CARGA Y VISTA PREVIA)                  */}
              {/* ========================================================= */}
              {pasoActual === 3 && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-5"
                >
                  {/* Inputs de archivo ocultos nativos */}
                  <input
                    ref={inputPortadaRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSubirPortada}
                    className="hidden"
                  />
                  <input
                    ref={inputGaleriaRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleSubirGaleria}
                    className="hidden"
                  />

                  {/* 1. Imagen de Portada Principal */}
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 font-semibold flex items-center gap-2">
                        <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Foto de Portada Principal
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">Visible en la tarjeta de catálogo</span>
                    </div>

                    {formData.imagen_principal ? (
                      /* Vista previa de Portada Cargada con soporte Drag & Drop para reemplazo */
                      <div
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPortada(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPortada(false); }}
                        onDrop={handleDropPortada}
                        className={`relative group rounded-xl overflow-hidden border p-2 flex items-center gap-4 transition-all ${
                          isDraggingPortada
                            ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50 scale-[1.01]'
                            : 'border-cyan-500/40 bg-slate-950'
                        }`}
                      >
                        <div className="w-24 h-24 rounded-lg overflow-hidden bg-slate-900 shrink-0 border border-slate-700">
                          <img
                            src={normalizarUrlImagen(formData.imagen_principal)}
                            alt="Portada del producto"
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=400&q=80'; }}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                              Portada Asignada
                            </span>
                            <span className="text-xs text-slate-400">Archivo guardado en el servidor</span>
                          </div>
                          <p className="text-xs text-slate-300">
                            Esta imagen representará al producto en las vistas compactas y en la tienda. Puedes soltar otra imagen encima para reemplazarla.
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => inputPortadaRef.current?.click()}
                              disabled={subiendoPortada}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
                            >
                              Cambiar foto
                            </button>
                            <button
                              type="button"
                              onClick={handleEliminarPortada}
                              disabled={subiendoPortada}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-all cursor-pointer"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Zona de carga y Drag & Drop de portada cuando no hay imagen */
                      <div
                        onClick={() => inputPortadaRef.current?.click()}
                        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPortada(true); }}
                        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingPortada(false); }}
                        onDrop={handleDropPortada}
                        className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group ${
                          isDraggingPortada
                            ? 'border-cyan-400 bg-cyan-950/40 ring-2 ring-cyan-400/50 scale-[1.01]'
                            : 'border-slate-700 hover:border-cyan-500/60 bg-slate-950/40 hover:bg-slate-900/50'
                        }`}
                      >
                        {subiendoPortada ? (
                          <div className="flex flex-col items-center gap-2 py-2">
                            <svg className="animate-spin w-7 h-7 text-cyan-400" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span className="text-xs text-cyan-300 font-medium">Subiendo foto al servidor...</span>
                          </div>
                        ) : (
                          <>
                            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
                              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                            </div>
                            <div className="text-center">
                              <span className="text-xs font-semibold text-slate-200 group-hover:text-cyan-300 block transition-colors">
                                {isDraggingPortada ? '¡Suelta la imagen de portada aquí!' : 'Cargar foto de portada desde el dispositivo'}
                              </span>
                              <span className="text-[11px] text-slate-500">
                                Arrastra y suelta un archivo aquí, o haz clic para seleccionar (JPG, PNG, WebP hasta 5MB)
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 2. Galería de Fotos Complementarias */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingGaleria(true); }}
                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingGaleria(false); }}
                    onDrop={handleDropGaleria}
                    className={`p-4 rounded-xl bg-slate-900/60 border transition-all ${
                      isDraggingGaleria
                        ? 'border-purple-400 bg-purple-950/30 ring-2 ring-purple-400/50'
                        : 'border-slate-700/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-mono uppercase tracking-wider text-purple-400 font-semibold block">
                          Galería Complementaria
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Se exhibirán en el carrusel de especificaciones de la vista expandida (admite arrastrar y soltar varias fotos)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => inputGaleriaRef.current?.click()}
                        disabled={subiendoGaleria}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                      >
                        {subiendoGaleria ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5 text-purple-300" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Subiendo...</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span>Agregar fotos</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Grilla de Miniaturas de la Galería */}
                    {formData.imagenes && formData.imagenes.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-2">
                        {formData.imagenes.map((urlImg, idx) => (
                          <div
                            key={idx}
                            className="relative group rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 aspect-square"
                          >
                            <img
                              src={normalizarUrlImagen(urlImg)}
                              alt={`Galería ${idx + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=300&q=80'; }}
                            />
                            {/* Overlay con botón para eliminar */}
                            <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-1">
                              <button
                                type="button"
                                onClick={() => handleEliminarFotoGaleria(idx)}
                                className="p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                                title="Eliminar de la galería"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                            <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/80 text-slate-300">
                              #{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div
                        onClick={() => inputGaleriaRef.current?.click()}
                        className="p-5 rounded-xl border border-dashed border-slate-800 hover:border-purple-500/50 bg-slate-950/30 text-center cursor-pointer transition-all"
                      >
                        <p className="text-xs text-slate-300 font-medium">
                          {isDraggingGaleria ? '¡Suelta tus imágenes aquí para añadirlas a la galería!' : 'Arrastra y suelta imágenes aquí o haz clic para agregar a la galería'}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Puedes seleccionar varios archivos simultáneamente (JPG, PNG, WebP)
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Botones de Navegación y Acción Inferiores */}
              <div className="pt-3 flex items-center justify-between border-t border-slate-700/80 shrink-0">
                {/* Botón Izquierda: Cancelar o Anterior */}
                <div>
                  {pasoActual === 1 ? (
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={enviando}
                      className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={retrocederPaso}
                      disabled={enviando}
                      className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                      <span>Anterior</span>
                    </button>
                  )}
                </div>

                {/* Botón Derecha: Siguiente o Guardar Producto */}
                <div className="flex items-center gap-2">
                  {pasoActual < 3 ? (
                    <button
                      type="button"
                      onClick={avanzarPaso}
                      className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-md shadow-cyan-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Continuar</span>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!formularioValido || enviando}
                      className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-lg ${
                        formularioValido && !enviando
                          ? 'bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-cyan-500/25 active:scale-95 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 border border-slate-700/60 cursor-not-allowed opacity-60'
                      }`}
                    >
                      {enviando ? (
                        <>
                          <svg className="animate-spin w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          <span>Guardando Producto...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Registrar Producto</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

            </form>
          </motion.div>

          {/* Sub-Modal para Agregar Nuevo Modelo al Vuelo */}
          <AnimatePresence>
            {modalNuevoModeloAbierto && (
              <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-3 sm:p-4">
                {/* Backdrop oscuro con desenfoque */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !guardandoNuevoModelo && setModalNuevoModeloAbierto(false)}
                  className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm"
                />

                {/* Contenedor del Sub-Modal */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full max-w-md bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/60 p-6 z-10 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">Agregar Nuevo Modelo</h3>
                        <p className="text-[11px] text-slate-400">Vincular a la marca seleccionada</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={guardandoNuevoModelo}
                      onClick={() => setModalNuevoModeloAbierto(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Marca Vinculada (Badge informativo) */}
                  <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Marca vinculada:</span>
                    <span className="font-semibold text-cyan-300 px-2.5 py-0.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                      {marcas.find((m) => String(m.id_marca) === String(formData.id_marca))?.nombre || 'Marca'}
                    </span>
                  </div>

                  {/* Alerta de Error en Sub-Modal */}
                  <AnimatePresence>
                    {errorNuevoModelo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{errorNuevoModelo}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleCrearNuevoModelo} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Nombre del Modelo <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={nuevoModeloNombre}
                        onChange={(e) => setNuevoModeloNombre(e.target.value)}
                        placeholder="Ej. Galaxy S24 Ultra, iPhone 16 Pro..."
                        autoFocus
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Tipo de Dispositivo <span className="text-cyan-400">*</span>
                      </label>
                      <select
                        value={nuevoModeloTipo}
                        onChange={(e) => setNuevoModeloTipo(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all cursor-pointer"
                      >
                        <option value="">Seleccione tipo de dispositivo...</option>
                        {tiposDispositivo.map((t) => (
                          <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                            {t.nombre}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-700/60">
                      <button
                        type="button"
                        disabled={guardandoNuevoModelo}
                        onClick={() => setModalNuevoModeloAbierto(false)}
                        className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={guardandoNuevoModelo || !nuevoModeloNombre.trim()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-slate-950 font-bold text-xs hover:from-cyan-400 hover:to-violet-500 transition-all shadow-md shadow-cyan-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                      >
                        {guardandoNuevoModelo ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5 text-slate-950" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <span>Crear y Vincular</span>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Sub-Modal para Agregar Nueva Categoría al Vuelo */}
          <AnimatePresence>
            {modalNuevaCategoriaAbierto && (
              <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-3 sm:p-4">
                {/* Backdrop oscuro con desenfoque */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !guardandoNuevaCategoria && setModalNuevaCategoriaAbierto(false)}
                  className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm"
                />

                {/* Contenedor del Sub-Modal */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full max-w-md bg-[#1E293B] border border-purple-500/40 rounded-2xl shadow-2xl shadow-purple-950/60 p-6 z-10 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold">
                        📁
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">Nueva Categoría de Producto</h3>
                        <p className="text-[11px] text-slate-400">Crear y asignar al producto actual</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={guardandoNuevaCategoria}
                      onClick={() => setModalNuevaCategoriaAbierto(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Alerta de Error en Sub-Modal */}
                  <AnimatePresence>
                    {errorNuevaCategoria && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{errorNuevaCategoria}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleCrearNuevaCategoria} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Nombre de la Categoría <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={nuevaCategoriaNombre}
                        onChange={(e) => setNuevaCategoriaNombre(e.target.value)}
                        placeholder="Ej. Pantallas, Periféricos, Baterías, Gamer..."
                        autoFocus
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300">
                        Descripción (Opcional)
                      </label>
                      <input
                        type="text"
                        value={nuevaCategoriaDescripcion}
                        onChange={(e) => setNuevaCategoriaDescripcion(e.target.value)}
                        placeholder="Breve descripción o uso de la categoría..."
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-700/60">
                      <button
                        type="button"
                        disabled={guardandoNuevaCategoria}
                        onClick={() => setModalNuevaCategoriaAbierto(false)}
                        className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={guardandoNuevaCategoria || !nuevaCategoriaNombre.trim()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-cyan-500 text-slate-950 font-bold text-xs hover:from-purple-400 hover:to-cyan-400 transition-all shadow-md shadow-purple-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                      >
                        {guardandoNuevaCategoria ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5 text-slate-950" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <span>Crear y Asignar</span>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Sub-Modal para Agregar Nueva Marca al Vuelo */}
          <AnimatePresence>
            {modalNuevaMarcaAbierto && (
              <div className="fixed inset-0 z-[70] overflow-y-auto flex items-center justify-center p-3 sm:p-4">
                {/* Backdrop oscuro con desenfoque */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !guardandoNuevaMarca && setModalNuevaMarcaAbierto(false)}
                  className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm"
                />

                {/* Contenedor del Sub-Modal */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="relative w-full max-w-md bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/60 p-6 z-10 space-y-4"
                >
                  <div className="flex items-center justify-between border-b border-slate-700/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                        🏷️
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white tracking-tight">Nueva Marca Comercial</h3>
                        <p className="text-[11px] text-slate-400">Registrar y vincular al producto actual</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={guardandoNuevaMarca}
                      onClick={() => setModalNuevaMarcaAbierto(false)}
                      className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Alerta de Error en Sub-Modal */}
                  <AnimatePresence>
                    {errorNuevaMarca && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2"
                      >
                        <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span>{errorNuevaMarca}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleCrearNuevaMarca} className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                        Nombre de la Marca <span className="text-cyan-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={nuevaMarcaNombre}
                        onChange={(e) => setNuevaMarcaNombre(e.target.value)}
                        placeholder="Ej. Apple, Samsung, Xiaomi, Motorola, Sony..."
                        autoFocus
                        className="w-full px-3.5 py-2 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-700/60">
                      <button
                        type="button"
                        disabled={guardandoNuevaMarca}
                        onClick={() => setModalNuevaMarcaAbierto(false)}
                        className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={guardandoNuevaMarca || !nuevaMarcaNombre.trim()}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-slate-950 font-bold text-xs hover:from-cyan-400 hover:to-violet-500 transition-all shadow-md shadow-cyan-950/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                      >
                        {guardandoNuevaMarca ? (
                          <>
                            <svg className="animate-spin w-3.5 h-3.5 text-slate-950" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            <span>Guardando...</span>
                          </>
                        ) : (
                          <span>Crear y Vincular</span>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}
    </AnimatePresence>
  );
}
