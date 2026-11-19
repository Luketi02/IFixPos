import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import axios from 'axios';
import useAuth from '../../context/useAuth';
import { API_BASE_URL } from '../../config/api';
import { extraerMensajeError, useMensajeTemporal } from '../../utils/errores';
import { useAccesibilidadModal } from '../../hooks/useAccesibilidadModal';

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

export default function RegistrarUsuarioModal({ isOpen, onClose, roles = [], onCreated }) {
  const { token } = useAuth();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [telefonoAlt, setTelefonoAlt] = useState('');
  const [contrasena, setContrasena] = useState(() => generarClaveTemporal());
  const [mostrarContrasena, setMostrarContrasena] = useState(true);
  const [idRolSeleccionado, setIdRolSeleccionado] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [errorMessage, setErrorMessage] = useMensajeTemporal('', 6000);
  const { contenedorRef } = useAccesibilidadModal(isOpen, onClose, submitting);

  useEffect(() => {
    if (!isOpen) return;
    setNombre('');
    setApellido('');
    setDni('');
    setEmail('');
    setTelefono('');
    setTelefonoAlt('');
    setContrasena(generarClaveTemporal());
    setMostrarContrasena(true);
    setErrorMessage('');

    if (Array.isArray(roles) && roles.length > 0) {
      const rolCliente = roles.find(
        (r) =>
          String(r.codigo || '').toUpperCase() === 'CLIENTE' ||
          String(r.nombre_rol || '').toLowerCase() === 'cliente'
      );
      setIdRolSeleccionado(String((rolCliente || roles[0]).id_rol));
    } else {
      setIdRolSeleccionado('');
    }
  }, [isOpen, roles, setErrorMessage]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const nom = nombre.trim();
    const ape = apellido.trim();
    const dniLimpio = dni.trim().replace(/\./g, '').replace(/\s+/g, '');
    const em = email.trim();
    const tel = telefono.trim().replace(/\s+/g, '');
    const telAlt = telefonoAlt.trim().replace(/\s+/g, '');

    if (nom.length < 2 || !REGEX_NOMBRE.test(nom)) {
      setErrorMessage('Ingresa un nombre válido (solo letras, mínimo 2 caracteres).');
      return;
    }
    if (ape.length < 2 || !REGEX_NOMBRE.test(ape)) {
      setErrorMessage('Ingresa un apellido válido (solo letras, mínimo 2 caracteres).');
      return;
    }
    if (dniLimpio && !REGEX_DNI.test(dniLimpio)) {
      setErrorMessage('El DNI debe contener entre 7 y 10 dígitos numéricos.');
      return;
    }
    if (!REGEX_EMAIL.test(em)) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }
    if (!REGEX_TELEFONO.test(tel)) {
      setErrorMessage('El teléfono debe contener entre 9 y 15 dígitos numéricos.');
      return;
    }
    if (telAlt && !REGEX_TELEFONO.test(telAlt)) {
      setErrorMessage('El teléfono alternativo debe contener entre 9 y 15 dígitos.');
      return;
    }
    if (!contrasena || contrasena.length < 6) {
      setErrorMessage('La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }
    if (!idRolSeleccionado) {
      setErrorMessage('Selecciona el rol que tendrá el usuario.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        nombre: nom,
        apellido: ape,
        dni: dniLimpio || null,
        email: em,
        telefono: tel,
        telefono_alt: telAlt || null,
        contrasena,
        id_rol_asignado: Number(idRolSeleccionado)
      };

      const res = await axios.post(`${API_BASE_URL}/api/users/registro/interno/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const rolObj = roles.find((r) => String(r.id_rol) === String(idRolSeleccionado));
      if (typeof onCreated === 'function') {
        onCreated(
          `Usuario ${nom} ${ape} (${rolObj?.nombre_rol || 'Rol asignado'}) registrado exitosamente. Credenciales enviadas a ${em}.`,
          res.data
        );
      }
      onClose();
    } catch (err) {
      setErrorMessage(
        extraerMensajeError(
          err,
          'No fue posible registrar el usuario. Verifica que el correo o DNI no existan en el sistema.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 overflow-y-auto font-['Lexend',sans-serif]">
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-registrar-usuario"
        tabIndex={-1}
        className="w-full max-w-xl bg-[#1E293B] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden my-auto focus:outline-none"
      >
        {/* Cabecera */}
        <div className="px-6 py-4 bg-[#0F172A]/90 border-b border-slate-800 flex items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-cyan-400">
              Alta Administrativa de Cuenta
            </span>
            <h2 id="titulo-registrar-usuario" className="text-lg font-black text-white">
              Registrar Nuevo Usuario
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
            title="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-center justify-between gap-3"
            >
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="text-rose-300 hover:text-white cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nombre <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej. María"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Apellido <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                placeholder="Ej. González"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Documento (DNI)
              </label>
              <input
                type="text"
                value={dni}
                onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej. 38456123"
                maxLength={10}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Rol de Usuario <span className="text-cyan-400">*</span>
              </label>
              <select
                value={idRolSeleccionado}
                onChange={(e) => setIdRolSeleccionado(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-cyan-500/40 focus:border-cyan-400 text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value="">Selecciona un rol...</option>
                {roles.map((r) => (
                  <option key={r.id_rol} value={String(r.id_rol)}>
                    {r.nombre_rol}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Correo Electrónico <span className="text-cyan-400">*</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ej. usuario@correo.com"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Teléfono Principal <span className="text-cyan-400">*</span>
              </label>
              <input
                type="text"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej. +5491122334455"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Teléfono Alternativo (Opcional)
              </label>
              <input
                type="text"
                value={telefonoAlt}
                onChange={(e) => setTelefonoAlt(e.target.value)}
                placeholder="Ej. 1144556677"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white placeholder-slate-500 focus:outline-none font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Contraseña Temporal <span className="text-cyan-400">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setContrasena(generarClaveTemporal())}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Generar otra clave
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type={mostrarContrasena ? 'text' : 'password'}
                  value={contrasena}
                  onChange={(e) => setContrasena(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 focus:border-cyan-400 text-sm text-white font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMostrarContrasena((prev) => !prev)}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer shrink-0"
                >
                  {mostrarContrasena ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Se enviará un correo electrónico al usuario con sus credenciales de ingreso.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 text-xs font-bold shadow-lg shadow-cyan-500/25 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
            >
              {submitting ? 'Registrando Usuario...' : '+ Registrar Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

RegistrarUsuarioModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  roles: PropTypes.array,
  onCreated: PropTypes.func
};
