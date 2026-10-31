import PropTypes from 'prop-types';
import NotificationBell from './NotificationBell';
import UserProfileDropdown from './UserProfileDropdown';

/**
 * Encabezado Unificado para todas las pantallas del Administrador.
 * Implementa estilo Cyber-Tech flotante con efecto sticky (móvil al scroll),
 * transparencia 80%, backdrop-blur, mapa de ruta jerárquico (breadcrumb),
 * título de página limpio (sin subtítulos, sin etiquetas invasivas ni botones pegados)
 * y una única campana de notificaciones junto al perfil de usuario.
 */
export default function AdminHeader({
  category = 'Administración',
  subcategory = null,
  pageName = '',
  title = '',
  onBack = null,
  showNotificationBell = true,
  showUserProfile = true,
  className = ''
}) {
  const tituloFinal = title || pageName;

  return (
    <header
      className={`px-6 sm:px-8 py-4 border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between gap-4 transition-all duration-200 ${className}`}
    >
      {/* Columna Izquierda: Mapa de Ruta + Título */}
      <div className="min-w-0">
        {/* Esquema de Mapa de Ruta (Breadcrumb) */}
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400 flex items-center flex-wrap gap-2 mb-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mr-1 text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1 font-mono text-[11px] cursor-pointer"
              title="Volver"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Volver</span>
              <span className="text-slate-600">|</span>
            </button>
          )}
          <span>{category}</span>
          {subcategory && (
            <>
              <span className="text-slate-600">›</span>
              <span>{subcategory}</span>
            </>
          )}
          {pageName && (
            <>
              <span className="text-slate-600">›</span>
              <span className="text-cyan-400 font-semibold">{pageName}</span>
            </>
          )}
        </nav>

        {/* Título de la página */}
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <span>{tituloFinal}</span>
          </h1>
        </div>
      </div>

      {/* Columna Derecha: Notificaciones + Perfil de Usuario (Exactamente 1 campanita) */}
      <div className="flex items-center gap-3 shrink-0">
        {showUserProfile ? (
          <UserProfileDropdown align="right" showNotificationBell={showNotificationBell} />
        ) : (
          showNotificationBell && <NotificationBell />
        )}
      </div>
    </header>
  );
}

AdminHeader.propTypes = {
  category: PropTypes.string,
  subcategory: PropTypes.string,
  pageName: PropTypes.string,
  title: PropTypes.node,
  onBack: PropTypes.func,
  showNotificationBell: PropTypes.bool,
  showUserProfile: PropTypes.bool,
  className: PropTypes.string
};
