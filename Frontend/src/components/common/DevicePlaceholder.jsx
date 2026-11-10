import PropTypes from 'prop-types';

/**
 * Placeholder visual y minimalista Cyber-Tech para dispositivos sin fotografía.
 * Detecta el tipo de equipo (smartphone, tablet, notebook, smartwatch, consola)
 * y renderiza un vector SVG estilizado con acentos cian y violeta neón.
 */
export default function DevicePlaceholder({ tipo = '', className = 'w-16 h-16' }) {
  const tipoNormalizado = String(tipo || '').toLowerCase();

  if (
    tipoNormalizado.includes('smart') ||
    tipoNormalizado.includes('cel') ||
    tipoNormalizado.includes('tel') ||
    tipoNormalizado.includes('phone') ||
    tipoNormalizado.includes('móvil') ||
    tipoNormalizado.includes('movil')
  ) {
    // Smartphone elegante
    return (
      <svg
        className={className}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="12"
          y="4"
          width="24"
          height="40"
          rx="5"
          className="stroke-cyan-500/40 fill-slate-900/80"
          strokeWidth="2"
        />
        {/* Pantalla interior */}
        <rect
          x="15"
          y="9"
          width="18"
          height="28"
          rx="2"
          className="stroke-cyan-400/20 fill-slate-950/90"
          strokeWidth="1.2"
        />
        {/* Altavoz superior */}
        <line
          x1="21"
          y1="6.5"
          x2="27"
          y2="6.5"
          className="stroke-cyan-400/60"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Botón / Barra de navegación inferior */}
        <line
          x1="20"
          y1="40"
          x2="28"
          y2="40"
          className="stroke-cyan-400/50"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Reflejo de cristal */}
        <path
          d="M17 11L29 23"
          className="stroke-cyan-400/20"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (tipoNormalizado.includes('tab') || tipoNormalizado.includes('ipad')) {
    // Tablet estilizada
    return (
      <svg
        className={className}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="8"
          y="6"
          width="32"
          height="36"
          rx="4"
          className="stroke-violet-500/40 fill-slate-900/80"
          strokeWidth="2"
        />
        <rect
          x="11"
          y="10"
          width="26"
          height="26"
          rx="2"
          className="stroke-violet-400/20 fill-slate-950/90"
          strokeWidth="1.2"
        />
        <circle cx="24" cy="39" r="1.5" className="fill-violet-400/60" />
      </svg>
    );
  }

  if (
    tipoNormalizado.includes('not') ||
    tipoNormalizado.includes('lap') ||
    tipoNormalizado.includes('pc') ||
    tipoNormalizado.includes('comp') ||
    tipoNormalizado.includes('macbook')
  ) {
    // Notebook / Portátil
    return (
      <svg
        className={className}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect
          x="10"
          y="8"
          width="28"
          height="22"
          rx="3"
          className="stroke-cyan-500/40 fill-slate-900/80"
          strokeWidth="2"
        />
        <rect
          x="13"
          y="11"
          width="22"
          height="16"
          rx="1"
          className="stroke-cyan-400/20 fill-slate-950/90"
          strokeWidth="1"
        />
        {/* Base del teclado */}
        <path
          d="M6 34C6 32.8954 6.89543 32 8 32H40C41.1046 32 42 32.8954 42 34V36C42 37.1046 41.1046 38 40 38H8C6.89543 38 6 37.1046 6 36V34Z"
          className="stroke-cyan-500/40 fill-slate-900/90"
          strokeWidth="1.5"
        />
        <line x1="21" y1="33.5" x2="27" y2="33.5" className="stroke-cyan-400/50" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (tipoNormalizado.includes('watch') || tipoNormalizado.includes('reloj')) {
    // Smartwatch
    return (
      <svg
        className={className}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Malla superior e inferior */}
        <rect x="18" y="3" width="12" height="8" rx="2" className="stroke-cyan-500/30 fill-slate-800" strokeWidth="1.5" />
        <rect x="18" y="37" width="12" height="8" rx="2" className="stroke-cyan-500/30 fill-slate-800" strokeWidth="1.5" />
        {/* Caja del reloj */}
        <rect x="13" y="11" width="22" height="26" rx="6" className="stroke-cyan-500/50 fill-slate-900" strokeWidth="2" />
        <circle cx="24" cy="24" r="7" className="stroke-cyan-400/30 fill-slate-950" strokeWidth="1.2" />
      </svg>
    );
  }

  // Genérico Cyber-Tech elegante
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="13"
        y="5"
        width="22"
        height="38"
        rx="4"
        className="stroke-cyan-500/40 fill-slate-900/80"
        strokeWidth="2"
      />
      <rect
        x="16"
        y="9"
        width="16"
        height="26"
        rx="2"
        className="stroke-cyan-400/20 fill-slate-950/90"
        strokeWidth="1.2"
      />
      <circle cx="24" cy="38.5" r="1.5" className="fill-cyan-400/60" />
      <line x1="21" y1="7" x2="27" y2="7" className="stroke-cyan-400/50" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

DevicePlaceholder.propTypes = {
  tipo: PropTypes.string,
  className: PropTypes.string
};

