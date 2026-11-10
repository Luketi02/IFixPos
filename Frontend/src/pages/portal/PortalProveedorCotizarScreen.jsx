import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';

import { API_BASE_URL } from '../../config/api';
export default function PortalProveedorCotizarScreen() {
  const [searchParams] = useSearchParams();
  const routeParams = useParams();

  // Paso 1 y 2: Extracción del token desde Query String (?token=...) o Parámetro de Ruta (:tokenAcceso)
  const token = useMemo(() => {
    return searchParams.get('token') || routeParams.tokenAcceso || '';
  }, [searchParams, routeParams]);

  // Estados de Carga y Datos del Expediente
  const [cargando, setCargando] = useState(true);
  const [errorAcceso, setErrorAcceso] = useState('');
  const [solicitudData, setSolicitudData] = useState(null);

  // Modo de Respuesta: 'SELECCION' (Paso 3) | 'COTIZAR' (Paso 4-8) | 'DECLINAR' (Paso 4 Excepción) | 'EXITO'
  const [modoRespuesta, setModoRespuesta] = useState('SELECCION');
  const [mensajeExito, setMensajeExito] = useState('');

  // Formulario: Declinación
  const [motivoDeclinacion, setMotivoDeclinacion] = useState('');

  // Formulario: Cotización de Precios
  // preciosMap: { [id_producto]: string } (ej. { 1: "95000.00" })
  const [preciosMap, setPreciosMap] = useState({});
  const [plazoEntrega, setPlazoEntrega] = useState('');
  const [fechaValidez, setFechaValidez] = useState('');
  const [archivoPdf, setArchivoPdf] = useState(null);
  const [comentarios, setComentarios] = useState('');

  // Feedback y Procesamiento
  const [enviando, setEnviando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');

  // Errores específicos por campo para señalización visual en el lugar exacto
  const [erroresCampos, setErroresCampos] = useState({
    precios: '',
    plazoEntrega: '',
    fechaValidez: '',
    archivoPdf: '',
    motivoDeclinacion: ''
  });

  // Referencias a los campos para scroll suave automático ante validaciones
  const refPlazo = useRef(null);
  const refValidez = useRef(null);
  const refPdf = useRef(null);
  const refPrecios = useRef(null);
  const refMotivoDeclinacion = useRef(null);
  const refBottomAlert = useRef(null);

  // Auto-cierre de alertas de error en 6 segundos (Regla 6)
  useEffect(() => {
    if (!errorFormulario) return undefined;
    const timer = setTimeout(() => {
      setErrorFormulario('');
    }, 6000);
    return () => clearTimeout(timer);
  }, [errorFormulario]);

  // Fecha mínima para el input de validez (hoy en formato YYYY-MM-DD)
  const fechaMinima = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  // ---------------------------------------------------------------------------
  // Paso 2: Validación del Token contra el Backend
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!token) {
      setCargando(false);
      setErrorAcceso('El enlace es inválido o no contiene un token de acceso seguro.');
      return;
    }

    const validarTokenYObtenerDetalle = async () => {
      setCargando(true);
      setErrorAcceso('');
      try {
        const res = await axios.get(`${API_BASE_URL}/api/purchases/cotizar/${token}/`);
        setSolicitudData(res.data);

        // Inicializar el mapa de precios en vacío para cada insumo
        const mapaInicial = {};
        (res.data?.productos_solicitados || []).forEach((prod) => {
          mapaInicial[prod.id_producto] = '';
        });
        setPreciosMap(mapaInicial);
      } catch (err) {
        const data = err.response?.data;
        let msg = 'El enlace de cotización es inválido o ha expirado.';
        if (typeof data?.error === 'string') {
          msg = data.error;
        } else if (data?.detail) {
          msg = data.detail;
        }
        setErrorAcceso(msg);
      } finally {
        setCargando(false);
      }
    };

    validarTokenYObtenerDetalle();
  }, [token]);

  // ---------------------------------------------------------------------------
  // Cálculos de Resumen de Cotización
  // ---------------------------------------------------------------------------
  const productosSolicitados = useMemo(() => {
    return Array.isArray(solicitudData?.productos_solicitados)
      ? solicitudData.productos_solicitados
      : [];
  }, [solicitudData]);

  const itemsCotizadosValidos = useMemo(() => {
    const listado = [];
    productosSolicitados.forEach((prod) => {
      const valorStr = preciosMap[prod.id_producto];
      const valorNum = parseFloat(valorStr);
      if (!isNaN(valorNum) && valorNum > 0) {
        listado.push({
          id_producto: prod.id_producto,
          nombre: prod.nombre,
          cantidad: prod.cantidad_requerida,
          precio_unitario: valorNum,
          subtotal: valorNum * prod.cantidad_requerida
        });
      }
    });
    return listado;
  }, [productosSolicitados, preciosMap]);

  const totalEstimadoCotizado = useMemo(() => {
    return itemsCotizadosValidos.reduce((acc, item) => acc + item.subtotal, 0);
  }, [itemsCotizadosValidos]);

  // ---------------------------------------------------------------------------
  // Paso 6: Mecanismo de Plantilla CSV (Descarga e Importación)
  // ---------------------------------------------------------------------------
  const descargarPlantillaCSV = () => {
    const encabezados = 'Numero_Producto;Nombre_Insumo;Cantidad_Requerida;Precio_Unitario_Pesos';
    const filas = productosSolicitados.map(
      (prod) =>
        `${prod.id_producto};"${(prod.nombre || '').replace(/"/g, '""')}";${prod.cantidad_requerida};${preciosMap[prod.id_producto] || ''}`
    );
    const contenido = [encabezados, ...filas].join('\n');

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Plantilla_Cotizacion_Solicitud_${solicitudData?.id_solicitud || 'B2B'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubirCSV = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setErrorFormulario('');
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const texto = evt.target?.result;
        if (typeof texto !== 'string') return;

        const lineas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lineas.length <= 1) {
          setErrorFormulario('El archivo CSV está vacío o solo contiene encabezados.');
          return;
        }

        const nuevoMapa = { ...preciosMap };
        let importadosCount = 0;

        // Omitir cabecera (índice 0)
        for (let i = 1; i < lineas.length; i += 1) {
          const columnas = lineas[i].split(';');
          if (columnas.length >= 4) {
            const idProd = parseInt(columnas[0].trim(), 10);
            const precioStr = columnas[3].trim().replace(',', '.');
            const precioNum = parseFloat(precioStr);

            if (!isNaN(idProd) && !isNaN(precioNum) && precioNum > 0) {
              nuevoMapa[idProd] = precioNum.toFixed(2);
              importadosCount += 1;
            }
          }
        }

        setPreciosMap(nuevoMapa);
        if (importadosCount > 0) {
          setErrorFormulario('');
        } else {
          setErrorFormulario('No se pudieron extraer precios válidos del archivo CSV.');
        }
      } catch {
        setErrorFormulario('Error al procesar el archivo CSV. Verifique que mantenga el formato requerido.');
      }
    };
    reader.readAsText(archivo);
  };

  // ---------------------------------------------------------------------------
  // Flujo: Declinar Solicitud (Paso 4 Excepción)
  // ---------------------------------------------------------------------------
  const handleConfirmarDeclinacion = async (e) => {
    if (e) e.preventDefault();
    setErrorFormulario('');
    setErroresCampos((prev) => ({ ...prev, motivoDeclinacion: '' }));

    const motivoLimpio = motivoDeclinacion.trim();
    if (!motivoLimpio) {
      const msg = 'Debe ingresar un comentario obligatorio justificando el motivo por el cual declina la solicitud.';
      setErrorFormulario(msg);
      setErroresCampos((prev) => ({ ...prev, motivoDeclinacion: msg }));
      refMotivoDeclinacion.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refMotivoDeclinacion.current?.querySelector('textarea')?.focus();
      return;
    }

    setEnviando(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/purchases/cotizar/${token}/responder/`,
        {
          accion: 'DECLINAR',
          comentarios: motivoLimpio
        }
      );

      setMensajeExito(
        res.data?.mensaje || 'Ha declinado la solicitud de cotización exitosamente. Gracias por notificarnos.'
      );
      setModoRespuesta('EXITO');
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No fue posible registrar la declinación.';
      if (typeof data?.error === 'string') msg = data.error;
      else if (data?.comentarios) msg = data.comentarios[0] || data.comentarios;
      setErrorFormulario(msg);
    } finally {
      setEnviando(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Flujo: Enviar Cotización (Pasos 7 a 9)
  // ---------------------------------------------------------------------------
  const handleConfirmarCotizacion = async (e) => {
    if (e) e.preventDefault();
    setErrorFormulario('');
    const nuevosErrores = {
      precios: '',
      plazoEntrega: '',
      fechaValidez: '',
      archivoPdf: ''
    };

    // Validación 1: Al menos un producto cotizado con precio mayor a 0
    if (itemsCotizadosValidos.length === 0) {
      const msg = 'Debe ingresar el precio unitario para al menos uno de los productos solicitados.';
      nuevosErrores.precios = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refPrecios.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Validación 2: Plazo de entrega obligatorio (> 0)
    const plazoNum = parseInt(plazoEntrega, 10);
    if (isNaN(plazoNum) || plazoNum <= 0) {
      const msg = 'El plazo de entrega estimado (días corridos) es obligatorio y debe ser un valor entero mayor a cero.';
      nuevosErrores.plazoEntrega = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refPlazo.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refPlazo.current?.querySelector('input')?.focus();
      return;
    }

    // Validación 3: Fecha límite de validez obligatoria y lógica
    if (!fechaValidez) {
      const msg = 'La fecha límite de validez de la oferta es obligatoria.';
      nuevosErrores.fechaValidez = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refValidez.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refValidez.current?.querySelector('input')?.focus();
      return;
    }
    if (fechaValidez < fechaMinima) {
      const msg = 'La fecha de validez de la oferta no puede ser anterior a la fecha actual.';
      nuevosErrores.fechaValidez = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refValidez.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      refValidez.current?.querySelector('input')?.focus();
      return;
    }

    // Validación 4: Archivo PDF obligatorio
    if (!archivoPdf) {
      const msg = 'Es obligatorio adjuntar el presupuesto formal en formato PDF de respaldo contable.';
      nuevosErrores.archivoPdf = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refPdf.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!archivoPdf.name.toLowerCase().endsWith('.pdf')) {
      const msg = 'El archivo adjunto debe ser estrictamente un documento en formato PDF.';
      nuevosErrores.archivoPdf = msg;
      setErrorFormulario(msg);
      setErroresCampos(nuevosErrores);
      refPdf.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setErroresCampos({ precios: '', plazoEntrega: '', fechaValidez: '', archivoPdf: '' });

    setEnviando(true);
    try {
      const itemsPayload = itemsCotizadosValidos.map((item) => ({
        id_producto: item.id_producto,
        precio_ofrecido: item.precio_unitario.toFixed(2)
      }));

      const formData = new FormData();
      formData.append('accion', 'COTIZAR');
      formData.append('plazo_entrega', String(plazoNum));
      formData.append('fecha_validez', fechaValidez);
      formData.append('comentarios', comentarios.trim());
      formData.append('archivo_adjunto', archivoPdf);
      formData.append('items', JSON.stringify(itemsPayload));

      const res = await axios.post(
        `${API_BASE_URL}/api/purchases/cotizar/${token}/responder/`,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      setMensajeExito(
        res.data?.mensaje || 'Su propuesta económica y presupuesto formal en PDF han sido enviados exitosamente.'
      );
      setModoRespuesta('EXITO');
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No fue posible registrar la cotización.';
      if (typeof data?.error === 'string') {
        msg = data.error;
      } else if (data?.detalles && typeof data.detalles === 'object') {
        const firstVal = Object.values(data.detalles)[0];
        msg = Array.isArray(firstVal) ? firstVal[0] : String(firstVal);
      }
      setErrorFormulario(msg);
    } finally {
      setEnviando(false);
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER: PANTALLA DE CARGA
  // ---------------------------------------------------------------------------
  if (cargando) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="w-12 h-12 border-3 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mx-auto" />
          <h2 className="text-lg font-bold text-white tracking-tight">
            Validando Enlace de Seguridad...
          </h2>
          <p className="text-xs text-slate-400 font-mono">
            Verificando credenciales criptográficas y vigencia de la solicitud.
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: ERROR DE ACCESO / ENLACE INVÁLIDO O EXPIRADO (Paso 2 Excepción)
  // ---------------------------------------------------------------------------
  if (errorAcceso) {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-6">
        <div className="bg-[#1E293B] border border-rose-500/40 rounded-3xl p-8 max-w-lg w-full text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center text-3xl mx-auto">
            ⚠
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 block font-bold mb-1">
              Acceso Restringido • Enlace No Disponible
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              Enlace Inválido o Expirado
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {errorAcceso}
          </p>
          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 text-left text-xs text-slate-400 space-y-1.5 font-mono">
            <p>• Los enlaces seguros de cotización son de un solo uso.</p>
            <p>• Una vez enviada una oferta o declinada la solicitud, el token se destruye.</p>
            <p>• Si considera que esto es un error, por favor contacte a nuestro sector de compras.</p>
          </div>
          <div className="pt-2">
            <Link
              to="/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all"
            >
              Ir a la Portada del Sistema
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PANTALLA DE ÉXITO FINAL (Paso 9 / Excepción Paso 4)
  // ---------------------------------------------------------------------------
  if (modoRespuesta === 'EXITO') {
    return (
      <div className="min-h-screen bg-[#0F172A] text-slate-100 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#1E293B] border border-emerald-500/40 rounded-3xl p-8 sm:p-10 max-w-lg w-full text-center space-y-6 shadow-2xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-3xl mx-auto">
            ✓
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-emerald-400 block font-bold mb-1">
              Operación Finalizada Exitosamente
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">
              ¡Respuesta Procesada!
            </h1>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">
            {mensajeExito}
          </p>

          <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 text-left space-y-1 font-mono">
            <div className="text-slate-300 font-bold mb-1">Registro de Seguridad:</div>
            <div>• Proveedor: {solicitudData?.proveedor?.nombre} (CUIT: {solicitudData?.proveedor?.cuit})</div>
            <div>• Solicitud de Cotización Referencia #{solicitudData?.id_solicitud}</div>
            <div>• El token de seguridad ha sido destruido e invalidado permanentemente.</div>
          </div>

          <p className="text-[11px] text-slate-500">
            Ya puede cerrar esta pestaña de forma segura.
          </p>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // RENDER: PORTAL PRINCIPAL DE COTIZACIÓN
  // ---------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-200 flex flex-col">
      {/* Barra Superior Pública B2B */}
      <header className="h-16 border-b border-slate-800 bg-[#1E293B]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-sm">
            iP
          </div>
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 block font-bold leading-none">
              Portal Seguro B2B
            </span>
            <span className="text-sm font-bold text-white leading-tight">
              IFixPos ERP • Abastecimiento
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-slate-300 hidden sm:inline-block">
            Conexión Encriptada Activa
          </span>
        </div>
      </header>

      {/* Contenedor Central */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Banner de Bienvenida y Datos del Proveedor */}
        <div className="bg-gradient-to-r from-[#1E293B] via-[#1E293B] to-slate-900 border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="relative z-10 space-y-2">
            <span className="px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-300 text-xs font-mono border border-cyan-500/30 inline-block">
              Sondeo de Precios B2B
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Solicitud de Cotización <span className="text-[#06B6D4]">#{solicitudData?.id_solicitud}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
              Estimado(a) <strong className="text-white">{solicitudData?.proveedor?.nombre}</strong> (CUIT: {solicitudData?.proveedor?.cuit}),
              lo invitamos a presentar su propuesta de precios unitarios y plazos de entrega para los insumos
              detallados a continuación.
            </p>
          </div>

          <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        </div>

        {/* Alerta de Error en Formulario (Regla 6) */}
        <AnimatePresence>
          {errorFormulario && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="bg-rose-500/15 border border-rose-500/40 text-rose-200 px-5 py-3.5 rounded-2xl text-xs sm:text-sm flex items-center justify-between gap-4 shadow-lg"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-rose-400 text-lg">⚠</span>
                <span>{errorFormulario}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorFormulario('')}
                className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer shrink-0"
              >
                ✕
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PASO 3: SELECCIÓN DE ACCIÓN (Enviar Cotización vs Declinar) */}
        {modoRespuesta === 'SELECCION' && (
          <div className="space-y-6">
            {/* Lista Preliminar de Insumos Solicitados */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    Insumos y Repuestos Requeridos
                  </h2>
                  <p className="text-xs text-slate-400">
                    Consulte el desglose de artículos que la empresa solicita presupuestar.
                  </p>
                </div>
                <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                  {productosSolicitados.length} artículo(s)
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#0F172A]/70 text-slate-400 text-xs font-mono uppercase border-b border-slate-800">
                      <th className="py-3 px-4">#</th>
                      <th className="py-3 px-4">Insumo / Repuesto</th>
                      <th className="py-3 px-4">Categoría</th>
                      <th className="py-3 px-4 text-right">Cantidad Solicitada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-xs sm:text-sm">
                    {productosSolicitados.map((prod, idx) => (
                      <tr key={prod.id_producto} className="hover:bg-slate-800/40">
                        <td className="py-3.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3.5 px-4 font-bold text-white">{prod.nombre}</td>
                        <td className="py-3.5 px-4 text-slate-300">{prod.categoria || 'Repuesto'}</td>
                        <td className="py-3.5 px-4 text-right font-mono font-bold text-cyan-300">
                          {prod.cantidad_requerida} un.
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Opciones de Decisión (Paso 3) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                onClick={() => setModoRespuesta('COTIZAR')}
                className="bg-[#1E293B] border border-cyan-500/30 hover:border-cyan-400 p-6 rounded-3xl cursor-pointer transition-all hover:shadow-xl hover:shadow-cyan-950/20 flex flex-col justify-between group space-y-4"
              >
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                    📋
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
                    Enviar Cotización de Precios
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Ingrese a la grilla interactiva o cargue una plantilla con los precios unitarios,
                    defina los plazos de entrega y adjunte su presupuesto formal en PDF.
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 font-mono">
                    <span>Continuar con la Cotización</span>
                    <span>→</span>
                  </span>
                </div>
              </div>

              <div
                onClick={() => setModoRespuesta('DECLINAR')}
                className="bg-[#1E293B] border border-slate-800 hover:border-rose-500/40 p-6 rounded-3xl cursor-pointer transition-all hover:shadow-xl hover:shadow-rose-950/20 flex flex-col justify-between group space-y-4"
              >
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center text-2xl group-hover:scale-105 transition-transform">
                    ✕
                  </div>
                  <h3 className="text-lg font-bold text-white group-hover:text-rose-300 transition-colors">
                    Declinar Solicitud
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Si no comercializa estos insumos, no cuenta con disponibilidad o no desea participar,
                    puede justificar el motivo para notificar formalmente a nuestro equipo.
                  </p>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-rose-400 font-mono">
                    <span>Justificar y Declinar</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PASO 4 EXCEPCIÓN: FORMULARIO PARA DECLINAR SOLICITUD */}
        {modoRespuesta === 'DECLINAR' && (
          <form
            onSubmit={handleConfirmarDeclinacion}
            className="bg-[#1E293B] border border-rose-500/30 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl"
          >
            <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-rose-400 font-bold block mb-1">
                  Respuesta Negativa Formal
                </span>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  Declinar Participación en la Solicitud #{solicitudData?.id_solicitud}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModoRespuesta('SELECCION')}
                className="text-xs text-slate-400 hover:text-white font-mono cursor-pointer"
              >
                ← Volver
              </button>
            </div>

            <div ref={refMotivoDeclinacion} className="space-y-2">
              <label className="block text-xs font-mono uppercase text-slate-300">
                Motivo / Justificación de la Declinación *
              </label>
              <textarea
                value={motivoDeclinacion}
                onChange={(e) => {
                  setMotivoDeclinacion(e.target.value);
                  if (erroresCampos.motivoDeclinacion) {
                    setErroresCampos((prev) => ({ ...prev, motivoDeclinacion: '' }));
                  }
                  if (errorFormulario) setErrorFormulario('');
                }}
                placeholder="Por favor, explique brevemente por qué no puede cotizar estos insumos (ej. Sin stock, insumos descontinuados, imposibilidad de cumplir plazos)..."
                rows={4}
                className={`w-full bg-[#0F172A] border rounded-2xl p-4 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
                  erroresCampos.motivoDeclinacion
                    ? 'border-rose-500 ring-2 ring-rose-500/40 focus:border-rose-400'
                    : 'border-slate-700 focus:border-rose-400'
                }`}
              />
              {erroresCampos.motivoDeclinacion ? (
                <p className="text-xs text-rose-400 font-semibold flex items-center gap-1.5 pt-0.5">
                  <span>⚠</span>
                  <span>{erroresCampos.motivoDeclinacion}</span>
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Este comentario será enviado directamente al equipo de compras de la empresa.
                </p>
              )}
            </div>

            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 text-xs text-rose-200 space-y-1">
              <span className="font-bold text-rose-300">Aviso importante:</span>
              <p className="text-slate-300 leading-relaxed">
                Al confirmar la declinación, su estado quedará registrado como &ldquo;Rechazada por proveedor&rdquo;
                y este enlace seguro quedará invalidado permanentemente.
              </p>
            </div>

            {/* Alerta de Error Visible al Pie del Formulario de Declinación */}
            <AnimatePresence>
              {errorFormulario && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-2xl text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-4 shadow-lg shadow-rose-950/20"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-rose-400 text-lg">⚠</span>
                    <span className="font-semibold">{errorFormulario}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorFormulario('');
                      setErroresCampos((prev) => ({ ...prev, motivoDeclinacion: '' }));
                    }}
                    className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer shrink-0"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModoRespuesta('SELECCION')}
                disabled={enviando}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold cursor-pointer"
              >
                Volver a Opciones
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-rose-900/30 active:scale-95 transition-all cursor-pointer"
              >
                {enviando ? 'Procesando Declinación...' : 'Confirmar Declinación'}
              </button>
            </div>
          </form>
        )}

        {/* PASOS 5 A 8: FORMULARIO COMPLETO DE COTIZACIÓN */}
        {modoRespuesta === 'COTIZAR' && (
          <form onSubmit={handleConfirmarCotizacion} className="space-y-6">
            {/* Cabecera y Herramientas CSV */}
            <div className="bg-[#1E293B] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 space-y-5 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400 font-bold block mb-1">
                    Carga de Propuesta Económica
                  </span>
                  <h2 className="text-lg sm:text-xl font-black text-white">
                    Precios Unitarios y Cotización de Insumos
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModoRespuesta('SELECCION')}
                  className="text-xs text-slate-400 hover:text-white font-mono cursor-pointer self-start sm:self-auto"
                >
                  ← Volver a Opciones
                </button>
              </div>

              {/* Paso 5 y 6: Mecanismo Automatizado de Plantilla Excel/CSV */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>📊</span>
                    <span>Carga Masiva con Plantilla CSV</span>
                  </span>
                  <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                    Para cotizaciones con muchos renglones, puede descargar la plantilla generada por el sistema,
                    cargar sus precios en Excel/Calc y subir el archivo para autocompletar la grilla.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={descargarPlantillaCSV}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span>⬇</span>
                    <span>Descargar Plantilla CSV</span>
                  </button>

                  <label className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-1.5">
                    <span>⬆</span>
                    <span>Subir CSV Completado</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleSubirCSV}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Paso 5: Grilla Interactiva Tradicional de Carga de Precios */}
              <div ref={refPrecios} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono uppercase text-slate-300 font-bold">
                    Desglose de Precios por Artículo
                  </span>
                  <span className="text-xs text-slate-400">
                    Omitir o dejar en 0 los ítems que no comercialice
                  </span>
                </div>

                {erroresCampos.precios && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2"
                  >
                    <span className="text-rose-400 text-base">⚠</span>
                    <span className="font-semibold">{erroresCampos.precios}</span>
                  </motion.div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#0F172A] text-slate-400 text-xs font-mono uppercase border-b border-slate-800">
                        <th className="py-3 px-4">#</th>
                        <th className="py-3 px-4">Artículo Requerido</th>
                        <th className="py-3 px-4 text-center">Cantidad</th>
                        <th className="py-3 px-4 text-right">Precio Unitario ($ ARS) *</th>
                        <th className="py-3 px-4 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 text-xs sm:text-sm">
                      {productosSolicitados.map((prod, idx) => {
                        const valStr = preciosMap[prod.id_producto] ?? '';
                        const valNum = parseFloat(valStr) || 0;
                        const subtotalFila = valNum * prod.cantidad_requerida;

                        return (
                          <tr key={prod.id_producto} className="hover:bg-slate-800/40">
                            <td className="py-3.5 px-4 font-mono text-slate-400">{idx + 1}</td>
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-white">{prod.nombre}</div>
                              <div className="text-xs text-slate-400">{prod.categoria || 'Catálogo General'}</div>
                            </td>
                            <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                              {prod.cantidad_requerida} un.
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5 bg-[#0F172A] border border-slate-700 focus-within:border-[#06B6D4] rounded-xl px-3 py-1.5 w-36 sm:w-44 ml-auto">
                                <span className="text-slate-400 font-mono text-xs">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={valStr}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setPreciosMap((prev) => ({ ...prev, [prod.id_producto]: v }));
                                  }}
                                  placeholder="0.00"
                                  className="w-full bg-transparent text-right font-mono text-xs sm:text-sm text-white focus:outline-none"
                                />
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-200">
                              {valNum > 0 ? (
                                <span className="text-emerald-300">
                                  ${subtotalFila.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              ) : (
                                <span className="text-slate-500 italic text-xs">Sin cotizar</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Resumen numérico inferior */}
                <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-xs text-slate-400 font-mono">
                    Ítems cotizados: <strong className="text-cyan-300">{itemsCotizadosValidos.length}</strong> de {productosSolicitados.length}
                  </div>
                  <div className="text-sm font-bold text-white flex items-center gap-2 sm:justify-end">
                    <span className="text-slate-400">Total Presupuestado Estimado:</span>
                    <span className="text-lg font-mono text-emerald-400">
                      ${totalEstimadoCotizado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Paso 5: Requisitos Obligatorios Adicionales (Plazo, Validez, Presupuesto PDF) */}
            <div className="bg-[#1E293B] border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Condiciones Comerciales y Documentación de Respaldo
                </h3>
                <p className="text-xs text-slate-400">
                  Complete los plazos pactados y adjunte el presupuesto contable formal obligatorio.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Plazo de Entrega */}
                <div ref={refPlazo} className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-slate-300">
                    Plazo de Entrega Estimado (Días corridos) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={plazoEntrega}
                    onChange={(e) => {
                      setPlazoEntrega(e.target.value);
                      if (erroresCampos.plazoEntrega) {
                        setErroresCampos((prev) => ({ ...prev, plazoEntrega: '' }));
                      }
                      if (errorFormulario) setErrorFormulario('');
                    }}
                    placeholder="Ej. 5"
                    className={`w-full bg-[#0F172A] border rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all ${
                      erroresCampos.plazoEntrega
                        ? 'border-rose-500 ring-2 ring-rose-500/40 focus:border-rose-400'
                        : 'border-slate-700 focus:border-[#06B6D4]'
                    }`}
                  />
                  {erroresCampos.plazoEntrega ? (
                    <p className="text-xs text-rose-400 font-semibold flex items-center gap-1.5 pt-0.5 animate-fadeIn">
                      <span>⚠</span>
                      <span>{erroresCampos.plazoEntrega}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Cantidad de días que demora en despachar los productos tras recibir la orden.
                    </p>
                  )}
                </div>

                {/* Fecha Límite de Validez */}
                <div ref={refValidez} className="space-y-1.5">
                  <label className="block text-xs font-mono uppercase text-slate-300">
                    Fecha Límite de Validez de la Oferta *
                  </label>
                  <input
                    type="date"
                    min={fechaMinima}
                    value={fechaValidez}
                    onChange={(e) => {
                      setFechaValidez(e.target.value);
                      if (erroresCampos.fechaValidez) {
                        setErroresCampos((prev) => ({ ...prev, fechaValidez: '' }));
                      }
                      if (errorFormulario) setErrorFormulario('');
                    }}
                    className={`w-full bg-[#0F172A] border rounded-2xl px-4 py-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all cursor-pointer [color-scheme:dark] ${
                      erroresCampos.fechaValidez
                        ? 'border-rose-500 ring-2 ring-rose-500/40 focus:border-rose-400'
                        : 'border-slate-700 focus:border-[#06B6D4]'
                    }`}
                  />
                  {erroresCampos.fechaValidez ? (
                    <p className="text-xs text-rose-400 font-semibold flex items-center gap-1.5 pt-0.5 animate-fadeIn">
                      <span>⚠</span>
                      <span>{erroresCampos.fechaValidez}</span>
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Período durante el cual garantiza los precios ofrecidos.
                    </p>
                  )}
                </div>
              </div>

              {/* Carga del Documento PDF (Presupuesto formal obligatorio - Paso 5) */}
              <div ref={refPdf} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-mono uppercase text-slate-300">
                    Presupuesto Formal Oficial (Documento PDF de respaldo) *
                  </label>
                  {erroresCampos.archivoPdf && (
                    <span className="text-xs font-bold text-rose-400 flex items-center gap-1 animate-pulse">
                      <span>⚠</span>
                      <span>PDF Obligatorio Faltante</span>
                    </span>
                  )}
                </div>

                <div
                  className={`border border-dashed rounded-2xl p-6 text-center space-y-3 transition-all ${
                    erroresCampos.archivoPdf
                      ? 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40'
                      : 'bg-[#0F172A] border-slate-700 hover:border-cyan-500/50'
                  }`}
                >
                  <div className="text-3xl">📄</div>
                  {archivoPdf ? (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-emerald-400">
                        ✓ Archivo PDF seleccionado: {archivoPdf.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">
                        {(archivoPdf.size / 1024).toFixed(1)} KB
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setArchivoPdf(null);
                          if (errorFormulario) setErrorFormulario('');
                        }}
                        className="text-xs text-rose-400 hover:text-rose-300 underline font-mono cursor-pointer pt-1"
                      >
                        Remover o reemplazar archivo
                      </button>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs sm:text-sm text-slate-300 font-semibold mb-1">
                        Seleccione el archivo PDF con su membrete comercial o presupuesto contable
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Formato estricto: .pdf (Máximo 10 MB)
                      </p>
                      <label className="mt-3 inline-block px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold border border-cyan-500/30 transition-all cursor-pointer">
                        Examinar Archivo PDF...
                        <input
                          type="file"
                          accept=".pdf,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!file.name.toLowerCase().endsWith('.pdf')) {
                                const msg = 'El archivo debe poseer extensión .pdf.';
                                setErrorFormulario(msg);
                                setErroresCampos((prev) => ({ ...prev, archivoPdf: msg }));
                                return;
                              }
                              setArchivoPdf(file);
                              setErroresCampos((prev) => ({ ...prev, archivoPdf: '' }));
                              if (errorFormulario) setErrorFormulario('');
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {erroresCampos.archivoPdf && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 bg-rose-500/15 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2"
                  >
                    <span className="text-rose-400 text-base">⚠</span>
                    <span className="font-semibold">{erroresCampos.archivoPdf}</span>
                  </motion.div>
                )}
              </div>

              {/* Comentarios Comerciales Opcionales */}
              <div className="space-y-1.5">
                <label className="block text-xs font-mono uppercase text-slate-300">
                  Comentarios Comerciales / Observaciones Adicionales (Opcional)
                </label>
                <textarea
                  value={comentarios}
                  onChange={(e) => setComentarios(e.target.value)}
                  placeholder="Detalles sobre modalidades de pago, recargos de envío, políticas de garantía de repuestos..."
                  rows={3}
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-2xl p-4 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#06B6D4]"
                />
              </div>

              {/* Alerta de Error Visible al Pie del Formulario de Cotización (Justo encima de los botones) */}
              <AnimatePresence>
                {errorFormulario && (
                  <motion.div
                    ref={refBottomAlert}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="p-4 bg-rose-500/15 border border-rose-500/40 rounded-2xl text-rose-200 text-xs sm:text-sm flex items-center justify-between gap-4 shadow-lg shadow-rose-950/20"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-rose-400 text-lg">⚠</span>
                      <span className="font-semibold">{errorFormulario}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorFormulario('');
                        setErroresCampos({ precios: '', plazoEntrega: '', fechaValidez: '', archivoPdf: '' });
                      }}
                      className="text-rose-300 hover:text-white text-xs font-mono cursor-pointer shrink-0"
                    >
                      ✕
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Botones de Acción Final */}
              <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModoRespuesta('SELECCION')}
                  disabled={enviando}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  ← Cambiar Opción
                </button>

                <button
                  type="submit"
                  disabled={enviando}
                  className="px-6 py-3 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <span>📨</span>
                  <span>{enviando ? 'Despachando Oferta Formal...' : 'Confirmar y Enviar Cotización'}</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </main>

      {/* Pie de Página Público */}
      <footer className="border-t border-slate-800 py-6 text-center text-xs text-slate-500 font-mono">
        IFixPos ERP • Módulo B2B de Abastecimiento & Compras • Conexión Segura Tokenizada
      </footer>
    </div>
  );
}
