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
  nuevo_diagnostico: 'Esperando Diagnóstico',
  'nuevo diagnostico': 'Esperando Diagnóstico',
  nuevo_diagnóstico: 'Esperando Diagnóstico',

  // Esperando pago de diagnóstico
  esperando_pago_diagnostico: 'Esperando Pago de Diagnóstico',
  'esperando pago diagnostico': 'Esperando Pago de Diagnóstico',
  esperando_pago_diagnóstico: 'Esperando Pago de Diagnóstico',
  'esperando pago de diagnostico': 'Esperando Pago de Diagnóstico',
  'esperando pago de diagnóstico': 'Esperando Pago de Diagnóstico',

  // En diagnóstico
  en_diagnostico: 'En Diagnóstico',
  'en diagnostico': 'En Diagnóstico',
  en_diagnóstico: 'En Diagnóstico',

  // Esperando confirmación de presupuesto
  esperando_confirmacion: 'Esperando Confirmación',
  'esperando confirmacion': 'Esperando Confirmación',
  esperando_confirmación: 'Esperando Confirmación',

  // En reparación / proceso
  en_reparacion: 'En Reparación',
  'en reparacion': 'En Reparación',
  en_reparación: 'En Reparación',
  en_proceso: 'En Proceso',
  'en proceso': 'En Proceso',

  // Esperando insumos o repuestos
  esperando_repuesto: 'Esperando Repuestos',
  'esperando repuesto': 'Esperando Repuestos',
  esperando_repuestos: 'Esperando Repuestos',
  'esperando repuestos': 'Esperando Repuestos',
  esperando_insumo: 'Esperando Repuestos',
  'esperando insumo': 'Esperando Repuestos',
  esperando_insumos: 'Esperando Repuestos',

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
  4: 'Esperando Confirmación',
  5: 'En Reparación',
  6: 'Finalizada',
  7: 'Entregada',
  8: 'Cancelada',
  9: 'Esperando Repuestos',
  10: 'Esperando Pago de Diagnóstico'
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
 * Retorna las clases visuales de Tailwind según el estado de la reparación,
 * siguiendo una paleta corporativa sobria (Cyber-Tech Dark Mode) sin saturación cromática.
 */
export function obtenerColorBadgeEstado(estado, esActual = false) {
  if (!esActual) {
    return 'bg-slate-800/90 text-slate-300 border-slate-700/80';
  }

  const formateado = formatearEstadoReparacion(estado).toLowerCase();

  if (formateado.includes('cancelad')) {
    return 'bg-rose-500/10 text-rose-300 border-rose-500/25';
  }
  if (formateado.includes('finalizad') || formateado.includes('entregad') || formateado.includes('disponible')) {
    return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25';
  }

  return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35';
}

/**
 * Genera un resumen ejecutivo breve para mostrar en las tarjetas de la Línea de Tiempo (Bitácora),
 * reservando el desglose completo para el modal "Inspeccionar análisis".
 */
