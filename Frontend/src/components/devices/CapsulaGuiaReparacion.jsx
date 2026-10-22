import PropTypes from 'prop-types';
import { motion } from 'framer-motion';
import { formatearEstadoReparacion } from '../../utils/repairStatus';

/**
 * Obtiene la configuración de información, consejos y próximos pasos
 * según la etapa técnica actual del equipo.
 */
export function obtenerGuiaPorEstado(etapa) {
  const clave = (etapa || '').toString().toLowerCase().replace(/[\s\-]+/g, '_').trim();

  // 1️⃣ Registro y Entrega
  if (clave.includes('dispositivo') && clave.includes('esperando')) {
    return {
      fase: 'Registro y Entrega',
      estadoTitulo: 'Esperando Dispositivo',
      icono: '🟡',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      contenedorClass: 'from-amber-500/15 via-[#1E293B] to-slate-900 border-amber-500/40',
      acentoColor: '#F59E0B',
      descripcion:
        'Has iniciado la solicitud desde la App. Visualice su comprobante de ingreso en la bandeja de entrada del correo electrónico registrado y acérquese a nuestra sucursal para dejar el dispositivo en manos de los técnicos.',
      tip: 'Conserve el PIN provisto; el técnico le solicitará en mostrador para recepcionar físicamente el equipo.'
    };
  }

  // 1️⃣ / 2️⃣ Esperando Diagnóstico o En Diagnóstico
  if (clave.includes('diagnostico') || clave.includes('diagnóstico')) {
    const enEvaluacion = clave.includes('en_');
    return {
      fase: 'Diagnóstico Técnico',
      estadoTitulo: enEvaluacion ? 'En Diagnóstico' : 'Esperando Diagnóstico',
      icono: '🔵',
      badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
      contenedorClass: 'from-cyan-500/15 via-[#1E293B] to-slate-900 border-cyan-500/40',
      acentoColor: '#06B6D4',
      descripcion:
        'Tu equipo ya ingresó a nuestro taller y está en fila para ser evaluado por uno de nuestros especialistas técnicos.',
      tip: 'Te notificaremos por correo electrónico en cuanto el especialista haya elaborado el presupuesto.'
    };
  }

  // 2️⃣ Esperando Confirmación del Presupuesto
  if (clave.includes('confirmacion') || clave.includes('confirmación') || clave.includes('presupuesto')) {
    return {
      fase: 'Diagnóstico y Presupuesto',
      estadoTitulo: 'Esperando Confirmación',
      icono: '🟠',
      badgeClass: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
      contenedorClass: 'from-orange-500/15 via-[#1E293B] to-slate-900 border-orange-500/50 shadow-orange-950/30',
      acentoColor: '#F97316',
      descripcion:
        '¡Tu presupuesto está listo! Haz clic en "Ver Historial" para revisar el detalle de la falla detectada y el costo total.',
      tip: '👉 Debes presionar "Aceptar Reparación" para que podamos comenzar a trabajar, o "Rechazar" si prefieres retirar el equipo sin reparar.'
    };
  }

  // 3️⃣ En Reparación
  if (clave.includes('reparacion') || clave.includes('reparación') || clave.includes('proceso')) {
    return {
      fase: 'Proceso en Taller',
      estadoTitulo: 'En Reparación',
      icono: '🟣',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
      contenedorClass: 'from-purple-500/15 via-[#1E293B] to-slate-900 border-purple-500/40',
      acentoColor: '#8B5CF6',
      descripcion:
        'Reparación en curso... Nuestro técnico está trabajando en la solución de tu equipo.',
      tip: 'El dispositivo se encuentra en banco de trabajo sometiéndose a las intervenciones técnicas solicitadas.'
    };
  }

  // 3️⃣ Esperando Insumos / Repuestos
  if (clave.includes('insumo') || clave.includes('repuesto')) {
    return {
      fase: 'Proceso en Taller',
      estadoTitulo: 'Esperando Insumos',
      icono: '⏸️',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      contenedorClass: 'from-indigo-500/15 via-[#1E293B] to-slate-900 border-indigo-500/40',
      acentoColor: '#6366F1',
      descripcion:
        'Estamos aguardando el arribo de un repuesto específico para tu modelo. Te notificaremos apenas reanudemos el trabajo.',
      tip: 'Los repuestos originales han sido solicitados a nuestros proveedores oficiales.'
    };
  }

  // 4️⃣ Listo para Retirar / Finalizada
  if (
    clave.includes('retirar') ||
    clave.includes('finalizad') ||
    clave.includes('completad') ||
    clave.includes('terminad')
  ) {
    return {
      fase: 'Finalización y Retiro',
      estadoTitulo: 'Listo para Retirar',
      icono: '🟢',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      contenedorClass: 'from-emerald-500/15 via-[#1E293B] to-slate-900 border-emerald-500/40 shadow-emerald-950/30',
      acentoColor: '#10B981',
      descripcion:
        '¡Tu equipo finalizó su reparación! Puedes pasar a buscarlo por la sucursal.',
      tip: '👉 Requisito obligatorio: Presentar tu Código de Seguridad (PIN) y saldar el importe pendiente para su entrega.'
    };
  }

  // 4️⃣ Entregado / Cerrado
  if (clave.includes('entregad') || clave.includes('cerrad')) {
    return {
      fase: 'Finalización y Retiro',
      estadoTitulo: 'Entregado / Cerrado',
      icono: '✅',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      contenedorClass: 'from-emerald-500/15 via-[#1E293B] to-slate-900 border-emerald-500/30',
      acentoColor: '#10B981',
      descripcion:
        'Tu servicio ha finalizado. ¡No olvides dejarnos tu valoración y puntuación (1 a 5 estrellas) para ayudarnos a mejorar!',
      tip: 'Gracias por confiar en IFixPos. Conserva tu comprobante para la garantía del trabajo realizado.'
    };
  }

  // Cancelada
  if (clave.includes('cancelad')) {
    return {
      fase: 'Cancelación',
      estadoTitulo: 'Reparación Cancelada',
      icono: '❌',
      badgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
      contenedorClass: 'from-rose-500/15 via-[#1E293B] to-slate-900 border-rose-500/40',
      acentoColor: '#F43F5E',
      descripcion:
        'Esta orden técnica fue desestimada o cancelada. Puedes retirar tu equipo por la sucursal con tu comprobante, DNI y Código de Seguridad.',
      tip: 'Si tienes dudas comunícate con nuestro soporte técnico.'
    };
  }

  // Fallback por defecto
  return {
    fase: 'Gestión Técnica',
    estadoTitulo: formatearEstadoReparacion(etapa),
    icono: '⚡',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    contenedorClass: 'from-cyan-500/10 via-[#1E293B] to-slate-900 border-slate-700/80',
    acentoColor: '#06B6D4',
    descripcion:
      'Tu equipo se encuentra registrado en nuestro circuito de taller especializado. Puedes seguir su avance en cualquier momento.',
    tip: 'Consulta el estado detallado para examinar eventos de la bitácora.'
  };
}

