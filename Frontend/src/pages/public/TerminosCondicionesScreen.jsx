import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';

export default function TerminosCondicionesScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0F172A] text-[#F8FAFC] font-sans selection:bg-cyan-500/30 selection:text-cyan-200 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Cabecera */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
            />
            <div>
              <span className="text-xs font-mono text-cyan-400 font-semibold tracking-wider uppercase block">
                IFixPos • Servicio Técnico Oficial
              </span>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Términos y Condiciones del Servicio
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/tienda')}
            className="self-start sm:self-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span>←</span>
            <span>Volver</span>
          </button>
        </header>

        {/* Tarjeta de Resumen Legal */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="bg-gradient-to-r from-cyan-950/40 via-[#1E293B] to-purple-950/30 border border-cyan-500/30 rounded-2xl p-6 sm:p-8 space-y-3"
        >
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
            <span>⚖️</span>
            <span>Marco Regulatorio y Transparencia del Taller</span>
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            Al registrar una solicitud de reparación o recepcionar físicamente un dispositivo en nuestras sucursales, el cliente acepta en su totalidad las cláusulas, garantías y protocolos técnicos detallados a continuación, diseñados para garantizar la máxima seguridad tanto del equipo como de la información confidencial contenida.
          </p>
        </motion.div>

        {/* Cláusulas Detalladas */}
        <div className="space-y-6">
          {/* Cláusula 1 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">1</span>
              <span>Recepción y Constatación Física del Equipo</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Al momento de la entrega en mostrador, el personal técnico registrará el estado estético y funcional del equipo (rayones, trizaduras, ausencias de piezas o tornillos) junto con un respaldo fotográfico digital. Las observaciones asentadas en el Remito de Recepción constituyen prueba fehaciente del estado en que el equipo ingresa al laboratorio.
            </p>
          </div>

          {/* Cláusula 2 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">2</span>
              <span>Diagnóstico Técnico y Presupuesto</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              La apertura del equipo para diagnóstico puede revelar fallas ocultas preexistentes atribuibles a sulfatación, golpes previos o manipulaciones indebidas. El presupuesto emitido contendrá el costo de mano de obra y de los repuestos originales o compatibles requeridos. Ninguna intervención de reparación se iniciará sin la previa aceptación expresa del cliente a través de la plataforma o en mostrador.
            </p>
          </div>

          {/* Cláusula 3 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">3</span>
              <span>Respaldo de Información y Confidencialidad</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              El cliente es el único responsable de realizar una copia de seguridad (backup) de sus datos personales, fotos y configuraciones antes de entregar el equipo. IFixPos no se responsabiliza por pérdidas fortuitas de información derivadas de reparaciones de software, memorias NAND o placas base. Las claves de acceso suministradas solo serán empleadas con propósitos de testeo operativo post-reparación y bajo estricta confidencialidad.
            </p>
          </div>

          {/* Cláusula 4 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">4</span>
              <span>Retiro del Dispositivo y Token de Seguridad</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Por razones estrictas de seguridad contra estafas y suplantación de identidad, la restitución física del hardware solo se efectuará contra presentación del Código de Seguridad (Token de Entrega) asignado al titular o mediante verificación presencial de documento de identidad por parte de la Administración del local, previo pago del saldo total pendiente.
            </p>
          </div>

          {/* Cláusula 5 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">5</span>
              <span>Plazo de Almacenamiento y Abandono Legal</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Transcurridos 90 (noventa) días corridos desde la notificación de finalización del servicio o presupuesto sin que el cliente retire el dispositivo, este se considerará en situación de abandono con arreglo a los artículos 2525 y concordantes del Código Civil y Comercial de la Nación, facultando al taller a disponer del hardware para el recupero de gastos de almacenamiento y repuestos devengados.
            </p>
          </div>

          {/* Cláusula 6 */}
          <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 space-y-3">
            <h2 className="text-base font-bold text-cyan-300 flex items-center gap-2 font-mono">
              <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-xs">6</span>
              <span>Garantía de Servicio Técnico</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Las reparaciones cuentan con una garantía legal de 90 días corridos sobre el componente intervenido o sustituido. La garantía quedará automáticamente anulada si el equipo presenta signos de nuevo daño físico, rotura por caída, penetración de líquidos, apertura por terceros ajenos a IFixPos o alteración de los sellos de seguridad internos.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-xs text-slate-500 pt-6 border-t border-slate-800 font-mono">
          IFixPos ERP • Última actualización de términos: 2026 • Todos los derechos reservados.
        </footer>
      </div>
    </div>
  );
}