export function obtenerResumenCortoBitacora(registro, estadoAnterior = null) {
  if (!registro) return 'Actualización de orden registrada';

  const comentario = String(registro.comentario || '').trim();
  const lower = comentario.toLowerCase();
  const estadoActualFmt = formatearEstadoReparacion(
    registro.estado_nombre || registro.estado_alcanzado_nombre || registro.estado_alcanzado
  );
  const estadoAntFmt = estadoAnterior ? formatearEstadoReparacion(estadoAnterior) : null;

  if (lower.includes('apertura de orden') || lower.includes('proceso inicializado')) {
    return `Proceso de reparación iniciado • Ingreso en '${estadoActualFmt}'`;
  }

  if (lower.includes('recepcionado en mostrador')) {
    if (estadoAntFmt && estadoAntFmt !== estadoActualFmt) {
      return `Recepción física en mostrador • Transición de '${estadoAntFmt}' a '${estadoActualFmt}'`;
    }
    return `Recepción física del dispositivo en mostrador • Etapa '${estadoActualFmt}'`;
  }

  if (lower.includes('comprobante fiscal emitido')) {
    return 'Emisión de comprobante fiscal de pago';
  }

  if (
    lower.includes('abono de costo de diagnóstico') ||
    lower.includes('abono de diagnóstico') ||
    lower.includes('transacción en plataforma') ||
    lower.includes('transacción online')
  ) {
    if (estadoAntFmt && estadoAntFmt !== estadoActualFmt) {
      return `Pago de diagnóstico acreditado • Transición de '${estadoAntFmt}' a '${estadoActualFmt}'`;
    }
    return 'Pago de diagnóstico único acreditado';
  }

  if (lower.includes('liquidación final') || lower.includes('cobro de $')) {
    return 'Liquidación de saldo confirmada en caja';
  }

  if (lower.includes('carga de nuevo diagnóstico')) {
    return `Nuevo informe de diagnóstico emitido • Pasa a '${estadoActualFmt}'`;
  }

  if (lower.includes('carga de diagnóstico')) {
    return `Informe de diagnóstico y presupuesto emitido • Pasa a '${estadoActualFmt}'`;
  }

  if (lower.includes('diagnóstico aceptado') || lower.includes('presupuesto aprobado')) {
    return `Presupuesto aprobado por el cliente • Transición a '${estadoActualFmt}'`;
  }

  if (lower.includes('diagnóstico rechazado') || lower.includes('presupuesto rechazado')) {
    return `Presupuesto rechazado por el cliente • Orden '${estadoActualFmt}'`;
  }

  if (lower.includes('cierre de orden') || lower.includes('entregado físicamente')) {
    return 'Cierre de orden • Dispositivo entregado físicamente al cliente';
  }

  // Extraer si el comentario menciona "pasó de 'X' a 'Y'"
  const matchTransicion = comentario.match(/pasó de ['"]([^'"]+)['"] a ['"]([^'"]+)['"]/i);
  if (matchTransicion) {
    const deEstado = formatearEstadoReparacion(matchTransicion[1]);
    const aEstado = formatearEstadoReparacion(matchTransicion[2]);
    return `Transición de estado desde '${deEstado}' a '${aEstado}'`;
  }

  if (estadoAntFmt && estadoAntFmt !== estadoActualFmt) {
    return `Transición de estado desde '${estadoAntFmt}' a '${estadoActualFmt}'`;
  }

  return `Actualización de orden en etapa '${estadoActualFmt}'`;
}

/**
 * Desglosa el comentario crudo de un registro de bitácora en ítems individuales
 * ({ etiqueta, valor }) sin repetir información y separando bloques unidos por "|", saltos de línea o etiquetas.
 */
export function desglosarItemsComentarioBitacora(comentario) {
  if (!comentario || !String(comentario).trim()) {
    return [{ etiqueta: 'Detalle', valor: 'Sin descripción adicional registrada en este evento.' }];
  }

  let texto = String(comentario).trim();

  // Normalizar separadores "|" y separar etiquetas incrustadas en la misma oración
  texto = texto
    .replace(/\s*\|\s*/g, '\n')
    .replace(/\.\s*(Cambio de etapa:|Estado inicial:|Estado actual:|Estado físico:|Estado de arancel:|Cobertura de diagnóstico:|Transacción en caja:|Transacción en plataforma:|Transacción online:|Respaldo fotográfico:|Técnico asignado:|Asignado automáticamente|Asignado para diagnóstico|Falla constatada:|Detalle técnico:|Observaciones de entrega:|Resolución del cliente:|Motivo:|Comentarios:|Archivo:)/gi, '\n$1');

  const lineasBrutas = texto
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  const valoresVistos = new Set();

  for (const linea of lineasBrutas) {
    const limpia = linea.replace(/\.$/, '').trim();
    if (!limpia) continue;

    let etiqueta = 'Información';
    let valor = limpia;

    const idxPuntos = limpia.indexOf(':');
    if (idxPuntos > 0 && idxPuntos < 35) {
      etiqueta = limpia.slice(0, idxPuntos).trim();
      valor = limpia.slice(idxPuntos + 1).trim();
    } else if (/^asignado/i.test(limpia)) {
      etiqueta = 'Asignación técnica';
      valor = limpia;
    }

    // Formatear nombres de etapas en crudo si aparecen entre comillas (ej: 'ESPERANDO_DISPOSITIVO')
    valor = valor.replace(/'([A-Z_]+)'/g, (_, cod) => `'${formatearEstadoReparacion(cod)}'`);

    const claveUnica = `${etiqueta.toLowerCase()}:${valor.toLowerCase()}`;
    if (!valoresVistos.has(claveUnica) && valor) {
      valoresVistos.add(claveUnica);
      items.push({ etiqueta, valor });
    }
  }

  return items.length > 0
    ? items
    : [{ etiqueta: 'Detalle del evento', valor: String(comentario).trim() }];
}