/**
 * Cápsula informativa Cyber-Tech que orienta al cliente sobre el estado actual
 * de su reparación, qué está sucediendo tras bambalinas y qué acción debe tomar.
 */
export default function CapsulaGuiaReparacion({ etapa, codigoSeguridad, className = '' }) {
  if (!etapa) return null;

  const guia = obtenerGuiaPorEstado(etapa);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl p-4 sm:p-5 bg-gradient-to-r ${guia.contenedorClass} border shadow-lg relative overflow-hidden ${className}`}
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl sm:text-2xl">{guia.icono}</span>
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block font-semibold">
              {guia.fase}
            </span>
            <span className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{guia.estadoTitulo}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {codigoSeguridad && (
            <span className="px-2.5 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30 text-xs font-mono font-bold">
              Código para presentar en mostrador: {codigoSeguridad}
            </span>
          )}
          <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold uppercase ${guia.badgeClass}`}>
            En Curso
          </span>
        </div>
      </div>

      <div className="pt-3 space-y-2">
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
          {guia.descripcion}
        </p>

        {guia.tip && (
          <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2">
            <span className="text-cyan-400 shrink-0 mt-0.5">💡</span>
            <span className="leading-snug">{guia.tip}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

CapsulaGuiaReparacion.propTypes = {
  etapa: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  codigoSeguridad: PropTypes.string,
  className: PropTypes.string
};
