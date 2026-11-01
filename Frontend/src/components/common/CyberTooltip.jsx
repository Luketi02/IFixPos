import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CyberTooltip:
 * Icono de información con estética Cyber-Tech Dark Mode para el Administrador de IFixPos.
 *
 * - Comportamiento: Si el usuario mantiene el mouse posicionado durante 3 segundos (configurable),
 *   se despliega una cápsula flotante con la explicación extendida de la opción.
 * - Soporte de clic instantáneo: Si el usuario hace clic en el icono, abre/cierra la información de inmediato.
 * - Auto-cierre al retirar el cursor (onMouseLeave) con limpieza de temporizadores.
 */
export default function CyberTooltip({
  text,
  title = 'Información del Sistema',
  delay = 3000,
  position = 'top',
  className = ''
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  // Iniciar cuenta regresiva al entrar el cursor
  const handleMouseEnter = () => {
    setIsHovering(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  // Cancelar y ocultar al salir el cursor
  const handleMouseLeave = () => {
    setIsHovering(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsVisible(false);
  };

  // Clic directo para abrir o cerrar sin esperar los 3 segundos
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible((prev) => !prev);
  };

  // Limpiar temporizador al desmontar
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Cerrar al presionar Escape o clic fuera
  useEffect(() => {
    if (!isVisible) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsVisible(false);
    };
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsVisible(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // Coordenadas y orientación según 'position'
  const getPositionClasses = () => {
    switch (position) {
      case 'bottom':
        return 'top-full mt-2 left-1/2 -translate-x-1/2';
      case 'left':
        return 'right-full mr-2 top-1/2 -translate-y-1/2';
      case 'right':
        return 'left-full ml-2 top-1/2 -translate-y-1/2';
      case 'top':
      default:
        return 'bottom-full mb-2 left-1/2 -translate-x-1/2';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center justify-center ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Botón / Icono de Información interactivo */}
      <button
        type="button"
        onClick={handleClick}
        className="relative group p-1 rounded-full text-slate-400 hover:text-cyan-400 focus:outline-none focus:text-cyan-300 transition-colors cursor-help"
        aria-label="Más información"
        title="Mantén el cursor 3s o haz clic para ver detalles"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        {/* Indicador sutil de progreso si el cursor se mantiene encima */}
        {isHovering && !isVisible && (
          <span
            className="absolute inset-0 rounded-full border border-cyan-400/60 animate-ping pointer-events-none"
            style={{ animationDuration: '3s' }}
          />
        )}
      </button>

      {/* Cápsula Flotante con Información Detallada */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: position === 'top' ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: position === 'top' ? 6 : -6 }}
            transition={{ duration: 0.2 }}
            className={`absolute z-50 w-72 sm:w-80 p-3.5 bg-slate-950/95 backdrop-blur-xl border border-cyan-500/40 rounded-xl shadow-[0_10px_35px_rgba(0,0,0,0.7)] text-left pointer-events-auto ${getPositionClasses()}`}
          >
            {/* Cabecera del Tooltip */}
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
              <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-[11px] font-mono">
                <svg className="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{title}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsVisible(false)}
                className="text-slate-500 hover:text-slate-300 text-xs px-1 leading-none font-mono"
              >
                ✕
              </button>
            </div>

            {/* Contenido / Explicación del Parámetro */}
            <div className="text-[11px] text-slate-300 leading-relaxed font-sans space-y-1">
              {typeof text === 'string' ? <p>{text}</p> : text}
            </div>

            {/* Pie sutil */}
            <div className="mt-2.5 pt-1.5 border-t border-slate-900 flex items-center justify-between text-[9px] text-slate-500 font-mono">
              <span>Configuración Global</span>
              <span>Esc para cerrar</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export { CyberTooltip };

