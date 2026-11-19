import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Database01Icon,
  CloudBackupIcon,
  CloudDownloadIcon,
  AlertCircleIcon,
  Alert02Icon,
  CheckmarkCircle01Icon,
  LockIcon,
  Key01Icon,
  RefreshIcon,
  ViewIcon,
  ViewOffSlashIcon,
  Search01Icon,
  Copy01Icon,
  Cancel01Icon,
  ShieldAlertIcon,
  CleanIcon,
  PlayIcon,
  Folder01Icon
} from '@hugeicons/core-free-icons';

import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

import { API_BASE_URL } from '../../config/api';
export default function AdminBackupsScreen() {
  const { token, logout, user } = useAuth();
  const navigate = useNavigate();

  // ============================================================================
  // ESTADOS PRINCIPALES DE DATOS
  // ============================================================================
  const [backups, setBackups] = useState([]);
  const [estadoAlmacenamiento, setEstadoAlmacenamiento] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('TODAS');
  const [depurandoHuerfanos, setDepurandoHuerfanos] = useState(false);
  const [ejecutandoCiclo, setEjecutandoCiclo] = useState(false);
  const [alerta, setAlerta] = useState(null);

  // ============================================================================
  // ESTADOS DE MODALES
  // ============================================================================
  // Modal CU-22: Generar Copia de Seguridad
  const [modalGenerar, setModalGenerar] = useState(false);
  const [versionNueva, setVersionNueva] = useState('1.0.0');
  const [generandoCopia, setGenerandoCopia] = useState(false);
  const [copiaGeneradaExitosa, setCopiaGeneradaExitosa] = useState(null);

  // Modal CU-23: Restauración Crítica
  const [modalRestaurar, setModalRestaurar] = useState(false);
  const [copiaSeleccionada, setCopiaSeleccionada] = useState(null);
  const [solicitandoOtp, setSolicitandoOtp] = useState(false);
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [passwordAdmin, setPasswordAdmin] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [otpToken, setOtpToken] = useState('');
  const [confirmacionCheck, setConfirmacionCheck] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [restauracionExitosa, setRestauracionExitosa] = useState(false);

  // Modal Inspección Técnica
  const [modalDetalle, setModalDetalle] = useState(false);
  const [detalleBackup, setDetalleBackup] = useState(null);
  const [copiadoRuta, setCopiadoRuta] = useState(false);

  // ============================================================================
  // SISTEMA DE ALERTAS SUAVES (6 SEGUNDOS)
  // ============================================================================
  const dispararAlerta = useCallback((tipo, mensaje) => {
    setAlerta({ tipo, mensaje });
    setTimeout(() => {
      setAlerta(null);
    }, 6000);
  }, []);

  // ============================================================================
  // CARGA DE DATOS: LISTADO Y ESTADO DE ALMACENAMIENTO (CU-22 / CU-23)
  // ============================================================================
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    try {
      const config = {
        headers: {
          Authorization: `Bearer ${token}`
        }
      };

      const [resBackups, resEstado] = await Promise.all([
        axios.get(`${API_BASE_URL}/api/core/backups/`, config),
        axios.get(`${API_BASE_URL}/api/core/backups/estado/`, config)
      ]);

      setBackups(resBackups.data || []);
      setEstadoAlmacenamiento(resEstado.data || null);
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || 'Error al sincronizar datos del repositorio de respaldos.';
      dispararAlerta('error', msg);
    } finally {
      setCargando(false);
    }
  }, [token, dispararAlerta]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // ============================================================================
  // CONTEO Y FILTRADO MULTI-NIVEL DE RESPALDOS
  // ============================================================================
  const conteoCategorias = useMemo(() => {
    const counts = { TODAS: backups.length, DIARIOS: 0, SEMANALES: 0, QUINCENALES: 0, MENSUALES: 0, MANUALES: 0 };
    backups.forEach(b => {
      const cat = b.categoria_backup || (b.automatico ? 'DIARIO' : 'MANUAL');
      if (cat === 'DIARIO') counts.DIARIOS++;
      else if (cat === 'SEMANAL') counts.SEMANALES++;
      else if (cat === 'QUINCENAL') counts.QUINCENALES++;
      else if (cat === 'MENSUAL') counts.MENSUALES++;
      else if (cat === 'MANUAL') counts.MANUALES++;
    });
    return counts;
  }, [backups]);

  const respaldosFiltrados = useMemo(() => {
    let lista = backups;
    if (categoriaFiltro !== 'TODAS') {
      lista = lista.filter(b => {
        const cat = b.categoria_backup || (b.automatico ? 'DIARIO' : 'MANUAL');
        if (categoriaFiltro === 'DIARIOS') return cat === 'DIARIO';
        if (categoriaFiltro === 'SEMANALES') return cat === 'SEMANAL';
        if (categoriaFiltro === 'QUINCENALES') return cat === 'QUINCENAL';
        if (categoriaFiltro === 'MENSUALES') return cat === 'MENSUAL';
        if (categoriaFiltro === 'MANUALES') return cat === 'MANUAL';
        return true;
      });
    }

    if (!filtroTexto.trim()) return lista;
    const q = filtroTexto.toLowerCase().trim();
    return lista.filter(b => {
      const nombre = (b.nombre_archivo || '').toLowerCase();
      const ver = (b.version || '').toLowerCase();
      const usuario = (b.nombre_usuario || b.email_usuario || '').toLowerCase();
      const carpeta = (b.carpeta_relativa || '').toLowerCase();
      const categoria = (b.categoria_backup || '').toLowerCase();
      return nombre.includes(q) || ver.includes(q) || usuario.includes(q) || carpeta.includes(q) || categoria.includes(q);
    });
  }, [backups, categoriaFiltro, filtroTexto]);

  const getBadgeCategoria = (categoria) => {
    switch (categoria) {
      case 'DIARIO':
        return {
          label: 'Diario',
          className: 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
        };
      case 'SEMANAL':
        return {
          label: 'Semanal',
          className: 'bg-cyan-950/40 text-cyan-300 border-cyan-500/40'
        };
      case 'QUINCENAL':
        return {
          label: 'Quincenal',
          className: 'bg-purple-950/40 text-purple-300 border-purple-500/40'
        };
      case 'MENSUAL':
        return {
          label: 'Mensual',
          className: 'bg-amber-950/40 text-amber-300 border-amber-500/40'
        };
      case 'MANUAL':
      default:
        return {
          label: 'Manual',
          className: 'bg-blue-950/40 text-blue-300 border-blue-500/40'
        };
    }
  };

  // ============================================================================
  // ACCIONES AVANZADAS: DEPURACIÓN DE HUÉRFANOS Y CICLO PROGRAMADO
  // ============================================================================
  const ejecutarDepuracionHuerfanos = async () => {
    setDepurandoHuerfanos(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/core/backups/depurar-huerfanos/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const detalle = res.data?.detalle || {};
      const eliminados = detalle.eliminados ?? 0;
      const registrosBd = detalle.registros_bd_eliminados ?? 0;
      const mb = detalle.mb_liberados ?? 0;
      if (eliminados > 0 || registrosBd > 0) {
        const partes = [];
        if (eliminados > 0) partes.push(`${eliminados} archivo(s) suelto(s) del disco (${mb} MB liberados)`);
        if (registrosBd > 0) partes.push(`${registrosBd} registro(s) huérfano(s) de historial sin archivo`);
        dispararAlerta('exito', `Depuración completa: se limpiaron ${partes.join(' y ')}.`);
      } else {
        dispararAlerta('info', 'El repositorio físico y la base de datos están sincronizados. No hay elementos huérfanos.');
      }
      await cargarDatos();
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || 'Error al depurar archivos huérfanos del servidor.';
      dispararAlerta('error', msg);
    } finally {
      setDepurandoHuerfanos(false);
    }
  };

  const ejecutarCicloProgramado = async () => {
    setEjecutandoCiclo(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/core/backups/ejecutar-ciclo/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      const resultados = res.data?.resultados || {};
      if (resultados.ejecutado && resultados.nivel) {
        dispararAlerta('exito', `Ciclo ejecutado exitosamente. Se generó respaldo nivel: ${resultados.nivel}.`);
      } else if (resultados.motivo) {
        dispararAlerta('info', `Ciclo evaluado: ${resultados.motivo}`);
      } else {
        dispararAlerta('info', 'Ciclo evaluado con éxito: ningún nivel programado requería ejecución en este momento.');
      }
      await cargarDatos();
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || 'Error al evaluar ciclo de respaldos.';
      dispararAlerta('error', msg);
    } finally {
      setEjecutandoCiclo(false);
    }
  };

  // ============================================================================
  // FLUJO CU-22: GENERAR COPIA DE SEGURIDAD MANUAL
  // ============================================================================
  const abrirModalGenerar = () => {
    // Paso 2: Verificación de espacio y permisos antes de abrir
    if (estadoAlmacenamiento && !estadoAlmacenamiento.espacio_suficiente) {
      dispararAlerta('error', 'Espacio en disco insuficiente en el servidor para generar una copia de seguridad.');
      return;
    }
    if (estadoAlmacenamiento && !estadoAlmacenamiento.permisos_escritura) {
      dispararAlerta('error', 'Falta de permisos de escritura en el directorio de respaldos del servidor.');
      return;
    }

    setVersionNueva('1.0.0');
    setCopiaGeneradaExitosa(null);
    setModalGenerar(true);
  };

  const ejecutarGenerarCopia = async () => {
    setGenerandoCopia(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/core/backups/manual/`,
        { version: versionNueva || '1.0.0' },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const nuevaCopia = response.data?.backup;
      setCopiaGeneradaExitosa(nuevaCopia);
      dispararAlerta('exito', 'Copia de seguridad generada y auditada exitosamente.');
      await cargarDatos();
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || 'Error crítico al ejecutar el volcado de la base de datos.';
      dispararAlerta('error', msg);
      setModalGenerar(false);
    } finally {
      setGenerandoCopia(false);
    }
  };

  // ============================================================================
  // DESCARGA LOCAL DE COPIA DE SEGURIDAD (BLOB CON CABECERAS JWT)
  // ============================================================================
  const descargarRespaldo = async (idBackup, nombreArchivoSugerido) => {
    try {
      dispararAlerta('info', `Iniciando descarga segura de ${nombreArchivoSugerido || 'respaldo'}...`);
      const response = await axios.get(
        `${API_BASE_URL}/api/core/backups/${idBackup}/descargar/`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          responseType: 'blob'
        }
      );

      const blob = new Blob([response.data], { type: 'application/sql' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', nombreArchivoSugerido || `backup_${idBackup}.sql`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      dispararAlerta('exito', 'Descarga completada satisfactoriamente.');
    } catch (error) {
      dispararAlerta('error', 'No se pudo descargar el archivo de respaldo físico.');
    }
  };

  // ============================================================================
  // FLUJO CU-23: RESTAURAR COPIA DE SEGURIDAD
  // ============================================================================
  const iniciarProcesoRestauracion = async (backup) => {
    setCopiaSeleccionada(backup);
    setPasswordAdmin('');
    setOtpToken('');
    setConfirmacionCheck(false);
    setRestaurando(false);
    setRestauracionExitosa(false);
    setOtpEnviado(false);
    setModalRestaurar(true);

    // Paso 4: Solicitar y despachar automáticamente el OTP al correo
    setSolicitandoOtp(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/core/backups/${backup.id_backup}/solicitar-token/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setOtpEnviado(true);
      dispararAlerta('info', 'Código de seguridad OTP despachado a su correo electrónico.');
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || 'Error al emitir el código de seguridad OTP.';
      dispararAlerta('error', msg);
    } finally {
      setSolicitandoOtp(false);
    }
  };

  const reintentarEnvioOtp = async () => {
    if (!copiaSeleccionada) return;
    setSolicitandoOtp(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/core/backups/${copiaSeleccionada.id_backup}/solicitar-token/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );
      setOtpEnviado(true);
      dispararAlerta('exito', 'Nuevo código OTP despachado a su casilla de correo.');
    } catch (error) {
      dispararAlerta('error', 'No se pudo reenviar el código OTP.');
    } finally {
      setSolicitandoOtp(false);
    }
  };

  const ejecutarRestauracion = async () => {
    // Doble validación en cliente
    if (!passwordAdmin) {
      dispararAlerta('error', 'Debe ingresar su contraseña de administrador.');
      return;
    }
    if (!otpToken || otpToken.trim().length < 6) {
      dispararAlerta('error', 'Ingrese el código OTP numérico de 6 dígitos.');
      return;
    }
    if (!confirmacionCheck) {
      dispararAlerta('error', 'Debe marcar la casilla de confirmación expresa.');
      return;
    }

    setRestaurando(true);
    try {
      // Paso 7: Se activa modo mantenimiento y se ejecuta la restauración en servidor
      const response = await axios.post(
        `${API_BASE_URL}/api/core/backups/${copiaSeleccionada.id_backup}/restaurar/`,
        {
          password: passwordAdmin,
          otp_token: otpToken.trim()
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      // Paso 8: Éxito, modo mantenimiento desactivado y cierre forzado de sesión
      setRestauracionExitosa(true);

      setTimeout(() => {
        logout();
        navigate('/login', {
          replace: true,
          state: {
            mensaje: 'Restauración completada satisfactoriamente. Su sesión ha finalizado por seguridad. Inicie sesión nuevamente.'
          }
        });
      }, 3500);
    } catch (error) {
      const msg = error.response?.data?.detail || error.response?.data?.mensaje || error.response?.data?.password?.[0] || error.response?.data?.otp_token?.[0] || 'Error crítico durante la restauración.';
      dispararAlerta('error', msg);
      setRestaurando(false);
    }
  };

  const copiarAlPortapapeles = (texto) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setCopiadoRuta(true);
    setTimeout(() => setCopiadoRuta(false), 2000);
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* Barra Lateral Unificada */}
      <AdminSidebar activeRoute="/admin/auditoria/copias-seguridad" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Encabezado Unificado Cyber-Tech */}
        <AdminHeader
          title="Copias de Seguridad"
          breadcrumb="Auditoría › Copias de Seguridad"
        />

        {/* Zona Scrolleable */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          {/* Banner de Notificación Suave */}
          <AnimatePresence>
            {alerta && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`p-4 rounded-xl border flex items-center justify-between shadow-lg backdrop-blur-md ${
                  alerta.tipo === 'exito'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                    : alerta.tipo === 'info'
                    ? 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300'
                    : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  <HugeiconsIcon
                    icon={alerta.tipo === 'exito' ? CheckmarkCircle01Icon : AlertCircleIcon}
                    size={20}
                    className="shrink-0"
                  />
                  <span className="text-sm font-medium">{alerta.mensaje}</span>
                </div>
                <button
                  onClick={() => setAlerta(null)}
                  className="text-xs opacity-75 hover:opacity-100 transition-opacity p-1"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tarjetas KPI de Estado del Servidor & Almacenamiento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* KPI 1: Espacio Libre en Disco */}
            <div className="bg-[#1E293B]/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Espacio en Servidor
                </span>
                <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <HugeiconsIcon icon={Database01Icon} size={18} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-100">
                  {estadoAlmacenamiento ? `${estadoAlmacenamiento.espacio_libre_gb} GB` : '—'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      estadoAlmacenamiento?.espacio_suficiente ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-xs text-slate-400">
                    {estadoAlmacenamiento ? `${estadoAlmacenamiento.porcentaje_libre}% disponible` : 'Verificando disco...'}
                  </span>
                </div>
              </div>
            </div>

            {/* KPI 2: Permisos de Escritura */}
            <div className="bg-[#1E293B]/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Permisos de Destino
                </span>
                <span className="p-2 rounded-lg bg-violet-500/10 text-violet-400">
                  <HugeiconsIcon icon={LockIcon} size={18} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-lg font-bold text-slate-100">
                  {estadoAlmacenamiento?.permisos_escritura ? 'Habilitados' : 'Restringidos'}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`inline-block w-2 h-2 rounded-full ${
                      estadoAlmacenamiento?.permisos_escritura ? 'bg-emerald-400' : 'bg-rose-500'
                    }`}
                  />
                  <span className="text-xs text-slate-400">Directorio seguro verificado</span>
                </div>
              </div>
            </div>

            {/* KPI 3: Total de Respaldos */}
            <div className="bg-[#1E293B]/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Respaldos Guardados
                </span>
                <span className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <HugeiconsIcon icon={CloudBackupIcon} size={18} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-slate-100">
                  {estadoAlmacenamiento ? estadoAlmacenamiento.total_copias : backups.length}
                </div>
                <p className="text-xs text-slate-400 mt-1">Copias históricas inmutables</p>
              </div>
            </div>

            {/* KPI 4: Último Respaldo */}
            <div className="bg-[#1E293B]/70 border border-slate-700/60 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Último Respaldo
                </span>
                <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <HugeiconsIcon icon={CheckmarkCircle01Icon} size={18} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-sm font-bold text-slate-100 truncate">
                  {estadoAlmacenamiento?.ultima_copia?.fecha_creacion
                    ? `${estadoAlmacenamiento.ultima_copia.fecha_creacion} ${estadoAlmacenamiento.ultima_copia.hora_creacion || ''}`
                    : 'Sin copias registradas'}
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  {estadoAlmacenamiento?.ultima_copia?.nombre_archivo || 'Repositorio inicializado'}
                </p>
              </div>
            </div>
          </div>

          {/* Barra de Acciones y Búsqueda */}
          <div className="bg-[#1E293B]/60 border border-slate-700/60 rounded-xl p-4 backdrop-blur-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-sm">
            {/* Buscador de Respaldos */}
            <div className="relative flex-1 max-w-md">
              <HugeiconsIcon
                icon={Search01Icon}
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Buscar por nombre de archivo, versión u operador..."
                value={filtroTexto}
                onChange={e => setFiltroTexto(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-[#0F172A] border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            {/* Botonera de Acción */}
            <div className="flex items-center flex-wrap gap-2.5">
              <button
                onClick={ejecutarDepuracionHuerfanos}
                disabled={depurandoHuerfanos || cargando}
                title="Escanear la carpeta de respaldos para eliminar archivos .sql sueltos sin registro y limpiar filas del historial cuyo archivo ya no exista en disco."
                className="flex flex-col items-start px-3.5 py-2 rounded-lg bg-amber-950/30 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <HugeiconsIcon icon={CleanIcon} size={15} className={depurandoHuerfanos ? 'animate-spin' : ''} />
                  <span>Depurar Huérfanos</span>
                </span>
                <span className="text-[10px] text-amber-200/70 font-normal hidden sm:block">
                  Sincroniza disco y registros BD
                </span>
              </button>

              <button
                onClick={ejecutarCicloProgramado}
                disabled={ejecutandoCiclo || cargando}
                title="Evalúa los niveles automáticos habilitados (Diario, Semanal, Quincenal, Mensual) según calendario y ejecuta los respaldos que correspondan con rotación FIFO."
                className="flex flex-col items-start px-3.5 py-2 rounded-lg bg-violet-950/40 hover:bg-violet-900/60 text-violet-300 border border-violet-500/40 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span className="flex items-center gap-1.5 text-xs font-semibold">
                  <HugeiconsIcon icon={PlayIcon} size={15} className={ejecutandoCiclo ? 'animate-spin' : ''} />
                  <span>Ejecutar Ciclo</span>
                </span>
                <span className="text-[10px] text-violet-200/70 font-normal hidden sm:block">
                  Evalúa respaldos programados
                </span>
              </button>

              <button
                onClick={cargarDatos}
                disabled={cargando}
                title="Actualizar listado"
                className="p-2.5 rounded-lg bg-[#0F172A] border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
              >
                <HugeiconsIcon icon={RefreshIcon} size={18} className={cargando ? 'animate-spin' : ''} />
              </button>

              <button
                onClick={abrirModalGenerar}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-semibold text-sm shadow-md shadow-cyan-500/20 transition-all active:scale-[0.98] cursor-pointer"
              >
                <HugeiconsIcon icon={CloudBackupIcon} size={18} />
                <span>Generar Respaldo Manual</span>
              </button>
            </div>
          </div>

          {/* Guía rápida de acciones de mantenimiento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-amber-950/15 border border-amber-500/25 text-slate-300 flex items-start gap-2.5">
              <span className="text-amber-400 font-bold shrink-0">🧹</span>
              <div>
                <span className="font-semibold text-amber-300">Depurar Huérfanos: </span>
                <span className="text-slate-400">
                  Elimina archivos <code className="text-slate-300">.sql</code> residuales que no figuren en el historial y limpia registros cuyo archivo físico falte en el servidor (estado &ldquo;No Encontrado&rdquo;).
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-violet-950/15 border border-violet-500/25 text-slate-300 flex items-start gap-2.5">
              <span className="text-violet-400 font-bold shrink-0">▶</span>
              <div>
                <span className="font-semibold text-violet-300">Ejecutar Ciclo: </span>
                <span className="text-slate-400">
                  Evalúa en el momento las políticas automáticas activas (Diario, Semanal, Quincenal, Mensual) y genera el respaldo si corresponde por calendario, aplicando rotación FIFO.
                </span>
              </div>
            </div>
          </div>

          {/* Selector de Pestañas / Filtro por Nivel de Respaldo */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-slate-700">
            {[
              { id: 'TODAS', label: 'Todos los Respaldos', count: conteoCategorias.TODAS },
              { id: 'DIARIOS', label: 'Diarios', count: conteoCategorias.DIARIOS },
              { id: 'SEMANALES', label: 'Semanales', count: conteoCategorias.SEMANALES },
              { id: 'QUINCENALES', label: 'Quincenales', count: conteoCategorias.QUINCENALES },
              { id: 'MENSUALES', label: 'Mensuales', count: conteoCategorias.MENSUALES },
              { id: 'MANUALES', label: 'Manuales', count: conteoCategorias.MANUALES }
            ].map(pill => {
              const activo = categoriaFiltro === pill.id;
              return (
                <button
                  key={pill.id}
                  onClick={() => setCategoriaFiltro(pill.id)}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border ${
                    activo
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm shadow-cyan-500/10'
                      : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border-slate-700/60 hover:border-slate-600'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      activo ? 'bg-cyan-400/20 text-cyan-200' : 'bg-slate-900 text-slate-400'
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Tabla de Copias de Seguridad */}
          <div className="bg-[#1E293B]/60 border border-slate-700/60 rounded-xl overflow-hidden backdrop-blur-md shadow-sm">
            <div className="p-4 border-b border-slate-700/60 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Respaldos del Sistema</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Copias inmutables almacenadas en el directorio protegido del servidor
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {respaldosFiltrados.length} {respaldosFiltrados.length === 1 ? 'copia' : 'copias'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-800/50 text-slate-400 border-b border-slate-700/60 uppercase text-xs tracking-wider">
                    <th className="py-3 px-4">Archivo & Versión</th>
                    <th className="py-3 px-4">Fecha & Hora</th>
                    <th className="py-3 px-4">Tamaño</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4">Generado Por</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-slate-200">
                  {cargando && respaldosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HugeiconsIcon icon={RefreshIcon} size={24} className="animate-spin text-cyan-400" />
                          <span>Consultando repositorio de respaldos...</span>
                        </div>
                      </td>
                    </tr>
                  ) : respaldosFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <HugeiconsIcon icon={Database01Icon} size={32} className="text-slate-600" />
                          <span className="font-medium">No se encontraron resultados</span>
                          <span className="text-xs text-slate-500">
                            {filtroTexto ? 'Intente ajustar el texto de búsqueda.' : 'Genere su primer respaldo manual usando el botón superior.'}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    respaldosFiltrados.map(b => (
                      <tr key={b.id_backup} className="hover:bg-slate-800/40 transition-colors">
                        {/* Archivo & Versión */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <span className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 shrink-0">
                              <HugeiconsIcon icon={Database01Icon} size={16} />
                            </span>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-100 truncate max-w-xs" title={b.nombre_archivo}>
                                {b.nombre_archivo}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono border border-cyan-500/30">
                                  v{b.version}
                                </span>
                                {b.carpeta_relativa && (
                                  <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                                    <HugeiconsIcon icon={Folder01Icon} size={12} className="text-slate-500" />
                                    {b.carpeta_relativa}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Fecha & Hora */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-200 font-medium">{b.fecha_creacion}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {b.hora_creacion || 'Horario no registrado'}
                          </div>
                        </td>

                        {/* Tamaño */}
                        <td className="py-3.5 px-4 whitespace-nowrap font-mono text-xs text-slate-300">
                          {b.tamano_formateado || (b.tamano_mb ? `${b.tamano_mb} MB` : 'N/D')}
                        </td>

                        {/* Nivel / Tipo */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {(() => {
                            const badge = getBadgeCategoria(b.categoria_backup || (b.automatico ? 'DIARIO' : 'MANUAL'));
                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}>
                                {badge.label}
                              </span>
                            );
                          })()}
                        </td>

                        {/* Generado Por */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-200 text-xs font-medium truncate max-w-[180px]">
                            {b.nombre_usuario || 'Administrador'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            {b.email_usuario || ''}
                          </div>
                        </td>

                        {/* Estado */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {b.archivo_existe ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-500/40">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Verificado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-rose-950/40 text-rose-300 border border-rose-500/40">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              No Encontrado
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Ver Expediente */}
                            <button
                              onClick={() => {
                                setDetalleBackup(b);
                                setModalDetalle(true);
                              }}
                              title="Ver ficha técnica"
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                            >
                              <HugeiconsIcon icon={ViewIcon} size={16} />
                            </button>

                            {/* Descargar Respaldo */}
                            <button
                              onClick={() => descargarRespaldo(b.id_backup, b.nombre_archivo)}
                              disabled={!b.archivo_existe}
                              title="Descargar respaldo localmente"
                              className="p-1.5 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <HugeiconsIcon icon={CloudDownloadIcon} size={16} />
                            </button>

                            {/* Restaurar Sistema */}
                            <button
                              onClick={() => iniciarProcesoRestauracion(b)}
                              disabled={!b.archivo_existe}
                              title="Restaurar base de datos a este punto"
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-500/40 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <HugeiconsIcon icon={ShieldAlertIcon} size={15} />
                              <span>Restaurar</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* ====================================================================== */}
      {/* MODAL CU-22: GENERAR COPIA DE SEGURIDAD MANUAL */}
      {/* ====================================================================== */}
      <AnimatePresence>
        {modalGenerar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Cabecera del Modal */}
              <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
                    <HugeiconsIcon icon={CloudBackupIcon} size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Generar Respaldo Manual</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Creación de volcado completo de la base de datos</p>
                  </div>
                </div>
                {!generandoCopia && (
                  <button
                    onClick={() => setModalGenerar(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={18} />
                  </button>
                )}
              </div>

              {/* Contenido del Modal */}
              <div className="p-6 space-y-4">
                {copiaGeneradaExitosa ? (
                  /* Vista de Éxito con opción de descarga (CU-22 Paso 6) */
                  <div className="space-y-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={36} />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-100">¡Respaldo Generado Exitosamente!</h4>
                      <p className="text-xs text-slate-300 mt-1">
                        El archivo ha sido almacenado en el repositorio inmutable del servidor, se ha generado el log de
                        auditoría y se envió la notificación formal a su correo electrónico.
                      </p>
                    </div>

                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-3 text-left space-y-1.5 font-mono text-xs">
                      <div className="text-slate-400">
                        <span className="text-slate-500">Archivo:</span> {copiaGeneradaExitosa.nombre_archivo}
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Versión:</span> v{copiaGeneradaExitosa.version}
                      </div>
                      <div className="text-slate-400">
                        <span className="text-slate-500">Tamaño:</span> {copiaGeneradaExitosa.tamano_formateado || `${copiaGeneradaExitosa.tamano_mb} MB`}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <button
                        onClick={() => descargarRespaldo(copiaGeneradaExitosa.id_backup, copiaGeneradaExitosa.nombre_archivo)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-950 font-semibold text-sm shadow-md transition-all active:scale-[0.98]"
                      >
                        <HugeiconsIcon icon={CloudDownloadIcon} size={18} />
                        <span>Descargar Respaldo Ahora</span>
                      </button>
                      <button
                        onClick={() => setModalGenerar(false)}
                        className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-colors"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Formulario de Confirmación (CU-22 Pasos 2, 3 y 4) */
                  <>
                    {/* Alerta de bloqueo y duración */}
                    <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3.5 flex gap-3 text-amber-200 text-xs">
                      <HugeiconsIcon icon={Alert02Icon} size={20} className="shrink-0 text-amber-400 mt-0.5" />
                      <div className="space-y-1">
                        <span className="font-semibold text-amber-300 block">Advertencia de Operación Crítica:</span>
                        <p className="leading-relaxed text-amber-200/90">
                          Durante el proceso de volcado, las operaciones de escritura críticas del sistema se bloquearán
                          temporalmente para salvaguardar la consistencia de los datos. Esta acción puede tardar unos
                          minutos.
                        </p>
                      </div>
                    </div>

                    {/* Verificación en tiempo real de espacio y permisos */}
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-500 block">Espacio Disponible:</span>
                        <span className="font-semibold text-slate-200">
                          {estadoAlmacenamiento ? `${estadoAlmacenamiento.espacio_libre_gb} GB libres` : 'Verificando...'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Permisos de Servidor:</span>
                        <span className="font-semibold text-emerald-400">Lectura y Escritura OK</span>
                      </div>
                    </div>

                    {/* Versión del Sistema */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Versión del Sistema o Etiqueta de Respaldo:
                      </label>
                      <input
                        type="text"
                        value={versionNueva}
                        onChange={e => setVersionNueva(e.target.value)}
                        placeholder="Ej: 1.0.0 o 2.1.0"
                        className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
                      <button
                        onClick={() => setModalGenerar(false)}
                        disabled={generandoCopia}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={ejecutarGenerarCopia}
                        disabled={generandoCopia}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 font-semibold text-sm shadow-md shadow-cyan-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                      >
                        {generandoCopia ? (
                          <>
                            <HugeiconsIcon icon={RefreshIcon} size={18} className="animate-spin" />
                            <span>Generando volcado...</span>
                          </>
                        ) : (
                          <>
                            <HugeiconsIcon icon={CloudBackupIcon} size={18} />
                            <span>Confirmar e Iniciar Respaldo</span>
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ====================================================================== */}
      {/* MODAL CU-23: RESTAURACIÓN CRÍTICA DE BASE DE DATOS */}
      {/* ====================================================================== */}
      <AnimatePresence>
        {modalRestaurar && copiaSeleccionada && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[#1E293B] border border-rose-500/40 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Cabecera del Modal */}
              <div className="p-5 border-b border-slate-700/60 flex items-center justify-between bg-rose-950/20">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    <HugeiconsIcon icon={ShieldAlertIcon} size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-rose-300">Restauración de Sistema</h3>
                    <p className="text-xs text-rose-400/80 mt-0.5">Operación destructiva de reversión completa</p>
                  </div>
                </div>
                {!restaurando && !restauracionExitosa && (
                  <button
                    onClick={() => setModalRestaurar(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={18} />
                  </button>
                )}
              </div>

              {/* Contenido del Modal */}
              <div className="p-6 space-y-4">
                {restauracionExitosa ? (
                  /* Estado de Éxito: Desconexión y Cierre Forzado */
                  <div className="text-center py-6 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto">
                      <HugeiconsIcon icon={CheckmarkCircle01Icon} size={36} />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-100">¡Restauración Completada!</h4>
                      <p className="text-xs text-slate-300 mt-2 max-w-sm mx-auto leading-relaxed">
                        La base de datos y sus registros regresaron exactamente al estado de la copia seleccionada. Por
                        motivos de máxima seguridad y sincronización de identificadores, su sesión ha sido finalizada.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 text-cyan-400 text-xs font-medium">
                      <HugeiconsIcon icon={RefreshIcon} size={16} className="animate-spin" />
                      <span>Redirigiendo a la pantalla de inicio de sesión...</span>
                    </div>
                  </div>
                ) : restaurando ? (
                  /* Estado En Progreso: Modo Mantenimiento */
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                      <HugeiconsIcon icon={RefreshIcon} size={36} className="animate-spin" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-100">Modo Mantenimiento Activado</h4>
                      <p className="text-xs text-amber-300 mt-2 max-w-sm mx-auto leading-relaxed">
                        Purgando el esquema actual y ejecutando el volcado de la base de datos. Las conexiones de los
                        demás usuarios se encuentran bloqueadas temporalmente.
                      </p>
                      <p className="text-xs text-slate-400 mt-2 font-semibold">
                        Por favor, no cierre ni refresque esta ventana del navegador.
                      </p>
                    </div>
                  </div>
                ) : (
                  /* Formulario de Autorización (CU-23 Pasos 4, 5 y 6) */
                  <>
                    {/* Banner Crítico */}
                    <div className="bg-rose-950/40 border border-rose-500/50 rounded-xl p-3.5 text-rose-200 text-xs leading-relaxed space-y-1">
                      <span className="font-bold text-rose-300 block">⚠️ ADVERTENCIA CRÍTICA:</span>
                      <p>
                        Esta acción sobreescribirá la totalidad de los datos actuales de la empresa con el estado del
                        respaldo seleccionado. Todos los cambios posteriores a esta fecha se perderán de manera
                        irreversible. Todas las sesiones activas en el ERP serán cerradas.
                      </p>
                    </div>

                    {/* Ficha del Respaldo a Restaurar */}
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-3 space-y-1 text-xs font-mono">
                      <div className="text-slate-300">
                        <span className="text-slate-500">Respaldo:</span> {copiaSeleccionada.nombre_archivo}
                      </div>
                      <div className="text-slate-300">
                        <span className="text-slate-500">Versión:</span> v{copiaSeleccionada.version}
                      </div>
                      <div className="text-slate-300">
                        <span className="text-slate-500">Fecha y Hora:</span> {copiaSeleccionada.fecha_creacion}{' '}
                        {copiaSeleccionada.hora_creacion || ''}
                      </div>
                    </div>

                    {/* Notificación de despacho OTP */}
                    <div className="flex items-center justify-between bg-cyan-950/30 border border-cyan-500/30 rounded-lg p-2.5 text-xs text-cyan-300">
                      <div className="flex items-center gap-2">
                        <HugeiconsIcon icon={Key01Icon} size={16} className="shrink-0 text-cyan-400" />
                        <span>
                          {solicitandoOtp
                            ? 'Generando y despachando código de seguridad OTP...'
                            : otpEnviado
                            ? 'Código OTP de 6 dígitos enviado a su correo electrónico.'
                            : 'Solicitando token de seguridad...'}
                        </span>
                      </div>
                      <button
                        onClick={reintentarEnvioOtp}
                        disabled={solicitandoOtp}
                        className="text-[11px] underline hover:text-cyan-200 transition-colors ml-2 shrink-0 disabled:opacity-50"
                      >
                        Reenviar
                      </button>
                    </div>

                    {/* Entrada 1: Contraseña de Administrador */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Contraseña de Administrador:
                      </label>
                      <div className="relative">
                        <input
                          type={mostrarPassword ? 'text' : 'password'}
                          value={passwordAdmin}
                          onChange={e => setPasswordAdmin(e.target.value)}
                          placeholder="Reintroduzca su contraseña para validar identidad"
                          className="w-full pl-3.5 pr-10 py-2.5 bg-[#0F172A] border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setMostrarPassword(!mostrarPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          <HugeiconsIcon icon={mostrarPassword ? ViewOffSlashIcon : ViewIcon} size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Entrada 2: Código OTP de Seguridad */}
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Código de Seguridad OTP (6 dígitos):
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otpToken}
                        onChange={e => setOtpToken(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000"
                        className="w-full px-3.5 py-2.5 bg-[#0F172A] border border-slate-700 rounded-lg text-center tracking-widest font-mono text-lg text-cyan-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition-colors"
                      />
                    </div>

                    {/* Entrada 3: Checkbox de Confirmación Expresa */}
                    <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={confirmacionCheck}
                        onChange={e => setConfirmacionCheck(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 text-rose-500 focus:ring-rose-500 bg-[#0F172A]"
                      />
                      <span className="leading-relaxed">
                        Confirmo que deseo sobreescribir la base de datos actual con este respaldo y entiendo que todas
                        las sesiones serán cerradas.
                      </span>
                    </label>

                    {/* Acciones */}
                    <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/60">
                      <button
                        onClick={() => setModalRestaurar(false)}
                        className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={ejecutarRestauracion}
                        disabled={!passwordAdmin || otpToken.length < 6 || !confirmacionCheck}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-semibold text-sm shadow-md shadow-rose-600/30 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <HugeiconsIcon icon={ShieldAlertIcon} size={18} />
                        <span>Ejecutar Restauración Crítica</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ====================================================================== */}
      {/* MODAL: FICHA TÉCNICA DE LA COPIA DE SEGURIDAD */}
      {/* ====================================================================== */}
      {modalDetalle && detalleBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 overflow-y-auto">
          <div className="w-full max-w-lg bg-[#1E293B] border border-slate-700 rounded-2xl shadow-2xl overflow-hidden my-auto">
            <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-slate-800 text-cyan-400 shrink-0">
                  <HugeiconsIcon icon={Database01Icon} size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-100">Ficha Técnica de Respaldo</h3>
                  <p className="text-xs text-slate-400">Metadatos e integridad física en el servidor</p>
                </div>
              </div>
              <button
                onClick={() => setModalDetalle(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-sm">
              <div className="space-y-3">
                <div className="min-w-0">
                  <span className="text-xs text-slate-500 block uppercase font-mono">Nombre de Archivo</span>
                  <span className="font-semibold text-slate-200 break-all block">{detalleBackup.nombre_archivo}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Versión</span>
                    <span className="font-semibold text-cyan-300 block">v{detalleBackup.version}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Nivel / Categoría</span>
                    {(() => {
                      const badge = getBadgeCategoria(detalleBackup.categoria_backup || (detalleBackup.automatico ? 'DIARIO' : 'MANUAL'));
                      return (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border mt-0.5 ${badge.className}`}>
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Subcarpeta de Destino</span>
                    <span className="font-semibold text-slate-200 font-mono text-xs break-all block mt-0.5">
                      {detalleBackup.carpeta_relativa || 'backups/'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Tipo de Ejecución</span>
                    <span className="font-semibold text-slate-200 break-words block mt-0.5">
                      {detalleBackup.automatico ? 'Automático (Programado)' : 'Manual (Bajo Demanda)'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Fecha de Creación</span>
                    <span className="font-semibold text-slate-200 block">{detalleBackup.fecha_creacion}</span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Hora Registrada</span>
                    <span className="font-semibold text-slate-200 block">{detalleBackup.hora_creacion || 'N/D'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Tamaño en Disco</span>
                    <span className="font-semibold text-slate-200 block">
                      {detalleBackup.tamano_formateado || `${detalleBackup.tamano_mb} MB`}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs text-slate-500 block uppercase font-mono">Integridad Física</span>
                    <span
                      className={`font-semibold block ${
                        detalleBackup.archivo_existe ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {detalleBackup.archivo_existe ? 'Archivo Íntegro en Disco' : 'No Encontrado'}
                    </span>
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="text-xs text-slate-500 block uppercase font-mono">Operador Responsable</span>
                  <span className="font-semibold text-slate-200 break-words block">
                    {detalleBackup.nombre_usuario || 'Administrador'} ({detalleBackup.email_usuario || 'N/D'})
                  </span>
                </div>

                <div className="min-w-0">
                  <span className="text-xs text-slate-500 block uppercase font-mono mb-1">Ruta Física en Servidor</span>
                  <div className="flex items-center justify-between bg-[#0F172A] border border-slate-700/80 rounded-lg p-2 font-mono text-xs text-slate-400 break-all">
                    <span>{detalleBackup.ubicacion_archivo}</span>
                    <button
                      onClick={() => copiarAlPortapapeles(detalleBackup.ubicacion_archivo)}
                      className="p-1 rounded text-slate-400 hover:text-white transition-colors shrink-0 ml-2 cursor-pointer"
                      title="Copiar ruta"
                    >
                      <HugeiconsIcon icon={Copy01Icon} size={15} />
                    </button>
                  </div>
                  {copiadoRuta && (
                    <span className="text-[11px] text-cyan-400 block mt-1">¡Ruta copiada al portapapeles!</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-700/60">
                <button
                  onClick={() => descargarRespaldo(detalleBackup.id_backup, detalleBackup.nombre_archivo)}
                  disabled={!detalleBackup.archivo_existe}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/40 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
                >
                  <HugeiconsIcon icon={CloudDownloadIcon} size={16} />
                  <span>Descargar Archivo</span>
                </button>
                <button
                  onClick={() => setModalDetalle(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
