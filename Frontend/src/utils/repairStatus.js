/**
 * Utilidades para el formateo y visualización amigable de estados de reparación y bitácora técnica.
 * Transforma cadenas en crudo (ej: "esperando_diagnostico", "ESPERANDO_DISPOSITIVO", números)
 * en títulos limpios, con correcta acentuación y sin caracteres técnicos o guiones bajos.
 */

const DICCIONARIO_ESTADOS = {
  // Esperando dispositivo
  esperando_dispositivo: 'Esperando Dispositivo',
  'esperando dispositivo': 'Esperando Dispositivo',

  // Esperando diagnóstico
  esperando_diagnostico: 'Esperando Diagnóstico',
  'esperando diagnostico': 'Esperando Diagnóstico',
  esperando_diagnóstico: 'Esperando Diagnóstico',

  // En diagnóstico
  en_diagnostico: 'En Diagnóstico',
  'en diagnostico': 'En Diagnóstico',
  en_diagnóstico: 'En Diagnóstico',

  // En reparación / proceso
  en_reparacion: 'En Reparación',
  'en reparacion': 'En Reparación',
  en_reparación: 'En Reparación',
  en_proceso: 'En Proceso',
  'en proceso': 'En Proceso',

  // Esperando insumos o repuestos
  esperando_repuesto: 'Esperando Repuesto',
  'esperando repuesto': 'Esperando Repuesto',
  esperando_insumo: 'Esperando Insumo',
  'esperando insumo': 'Esperando Insumo',
  esperando_insumos: 'Esperando Insumos',

  // Finalizadas y entregadas
  finalizada: 'Finalizada',
  finalizado: 'Finalizado',
  completada: 'Completada',
  completado: 'Completado',
  entregada: 'Entregada',
  entregado: 'Entregado',

  // Canceladas o pausadas
  cancelada: 'Cancelada',
  cancelado: 'Cancelado',
  pausada: 'Pausada',
  pausado: 'Pausado',

  // Disponibilidad
  libre: 'Disponible',
  disponible: 'Disponible'
};

const DICCIONARIO_NUMERICO_ESTADOS = {
  1: 'Esperando Dispositivo',
  2: 'Esperando Diagnóstico',
  3: 'En Diagnóstico',
  4: 'En Reparación',
  5: 'Esperando Insumo',
  6: 'Finalizada',
  7: 'Entregada',
  8: 'Cancelada'
};

/**
 * Convierte cualquier representación de estado de reparación a un formato presentable.
 * Ejemplos:
 *   "esperando_diagnostico" -> "Esperando Diagnóstico"
 *   "ESPERANDO_DISPOSITIVO" -> "Esperando Dispositivo"
 *   "en_reparacion"         -> "En Reparación"
 *   2                       -> "Esperando Diagnóstico"
 *   "reparacion_en_curso"   -> "Reparacion En Curso"
 *
 * @param {string|number} estado
 * @returns {string} Texto amigable
 */
export function formatearEstadoReparacion(estado) {
  if (estado === null || estado === undefined || estado === '') return '—';

  // Si es numérico (por ejemplo en estado_alcanzado de bitácora)
  if (
    typeof estado === 'number' ||
    (!isNaN(Number(estado)) && String(estado).trim().length <= 2)
  ) {
    const num = Number(estado);
    if (DICCIONARIO_NUMERICO_ESTADOS[num]) {
      return DICCIONARIO_NUMERICO_ESTADOS[num];
    }
  }

  const str = String(estado).trim();
  const claveSnake = str.toLowerCase().replace(/[\s\-]+/g, '_').trim();
  const claveEspacio = str.toLowerCase().replace(/[\-_]+/g, ' ').trim();

  if (DICCIONARIO_ESTADOS[claveSnake]) return DICCIONARIO_ESTADOS[claveSnake];
  if (DICCIONARIO_ESTADOS[claveEspacio]) return DICCIONARIO_ESTADOS[claveEspacio];

  // Fallback: separar por guiones y espacios, capitalizar cada palabra
  return str
    .replace(/[_\-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Retorna las clases visuales de Tailwind según el estado de la reparación.
 */
export function obtenerColorBadgeEstado(estado) {
  const formateado = formatearEstadoReparacion(estado).toLowerCase();

  if (formateado.includes('diagnóstico') || formateado.includes('diagnostico')) {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  if (formateado.includes('reparación') || formateado.includes('proceso')) {
    return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
  }
  if (formateado.includes('insumo') || formateado.includes('repuesto') || formateado.includes('dispositivo')) {
    return 'bg-purple-500/15 text-purple-300 border-purple-500/30';
  }
  if (formateado.includes('finalizad') || formateado.includes('entregad') || formateado.includes('disponible')) {
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  }
  if (formateado.includes('cancelad')) {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }

  return 'bg-slate-800 text-slate-300 border-slate-700';
}
