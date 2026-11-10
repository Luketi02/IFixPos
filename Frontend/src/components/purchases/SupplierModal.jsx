import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

import { API_BASE_URL } from '../../config/api';
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^[+\d\s()-]{7,25}$/;

export default function SupplierModal({
  isOpen,
  onClose,
  proveedor = null,
  nombreSugerido = '',
  paises = [],
  onSaved
}) {
  const { token } = useAuth();
  const esEdicion = Boolean(proveedor);

  // Datos principales del proveedor
  const [nombre, setNombre] = useState('');
  const [cuit, setCuit] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [estado, setEstado] = useState(true);
  const [ofreceEnvio, setOfreceEnvio] = useState(true);
  const [nivel, setNivel] = useState('Estándar');

  // Datos de Dirección Física
  const [paisId, setPaisId] = useState('');
  const [provinciaId, setProvinciaId] = useState('');
  const [ciudadId, setCiudadId] = useState('');
  const [calle, setCalle] = useState('');
  const [numero, setNumero] = useState('');
  const [barrio, setBarrio] = useState('');
  const [piso, setPiso] = useState('');
  const [dpto, setDpto] = useState('');

  // Listas en cascada para Provincia y Ciudad
  const [provincias, setProvincias] = useState([]);
  const [ciudades, setCiudades] = useState([]);
  const [cargandoGeo, setCargandoGeo] = useState(false);

  // Estados de confirmación y envío
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-cierre de alerta de error a los 6 segundos
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  // Inicializar formulario al abrir el modal
  useEffect(() => {
    if (!isOpen) return;

    setConfirmando(false);
    setErrorMsg('');

    if (proveedor) {
      setNombre(proveedor.nombre_proveedor || proveedor.nombre || '');
      setCuit(proveedor.cuit_prov || proveedor.cuit || '');
      setCorreo(proveedor.correo || '');
      setTelefono(proveedor.telefono || '');
      setEstado(proveedor.estado !== false);
      setOfreceEnvio(proveedor.ofrece_envio !== false);
      setNivel(proveedor.nivel || 'Estándar');

      const dir = proveedor.direccion;
      if (dir) {
        setCalle(dir.nro_calle || dir.calle_numero || '');
        setNumero('');
        setBarrio(dir.nombre_barrio || dir.barrio || '');
        setPiso(dir.piso !== null && dir.piso !== undefined ? String(dir.piso) : '');
        setDpto(dir.nro_dpto || dir.dpto || '');

        const pId = dir.id_pais ? String(dir.id_pais) : '';
        const provId = dir.id_provincia ? String(dir.id_provincia) : '';
        const cId = dir.id_ciudad ? String(dir.id_ciudad) : '';

        setPaisId(pId);
        setProvinciaId(provId);
        setCiudadId(cId);
      } else {
        setCalle('');
        setNumero('');
        setBarrio('');
        setPiso('');
        setDpto('');
        setPaisId(paises[0]?.id_pais ? String(paises[0].id_pais) : '');
        setProvinciaId('');
        setCiudadId('');
      }
    } else {
      // Modo Registro Nuevo Proveedor
      setNombre(nombreSugerido || '');
      setCuit('');
      setCorreo('');
      setTelefono('');
      setEstado(true);
      setOfreceEnvio(true);
      setNivel('Estándar');
      setCalle('');
      setNumero('');
      setBarrio('');
      setPiso('');
      setDpto('');
      const defaultPais = paises[0]?.id_pais ? String(paises[0].id_pais) : '';
      setPaisId(defaultPais);
      setProvinciaId('');
      setCiudadId('');
    }
  }, [isOpen, proveedor, nombreSugerido, paises]);

  // Cargar provincias cuando cambia paisId
  useEffect(() => {
    if (!isOpen || !paisId || !token) {
      setProvincias([]);
      return;
    }

    let cancelado = false;
    const fetchProvincias = async () => {
      setCargandoGeo(true);
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/geo/paises/${paisId}/provincias/?todas=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelado && Array.isArray(res.data)) {
          setProvincias(res.data);
        }
      } catch {
        if (!cancelado) setProvincias([]);
      } finally {
        if (!cancelado) setCargandoGeo(false);
      }
    };
    fetchProvincias();
    return () => {
      cancelado = true;
    };
  }, [isOpen, paisId, token]);

  // Cargar ciudades cuando cambia provinciaId
  useEffect(() => {
    if (!isOpen || !provinciaId || !token) {
      setCiudades([]);
      return;
    }

    let cancelado = false;
    const fetchCiudades = async () => {
      setCargandoGeo(true);
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/geo/provincias/${provinciaId}/ciudades/?todas=true`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!cancelado && Array.isArray(res.data)) {
          setCiudades(res.data);
        }
      } catch {
        if (!cancelado) setCiudades([]);
      } finally {
        if (!cancelado) setCargandoGeo(false);
      }
    };
    fetchCiudades();
    return () => {
      cancelado = true;
    };
  }, [isOpen, provinciaId, token]);

  if (!isOpen) return null;

  // Validaciones en tiempo real (Doble Validación)
  const nombreLimpio = nombre.trim();
  const cuitLimpio = cuit.trim();
  const cuitSoloDigitos = cuitLimpio.replace(/[-\s]/g, '');
  const cuitSinLetras = /^\d+$/.test(cuitSoloDigitos);
  const cuitValido = cuitSinLetras && cuitSoloDigitos.length === 11;

  const correoLimpio = correo.trim().toLowerCase();
  const correoValido = REGEX_EMAIL.test(correoLimpio);

  const telLimpio = telefono.trim();
  const telDigitos = telLimpio.replace(/\D/g, '');
  const telValido = REGEX_TELEFONO.test(telLimpio) && telDigitos.length >= 7;

  const calleLimpia = calle.trim();
  const numeroLimpio = numero.trim();
  const direccionValida = Boolean(calleLimpia && ciudadId);

  const formularioValido =
    Boolean(nombreLimpio) &&
    cuitValido &&
    correoValido &&
    telValido &&
    direccionValida;

  const handlePaisChange = (e) => {
    setPaisId(e.target.value);
    setProvinciaId('');
    setCiudadId('');
  };

  const handleProvinciaChange = (e) => {
    setProvinciaId(e.target.value);
    setCiudadId('');
  };

  const handleRevisarDatos = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!nombreLimpio) {
      setErrorMsg('El nombre o razón social del proveedor es obligatorio.');
      return;
    }
    if (!cuitValido) {
      setErrorMsg('El CUIT es obligatorio y debe contener exactamente 11 dígitos numéricos sin letras.');
      return;
    }
    if (!correoValido) {
      setErrorMsg('Ingresa un correo electrónico de contacto con formato válido.');
      return;
    }
    if (!telValido) {
      setErrorMsg('Ingresa un número de teléfono válido (mínimo 7 dígitos numéricos).');
      return;
    }
    if (!ciudadId || !calleLimpia) {
      setErrorMsg('Completa la dirección física seleccionando País, Provincia, Ciudad y Calle.');
      return;
    }

    // Mostrar paso 5: Resumen y Confirmación final
    setConfirmando(true);
  };

  const handleConfirmarGuardado = async () => {
    setGuardando(true);
    setErrorMsg('');

    const payload = {
      nombre: nombreLimpio,
      cuit: cuitLimpio,
      correo: correoLimpio,
      telefono: telLimpio,
      ofrece_envio: Boolean(ofreceEnvio),
      nivel: nivel || 'Estándar',
      direccion: {
        calle: calleLimpia,
        numero: numeroLimpio,
        ciudad: Number(ciudadId),
        barrio: barrio.trim(),
        piso: piso.trim() !== '' ? parseInt(piso.trim(), 10) : null,
        dpto: dpto.trim()
      }
    };

    if (esEdicion) {
      payload.estado = Boolean(estado);
    }

    try {
      const headers = { Authorization: `Bearer ${token}` };
      let res;
      if (esEdicion) {
        const idProv = encodeURIComponent(proveedor.cuit_prov || proveedor.cuit);
        res = await axios.patch(
          `${API_BASE_URL}/api/purchases/proveedores/${idProv}/modificar/`,
          payload,
          { headers }
        );
      } else {
        res = await axios.post(
          `${API_BASE_URL}/api/purchases/proveedores/registrar/`,
          payload,
          { headers }
        );
      }

      if (onSaved) {
        onSaved(
          res.data?.mensaje ||
            (esEdicion
              ? 'Proveedor actualizado correctamente.'
              : 'Proveedor registrado exitosamente con estado Activo.')
        );
      }
      onClose();
    } catch (err) {
      setConfirmando(false);
      const data = err.response?.data;
      let msg = esEdicion
        ? 'No se pudieron guardar las modificaciones del proveedor.'
        : 'No se pudo completar el registro del proveedor.';

      if (data) {
        if (typeof data.error === 'string') {
          msg = data.error;
          if (msg.toLowerCase().includes('ya se encuentra registrado')) {
            msg = `${msg} Te sugerimos utilizar el buscador del padrón para localizarlo.`;
          }
        } else if (Array.isArray(data.error)) {
          msg = data.error.join(' ');
        } else if (typeof data.detail === 'string') {
          msg = data.detail;
        } else {
          const firstField = Object.keys(data)[0];
          if (firstField) {
            const val = data[firstField];
            msg = Array.isArray(val) ? val[0] : typeof val === 'string' ? val : JSON.stringify(val);
          }
        }
      }
      setErrorMsg(msg);
    } finally {
      setGuardando(false);
    }
  };

  const nombreCiudadSeleccionada =
    ciudades.find((c) => String(c.id_ciudad) === String(ciudadId))?.nombre_ciudad ||
    proveedor?.direccion?.ciudad ||
    '';
  const nombreProvinciaSeleccionada =
    provincias.find((p) => String(p.id_provincia) === String(provinciaId))?.nombre_provincia ||
    proveedor?.direccion?.provincia ||
    '';
  const nombrePaisSeleccionado =
    paises.find((p) => String(p.id_pais) === String(paisId))?.nombre_pais ||
    proveedor?.direccion?.pais ||
    '';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-3xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        >
          {/* Cabecera */}
          <div className="px-6 py-5 bg-slate-900/70 border-b border-slate-700/80 flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-1">
                {esEdicion ? 'Actualización de Ficha Comercial' : 'Empadronamiento de Abastecimiento'}
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                {esEdicion ? 'Modificar Proveedor' : 'Registrar Nuevo Proveedor'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {esEdicion
                  ? 'Edita los datos fiscales, de contacto, dirección física o estado operativo del proveedor.'
                  : 'Completa los datos fiscales, de contacto y domicilio físico para empadronar al proveedor.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Cuerpo del Formulario */}
          <form onSubmit={handleRevisarDatos} className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Alerta de Error suave */}
            <AnimatePresence>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs sm:text-sm flex items-start justify-between gap-3"
                >
                  <span>{errorMsg}</span>
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

            {/* Sección 1: Identificación Fiscal y Contacto */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase font-mono text-cyan-400 tracking-wider">
                  1. Datos Fiscales y de Contacto
                </h3>
                {esEdicion && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Estado Operativo:</span>
                    <button
                      type="button"
                      onClick={() => setEstado((prev) => !prev)}
                      className={`px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                        estado
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {estado ? '● Activo' : '○ Inactivo'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nombre / Razón Social <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder="Ej: Distribuidora Mayorista Tech S.A."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    CUIT (11 dígitos) <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={cuit}
                    onChange={(e) => setCuit(e.target.value)}
                    placeholder="Ej: 30-71234567-9 o 30712345679"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 font-mono focus:outline-none transition-colors ${
                      cuit && !cuitValido
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : 'border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  {cuit && !cuitValido && (
                    <p className="text-[11px] text-rose-400 mt-1">
                      Debe contener exactamente 11 dígitos numéricos (sin letras).
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Correo Electrónico <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="ventas@proveedor.com.ar"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      correo && !correoValido
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : 'border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  {correo && !correoValido && (
                    <p className="text-[11px] text-rose-400 mt-1">
                      Ingresa un formato de correo electrónico válido.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Teléfono de Contacto <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="Ej: +54 11 4455-6677"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                      telefono && !telValido
                        ? 'border-rose-500/60 focus:border-rose-400'
                        : 'border-slate-700 focus:border-cyan-400'
                    }`}
                  />
                  {telefono && !telValido && (
                    <p className="text-[11px] text-rose-400 mt-1">
                      Ingresa un teléfono válido (mínimo 7 dígitos numéricos, sin letras).
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Sección 2: Dirección Física del Depósito / Sede */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase font-mono text-violet-400 tracking-wider">
                  2. Dirección Física (Depósito / Casa Central)
                </h3>
                {cargandoGeo && (
                  <span className="text-[11px] text-cyan-400 animate-pulse">
                    Actualizando catálogo geográfico...
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    País <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={paisId}
                    onChange={handlePaisChange}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                  >
                    <option value="">Seleccionar país...</option>
                    {paises.map((p) => (
                      <option key={p.id_pais} value={String(p.id_pais)}>
                        {p.nombre_pais}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Provincia <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={provinciaId}
                    onChange={handleProvinciaChange}
                    disabled={!paisId}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">
                      {paisId ? 'Seleccionar provincia...' : 'Elija un país'}
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
                    Ciudad <span className="text-cyan-400">*</span>
                  </label>
                  <select
                    value={ciudadId}
                    onChange={(e) => setCiudadId(e.target.value)}
                    disabled={!provinciaId}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors disabled:opacity-50"
                  >
                    <option value="">
                      {provinciaId ? 'Seleccionar ciudad...' : 'Elija una provincia'}
                    </option>
                    {ciudades.map((c) => (
                      <option key={c.id_ciudad} value={String(c.id_ciudad)}>
                        {c.nombre_ciudad}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-6">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Calle / Avenida <span className="text-cyan-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={calle}
                    onChange={(e) => setCalle(e.target.value)}
                    placeholder="Ej: Av. Corrientes"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Altura / Número
                  </label>
                  <input
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="Ej: 1234"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Barrio
                  </label>
                  <input
                    type="text"
                    value={barrio}
                    onChange={(e) => setBarrio(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Sección 3: Parámetros Operativos y Logísticos */}
            <div className="space-y-4">
              <div className="border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold uppercase font-mono text-slate-400 tracking-wider">
                  3. Parámetros Operativos y Logísticos
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Nivel Comercial
                  </label>
                  <select
                    value={nivel}
                    onChange={(e) => setNivel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                  >
                    <option value="Estándar">Estándar</option>
                    <option value="Distribuidor">Distribuidor Oficial / Importador Directo</option>
                    <option value="Mayorista">Mayorista Multimarca</option>
                    <option value="Minorista">Minorista / Revendedor Local</option>
                    <option value="Oficial">Oficial / Fabricante</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2.5 cursor-pointer select-none px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 transition-colors">
                    <input
                      type="checkbox"
                      checked={ofreceEnvio}
                      onChange={(e) => setOfreceEnvio(e.target.checked)}
                      className="w-4 h-4 accent-cyan-500 rounded"
                    />
                    <span className="text-xs sm:text-sm font-semibold text-slate-200">
                      Realiza envíos a domicilio
                    </span>
                  </label>
                </div>
              </div>

              <div className="px-3.5 py-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
                <span className="text-cyan-400 font-bold">ℹ</span>
                <span>
                  Los indicadores de <strong className="text-slate-300">Confiabilidad</strong> (por defecto <strong className="text-cyan-300">60%</strong> hasta concretar al menos 5 órdenes de compra) y <strong className="text-slate-300">Entrega Promedio</strong> se calculan automáticamente según el cumplimiento de las entregas del proveedor.
                </span>
              </div>
            </div>

            {/* Paso 5 y 6: Resumen de datos capturados y Confirmación final */}
            <AnimatePresence>
              {confirmando && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/40 space-y-3"
                >
                  <div className="space-y-1.5">
                    <p className="text-sm font-bold text-cyan-300">
                      {esEdicion
                        ? 'Confirmar modificación de datos del proveedor'
                        : 'Resumen de empadronamiento del nuevo proveedor'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-200 bg-slate-900/70 p-3 rounded-lg border border-slate-800">
                      <p>
                        <span className="text-slate-400">Razón Social:</span>{' '}
                        <strong className="text-white">{nombreLimpio}</strong>
                      </p>
                      <p>
                        <span className="text-slate-400">CUIT:</span>{' '}
                        <strong className="font-mono text-cyan-300">{cuitLimpio}</strong>
                      </p>
                      <p>
                        <span className="text-slate-400">Correo:</span>{' '}
                        <strong className="text-white">{correoLimpio}</strong>
                      </p>
                      <p>
                        <span className="text-slate-400">Teléfono:</span>{' '}
                        <strong className="text-white">{telLimpio}</strong>
                      </p>
                      <p className="sm:col-span-2">
                        <span className="text-slate-400">Dirección Física:</span>{' '}
                        <strong className="text-white">
                          {[calleLimpia, numeroLimpio].filter(Boolean).join(' ')}
                          {nombreCiudadSeleccionada ? `, ${nombreCiudadSeleccionada}` : ''}
                          {nombreProvinciaSeleccionada ? `, ${nombreProvinciaSeleccionada}` : ''}
                          {nombrePaisSeleccionado ? ` (${nombrePaisSeleccionado})` : ''}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-400">Estado:</span>{' '}
                        <strong className={estado ? 'text-emerald-400' : 'text-rose-400'}>
                          {estado ? 'Activo' : 'Inactivo'}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-400">Nivel / Envío:</span>{' '}
                        <strong className="text-white">
                          {nivel} • {ofreceEnvio ? 'Con envío' : 'Solo retiro'}
                        </strong>
                      </p>
                    </div>
                    {esEdicion && !estado && (
                      <p className="text-xs text-amber-300 font-medium">
                        ⚠️ Al marcar el proveedor como Inactivo, quedará oculto para futuras órdenes de compra preservando su historial contable.
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmando(false)}
                      disabled={guardando}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Volver a editar
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmarGuardado}
                      disabled={guardando}
                      className="px-5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {guardando
                        ? 'Procesando...'
                        : esEdicion
                        ? 'Confirmar y Actualizar'
                        : 'Confirmar y Registrar'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pie del Modal */}
            {!confirmando && (
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={guardando}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!formularioValido || guardando}
                  className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {esEdicion ? 'Guardar Modificaciones' : 'Registrar Proveedor'}
                </button>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

