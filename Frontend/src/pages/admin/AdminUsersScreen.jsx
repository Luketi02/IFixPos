import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import UserProfileDropdown from '../../components/navigation/UserProfileDropdown';
import EditUserModal from '../../components/users/EditUserModal';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function AdminUsersScreen() {
  const { token } = useAuth();
  // Estados de Datos
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [paises, setPaises] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);

  // Estados de Filtros (Búsqueda exacta + Categóricos + Geográficos)
  const [filtroDni, setFiltroDni] = useState('');
  const [filtroEmail, setFiltroEmail] = useState('');
  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState(''); // '' | 'true' | 'false'
  const [filtroPais, setFiltroPais] = useState('');
  const [filtroProvincia, setFiltroProvincia] = useState('');
  const [filtroCiudad, setFiltroCiudad] = useState('');

  // Estados de UI y Feedback
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Estado para Modal de Edición (Modificar Usuario)
  const [usuarioEditar, setUsuarioEditar] = useState(null);
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);

  // Auto-ocultar alertas a los 6 segundos
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

  // Cargar catálogos iniciales: Roles y Países
  useEffect(() => {
    if (!token) return;
    const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

    const cargarCatalogosBase = async () => {
      try {
        const [resRoles, resPaises] = await Promise.all([
          axios.get(`${API_BASE_URL}/api/users/roles/`, authHeaders).catch(() => ({ data: [] })),
          axios.get(`${API_BASE_URL}/api/geo/paises/?todas=true`, authHeaders).catch(() => ({ data: [] }))
        ]);

        if (Array.isArray(resRoles.data) && resRoles.data.length > 0) {
          setRoles(resRoles.data);
        } else {
          setRoles([
            { id_rol: 1, codigo: 'ADMIN', nombre_rol: 'Administrador' },
            { id_rol: 2, codigo: 'TECNICO', nombre_rol: 'Técnico' },
            { id_rol: 3, codigo: 'CLIENTE', nombre_rol: 'Cliente' }
          ]);
        }

        if (Array.isArray(resPaises.data)) {
          setPaises(resPaises.data);
        }
      } catch {
        // Silencioso en catálogos auxiliares
      }
    };
    cargarCatalogosBase();
  }, [token]);

  // Cascada Geográfica: Provincias al seleccionar País
  useEffect(() => {
    setFiltroProvincia('');
    setFiltroCiudad('');
    setProvincias([]);
    setCiudades([]);

    if (!filtroPais || !token) return;

    const cargarProvincias = async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/geo/paises/${filtroPais}/provincias/?todas=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (Array.isArray(res.data)) {
          setProvincias(res.data);
        }
      } catch {
        setProvincias([]);
      }
    };
    cargarProvincias();
  }, [filtroPais, token]);

  // Cascada Geográfica: Ciudades al seleccionar Provincia
  useEffect(() => {
    setFiltroCiudad('');
    setCiudades([]);

    if (!filtroProvincia || !token) return;

    const cargarCiudades = async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/geo/provincias/${filtroProvincia}/ciudades/?todas=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (Array.isArray(res.data)) {
          setCiudades(res.data);
        }
      } catch {
        setCiudades([]);
      }
    };
    cargarCiudades();
  }, [filtroProvincia, token]);

  // Función para consultar usuarios aplicando los filtros combinados
  const consultarUsuarios = useCallback(
    async (paramsPersonalizados = null) => {
      if (!token) return;
      setCargando(true);
      setErrorMsg('');

      const dniVal = paramsPersonalizados ? paramsPersonalizados.dni : filtroDni;
      const emailVal = paramsPersonalizados ? paramsPersonalizados.email : filtroEmail;
      const rolVal = paramsPersonalizados ? paramsPersonalizados.id_rol : filtroRol;
      const estadoVal = paramsPersonalizados ? paramsPersonalizados.activo : filtroEstado;
      const paisVal = paramsPersonalizados ? paramsPersonalizados.id_pais : filtroPais;
      const provVal = paramsPersonalizados ? paramsPersonalizados.id_provincia : filtroProvincia;
      const ciudadVal = paramsPersonalizados ? paramsPersonalizados.id_ciudad : filtroCiudad;

      // Validación en tiempo real de DNI si se ingresó
      if (dniVal && dniVal.trim() && !/^\d+$/.test(dniVal.trim())) {
        setCargando(false);
        setErrorMsg('El filtro de DNI debe contener únicamente números.');
        return;
      }

      const queryParams = {};
      if (dniVal && dniVal.trim()) queryParams.dni = dniVal.trim();
      if (emailVal && emailVal.trim()) queryParams.email = emailVal.trim();
      if (rolVal) queryParams.id_rol = rolVal;
      if (estadoVal === 'true' || estadoVal === 'false') queryParams.activo = estadoVal;
      if (ciudadVal) queryParams.id_ciudad = ciudadVal;
      else if (provVal) queryParams.id_provincia = provVal;
      else if (paisVal) queryParams.id_pais = paisVal;

      try {
        const res = await axios.get(`${API_BASE_URL}/api/users/filtrar/`, {
          params: queryParams,
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsuarios(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        const data = err.response?.data;
        let msg = 'No se pudo obtener el directorio de usuarios. Verifique los filtros aplicados.';
        if (data) {
          if (typeof data.detail === 'string') msg = data.detail;
          else if (data.error) msg = data.error;
          else if (data.dni) msg = Array.isArray(data.dni) ? data.dni[0] : data.dni;
          else if (data.email) msg = Array.isArray(data.email) ? data.email[0] : data.email;
        }
        setErrorMsg(msg);
      } finally {
        setCargando(false);
      }
    },
    [token, filtroDni, filtroEmail, filtroRol, filtroEstado, filtroPais, filtroProvincia, filtroCiudad]
  );

  // Carga inicial
  useEffect(() => {
    if (!token) return;
    consultarUsuarios({
      dni: '',
      email: '',
      id_rol: '',
      activo: '',
      id_pais: '',
      id_provincia: '',
      id_ciudad: ''
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleAplicarFiltros = (e) => {
    if (e) e.preventDefault();
    consultarUsuarios();
  };

  const handleLimpiarFiltros = () => {
    setFiltroDni('');
    setFiltroEmail('');
    setFiltroRol('');
    setFiltroEstado('');
    setFiltroPais('');
    setFiltroProvincia('');
    setFiltroCiudad('');

    consultarUsuarios({
      dni: '',
      email: '',
      id_rol: '',
      activo: '',
      id_pais: '',
      id_provincia: '',
      id_ciudad: ''
    });
  };

  const handleAbrirEditar = (usuario) => {
    setUsuarioEditar(usuario);
    setModalEditarAbierto(true);
  };

  const handleUsuarioGuardado = (mensajeExito) => {
    setSuccessMsg(mensajeExito || 'Usuario actualizado correctamente.');
    consultarUsuarios();
  };

  // Métricas rápidas de los resultados en vista
  const totalUsuarios = usuarios.length;
  const totalActivos = usuarios.filter((u) => u.is_active !== false).length;
  const totalInactivos = totalUsuarios - totalActivos;

  const obtenerBadgeRol = (nombreRol = '') => {
    const lower = nombreRol.toLowerCase();
    if (lower.includes('admin')) {
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    }
    if (lower.includes('técnico') || lower.includes('tecnico')) {
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
    }
    return 'bg-slate-700/50 text-slate-300 border-slate-600/50';
  };

  const hayFiltrosActivos = Boolean(
    filtroDni.trim() ||
      filtroEmail.trim() ||
      filtroRol ||
      filtroEstado !== '' ||
      filtroPais ||
      filtroProvincia ||
      filtroCiudad
  );

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra Lateral de Administrador */}
      <AdminSidebar activeMenu="admin-users" />

      {/* Columna Principal */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Cabecera Superior */}
        <header className="h-16 border-b border-slate-800 bg-[#1E293B]/70 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-slate-300">
              Gestión de Roles • <span className="text-cyan-400 font-semibold">Directorio de Usuarios</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <UserProfileDropdown align="right" />
          </div>
        </header>

        <div className="p-6 sm:p-8 space-y-6 flex-1 max-w-7xl w-full mx-auto">
          {/* Encabezado de Pantalla y Cápsulas de Resumen */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 bg-[#1E293B] border border-slate-700/80 rounded-2xl p-6 shadow-xl">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-semibold border border-cyan-500/30 mb-2">
                Administración de Cuentas
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Directorio y Gestión de Usuarios
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm mt-1">
                Filtra cuentas por criterios combinados y administra sus datos personales, roles y credenciales.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:w-auto w-full">
              <div className="px-4 py-3 rounded-xl bg-slate-900/80 border border-slate-700/70 text-center">
                <p className="text-[11px] font-mono uppercase text-slate-400">En Vista</p>
                <p className="text-xl font-black text-white mt-0.5">{totalUsuarios}</p>
              </div>
              <div className="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <p className="text-[11px] font-mono uppercase text-emerald-300">Activos</p>
                <p className="text-xl font-black text-emerald-400 mt-0.5">{totalActivos}</p>
              </div>
              <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-center">
                <p className="text-[11px] font-mono uppercase text-rose-300">Inactivos</p>
                <p className="text-xl font-black text-rose-400 mt-0.5">{totalInactivos}</p>
              </div>
            </div>
          </div>

          {/* Alertas de Feedback (Éxito / Error) */}
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

          {/* Panel de Filtros Combinados */}
          <form
            onSubmit={handleAplicarFiltros}
            className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Filtros de Búsqueda y Segmentación
                </h2>
                <p className="text-xs text-slate-400">
                  Combina búsqueda por DNI o correo con rol, estado de cuenta y ubicación geográfica.
                </p>
              </div>
              {hayFiltrosActivos && (
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Limpiar todos los filtros
                </button>
              )}
            </div>

            {/* Fila 1: Búsqueda Exacta (DNI y Correo) + Filtros Categóricos (Rol y Estado) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Documento (DNI)
                </label>
                <input
                  type="text"
                  value={filtroDni}
                  onChange={(e) => setFiltroDni(e.target.value)}
                  placeholder="Ej: 33445566"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Correo Electrónico
                </label>
                <input
                  type="text"
                  value={filtroEmail}
                  onChange={(e) => setFiltroEmail(e.target.value)}
                  placeholder="Ej: usuario@correo.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Rol de Sistema
                </label>
                <select
                  value={filtroRol}
                  onChange={(e) => setFiltroRol(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Todos los roles</option>
                  {roles.map((r) => (
                    <option key={r.id_rol} value={String(r.id_rol)}>
                      {r.nombre_rol}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Estado de la Cuenta
                </label>
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Todos los estados</option>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo / Bloqueado</option>
                </select>
              </div>
            </div>

            {/* Fila 2: Ubicación Geográfica en Cascada + Botones de Acción */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  País
                </label>
                <select
                  value={filtroPais}
                  onChange={(e) => setFiltroPais(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="">Todos los países</option>
                  {paises.map((p) => (
                    <option key={p.id_pais} value={String(p.id_pais)}>
                      {p.nombre_pais}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Provincia
                </label>
                <select
                  value={filtroProvincia}
                  onChange={(e) => setFiltroProvincia(e.target.value)}
                  disabled={!filtroPais}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {filtroPais ? 'Todas las provincias' : 'Seleccione un país'}
                  </option>
                  {provincias.map((pr) => (
                    <option key={pr.id_provincia} value={String(pr.id_provincia)}>
                      {pr.nombre_provincia}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Ciudad
                </label>
                <select
                  value={filtroCiudad}
                  onChange={(e) => setFiltroCiudad(e.target.value)}
                  disabled={!filtroProvincia}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {filtroProvincia ? 'Todas las ciudades' : 'Seleccione una provincia'}
                  </option>
                  {ciudades.map((c) => (
                    <option key={c.id_ciudad} value={String(c.id_ciudad)}>
                      {c.nombre_ciudad}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="submit"
                  disabled={cargando}
                  className="flex-1 px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {cargando ? 'Filtrando...' : 'Aplicar Filtros'}
                </button>
                <button
                  type="button"
                  onClick={handleLimpiarFiltros}
                  disabled={cargando}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold border border-slate-700 transition-colors"
                >
                  Restablecer
                </button>
              </div>
            </div>
          </form>

          {/* Tabla de Resultados */}
          <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-xl overflow-hidden">
            {cargando ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-slate-400">Consultando directorio de usuarios...</p>
              </div>
            ) : usuarios.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400 text-xl">
                  🔍
                </div>
                <h3 className="text-base font-bold text-white">No se encontraron resultados</h3>
                <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
                  No existen usuarios registrados que coincidan con la combinación de filtros ingresada.
                </p>
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={handleLimpiarFiltros}
                    className="mt-2 px-4 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors"
                  >
                    Ver todos los usuarios
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/70 border-b border-slate-700/80 text-[11px] font-mono uppercase text-slate-400">
                      <th className="py-3.5 px-5">Usuario</th>
                      <th className="py-3.5 px-4">Documento (DNI)</th>
                      <th className="py-3.5 px-4">Contacto</th>
                      <th className="py-3.5 px-4">Ubicación</th>
                      <th className="py-3.5 px-4">Rol</th>
                      <th className="py-3.5 px-4">Estado</th>
                      <th className="py-3.5 px-5 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 text-sm">
                    {usuarios.map((u) => {
                      const nombreCompleto =
                        [u.perfil?.nombre, u.perfil?.apellido].filter(Boolean).join(' ') ||
                        'Sin nombre registrado';
                      const iniciales = (
                        (u.perfil?.nombre?.[0] || u.email?.[0] || 'U') +
                        (u.perfil?.apellido?.[0] || '')
                      ).toUpperCase();
                      const nombreRol = u.rol?.nombre_rol || 'Cliente';
                      const activo = u.is_active !== false;
                      const textoUbicacion = u.ubicacion
                        ? [u.ubicacion.ciudad, u.ubicacion.provincia, u.ubicacion.pais]
                            .filter(Boolean)
                            .join(', ')
                        : 'Sin dirección registrada';

                      return (
                        <tr
                          key={u.email}
                          className="hover:bg-slate-800/40 transition-colors"
                        >
                          {/* Usuario (Avatar + Nombre + Correo) */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-xs font-bold text-cyan-300 shrink-0">
                                {iniciales}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate">
                                  {nombreCompleto}
                                </p>
                                <p className="text-xs text-slate-400 truncate">
                                  {u.email}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* DNI */}
                          <td className="py-4 px-4 font-mono text-xs text-slate-300">
                            {u.perfil?.dni || <span className="text-slate-500">No registrado</span>}
                          </td>

                          {/* Teléfonos */}
                          <td className="py-4 px-4">
                            <p className="text-xs text-slate-200">
                              {u.perfil?.telefono || <span className="text-slate-500">Sin teléfono</span>}
                            </p>
                            {u.perfil?.telefono_alt && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Alt: {u.perfil.telefono_alt}
                              </p>
                            )}
                          </td>

                          {/* Ubicación Geográfica */}
                          <td className="py-4 px-4 text-xs text-slate-300">
                            {u.ubicacion ? (
                              <span>{textoUbicacion}</span>
                            ) : (
                              <span className="text-slate-500">No registrada</span>
                            )}
                          </td>

                          {/* Rol */}
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${obtenerBadgeRol(
                                nombreRol
                              )}`}
                            >
                              {nombreRol}
                            </span>
                          </td>

                          {/* Estado */}
                          <td className="py-4 px-4">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                activo
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  activo ? 'bg-emerald-400' : 'bg-rose-400'
                                }`}
                              />
                              {activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </td>

                          {/* Acción: Editar Usuario */}
                          <td className="py-4 px-5 text-right">
                            <button
                              type="button"
                              onClick={() => handleAbrirEditar(u)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all"
                            >
                              Editar
                            </button>
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

      {/* Modal de Edición Administrativa de Usuario */}
      <EditUserModal
        isOpen={modalEditarAbierto}
        onClose={() => {
          setModalEditarAbierto(false);
          setUsuarioEditar(null);
        }}
        usuario={usuarioEditar}
        roles={roles}
        onSaved={handleUsuarioGuardado}
      />
    </div>
  );
}
