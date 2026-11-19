import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import useAuth from '../../context/useAuth';
import { normalizeRole, ROLES } from '../../utils/roleRoutes';
import { formatearEstadoReparacion } from '../../utils/repairStatus';
import { API_BASE_URL } from '../../config/api';
import { extraerMensajeError, useMensajeTemporal } from '../../utils/errores';
import { obtenerCatalogoCacheado, esErrorCancelacion } from '../../utils/cacheCatalogos';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';
import { useMediosPagoActivos } from '../../hooks/useMediosPagoActivos';
import { TIPOS_MODAL_PAGO } from '../../utils/mediosPago';
import PaymentMethodModalDispatcher from '../payments/PaymentMethodModalDispatcher';

const REGEX_NOMBRE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;
const REGEX_DNI = /^\d{7,10}$/;
const REGEX_TELEFONO = /^\+?\d{9,15}$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generarClaveTemporal() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let sufijo = '';
  for (let i = 0; i < 6; i += 1) {
    sufijo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `IFix-${sufijo}!`;
}

export default function AsistenteClienteNoRegistradoModal({
  isOpen,
  onClose,
  onReparacionIniciada,
  dniInicial = ''
}) {
  const { user, token } = useAuth();
  const navigate = useNavigate();

  const rolNormalizado = normalizeRole(user?.rol || user?.role || user?.id_rol?.codigo);
  const esAdmin = rolNormalizado === ROLES.ADMIN;

  // Paso actual dentro del mismo modal:
  // 1 = Cuenta de Cliente | 2 = Registro de Dispositivo | 3 = Iniciar Reparación | 4 = Ticket Éxito (solo pagos digitales)
  const [pasoActual, setPasoActual] = useState(1);

  // Modo del Paso 1: 'NUEVO' (Cliente no registrado) | 'EXISTENTE' (Cliente registrado con equipo nuevo)
  const [modoCliente, setModoCliente] = useState('NUEVO');

  // Datos del formulario de Nuevo Cliente (Paso 1)
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dni, setDni] = useState(() =>
    dniInicial && /^\d+$/.test(dniInicial.trim()) ? dniInicial.trim() : ''
  );
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [telefonoAlt, setTelefonoAlt] = useState('');
  const [contrasena, setContrasena] = useState(() => generarClaveTemporal());
  const [mostrarContrasena, setMostrarContrasena] = useState(true);

  // Buscador de cliente existente (Paso 1B)
  const [busquedaDniExistente, setBusquedaDniExistente] = useState('');
  const [busquedaEmailExistente, setBusquedaEmailExistente] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  // Entidades creadas/seleccionadas a medida que avanza el asistente
  const [clienteTitular, setClienteTitular] = useState(null);
  const [dispositivoRegistrado, setDispositivoRegistrado] = useState(null);

  // Estados del Paso 2: Registro de Dispositivo
  const [tiposDispositivos, setTiposDispositivos] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [cargandoCatalogosDisp, setCargandoCatalogosDisp] = useState(false);
  const [cargandoModelos, setCargandoModelos] = useState(false);

  const [selectedTipoId, setSelectedTipoId] = useState('');
  const [selectedMarcaId, setSelectedMarcaId] = useState('');
  const [selectedModeloId, setSelectedModeloId] = useState('');
  const [numeroSerie, setNumeroSerie] = useState('');

  const [tipoPersonalizado, setTipoPersonalizado] = useState('');
  const [marcaPersonalizada, setMarcaPersonalizada] = useState('');
  const [modeloPersonalizado, setModeloPersonalizado] = useState('');

  const [imagenFile, setImagenFile] = useState(null);
  const [imagenPreview, setImagenPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Estados del Paso 3: Iniciar Reparación (integrado en el mismo modal)
  const [categoriasReparacion, setCategoriasReparacion] = useState([]);
  const [cargandoCategoriasRep, setCargandoCategoriasRep] = useState(false);
  const [costoDiagnostico, setCostoDiagnostico] = useState(null);
  const [cargandoCostoDiag, setCargandoCostoDiag] = useState(false);

  const [selectedCategorias, setSelectedCategorias] = useState([]);
  const [busquedaCategoria, setBusquedaCategoria] = useState('');
  const [dropdownCatAbierto, setDropdownCatAbierto] = useState(false);
  const dropdownCatRef = useRef(null);

  const [descripcionProblema, setDescripcionProblema] = useState('');
  const [credencialAcceso, setCredencialAcceso] = useState('');
  const [sinCredencial, setSinCredencial] = useState(false);

  // Cargar medios de pago solo cuando se llega al Paso 3 (ahorro de recursos)
  const {
    mediosPago,
    medioSeleccionado,
    idMedioSeleccionado,
    setIdMedioSeleccionado,
    cargandoMediosPago,
    errorMediosPago,
    recargarMediosPago
  } = useMediosPagoActivos({
    habilitado: isOpen && pasoActual === 3,
    metodoEntrega: 'PRESENCIAL',
    tipoPreferidoInicial: TIPOS_MODAL_PAGO.EFECTIVO
  });

  // Control del modal de pago (reemplaza la vista para no apilar modales)
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const [ordenCreada, setOrdenCreada] = useState(null);
  const [pagoAcreditadoOnline, setPagoAcreditadoOnline] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Control general de envío y errores (auto-cierre en 6s - Regla Global 6)
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useMensajeTemporal();

  const { contenedorRef } = useAccesibilidadModal(
    isOpen && !modalPagoAbierto,
    onClose,
    submitting
  );

  // Limpieza de URL de previsualización al desmontar
  useEffect(() => {
    return () => {
      if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    };
  }, [imagenPreview]);

  // Cargar catálogos de Tipos y Marcas únicamente cuando entra al Paso 2
  useEffect(() => {
    if (!isOpen || pasoActual !== 2) return undefined;
    const controller = new AbortController();
    setCargandoCatalogosDisp(true);

    Promise.all([
      obtenerCatalogoCacheado('workshop:tipos-dispositivos', '/api/workshop/tipos-dispositivos/', {
        signal: controller.signal
      }),
      obtenerCatalogoCacheado('workshop:marcas', '/api/workshop/marcas/', {
        signal: controller.signal
      })
    ])
      .then(([datosTipos, datosMarcas]) => {
        if (!controller.signal.aborted) {
          setTiposDispositivos(Array.isArray(datosTipos) ? datosTipos : []);
          setMarcas(Array.isArray(datosMarcas) ? datosMarcas : []);
        }
      })
      .catch((err) => {
        if (!esErrorCancelacion(err)) {
          setErrorMessage('No fue posible cargar el catálogo de marcas y tipos de dispositivo.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoCatalogosDisp(false);
      });

    return () => controller.abort();
  }, [isOpen, pasoActual, setErrorMessage]);

  // Cargar Categorías de Reparación y Costo de Diagnóstico únicamente cuando entra al Paso 3
  useEffect(() => {
    if (!isOpen || pasoActual !== 3) return undefined;
    const controller = new AbortController();
    setCargandoCategoriasRep(true);
    setCargandoCostoDiag(true);

    obtenerCatalogoCacheado(
      'workshop:categorias-reparacion-activas',
      '/api/workshop/categorias-reparacion/?estado=true',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      }
    )
      .then((datos) => {
        if (!controller.signal.aborted) {
          const lista = Array.isArray(datos) ? datos : [];
          setCategoriasReparacion(lista.filter((c) => c.estado_activo !== false));
        }
      })
      .catch((err) => {
        if (!esErrorCancelacion(err)) {
          setErrorMessage('No fue posible cargar las categorías de reparación.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoCategoriasRep(false);
      });

    obtenerCatalogoCacheado(
      'workshop:configuracion-diagnostico',
      '/api/workshop/configuracion-diagnostico/',
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal
      }
    )
      .then((datos) => {
        if (!controller.signal.aborted && datos?.costo_diagnostico_base !== undefined) {
          setCostoDiagnostico(Number(datos.costo_diagnostico_base));
        }
      })
      .catch((err) => {
        if (!esErrorCancelacion(err)) {
          setCostoDiagnostico(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCargandoCostoDiag(false);
      });

    return () => controller.abort();
  }, [isOpen, pasoActual, token, setErrorMessage]);

  // Cerrar dropdown de categorías al hacer clic fuera
  useEffect(() => {
    if (!dropdownCatAbierto) return undefined;
    const handleClickOutside = (e) => {
      if (dropdownCatRef.current && !dropdownCatRef.current.contains(e.target)) {
        setDropdownCatAbierto(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownCatAbierto]);

  // Validaciones reactivas en tiempo real para el Paso 1
  const nombreLimpio = nombre.trim();
  const apellidoLimpio = apellido.trim();
  const dniLimpio = dni.trim().replace(/\./g, '').replace(/\s+/g, '');
  const emailLimpio = email.trim();
  const telLimpio = telefono.trim().replace(/\s+/g, '');
  const telAltLimpio = telefonoAlt.trim().replace(/\s+/g, '');

  const nombreValido = nombreLimpio.length >= 2 && REGEX_NOMBRE.test(nombreLimpio);
  const apellidoValido = apellidoLimpio.length >= 2 && REGEX_NOMBRE.test(apellidoLimpio);
  const dniValido = REGEX_DNI.test(dniLimpio);
  const emailValido = REGEX_EMAIL.test(emailLimpio);
  const telValido = REGEX_TELEFONO.test(telLimpio);
  const telAltValido = !telAltLimpio || REGEX_TELEFONO.test(telAltLimpio);
  const passValida = contrasena.trim().length >= 6;

  const paso1NuevoValido =
    nombreValido &&
    apellidoValido &&
    dniValido &&
    emailValido &&
    telValido &&
    telAltValido &&
    passValida;

  // Paso 1A: Registrar Nuevo Cliente en el Backend
  const handleRegistrarNuevoCliente = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!paso1NuevoValido) {
      setErrorMessage('Por favor completa correctamente todos los campos obligatorios del cliente.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nombre: nombreLimpio,
        apellido: apellidoLimpio,
        dni: dniLimpio,
        email: emailLimpio,
        telefono: telLimpio,
        contrasena: contrasena.trim(),
        ...(telAltLimpio ? { telefono_alt: telAltLimpio } : {})
      };

      const res = await axios.post(`${API_BASE_URL}/api/users/registro/interno/`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const creado = res.data;
      setClienteTitular({
        id_usuario: creado.id_usuario,
        nombre: creado.nombre || nombreLimpio,
        apellido: creado.apellido || apellidoLimpio,
        nombre_completo: `${creado.nombre || nombreLimpio} ${creado.apellido || apellidoLimpio}`.trim(),
        dni: creado.dni || dniLimpio,
        email: creado.email || emailLimpio,
        telefono: creado.telefono || telLimpio
      });
      setPasoActual(2);
    } catch (err) {
      setErrorMessage(
        extraerMensajeError(
          err,
          'No fue posible registrar la cuenta del cliente. Verifica que el correo o DNI no estén duplicados.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Paso 1B: Buscar cliente ya registrado
  const handleBuscarClienteExistente = async (e) => {
    if (e) e.preventDefault();
    setErrorMessage('');
    const dniQ = busquedaDniExistente.trim();
    const emailQ = busquedaEmailExistente.trim();

    if (!dniQ && !emailQ) {
      setErrorMessage('Ingresa el DNI o el correo electrónico del cliente para buscarlo.');
      return;
    }

    setBuscandoClientes(true);
    try {
      const params = { rol_codigo: 'CLIENTE' };
      if (dniQ) params.dni = dniQ;
      if (emailQ) params.email = emailQ;

      const res = await axios.get(`${API_BASE_URL}/api/users/filtrar/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      const lista = Array.isArray(res.data) ? res.data : res.data?.results || [];
      const listaSoloClientes = lista.filter((u) => {
        const cod = (u.rol?.codigo || u.id_rol?.codigo || '').toUpperCase();
        const nom = (u.rol?.nombre_rol || u.id_rol?.nombre_rol || '').toLowerCase();
        return cod === 'CLIENTE' || nom === 'cliente';
      });
      setClientesEncontrados(listaSoloClientes);
      if (listaSoloClientes.length === 0) {
        setErrorMessage('No se encontraron clientes con esos datos. Puedes darlo de alta en "Cliente No Registrado".');
      }
    } catch (err) {
      setErrorMessage(extraerMensajeError(err, 'No fue posible consultar el padrón de clientes.'));
    } finally {
      setBuscandoClientes(false);
    }
  };

  const handleSeleccionarClienteExistente = (u) => {
    const nom = u.perfil?.nombre || '';
    const ape = u.perfil?.apellido || '';
    setClienteTitular({
      id_usuario: u.id_usuario,
      nombre: nom,
      apellido: ape,
      nombre_completo: `${nom} ${ape}`.trim() || u.email,
      dni: u.perfil?.dni || '',
      email: u.email,
      telefono: u.perfil?.telefono || ''
    });
    setPasoActual(2);
  };

  // Paso 2: Cascada de Modelos por Marca
  const handleMarcaChange = async (e) => {
    const idMarca = e.target.value;
    setSelectedMarcaId(idMarca);

    if (idMarca === 'OTRO') {
      setModelos([]);
      setSelectedModeloId('OTRO');
      return;
    }

    setMarcaPersonalizada('');
    setSelectedModeloId('');
    setModelos([]);

    if (!idMarca) return;

    setCargandoModelos(true);
    try {
      const resModelos = await axios.get(`${API_BASE_URL}/api/workshop/marcas/${idMarca}/modelos/`);
      setModelos(Array.isArray(resModelos.data) ? resModelos.data : []);
    } catch {
      setErrorMessage('No fue posible obtener los modelos de la marca seleccionada.');
    } finally {
      setCargandoModelos(false);
    }
  };

  const modelosFiltrados =
    selectedTipoId && selectedTipoId !== 'OTRO'
      ? modelos.filter((m) => String(m.id_tipo_dispositivo) === String(selectedTipoId))
      : modelos;

  const isModoOtro =
    selectedModeloId === 'OTRO' || selectedMarcaId === 'OTRO' || selectedTipoId === 'OTRO';

  const handleFileSelect = (file) => {
    if (!file) return;
    const extensionValida = /\.(png|jpe?g|webp|jfif|avif|heic|heif)$/i.test(file.name);
    if (!extensionValida) {
      setErrorMessage('Formato de imagen no permitido. Se admiten PNG, JPG, WEBP o AVIF.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrorMessage('El tamaño de la imagen supera el límite de 5 MB.');
      return;
    }
    setImagenFile(file);
    if (imagenPreview) URL.revokeObjectURL(imagenPreview);
    setImagenPreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = () => {
    setImagenFile(null);
    if (imagenPreview) {
      URL.revokeObjectURL(imagenPreview);
      setImagenPreview(null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Paso 2: Registrar Dispositivo y avanzar internamente al Paso 3 (en este mismo modal)
  const handleRegistrarDispositivo = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!clienteTitular?.id_usuario) {
      setErrorMessage('Primero debes registrar o seleccionar al cliente titular.');
      setPasoActual(1);
      return;
    }
    if (!selectedMarcaId) {
      setErrorMessage('Por favor selecciona o especifica la marca del dispositivo.');
      return;
    }
    if (selectedMarcaId === 'OTRO' && !marcaPersonalizada.trim()) {
      setErrorMessage('Por favor escribe el nombre de la marca.');
      return;
    }
    if (!selectedModeloId) {
      setErrorMessage('Por favor selecciona o especifica el modelo del dispositivo.');
      return;
    }
    if (selectedModeloId === 'OTRO' && !modeloPersonalizado.trim()) {
      setErrorMessage('Por favor escribe el nombre del modelo comercial.');
      return;
    }
    if (selectedTipoId === 'OTRO' && !tipoPersonalizado.trim()) {
      setErrorMessage('Por favor escribe el tipo de dispositivo.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('id_cliente', clienteTitular.id_usuario);

      if (isModoOtro || selectedModeloId === 'OTRO') {
        formData.append('es_otro', 'true');
        formData.append('nombre_modelo_otro', modeloPersonalizado.trim());

        if (selectedMarcaId === 'OTRO') {
          formData.append('nombre_marca_otro', marcaPersonalizada.trim());
        } else {
          formData.append('id_marca', selectedMarcaId);
        }

        if (selectedTipoId === 'OTRO') {
          formData.append('nombre_tipo_otro', tipoPersonalizado.trim());
        } else if (selectedTipoId) {
          formData.append('id_tipo', selectedTipoId);
        }
      } else {
        formData.append('id_modelo', selectedModeloId);
      }

      if (numeroSerie.trim()) {
        formData.append('nro_serie', numeroSerie.trim());
      }
      if (imagenFile) {
        formData.append('imagen', imagenFile);
      }

      const res = await axios.post(`${API_BASE_URL}/api/workshop/dispositivos/registrar/`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const dispData = res.data?.dispositivo || {};
      const idDispositivoCreado = res.data?.id_dispositivo || dispData.id_dispositivo;

      const marcaNombre =
        selectedMarcaId === 'OTRO'
          ? marcaPersonalizada.trim()
          : marcas.find((m) => String(m.id_marca) === String(selectedMarcaId))?.nombre || 'Marca';

      const modeloObj = modelos.find((m) => String(m.id_modelo) === String(selectedModeloId));
      const modeloNombre =
        isModoOtro || selectedModeloId === 'OTRO'
          ? modeloPersonalizado.trim()
          : modeloObj?.nombre || 'Modelo';

      const tipoIdResuelto = selectedTipoId || modeloObj?.id_tipo_dispositivo;
      const tipoNombre =
        selectedTipoId === 'OTRO'
          ? tipoPersonalizado.trim()
          : tiposDispositivos.find((t) => String(t.id_tipo_dispositivo) === String(tipoIdResuelto))
              ?.nombre || 'Dispositivo';

      const dispositivoEnriquecido = {
        id_dispositivo: idDispositivoCreado,
        marca: marcaNombre,
        modelo: modeloNombre,
        tipo: tipoNombre,
        numero_serie: dispData.numero_serie || numeroSerie.trim() || null,
        fecha_registro: dispData.fecha_registro || new Date().toISOString().split('T')[0],
        imagen: dispData.imagen || null,
        cliente: {
          id_usuario: clienteTitular.id_usuario,
          nombre: clienteTitular.nombre,
          apellido: clienteTitular.apellido,
          nombre_completo: clienteTitular.nombre_completo,
          dni: clienteTitular.dni,
          email: clienteTitular.email,
          telefono: clienteTitular.telefono
        },
        reparaciones: []
      };

      setDispositivoRegistrado(dispositivoEnriquecido);
      setPasoActual(3);
    } catch (err) {
      setErrorMessage(
        extraerMensajeError(
          err,
          'Ocurrió un inconveniente al registrar el dispositivo del cliente.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Paso 3: Categorías y apertura de reparación dentro del mismo modal
  const categoriasFiltradas = useMemo(() => {
    const q = busquedaCategoria.toLowerCase().trim();
    if (!q) return categoriasReparacion;
    return categoriasReparacion.filter((c) => (c.nombre || '').toLowerCase().includes(q));
  }, [categoriasReparacion, busquedaCategoria]);

  const categoriasSeleccionadasInfo = useMemo(
    () => categoriasReparacion.filter((c) => selectedCategorias.includes(c.id_categoria)),
    [categoriasReparacion, selectedCategorias]
  );

  const handleToggleCategoria = (idCat) => {
    setSelectedCategorias((prev) =>
      prev.includes(idCat) ? prev.filter((id) => id !== idCat) : [...prev, idCat]
    );
  };

  const handleToggleSinCredencial = (e) => {
    const checked = e.target.checked;
    setSinCredencial(checked);
    setCredencialAcceso(checked ? 'Ninguna' : '');
  };

  // Redirección directa a Cobrar Operación cuando se opera con Efectivo
  const redirigirACobrosTaller = (orden = ordenCreada) => {
    const codSec = orden?.codigo_seguridad;
    setModalPagoAbierto(false);
    onClose();
    if (codSec) {
      navigate(esAdmin ? '/admin/caja/cobros' : '/tecnico/caja/cobros', {
        state: {
          codigo_sec: codSec,
          busquedaExacta: codSec,
          autoSeleccionar: true,
          medioPagoPreferido: medioSeleccionado?.nombre_medio_pago || 'Efectivo'
        }
      });
    }
  };

  const handleIniciarReparacionPaso3 = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!dispositivoRegistrado?.id_dispositivo) {
      setErrorMessage('Primero debes registrar el dispositivo en el Paso 2.');
      setPasoActual(2);
      return;
    }

    if (descripcionProblema.trim().length < 10) {
      setErrorMessage('La descripción del problema debe contener al menos 10 caracteres.');
      return;
    }

    if (!credencialAcceso.trim()) {
      setErrorMessage('Indica la credencial de acceso del equipo o marca "Sin contraseña / Ninguna".');
      return;
    }

    if (!medioSeleccionado) {
      setErrorMessage('Selecciona un medio de pago para el arancel de diagnóstico.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        id_dispositivo: dispositivoRegistrado.id_dispositivo,
        descripcion_problema: descripcionProblema.trim(),
        credencial_acceso: credencialAcceso.trim() || 'Ninguna',
        ids_categorias: selectedCategorias,
        medio_pago: String(
          medioSeleccionado.id_mediopago ||
            medioSeleccionado.codigo ||
            medioSeleccionado.nombre_medio_pago
        )
      };

      const res = await axios.post(`${API_BASE_URL}/api/workshop/reparaciones/iniciar/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const nuevaOrden = res.data;
      setOrdenCreada(nuevaOrden);
      // Abrir el modal del medio de pago desmontando el asistente (sin apilar modales)
      setModalPagoAbierto(true);
    } catch (err) {
      setErrorMessage(
        extraerMensajeError(
          err,
          'No fue posible iniciar la orden de reparación. Verifica los datos ingresados.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePagoModalConfirmado = (datosPago) => {
    if (datosPago?.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO) {
      const ordenActualizada = ordenCreada ? { ...ordenCreada, estado_pago: 'PAGADA' } : ordenCreada;
      setOrdenCreada(ordenActualizada);
      setPagoAcreditadoOnline(true);

      if (ordenActualizada?.id_reparacion) {
        setModalPagoAbierto(false);
        onClose();
        if (typeof onReparacionIniciada === 'function') {
          onReparacionIniciada(ordenActualizada, dispositivoRegistrado);
        }
        navigate(`/tecnico/reparaciones/${ordenActualizada.id_reparacion}`);
        return;
      }
    }
    if (
      datosPago?.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO ||
      medioSeleccionado?.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO
    ) {
      redirigirACobrosTaller(ordenCreada);
      return;
    }
    setModalPagoAbierto(false);
    setPasoActual(4);
  };

  const handlePagoModalPendiente = () => {
    if (medioSeleccionado?.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO) {
      redirigirACobrosTaller(ordenCreada);
      return;
    }
    setModalPagoAbierto(false);
    setPasoActual(4);
  };

  const handleFinalizarTodo = () => {
    if (typeof onReparacionIniciada === 'function') {
      onReparacionIniciada(ordenCreada, dispositivoRegistrado);
    }
    onClose();
  };

  const handleCopiarCodigo = () => {
    if (!ordenCreada?.codigo_seguridad) return;
    navigator.clipboard.writeText(ordenCreada.codigo_seguridad);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  };

  if (!isOpen) return null;

  // ZERO MODAL STACKING: Cuando el modal de pasarela/medio de pago está activo,
  // renderizamos ÚNICAMENTE el modal de pago para no apilar capas ni consumir GPU doble.
  if (modalPagoAbierto) {
    return (
      <PaymentMethodModalDispatcher
        isOpen={modalPagoAbierto}
        onClose={handlePagoModalPendiente}
        medioPago={medioSeleccionado}
        idVenta={ordenCreada?.id_venta || null}
        montoTotal={costoDiagnostico || 0}
        concepto={`Diagnóstico Técnico • ${dispositivoRegistrado?.marca || ''} ${dispositivoRegistrado?.modelo || ''}`.trim()}
        codigoSeguridad={ordenCreada?.codigo_seguridad || null}
        permitirContinuarPendiente={true}
        textoBotonPendiente={
          medioSeleccionado?.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO
            ? 'Ir a Cobrar Operación en Caja'
            : 'Continuar y abonar más tarde'
        }
        textoConfirmar={
          medioSeleccionado?.tipoModal === TIPOS_MODAL_PAGO.EFECTIVO
            ? 'Continuar a Cobrar en Caja'
            : 'Confirmar'
        }
        onPagoConfirmado={handlePagoModalConfirmado}
        onContinuarPendiente={handlePagoModalPendiente}
      />
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          ref={contenedorRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="asistente-nuevo-cliente-titulo"
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl shadow-cyan-950/50 text-[#F8FAFC] my-8 overflow-hidden font-sans"
        >
          {/* ============================================================== */}
          {/* CABECERA DEL ASISTENTE INTEGRAL                                */}
          {/* ============================================================== */}
          <div className="px-6 py-5 bg-[#0F172A]/90 border-b border-slate-800 flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  Atención en Mostrador
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Flujo Unificado en Ventana Única
                </span>
              </div>
              <h2
                id="asistente-nuevo-cliente-titulo"
                className="text-lg sm:text-xl font-black text-white tracking-tight"
              >
                {pasoActual === 1 && 'Paso 1: Identificación o Registro del Cliente'}
                {pasoActual === 2 && 'Paso 2: Empadronamiento del Dispositivo'}
                {pasoActual === 3 && 'Paso 3: Iniciar Proceso de Reparación'}
                {pasoActual === 4 && 'Orden de Servicio Registrada'}
              </h2>
            </div>

            <button
              type="button"
              onClick={pasoActual === 4 ? handleFinalizarTodo : onClose}
              disabled={submitting}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Cerrar ventana"
            >
              ✕
            </button>
          </div>

          {/* ============================================================== */}
          {/* INDICADOR VISUAL DE LAS 3 ETAPAS                               */}
          {/* ============================================================== */}
          {pasoActual <= 3 && (
            <div className="px-6 py-3.5 bg-slate-900/70 border-b border-slate-800/80">
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div
                  className={`flex items-center gap-2 p-2 rounded-xl border ${
                    pasoActual === 1
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-slate-950/60 shrink-0">
                    {pasoActual > 1 ? '✓' : '1'}
                  </span>
                  <span className="truncate">1. Registrar Cuenta</span>
                </div>

                <div
                  className={`flex items-center gap-2 p-2 rounded-xl border ${
                    pasoActual === 2
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold'
                      : pasoActual > 2
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 font-semibold'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-slate-950/60 shrink-0">
                    {pasoActual > 2 ? '✓' : '2'}
                  </span>
                  <span className="truncate">2. Registrar Dispositivo</span>
                </div>

                <div
                  className={`flex items-center gap-2 p-2 rounded-xl border ${
                    pasoActual === 3
                      ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 font-bold'
                      : 'bg-slate-900/50 border-slate-800 text-slate-400'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-mono bg-slate-950/60 shrink-0">
                    3
                  </span>
                  <span className="truncate">3. Iniciar Reparación</span>
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* CUERPO DEL MODAL                                               */}
          {/* ============================================================== */}
          <div className="p-6 max-h-[75vh] overflow-y-auto space-y-5">
            {/* ============================================================ */}
            {/* PASO 1: REGISTRAR CUENTA DE CLIENTE O SELECCIONAR EXISTENTE  */}
            {/* ============================================================ */}
            {pasoActual === 1 && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-1.5 bg-[#0F172A] rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setModoCliente('NUEVO');
                      setErrorMessage('');
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      modoCliente === 'NUEVO'
                        ? 'bg-[#06B6D4] text-slate-950 shadow-md shadow-cyan-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>👤+</span>
                    <span>Cliente No Registrado (Crear Cuenta)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setModoCliente('EXISTENTE');
                      setErrorMessage('');
                    }}
                    className={`py-2.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                      modoCliente === 'EXISTENTE'
                        ? 'bg-[#8B5CF6] text-white shadow-md shadow-violet-500/20'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    <span>🔍</span>
                    <span>Cliente Registrado (Agregar Nuevo Equipo)</span>
                  </button>
                </div>

                {modoCliente === 'NUEVO' ? (
                  <form onSubmit={handleRegistrarNuevoCliente} className="space-y-4">
                    <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-200 leading-relaxed">
                      Completa los datos personales y de contacto del cliente. El sistema creará su cuenta activa y le enviará sus credenciales por correo electrónico.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Nombre <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Martín"
                          value={nombre}
                          onChange={(e) => setNombre(e.target.value)}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            nombre && !nombreValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Apellido <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Rodríguez"
                          value={apellido}
                          onChange={(e) => setApellido(e.target.value)}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            apellido && !apellidoValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          DNI (Solo números) <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Ej. 40123456"
                          value={dni}
                          onChange={(e) => setDni(e.target.value.replace(/[^\d]/g, ''))}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-colors ${
                            dni && !dniValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Correo Electrónico <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="email"
                          placeholder="cliente@correo.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors ${
                            email && !emailValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Teléfono Principal <span className="text-cyan-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. +5493794123456"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-colors ${
                            telefono && !telValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Teléfono de Respaldo <span className="text-slate-500">(Opcional)</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 3794998877"
                          value={telefonoAlt}
                          onChange={(e) => setTelefonoAlt(e.target.value)}
                          className={`w-full bg-[#0F172A] border rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-colors ${
                            telefonoAlt && !telAltValido
                              ? 'border-rose-500'
                              : 'border-slate-700 focus:border-[#06B6D4]'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="bg-[#0F172A]/80 p-4 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-300">
                          Contraseña Temporal de Acceso <span className="text-cyan-400">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setContrasena(generarClaveTemporal())}
                          className="text-[11px] font-mono font-bold text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 px-2.5 py-1 rounded-lg border border-cyan-500/30 transition-colors cursor-pointer"
                        >
                          🔄 Generar Otra Clave
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={mostrarContrasena ? 'text' : 'password'}
                          value={contrasena}
                          onChange={(e) => setContrasena(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-300 focus:outline-none focus:border-[#06B6D4] pr-20"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarContrasena((v) => !v)}
                          className="absolute right-3 top-2 text-[11px] font-mono text-slate-400 hover:text-white cursor-pointer"
                        >
                          {mostrarContrasena ? 'Ocultar' : 'Mostrar'}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                      <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !paso1NuevoValido}
                        className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
                      >
                        {submitting ? (
                          <span>Registrando Cliente...</span>
                        ) : (
                          <>
                            <span>Registrar Cuenta y Continuar al Dispositivo</span>
                            <span>→</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <form
                      onSubmit={handleBuscarClienteExistente}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800 items-end"
                    >
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                          Buscar por DNI
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. 40123456"
                          value={busquedaDniExistente}
                          onChange={(e) => setBusquedaDniExistente(e.target.value.replace(/[^\d]/g, ''))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#8B5CF6]"
                        />
                      </div>
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-mono uppercase text-slate-400 mb-1">
                          Buscar por Correo
                        </label>
                        <input
                          type="text"
                          placeholder="cliente@correo.com"
                          value={busquedaEmailExistente}
                          onChange={(e) => setBusquedaEmailExistente(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="submit"
                          disabled={buscandoClientes}
                          className="w-full py-2 px-3 rounded-lg bg-[#8B5CF6] hover:bg-violet-500 text-white font-bold text-xs transition-colors cursor-pointer"
                        >
                          {buscandoClientes ? '...' : 'Buscar'}
                        </button>
                      </div>
                    </form>

                    {clientesEncontrados.length > 0 && (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {clientesEncontrados.map((u) => {
                          const nombreCompleto =
                            `${u.perfil?.nombre || ''} ${u.perfil?.apellido || ''}`.trim() ||
                            'Usuario Registrado';
                          return (
                            <div
                              key={u.id_usuario}
                              className="p-3 rounded-xl bg-[#0F172A] border border-slate-800 hover:border-[#8B5CF6] flex items-center justify-between gap-3 transition-all"
                            >
                              <div className="text-xs space-y-0.5">
                                <p className="font-bold text-white">{nombreCompleto}</p>
                                <p className="text-slate-400 font-mono">
                                  DNI: {u.perfil?.dni || 'Sin DNI'} • {u.email}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleSeleccionarClienteExistente(u)}
                                className="px-3.5 py-1.5 rounded-lg bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer shrink-0"
                              >
                                Seleccionar →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ============================================================ */}
            {/* PASO 2: REGISTRAR DISPOSITIVO DEL CLIENTE                    */}
            {/* ============================================================ */}
            {pasoActual === 2 && clienteTitular && (
              <form onSubmit={handleRegistrarDispositivo} className="space-y-5">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">
                      ✓ Cliente Titular Vinculado
                    </span>
                    <p className="text-sm font-black text-white">
                      {clienteTitular.nombre_completo}
                    </p>
                    <p className="text-xs text-slate-300 font-mono">
                      DNI: {clienteTitular.dni || 'No informado'} • {clienteTitular.email} • Tel:{' '}
                      {clienteTitular.telefono || 'No informado'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPasoActual(1)}
                    className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700 self-start sm:self-center cursor-pointer"
                  >
                    Cambiar Cliente
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Tipo de Dispositivo
                    </label>
                    <select
                      value={selectedTipoId}
                      onChange={(e) => {
                        setSelectedTipoId(e.target.value);
                        if (e.target.value !== 'OTRO') setTipoPersonalizado('');
                      }}
                      disabled={cargandoCatalogosDisp}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                    >
                      <option value="">Todos los tipos...</option>
                      {tiposDispositivos.map((t) => (
                        <option key={t.id_tipo_dispositivo} value={t.id_tipo_dispositivo}>
                          {t.nombre}
                        </option>
                      ))}
                      <option value="OTRO">+ Otro tipo...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Marca <span className="text-cyan-400">*</span>
                    </label>
                    <select
                      value={selectedMarcaId}
                      onChange={handleMarcaChange}
                      disabled={cargandoCatalogosDisp}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4]"
                    >
                      <option value="">Seleccionar marca...</option>
                      {marcas.map((m) => (
                        <option key={m.id_marca} value={m.id_marca}>
                          {m.nombre}
                        </option>
                      ))}
                      <option value="OTRO">+ Otra marca...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Modelo Comercial <span className="text-cyan-400">*</span>
                    </label>
                    <select
                      value={selectedModeloId}
                      onChange={(e) => {
                        setSelectedModeloId(e.target.value);
                        if (e.target.value !== 'OTRO') setModeloPersonalizado('');
                      }}
                      disabled={!selectedMarcaId || cargandoModelos || selectedMarcaId === 'OTRO'}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#06B6D4] disabled:opacity-50"
                    >
                      <option value="">
                        {cargandoModelos
                          ? 'Cargando modelos...'
                          : !selectedMarcaId
                          ? 'Elige una marca primero'
                          : 'Seleccionar modelo...'}
                      </option>
                      {modelosFiltrados.map((mod) => (
                        <option key={mod.id_modelo} value={mod.id_modelo}>
                          {mod.nombre}
                        </option>
                      ))}
                      <option value="OTRO">+ Otro modelo...</option>
                    </select>
                  </div>
                </div>

                {isModoOtro && (
                  <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/30 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {selectedTipoId === 'OTRO' && (
                      <div>
                        <label className="block text-[11px] font-mono text-violet-300 mb-1">
                          Nuevo Tipo de Equipo *
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Consola Portátil"
                          value={tipoPersonalizado}
                          onChange={(e) => setTipoPersonalizado(e.target.value)}
                          className="w-full bg-[#0F172A] border border-violet-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
                        />
                      </div>
                    )}
                    {selectedMarcaId === 'OTRO' && (
                      <div>
                        <label className="block text-[11px] font-mono text-violet-300 mb-1">
                          Nueva Marca *
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Asus ROG"
                          value={marcaPersonalizada}
                          onChange={(e) => setMarcaPersonalizada(e.target.value)}
                          className="w-full bg-[#0F172A] border border-violet-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
                        />
                      </div>
                    )}
                    {(selectedModeloId === 'OTRO' || selectedMarcaId === 'OTRO') && (
                      <div>
                        <label className="block text-[11px] font-mono text-violet-300 mb-1">
                          Nombre del Modelo *
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Ally Z1 Extreme"
                          value={modeloPersonalizado}
                          onChange={(e) => setModeloPersonalizado(e.target.value)}
                          className="w-full bg-[#0F172A] border border-violet-500/40 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#8B5CF6]"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Número de Serie / IMEI <span className="text-slate-500">(Opcional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. SN-3589102938"
                      value={numeroSerie}
                      onChange={(e) => setNumeroSerie(e.target.value)}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Fotografía del Equipo <span className="text-slate-500">(Opcional)</span>
                    </label>
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                      className={`border border-dashed rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                        isDragging
                          ? 'border-[#06B6D4] bg-cyan-500/10'
                          : 'border-slate-700 bg-[#0F172A]'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                        className="hidden"
                      />
                      {imagenPreview ? (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={imagenPreview}
                            alt="Vista previa"
                            className="w-8 h-8 rounded-lg object-cover border border-slate-700"
                          />
                          <span className="text-xs text-emerald-300 truncate">
                            {imagenFile?.name}
                          </span>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="text-xs text-rose-400 hover:text-rose-300 font-bold ml-1 cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full text-left text-xs text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer py-0.5"
                        >
                          📷 Adjuntar foto del dispositivo...
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setPasoActual(1)}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    ← Volver al Cliente
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
                  >
                    {submitting ? (
                      <span>Registrando Dispositivo...</span>
                    ) : (
                      <>
                        <span>Registrar Dispositivo y Continuar a la Reparación</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* ============================================================ */}
            {/* PASO 3: INICIAR REPARACIÓN DENTRO DEL MISMO MODAL            */}
            {/* ============================================================ */}
            {pasoActual === 3 && dispositivoRegistrado && (
              <form onSubmit={handleIniciarReparacionPaso3} className="space-y-5">
                {/* Resumen compacto de Cliente + Dispositivo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#0F172A] p-4 rounded-xl border border-slate-800">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">
                      ✓ Cliente Titular
                    </span>
                    <p className="text-xs font-bold text-white">
                      {clienteTitular?.nombre_completo}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      DNI: {clienteTitular?.dni || 'S/D'} • {clienteTitular?.email}
                    </p>
                  </div>

                  <div className="space-y-0.5 sm:border-l sm:border-slate-800 sm:pl-3">
                    <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold">
                      ✓ Dispositivo Empadronado
                    </span>
                    <p className="text-xs font-bold text-white">
                      {dispositivoRegistrado.marca} {dispositivoRegistrado.modelo}
                    </p>
                    <p className="text-[11px] font-mono text-slate-400">
                      N. Serie: {dispositivoRegistrado.numero_serie || 'Sin registrar'}
                    </p>
                  </div>
                </div>

                {/* 1. Categorías de Reparación (opcional) */}
                <div className="space-y-2" ref={dropdownCatRef}>
                  <label className="block text-xs font-semibold text-slate-300">
                    Categorías de Reparación{' '}
                    <span className="text-slate-500 font-normal">(opcional)</span>
                  </label>

                  {categoriasSeleccionadasInfo.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {categoriasSeleccionadasInfo.map((cat) => (
                        <span
                          key={cat.id_categoria}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                        >
                          <span>{cat.nombre}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleCategoria(cat.id_categoria)}
                            className="hover:text-white font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type="text"
                      placeholder={
                        cargandoCategoriasRep
                          ? 'Cargando categorías...'
                          : 'Buscar y seleccionar categorías de falla (ej. Pantalla, Batería, Placa)...'
                      }
                      value={busquedaCategoria}
                      onFocus={() => setDropdownCatAbierto(true)}
                      onChange={(e) => {
                        setBusquedaCategoria(e.target.value);
                        setDropdownCatAbierto(true);
                      }}
                      className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                    />

                    {dropdownCatAbierto && (
                      <div className="absolute z-20 mt-1 w-full max-h-44 overflow-y-auto rounded-xl bg-[#0F172A] border border-slate-700 shadow-2xl divide-y divide-slate-800/80">
                        {categoriasFiltradas.length === 0 ? (
                          <div className="p-3 text-xs text-slate-400 text-center">
                            No se encontraron categorías coincidentes.
                          </div>
                        ) : (
                          categoriasFiltradas.map((cat) => {
                            const activa = selectedCategorias.includes(cat.id_categoria);
                            return (
                              <button
                                key={cat.id_categoria}
                                type="button"
                                onClick={() => handleToggleCategoria(cat.id_categoria)}
                                className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                  activa
                                    ? 'bg-cyan-500/15 text-cyan-300 font-bold'
                                    : 'text-slate-300 hover:bg-slate-800/70'
                                }`}
                              >
                                <span>{cat.nombre}</span>
                                <span>{activa ? '✓' : '+'}</span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Descripción del Problema / Síntomas */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Descripción Detallada de la Falla / Síntomas{' '}
                      <span className="text-cyan-400">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        descripcionProblema.trim().length >= 10
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {descripcionProblema.trim().length} / mín. 10 caract.
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    placeholder="Describe detalladamente la falla reportada por el cliente y las observaciones de ingreso..."
                    value={descripcionProblema}
                    onChange={(e) => setDescripcionProblema(e.target.value)}
                    className="w-full bg-[#0F172A] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] resize-none"
                  />
                </div>

                {/* 3. Credencial de Acceso del Dispositivo */}
                <div className="bg-[#0F172A] p-4 rounded-xl border border-slate-800 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Credencial de Acceso para Pruebas (PIN / Patrón / Clave){' '}
                      <span className="text-cyan-400">*</span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-cyan-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sinCredencial}
                        onChange={handleToggleSinCredencial}
                        className="rounded border-slate-600 text-[#06B6D4] focus:ring-[#06B6D4]"
                      />
                      <span>Sin contraseña / Ninguna</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    disabled={sinCredencial}
                    placeholder="Ej. PIN 2580 o Patrón en L"
                    value={credencialAcceso}
                    onChange={(e) => setCredencialAcceso(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-[#06B6D4] disabled:opacity-50"
                  />
                </div>

                {/* 4. Medio de Pago del Diagnóstico Inicial */}
                <div className="space-y-3 pt-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase font-mono tracking-wider">
                        Modalidad de Pago del Diagnóstico Inicial
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Si seleccionas Efectivo, al continuar serás redirigido directamente a Caja para cobrar la operación.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 font-mono font-black text-xs">
                      {cargandoCostoDiag || costoDiagnostico === null
                        ? 'Cargando...'
                        : `$${costoDiagnostico.toLocaleString('es-AR', {
                            minimumFractionDigits: 2
                          })} ARS`}
                    </span>
                  </div>

                  {cargandoMediosPago ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-20 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                      <div className="h-20 rounded-xl bg-slate-900/60 border border-slate-800 animate-pulse" />
                    </div>
                  ) : errorMediosPago ? (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center justify-between">
                      <span>{errorMediosPago}</span>
                      <button
                        type="button"
                        onClick={recargarMediosPago}
                        className="px-2.5 py-1 rounded bg-rose-500/20 text-rose-100 font-bold"
                      >
                        Reintentar
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {mediosPago.map((medio) => {
                        const seleccionado =
                          String(medio.id_mediopago) === String(idMedioSeleccionado);
                        const icono =
                          medio.tipoModal === TIPOS_MODAL_PAGO.MERCADOPAGO
                            ? '📱'
                            : medio.tipoModal === TIPOS_MODAL_PAGO.TRANSFERENCIA
                            ? '🏦'
                            : medio.tipoModal === TIPOS_MODAL_PAGO.TARJETA
                            ? '💳'
                            : '💵';

                        return (
                          <div
                            key={medio.id_mediopago}
                            role="button"
                            tabIndex={0}
                            onClick={() => setIdMedioSeleccionado(medio.id_mediopago)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setIdMedioSeleccionado(medio.id_mediopago);
                              }
                            }}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              seleccionado
                                ? 'bg-slate-900 border-[#06B6D4] ring-1 ring-[#06B6D4]/40'
                                : 'bg-[#0F172A]/80 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="text-xl">{icono}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {medio.nombre_medio_pago}
                                </p>
                                <p className="text-[10px] text-slate-400 truncate">
                                  {medio.etiquetaBadge}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                seleccionado
                                  ? 'border-cyan-400 bg-cyan-400'
                                  : 'border-slate-600'
                              }`}
                            >
                              {seleccionado && (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Botonera del Paso 3 */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => onClose()}
                    disabled={submitting}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>

                  <button
                    type="submit"
                    disabled={submitting || !medioSeleccionado || cargandoCostoDiag}
                    className="px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-black text-xs tracking-wide shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-40 cursor-pointer flex items-center gap-2"
                  >
                    {submitting ? (
                      <span>Iniciando Reparación...</span>
                    ) : (
                      <>
                        <span>⚡ Confirmar e Iniciar Reparación</span>
                        <span>→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* ============================================================ */}
            {/* PASO 4: RESUMEN FINAL (SOLO PARA PAGOS DIGITALES)            */}
            {/* ============================================================ */}
            {pasoActual === 4 && ordenCreada && (
              <div className="text-center space-y-5 py-3">
                <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-2xl">
                  ✓
                </div>

                <div>
                  <h3 className="text-xl font-black text-white">
                    ¡Orden de Reparación Iniciada!
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Equipo:{' '}
                    <strong className="text-cyan-300">
                      {dispositivoRegistrado?.marca} {dispositivoRegistrado?.modelo}
                    </strong>{' '}
                    • Estado:{' '}
                    <strong className="text-violet-300">
                      {formatearEstadoReparacion(ordenCreada.etapa)}
                    </strong>
                  </p>
                </div>

                <div className="max-w-md mx-auto p-4 rounded-2xl bg-[#0F172A] border border-[#06B6D4] space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 block">
                    Código de Seguridad de la Reparación
                  </span>
                  <div className="flex items-center justify-center gap-3">
                    <span className="font-mono text-2xl font-black text-cyan-300 tracking-widest">
                      {ordenCreada.codigo_seguridad}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopiarCodigo}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-cyan-300 cursor-pointer"
                    >
                      {copiado ? '¡Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  {pagoAcreditadoOnline && (
                    <p className="text-[11px] text-emerald-300">
                      ✓ Pago de diagnóstico acreditado online.
                    </p>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleFinalizarTodo}
                    className="px-6 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-black text-xs cursor-pointer"
                  >
                    Finalizar y Volver al Taller
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Notificación push de errores/problemas en esquina inferior izquierda (auto-desvanecimiento 6s) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, x: -24, y: 12 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, x: -24, y: 12 }}
              role="alert"
              className="fixed bottom-6 left-6 z-[70] max-w-md w-[calc(100%-3rem)] p-4 rounded-2xl bg-rose-950/95 border border-rose-500/60 text-rose-100 text-xs flex items-start justify-between gap-3 shadow-2xl"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <div className="space-y-0.5">
                  <p className="font-bold text-rose-200 uppercase tracking-wider text-[10px]">
                    Atención
                  </p>
                  <p className="leading-relaxed">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-300 hover:text-white font-bold px-1.5 py-0.5 cursor-pointer shrink-0"
                aria-label="Cerrar aviso"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AnimatePresence>
  );
}

AsistenteClienteNoRegistradoModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onReparacionIniciada: PropTypes.func,
  dniInicial: PropTypes.string
};
