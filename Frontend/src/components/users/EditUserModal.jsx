import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const REGEX_NOMBRE = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/;
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^\+?\d{9,15}$/;

export default function EditUserModal({ isOpen, onClose, usuario, roles = [], onSaved }) {
  const { token } = useAuth();
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [telefonoAlt, setTelefonoAlt] = useState('');
  const [rolCodigo, setRolCodigo] = useState('');
  const [rolId, setRolId] = useState('');
  const [forzarContrasena, setForzarContrasena] = useState('');
  const [mostrarContrasena, setMostrarContrasena] = useState(false);

  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen && usuario) {
      setNombre(usuario.perfil?.nombre || '');
      setApellido(usuario.perfil?.apellido || '');
      setEmail(usuario.email || '');
      setTelefono(usuario.perfil?.telefono || '');
      setTelefonoAlt(usuario.perfil?.telefono_alt || '');

      const currentRolId = usuario.rol?.id_rol || '';
      const currentRolCodigo = usuario.rol?.codigo || usuario.rol?.nombre_rol || '';
      setRolId(currentRolId ? String(currentRolId) : '');
      setRolCodigo(currentRolCodigo);

      setForzarContrasena('');
      setMostrarContrasena(false);
      setConfirmando(false);
      setErrorMsg('');
    }
  }, [isOpen, usuario]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  if (!isOpen || !usuario) return null;

  // Validaciones visuales en tiempo real (Doble Validación)
  const nombreLimpio = nombre.trim();
  const apellidoLimpio = apellido.trim();
  const emailLimpio = email.trim();
  const telLimpio = telefono.trim().replace(/\s+/g, '');
  const telAltLimpio = telefonoAlt.trim().replace(/\s+/g, '');
  const passLimpia = forzarContrasena.trim();

  const nombreValido = nombreLimpio.length >= 2 && REGEX_NOMBRE.test(nombreLimpio);
  const apellidoValido = apellidoLimpio.length >= 2 && REGEX_NOMBRE.test(apellidoLimpio);
  const emailValido = REGEX_EMAIL.test(emailLimpio);
  const telValido = !telLimpio || REGEX_TELEFONO.test(telLimpio);
  const telAltValido = !telAltLimpio || REGEX_TELEFONO.test(telAltLimpio);

  // Validación de contraseña forzada: mín. 6 caracteres, 1 mayúscula y mín. 2 números
  const tieneLongitudMinima = passLimpia.length >= 6;
  const tieneMayuscula = /[A-ZÁÉÍÓÚÑÜ]/.test(passLimpia);
  const tieneMinimoDosNumeros = (passLimpia.match(/\d/g) || []).length >= 2;
  const passValida =
    !passLimpia || (tieneLongitudMinima && tieneMayuscula && tieneMinimoDosNumeros);

  const rolValido = Boolean(rolId || rolCodigo);

  const formularioValido =
    nombreValido &&
    apellidoValido &&
    emailValido &&
    telValido &&
    telAltValido &&
    passValida &&
    rolValido;

  const handleRoleChange = (e) => {
    const val = e.target.value;
    setRolId(val);
    const encontrado = roles.find((r) => String(r.id_rol) === String(val));
    if (encontrado) {
      setRolCodigo(encontrado.codigo || encontrado.nombre_rol);
    }
  };

  const handleIntentarGuardar = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!nombreValido) {
      setErrorMsg('El nombre es obligatorio y solo debe contener letras y espacios.');
      return;
    }
    if (!apellidoValido) {
      setErrorMsg('El apellido es obligatorio y solo debe contener letras y espacios.');
      return;
    }
    if (!emailValido) {
      setErrorMsg('Ingresa un correo electrónico con formato válido.');
      return;
    }
    if (!telValido) {
      setErrorMsg('El teléfono principal debe contener entre 9 y 15 dígitos numéricos (opcional + al inicio).');
      return;
    }
    if (!telAltValido) {
      setErrorMsg('El teléfono alternativo debe contener entre 9 y 15 dígitos numéricos (opcional + al inicio).');
      return;
    }
    if (!passValida) {
      setErrorMsg(
        'Si deseas forzar una nueva contraseña, debe tener al menos 6 caracteres, 1 letra mayúscula y mínimamente 2 números.'
      );
      return;
    }
    if (!rolValido) {
      setErrorMsg('Debes seleccionar un rol de sistema válido para el usuario.');
      return;
    }

    // Solicitar confirmación antes de aplicar los cambios administrativos
    setConfirmando(true);
  };

  const handleConfirmarGuardado = async () => {
    setGuardando(true);
    setErrorMsg('');

    try {
      const payload = {
        nombre: nombreLimpio,
        apellido: apellidoLimpio,
        email: emailLimpio,
        telefono: telLimpio,
        telefono_alt: telAltLimpio
      };

      if (rolId) {
        payload.rol_id = Number(rolId);
      }
      if (rolCodigo) {
        payload.rol_codigo = rolCodigo;
      }
      if (passLimpia) {
        payload.forzar_contrasena = passLimpia;
      }

      const res = await axios.put(
        `${API_BASE_URL}/api/users/${usuario.id_usuario}/admin-edit/`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (onSaved) {
        onSaved(res.data?.mensaje || 'Datos del usuario actualizados correctamente.');
      }
      onClose();
    } catch (err) {
      setConfirmando(false);
      const data = err.response?.data;
      let msg = 'No se pudieron guardar los cambios del usuario. Verifique los datos ingresados.';
      if (data) {
        if (typeof data.detail === 'string') msg = data.detail;
        else if (Array.isArray(data.detail)) msg = data.detail.join(' ');
        else if (data.error) msg = data.error;
        else if (data.email) msg = Array.isArray(data.email) ? data.email[0] : data.email;
        else if (data.nombre) msg = Array.isArray(data.nombre) ? data.nombre[0] : data.nombre;
        else if (data.apellido) msg = Array.isArray(data.apellido) ? data.apellido[0] : data.apellido;
        else if (data.telefono) msg = Array.isArray(data.telefono) ? data.telefono[0] : data.telefono;
        else if (data.telefono_alt) msg = Array.isArray(data.telefono_alt) ? data.telefono_alt[0] : data.telefono_alt;
        else if (data.rol) msg = Array.isArray(data.rol) ? data.rol[0] : data.rol;
      }
      setErrorMsg(msg);
    } finally {
      setGuardando(false);
    }
  };

  const rolSeleccionadoObj = roles.find((r) => String(r.id_rol) === String(rolId));
  const nombreRolMostrar = rolSeleccionadoObj?.nombre_rol || rolCodigo || usuario.rol?.nombre_rol || 'Sin rol';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2 }}
          className="w-full max-w-2xl bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Cabecera del Modal */}
          <div className="px-6 py-5 bg-slate-900/70 border-b border-slate-700/80 flex items-center justify-between">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 mb-1">
                Gestión de Cuentas
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Modificar Usuario
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Actualiza los datos personales, contacto, rol asignado o credenciales de acceso.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={guardando}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          {/* Cuerpo del Formulario */}
          <form onSubmit={handleIntentarGuardar} className="p-6 overflow-y-auto space-y-5 flex-1">
            {/* Alerta de Error suave (desaparece a los 6s) */}
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

            {/* Resumen de Identidad (DNI sólo lectura informativa) */}
            <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-400">Documento de Identidad (DNI)</p>
                <p className="text-sm font-semibold text-slate-200">
                  {usuario.perfil?.dni || 'No registrado'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Estado de la Cuenta</p>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    usuario.is_active !== false
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      usuario.is_active !== false ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  {usuario.is_active !== false ? 'Activo' : 'Inactivo / Bloqueado'}
                </span>
              </div>
            </div>

            {/* Datos Personales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nombre <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Carlos Alberto"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    nombre && !nombreValido
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
                {nombre && !nombreValido && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Solo se permiten letras y espacios (mín. 2 caracteres).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Apellido <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={apellido}
                  onChange={(e) => setApellido(e.target.value)}
                  placeholder="Ej: Gómez Pérez"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    apellido && !apellidoValido
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
                {apellido && !apellidoValido && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Solo se permiten letras y espacios (mín. 2 caracteres).
                  </p>
                )}
              </div>
            </div>

            {/* Correo Electrónico y Rol de Sistema */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Correo Electrónico <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    email && !emailValido
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
                {email && !emailValido && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Formato de correo electrónico inválido.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Rol de Sistema <span className="text-cyan-400">*</span>
                </label>
                <select
                  value={rolId}
                  onChange={handleRoleChange}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white focus:outline-none transition-colors"
                >
                  <option value="" disabled>
                    Seleccionar rol...
                  </option>
                  {roles.map((r) => (
                    <option key={r.id_rol} value={String(r.id_rol)}>
                      {r.nombre_rol}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Teléfonos de Contacto */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Teléfono Principal
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Ej: +5491122334455"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    telefono && !telValido
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
                {telefono && !telValido && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Debe tener entre 9 y 15 dígitos numéricos (opcional +).
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Teléfono Alternativo <span className="text-slate-500 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={telefonoAlt}
                  onChange={(e) => setTelefonoAlt(e.target.value)}
                  placeholder="Ej: +5491199887766"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    telefonoAlt && !telAltValido
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-cyan-400'
                  }`}
                />
                {telefonoAlt && !telAltValido && (
                  <p className="text-[11px] text-rose-400 mt-1">
                    Debe tener entre 9 y 15 dígitos numéricos (opcional +).
                  </p>
                )}
              </div>
            </div>

            {/* Campo Especial: Forzar Nueva Contraseña */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-violet-500/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-violet-300">
                  Forzar Nueva Contraseña <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <span className="text-[11px] text-violet-400/90 bg-violet-500/10 px-2 py-0.5 rounded-md border border-violet-500/20">
                  Acción Administrativa Directa
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Si completas este campo, se sobrescribirá la contraseña actual del usuario de manera inmediata sin requerir validación por token. Déjalo vacío para mantener su clave actual.
              </p>
              <div className="relative">
                <input
                  type={mostrarContrasena ? 'text' : 'password'}
                  value={forzarContrasena}
                  onChange={(e) => setForzarContrasena(e.target.value)}
                  placeholder="Dejar en blanco para no modificar la contraseña..."
                  autoComplete="new-password"
                  className={`w-full px-3.5 py-2.5 pr-20 rounded-xl bg-[#0F172A] border text-sm text-white placeholder-slate-500 focus:outline-none transition-colors ${
                    forzarContrasena && !passValida
                      ? 'border-rose-500/60 focus:border-rose-400'
                      : 'border-slate-700 focus:border-violet-400'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setMostrarContrasena((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-cyan-400 transition-colors"
                >
                  {mostrarContrasena ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              {forzarContrasena && (
                <div className="pt-1 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-300">
                    Requisitos de seguridad de la contraseña:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                        tieneLongitudMinima
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span>{tieneLongitudMinima ? '✓' : '•'}</span>
                      Mínimo 6 caracteres
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                        tieneMayuscula
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span>{tieneMayuscula ? '✓' : '•'}</span>
                      Al menos 1 mayúscula
                    </span>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors ${
                        tieneMinimoDosNumeros
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-medium'
                          : 'bg-slate-800/80 text-slate-400 border-slate-700'
                      }`}
                    >
                      <span>{tieneMinimoDosNumeros ? '✓' : '•'}</span>
                      Mínimo 2 números
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Bloque de Confirmación (Paso 5 y 6 del flujo) */}
            <AnimatePresence>
              {confirmando && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-amber-400 text-lg leading-none mt-0.5">⚠️</span>
                    <div className="text-xs text-slate-200 space-y-1">
                      <p className="font-bold text-amber-300 text-sm">
                        Confirmar modificación administrativa
                      </p>
                      <p>
                        ¿Estás seguro de que deseas aplicar estos cambios a la cuenta de{' '}
                        <strong className="text-white">
                          {nombreLimpio} {apellidoLimpio}
                        </strong>{' '}
                        con el rol <strong className="text-cyan-300">{nombreRolMostrar}</strong>?
                      </p>
                      {passLimpia && (
                        <p className="text-violet-300 font-semibold">
                          • Se forzará el cambio inmediato de su contraseña de acceso.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setConfirmando(false)}
                      disabled={guardando}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
                    >
                      Revisar datos
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmarGuardado}
                      disabled={guardando}
                      className="px-5 py-2 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {guardando ? 'Aplicando cambios...' : 'Sí, confirmar y guardar'}
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
                  Guardar Cambios
                </button>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
