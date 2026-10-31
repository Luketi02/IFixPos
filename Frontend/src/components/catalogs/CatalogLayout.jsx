import PropTypes from 'prop-types';
import { motion, AnimatePresence } from 'framer-motion';
import AdminSidebar from '../navigation/AdminSidebar';
import AdminHeader from '../navigation/AdminHeader';

/**
 * Layout maestro Cyber-Tech para las pantallas de gestión de Catálogos y Taxonomías.
 * Proporciona navegación unificada, cabecera limpia, badges de estadísticas,
 * barra de filtros y búsqueda con acciones operativas integradas, y banners de feedback.
 */
export default function CatalogLayout({
  title,
  badgeText = 'Taxonomía Base',
  activeMenu = 'catalogs',
  category = 'Catálogos y Taxonomías',
  onNew,
  newButtonText = 'Nuevo Registro',
  onActivateAll,
  loadingActivateAll = false,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar por nombre...',
  stats = { total: 0, activos: 0, inactivos: 0 },
  extraFilters = null,
  errorMessage = '',
  onDismissError,
  toastMessage = '',
  onDismissToast,
  children
}) {
  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col md:flex-row selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Barra Lateral de Administrador */}
      <AdminSidebar activeMenu={activeMenu} role="admin" />

      {/* Contenedor Principal */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto relative">
        {/* Cabecera Superior Unificada Cyber-Tech (Limpia, sin subtítulos ni botones pegados) */}
        <AdminHeader
          category={category}
          pageName={title}
          title={title}
        />

        {/* Notificación Toast de Éxito Flotante */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-20 right-6 z-50 max-w-md"
            >
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40 text-emerald-300 text-sm flex items-center justify-between gap-3 shadow-lg shadow-emerald-950/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">{toastMessage}</span>
                </div>
                {onDismissToast && (
                  <button
                    type="button"
                    onClick={onDismissToast}
                    className="text-emerald-400 hover:text-emerald-200 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alerta de Error Temporal (6 segundos) */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 mt-4"
            >
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-sm flex items-center justify-between gap-3 shadow-lg shadow-rose-950/20 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{errorMessage}</span>
                </div>
                {onDismissError && (
                  <button
                    type="button"
                    onClick={onDismissError}
                    className="text-rose-400 hover:text-rose-200 p-1"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Contenido Principal */}
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full space-y-6">

          {/* Tarjetas de Estadísticas Rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Registrados</p>
                <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/30 flex items-center justify-center text-violet-400 text-lg">
                📦
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Activos Operativos</p>
                <p className="text-2xl font-black text-emerald-400 mt-1">{stats.activos}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-lg">
                ✅
              </div>
            </div>

            <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Inactivos (Baja Lógica)</p>
                <p className="text-2xl font-black text-rose-400 mt-1">{stats.inactivos}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 text-lg">
                ⏸️
              </div>
            </div>
          </div>

          {/* Barra de Búsqueda, Filtros y Acciones Operativas Cyber-Tech */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 sm:p-5 shadow-xl">
            <div className="flex flex-col md:flex-row gap-3 sm:gap-4 items-center justify-between">
              {/* Buscador de Texto */}
              {onSearchChange !== undefined && (
                <div className="w-full md:flex-1 relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={searchValue || ''}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-[#0F172A] border border-slate-700 text-slate-100 placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] focus:border-[#8B5CF6] transition-all"
                  />
                  {searchValue && (
                    <button
                      type="button"
                      onClick={() => onSearchChange('')}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              )}

              {/* Filtros Extra (Opcional, e.g. en Modelos) */}
              {extraFilters && (
                <div className="w-full md:w-auto flex flex-wrap items-center gap-3">
                  {extraFilters}
                </div>
              )}

              {/* Acciones Operativas de la Sección */}
              {(onActivateAll || onNew) && (
                <div className="w-full md:w-auto flex items-center gap-2.5 shrink-0 justify-end">
                  {onActivateAll && (
                    <button
                      type="button"
                      onClick={onActivateAll}
                      disabled={loadingActivateAll || stats.inactivos === 0}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      title={stats.inactivos === 0 ? 'No hay registros inactivos para activar' : 'Activar todos los registros dados de baja'}
                    >
                      <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>{loadingActivateAll ? 'Activando...' : `Activar Todos ${stats.inactivos > 0 ? `(${stats.inactivos})` : ''}`}</span>
                    </button>
                  )}

                  {onNew && (
                    <button
                      type="button"
                      onClick={onNew}
                      className="px-4 py-2.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      <span>{newButtonText}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Grilla / Contenido Secundario */}
          <div>{children}</div>
        </main>
      </div>
    </div>
  );
}

CatalogLayout.propTypes = {
  title: PropTypes.string.isRequired,
  badgeText: PropTypes.string,
  activeMenu: PropTypes.string,
  category: PropTypes.string,
  onNew: PropTypes.func,
  newButtonText: PropTypes.string,
  onActivateAll: PropTypes.func,
  loadingActivateAll: PropTypes.bool,
  searchValue: PropTypes.string,
  onSearchChange: PropTypes.func,
  searchPlaceholder: PropTypes.string,
  stats: PropTypes.shape({
    total: PropTypes.number,
    activos: PropTypes.number,
    inactivos: PropTypes.number
  }),
  extraFilters: PropTypes.node,
  errorMessage: PropTypes.string,
  onDismissError: PropTypes.func,
  toastMessage: PropTypes.string,
  onDismissToast: PropTypes.func,
  children: PropTypes.node
};
