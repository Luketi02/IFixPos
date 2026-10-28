import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import useAuth from '../../context/useAuth';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Modal Cyber-Tech para Calificar el Servicio Técnico (CU-19).
 * Permite al cliente otorgar una valoración obligatoria de 1 a 5 estrellas
 * y un comentario cualitativo opcional de hasta 1000 caracteres.
 */
export default function CalificarServicioModal({
  isOpen,
  onClose,
  reparacion,
  onSuccess
}) {
  const { token } = useAuth();

  const [puntuacion, setPuntuacion] = useState(0);
  const [hoverPuntuacion, setHoverPuntuacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorLocal, setErrorLocal] = useState('');

  // Reseteo de estados al abrir/cerrar modal
  useEffect(() => {
    if (isOpen) {
      setPuntuacion(0);
      setHoverPuntuacion(0);
      setComentario('');
      setErrorLocal('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Auto-cierre de alertas tras 6 segundos (Regla de UX)
  useEffect(() => {
    if (!errorLocal) return undefined;
    const timer = setTimeout(() => setErrorLocal(''), 6000);
    return () => clearTimeout(timer);
  }, [errorLocal]);

  if (!isOpen || !reparacion) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorLocal('');

    // Validación visual previa en React (Doble Validación)
    if (!puntuacion || puntuacion < 1 || puntuacion > 5) {
      setErrorLocal('Por favor selecciona una puntuación de 1 a 5 estrellas.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/workshop/reparaciones/${reparacion.id_reparacion}/calificar/`,
        {
          puntuacion: Number(puntuacion),
          comentario: comentario.trim() || null
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (onSuccess) {
        onSuccess(res.data?.calificacion || res.data);
      }
      onClose();
    } catch (err) {
      console.error('Error al calificar servicio técnico:', err);
      const data = err.response?.data;
      const msg =
        data?.error ||
        data?.detail ||
        (Array.isArray(data?.puntuacion) ? data.puntuacion.join(' ') : null) ||
        (Array.isArray(data?.comentario) ? data.comentario.join(' ') : null) ||
        'No fue posible registrar la calificación. Por favor intenta nuevamente.';
      setErrorLocal(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getEtiquetaPuntuacion = (rating) => {
    switch (rating) {
      case 1:
        return 'Deficiente';
      case 2:
        return 'Regular';
      case 3:
        return 'Bueno';
      case 4:
        return 'Muy Bueno';
      case 5:
        return 'Excelente';
      default:
        return 'Selecciona tu puntuación';
    }
  };

  const calificacionActual = hoverPuntuacion || puntuacion;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25 }}
          className="relative w-full max-w-lg bg-[#1E293B] border border-cyan-500/40 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden my-8"
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-700/80 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-lg">
                ⭐
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">
                  Calificar Servicio Técnico
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {reparacion.dispositivo?.marca} {reparacion.dispositivo?.modelo}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Alerta de Error */}
            <AnimatePresence>
              {errorLocal && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg shadow-rose-950/20"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold">!</span>
                    <span>{errorLocal}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setErrorLocal('')}
                    className="text-rose-400 hover:text-rose-200 text-xs font-mono ml-2"
                  >
                    ✕
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mensaje de orientación */}
            <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-cyan-200 text-xs leading-relaxed">
              <span className="font-bold text-cyan-300 block mb-1">
                ¡Tu opinión es muy importante para nosotros!
              </span>
              Cuéntanos cómo fue tu experiencia con la reparación de tu equipo. Las valoraciones son definitivas y ayudan a evaluar el desempeño técnico.
            </div>

            {/* Selector de Estrellas */}
            <div className="text-center space-y-2">
              <label className="block text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                Puntuación General <span className="text-cyan-400">*</span>
              </label>

              <div className="flex items-center justify-center gap-2 py-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setPuntuacion(star)}
                    onMouseEnter={() => setHoverPuntuacion(star)}
                    onMouseLeave={() => setHoverPuntuacion(0)}
                    disabled={isSubmitting}
                    className="p-1 text-3xl sm:text-4xl transition-transform hover:scale-125 focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                    title={`${star} Estrella${star > 1 ? 's' : ''}`}
                  >
                    <span
                      className={`transition-colors duration-150 ${
                        star <= calificacionActual
                          ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                          : 'text-slate-600 hover:text-slate-500'
                      }`}
                    >
                      ★
                    </span>
                  </button>
                ))}
              </div>

              <span className="inline-block px-3 py-1 rounded-full text-xs font-mono font-semibold bg-slate-900 border border-slate-700 text-amber-300">
                {getEtiquetaPuntuacion(calificacionActual)}
              </span>
            </div>

            {/* Campo Comentario Opcional */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-mono text-slate-300 uppercase tracking-wider">
                  Comentario u Opinión (Opcional)
                </label>
                <span className="text-[11px] font-mono text-slate-400">
                  {comentario.length} / 1000
                </span>
              </div>
              <textarea
                rows={4}
                maxLength={1000}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                disabled={isSubmitting}
                placeholder="Escribe tu testimonio sobre la calidad del servicio, rapidez y trato recibido..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
              />
            </div>

            {/* Botones de Acción */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-700/80">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl text-xs font-mono text-slate-400 hover:text-white border border-slate-700 hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !puntuacion}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-400 hover:from-cyan-400 hover:to-cyan-300 text-slate-950 font-black text-xs font-mono tracking-wider uppercase transition-all shadow-[0_0_20px_rgba(6,182,212,0.4)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v2m0 12v2m8-8h-2M6 12H4m15.364 6.364l-1.414-1.414M7.05 7.05L5.636 5.636m12.728 0l-1.414 1.414M7.05 16.95l-1.414 1.414" />
                    </svg>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <>
                    <span>Finalizar Calificación</span>
                    <span>✓</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

CalificarServicioModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  reparacion: PropTypes.object,
  onSuccess: PropTypes.func
};

