/**
 * Utilidades para formateo de fechas adaptadas a Argentina (DD/MM/YYYY).
 */

/**
 * Convierte una fecha en formato YYYY-MM-DD o ISO a formato argentino DD/MM/YYYY.
 * Si recibe null, undefined o una cadena no válida, retorna el fallback proporcionado.
 *
 * @param {string|Date|null|undefined} fechaStr - Fecha a formatear
 * @param {string} fallback - Valor a retornar en caso de fecha vacía o inválida (por defecto '—')
 * @returns {string} Fecha formateada en DD/MM/YYYY
 */
export function formatearFecha(fechaStr, fallback = '—') {
  if (!fechaStr) return fallback;

  // Si viene en formato YYYY-MM-DD o YYYY/MM/DD
  if (typeof fechaStr === 'string') {
    const coincidencia = fechaStr.trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (coincidencia) {
      const [, anio, mes, dia] = coincidencia;
      return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${anio}`;
    }
  }

  // Si es un objeto Date o un ISO string con hora
  const fecha = new Date(fechaStr);
  if (Number.isNaN(fecha.getTime())) {
    return typeof fechaStr === 'string' ? fechaStr : fallback;
  }

  const dia = String(fecha.getDate()).padStart(2, '0');
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const anio = fecha.getFullYear();

  return `${dia}/${mes}/${anio}`;
}

export default formatearFecha;
