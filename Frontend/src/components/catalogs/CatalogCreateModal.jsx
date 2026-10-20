import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Modal universal para la creación de registros de catálogos y taxonomías.
 * Cumple estrictamente con la regla de advertencia de auditoría e inmutabilidad,
 * exigiendo confirmación explícita mediante checkbox para habilitar la creación.
 */
export default function CatalogCreateModal({
  isOpen,
  onClose,
  onSubmit,
  title = 'Nuevo Registro',
  subtitle = 'Complete los datos solicitados para incorporar el nuevo registro al catálogo.',
  fields = [],
  loading = false,
  error = ''
}) {
  const [formData, setFormData] = useState({});
  const [confirmed, setConfirmed] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Resetear estados al abrir o cerrar modal
  useEffect(() => {
    if (isOpen) {
      const initial = {};
      fields.forEach((f) => {
        initial[f.name] = f.defaultValue !== undefined ? f.defaultValue : '';
      });
      setFormData(initial);
      setConfirmed(false);
      setFieldErrors({});
    }
  }, [isOpen, fields]);

  if (!isOpen) return null;

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!confirmed || loading) return;

    // Validación básica de campos requeridos
    const errors = {};
    fields.forEach((f) => {
      if (f.required && (!formData[f.name] || String(formData[f.name]).trim() === '')) {
        errors[f.name] = `El campo ${f.label.toLowerCase()} es obligatorio.`;
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    onSubmit(formData);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop con desenfoque Cyber-Tech */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={loading ? undefined : onClose}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        />

        {/* Contenedor del Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-lg bg-[#1E293B] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-10 my-8"
        >
          {/* Cabecera del Modal */}
          <div className="p-6 border-b border-slate-700/60 bg-gradient-to-r from-slate-900/50 to-transparent">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#06B6D4] shadow-sm shadow-cyan-400/50" />
                  {title}
                </h3>
                <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Cerrar modal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Mensaje de error general si proviene de la API */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start gap-2.5"
              >
                <span className="text-base leading-none">⚠️</span>
                <span className="flex-1 font-medium">{error}</span>
              </motion.div>
            )}

            {/* Campos dinámicos del formulario */}
            <div className="space-y-4">
              {fields.map((field) => {
                const val = formData[field.name] !== undefined ? formData[field.name] : '';
                const hasError = fieldErrors[field.name];

                if (field.type === 'select') {
                  return (
                    <div key={field.name} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        {field.label} {field.required && <span className="text-cyan-400">*</span>}
                      </label>
                      <select
                        value={val}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        disabled={loading || field.disabled}
                        className={`w-full bg-slate-900/90 border ${
                          hasError ? 'border-rose-500' : 'border-slate-700'
                        } rounded-xl text-slate-100 text-sm px-4 py-2.5 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] transition-all`}
                      >
                        <option value="">{field.placeholder || 'Seleccione una opción...'}</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {hasError && <p className="text-[11px] text-rose-400">{hasError}</p>}
                      {field.helperText && <p className="text-[11px] text-slate-400">{field.helperText}</p>}
                    </div>
                  );
                }

                if (field.type === 'textarea') {
                  return (
                    <div key={field.name} className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        {field.label} {field.required && <span className="text-cyan-400">*</span>}
                      </label>
                      <textarea
                        rows={field.rows || 3}
                        value={val}
                        onChange={(e) => handleChange(field.name, e.target.value)}
                        placeholder={field.placeholder || ''}
                        disabled={loading || field.disabled}
                        className={`w-full bg-slate-900/90 border ${
                          hasError ? 'border-rose-500' : 'border-slate-700'
                        } rounded-xl text-slate-100 text-sm px-4 py-2.5 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] transition-all placeholder:text-slate-500 resize-none`}
                      />
                      {hasError && <p className="text-[11px] text-rose-400">{hasError}</p>}
                      {field.helperText && <p className="text-[11px] text-slate-400">{field.helperText}</p>}
                    </div>
                  );
                }

                return (
                  <div key={field.name} className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      {field.label} {field.required && <span className="text-cyan-400">*</span>}
                    </label>
                    <input
                      type={field.type || 'text'}
                      value={val}
                      onChange={(e) => handleChange(field.name, e.target.value)}
                      placeholder={field.placeholder || ''}
                      disabled={loading || field.disabled}
                      className={`w-full bg-slate-900/90 border ${
                        hasError ? 'border-rose-500' : 'border-slate-700'
                      } rounded-xl text-slate-100 text-sm px-4 py-2.5 focus:outline-none focus:border-[#8B5CF6] focus:ring-1 focus:ring-[#8B5CF6] transition-all placeholder:text-slate-500`}
                    />
                    {hasError && <p className="text-[11px] text-rose-400">{hasError}</p>}
                    {field.helperText && <p className="text-[11px] text-slate-400">{field.helperText}</p>}
                  </div>
                );
              })}
            </div>

            {/* ADVERTENCIA DE AUDITORÍA (Meticuloso y Estricto según requerimiento) */}
            <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-red-500/10 border-l-4 border-amber-500 rounded-xl">
              <div className="flex items-start gap-3">
                <span className="text-xl leading-none">⚠️</span>
                <div className="space-y-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                    Aviso de Inmutabilidad & Auditoría
                  </h4>
                  <p className="text-xs leading-relaxed text-amber-200/90">
                    Cuidado: Por normativas de auditoría y consistencia de datos, este registro será inmutable. Una vez creado, NO se podrá modificar su nombre ni eliminar físicamente del sistema, solo podrá ser dado de baja (desactivado). Verifique que los datos sean correctos antes de continuar.
                  </p>
                </div>
              </div>
            </div>

            {/* Checkbox de Confirmación Obligatoria */}
            <label className="flex items-center gap-3 p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl cursor-pointer hover:bg-slate-900 transition-colors select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-[#8B5CF6] focus:ring-[#8B5CF6] focus:ring-offset-slate-900"
              />
              <span className="text-xs font-medium text-slate-200">
                Entiendo y confirmo los datos
              </span>
            </label>

            {/* Botones de Acción */}
            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-700/60">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!confirmed || loading}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 bg-[#06B6D4] hover:bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20 active:scale-95"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Guardando...</span>
                  </>
                ) : (
                  <span>Crear Registro</span>
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
