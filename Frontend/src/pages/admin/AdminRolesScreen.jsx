import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AdminRolesScreen() {
  const { token } = useAuth();
  const [roles, setRoles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Estado del Rol seleccionado para edición
  const [rolEditando, setRolEditando] = useState(null);
  const [nombreRol, setNombreRol] = useState('');
  const [descripcionRol, setDescripcionRol] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState('');

  // Auto-cierre de alertas a los 6 segundos
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [successMsg]);

  useEffect(() => {
    if (!errorModal) return;
    const timer = setTimeout(() => setErrorModal(''), 6000);
    return () => clearTimeout(timer);
  }, [errorModal]);

  const cargarRoles = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setErrorMsg('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/users/roles/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(res.data)) {
        setRoles(res.data);
      }
    } catch (err) {
      const data = err.response?.data;
      setErrorMsg(
        data?.error ||
          data?.detail ||
          'No se pudo cargar el listado de roles del sistema.'
      );
    } finally {
      setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    cargarRoles();
  }, [cargarRoles]);

  const handleAbrirEdicion = (rol) => {
    setRolEditando(rol);
    setNombreRol(rol.nombre_rol || '');
    setDescripcionRol(rol.descripcion || '');
    setErrorModal('');
  };

  const handleCerrarEdicion = () => {
    if (guardando) return;
    setRolEditando(null);
    setNombreRol('');
    setDescripcionRol('');
    setErrorModal('');
  };

  const nombreLimpio = nombreRol.trim();
  const descripcionLimpia = descripcionRol.trim();

  // Verificar duplicado local en tiempo real excluyendo el rol actual
  const nombreDuplicado = Boolean(
    rolEditando &&
      nombreLimpio &&
      roles.some(
        (r) =>
          r.id_rol !== rolEditando.id_rol &&
          (r.nombre_rol || '').trim().toLowerCase() === nombreLimpio.toLowerCase()
      )
  );

  const formularioValido =
    Boolean(nombreLimpio) &&
    nombreLimpio.length <= 100 &&
    descripcionRol.length <= 1000 &&
    !nombreDuplicado;

  const handleGuardarRol = async (e) => {
    e.preventDefault();
    if (!rolEditando) return;
    setErrorModal('');

    if (!nombreLimpio) {
      setErrorModal('El nombre del rol no puede estar vacío.');
      return;
    }
    if (nombreDuplicado) {
      setErrorModal('Ya existe otro rol con ese nombre en el sistema.');
      return;
    }

    setGuardando(true);
    try {
      const res = await axios.patch(
        `${API_BASE_URL}/api/users/roles/${rolEditando.id_rol}/editar/`,
        {
          nombre: nombreLimpio,
          descripcion: descripcionLimpia
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      const rolActualizado = res.data?.rol;
      if (rolActualizado) {
        setRoles((prev) =>
          prev.map((r) =>
            r.id_rol === rolEditando.id_rol
              ? { ...r, ...rolActualizado, usuarios_count: r.usuarios_count }
              : r
          )
        );
      } else {
        await cargarRoles();
      }

      setSuccessMsg(res.data?.mensaje || 'Rol actualizado correctamente.');
      setRolEditando(null);
    } catch (err) {
      const data = err.response?.data;
      let msg = 'No se pudieron guardar los cambios del rol.';
      if (data) {
        if (typeof data.detail === 'string') msg = data.detail;
        else if (Array.isArray(data.detail)) msg = data.detail.join(' ');
        else if (data.error) msg = data.error;
        else if (data.nombre) msg = Array.isArray(data.nombre) ? data.nombre[0] : data.nombre;
        else if (data.descripcion)
          msg = Array.isArray(data.descripcion) ? data.descripcion[0] : data.descripcion;
      }
      setErrorModal(msg);
    } finally {
      setGuardando(false);
    }
  };

  const obtenerEstiloRol = (codigo = '', nombre = '') => {
    const ref = `${codigo} ${nombre}`.toUpperCase();
    if (ref.includes('ADMIN')) {
      return {
        acento: 'border-violet-500/40 hover:border-violet-400/70',
        badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
        iconoBg: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
        etiquetaNivel: 'Control Total del Sistema'
      };
    }
    if (ref.includes('TECNICO') || ref.includes('TÉCNICO')) {
      return {
        acento: 'border-cyan-500/40 hover:border-cyan-400/70',
        badge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        iconoBg: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
        etiquetaNivel: 'Operación Técnica y Taller'
      };
    }
    return {
      acento: 'border-slate-700/80 hover:border-cyan-500/40',
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      iconoBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      etiquetaNivel: 'Portal de Autogestión y Tienda'
    };
  };

  const totalUsuariosAsignados = roles.reduce(
    (acc, r) => acc + (Number(r.usuarios_count) || 0),
    0
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra Lateral de Administrador */}
      <AdminSidebar activeMenu="admin-roles" />

      {/* Contenido Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior Unificada */}
        <AdminHeader
          category="Gestión de Roles"
          pageName="Roles"
          title="Gestión de Roles"
        />

        <div className="p-6 sm:p-8 space-y-6 flex-1 max-w-6xl w-full mx-auto">
          {/* Métricas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="px-5 py-4 rounded-2xl bg-[#1E293B] border border-slate-700/80 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono uppercase text-slate-400">Roles Activos en Sistema</p>
                <p className="text-2xl font-black text-cyan-400 mt-1">{roles.length}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
                🛡️
              </div>
            </div>
            <div className="px-5 py-4 rounded-2xl bg-[#1E293B] border border-slate-700/80 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono uppercase text-slate-400">Cuentas de Usuario Vinculadas</p>
                <p className="text-2xl font-black text-violet-400 mt-1">{totalUsuariosAsignados}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold">
                👥
              </div>
            </div>
          </div>

          {/* Notificaciones de Éxito / Error */}
          <AnimatePresence>
            {successMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-emerald-400 font-bold">✓</span>
                  <span>{successMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMsg('')}
                  className="text-emerald-400 hover:text-emerald-200 font-bold"
                >
                  ✕
                </button>
              </motion.div>
            )}

            {errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center justify-between shadow-lg"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-rose-400 font-bold">⚠</span>
                  <span>{errorMsg}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="text-rose-400 hover:text-rose-200 font-bold"
                >
                  ✕
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Listado de Roles */}
          {cargando ? (
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center space-y-3 shadow-xl">
              <div className="w-10 h-10 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Cargando roles del sistema...</p>
            </div>
          ) : roles.length === 0 ? (
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center space-y-3 shadow-xl">
              <p className="text-base font-bold text-white">No hay roles registrados</p>
              <p className="text-xs text-slate-400">
                No se encontraron roles activos disponibles para configurar.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {roles.map((rol) => {
                const estilo = obtenerEstiloRol(rol.codigo, rol.nombre_rol);
                return (
                  <motion.div
                    key={rol.codigo || rol.nombre_rol}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`bg-[#1E293B] border ${estilo.acento} rounded-2xl p-6 shadow-xl flex flex-col justify-between transition-all duration-200`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${estilo.badge}`}
                        >
                          {estilo.etiquetaNivel}
                        </span>
                        <span className="text-xs font-mono text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800">
                          {Number(rol.usuarios_count) || 0} usuarios
                        </span>
                      </div>

                      <div>
                        <h2 className="text-xl font-extrabold text-white tracking-tight">
                          {rol.nombre_rol}
                        </h2>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mt-2 min-h-[60px]">
                          {rol.descripcion || 'Sin descripción configurada para este rol.'}
                        </p>
                      </div>
                    </div>

                    <div className="pt-5 mt-5 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        Rol Activo
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAbrirEdicion(rol)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#06B6D4]/20 to-[#8B5CF6]/20 hover:from-[#06B6D4]/30 hover:to-[#8B5CF6]/30 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all"
                      >
                        Modificar Rol
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Modal de Edición de Rol */}
      <AnimatePresence>
        {rolEditando && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-lg bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-5 bg-slate-900/70 border-b border-slate-700/80 flex items-center justify-between">
                <div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-500/10 text-violet-300 border border-violet-500/30 mb-1">
                    Configuración de Rol
                  </span>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Modificar Rol
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={handleCerrarEdicion}
                  disabled={guardando}
                  className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleGuardarRol} className="p-6 space-y-4">
                <AnimatePresence>
                  {errorModal && (
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start justify-between gap-2"
                    >
                      <span>{errorModal}</span>
                      <button
                        type="button"
                        onClick={() => setErrorModal('')}
                        className="text-rose-400 hover:text-rose-200 font-bold"
                      >
                        ✕
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nombre del Rol <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={nombreRol}
                    onChange={(e) => setNombreRol(e.target.value)}
                    placeholder="Ej: Técnico Especialista"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      !nombreLimpio || nombreDuplicado
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : 'border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  {!nombreLimpio && (
                    <p className="text-[11px] text-rose-400 mt-1">
                      El nombre del rol es obligatorio.
                    </p>
                  )}
                  {nombreDuplicado && (
                    <p className="text-[11px] text-rose-400 mt-1">
                      Ya existe otro rol registrado con este nombre.
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Descripción
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">
                      {descripcionRol.length}/1000
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={1000}
                    value={descripcionRol}
                    onChange={(e) => setDescripcionRol(e.target.value)}
                    placeholder="Describe las responsabilidades y alcance operativo de este rol..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors resize-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleCerrarEdicion}
                    disabled={guardando}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!formularioValido || guardando}
                    className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {guardando ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
