import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const NOMBRE_SISTEMA = 'IFixPos';

const MAPA_TITULOS_RUTA = [
  { patron: /^\/$/, titulo: 'Inicio y Servicios' },
  { patron: /^\/tienda/, titulo: 'Tienda Oficial de Repuestos e Insumos' },
  { patron: /^\/login/, titulo: 'Iniciar Sesión' },
  { patron: /^\/register/, titulo: 'Crear Cuenta' },
  { patron: /^\/recuperar-acceso/, titulo: 'Recuperar Acceso' },
  { patron: /^\/completar-perfil/, titulo: 'Completar Perfil' },
  { patron: /^\/editar-perfil/, titulo: 'Mi Perfil' },
  { patron: /^\/perfil\/direcciones/, titulo: 'Mis Direcciones' },
  { patron: /^\/perfil\/preferencias/, titulo: 'Preferencias de Cuenta' },
  { patron: /^\/terminos/, titulo: 'Términos y Condiciones' },
  { patron: /^\/cliente\/dispositivos\/nuevo/, titulo: 'Registrar Dispositivo' },
  { patron: /^\/cliente\/dispositivos\/[^/]+/, titulo: 'Detalle de Equipo' },
  { patron: /^\/cliente\/dispositivos/, titulo: 'Mis Dispositivos' },
  { patron: /^\/cliente\/reparaciones\/[^/]+/, titulo: 'Seguimiento de Reparación' },
  { patron: /^\/tecnico\/dashboard|^\/tareas-tecnico/, titulo: 'Panel Técnico Operativo' },
  { patron: /^\/tecnico\/reparaciones\/[^/]+/, titulo: 'Gestión Técnica de Orden' },
  { patron: /venta-presencial/, titulo: 'Punto de Venta Presencial (POS)' },
  { patron: /cobros/, titulo: 'Caja y Cobros de Mostrador' },
  { patron: /nueva-reparacion/, titulo: 'Ingreso Directo a Taller' },
  { patron: /recepcionar-dispositivo/, titulo: 'Recepción Física de Equipos' },
  { patron: /entregar-dispositivo/, titulo: 'Entrega de Equipos' },
  { patron: /en-curso/, titulo: 'Reparaciones en Curso' },
  { patron: /finalizadas/, titulo: 'Historial Técnico de Reparaciones' },
  { patron: /^\/portal-proveedor\/cotizar/, titulo: 'Portal de Proveedores • Cotización' },
  { patron: /^\/admin\/dashboard/, titulo: 'Panel Gerencial de Administración' },
  { patron: /^\/admin\/usuarios/, titulo: 'Gestión de Usuarios' },
  { patron: /^\/admin\/roles/, titulo: 'Roles y Permisos' },
  { patron: /^\/admin\/proveedores/, titulo: 'Directorio de Proveedores' },
  { patron: /^\/admin\/recepcion-compras/, titulo: 'Recepción de Compras' },
  { patron: /^\/admin\/cotizaciones/, titulo: 'Solicitudes de Cotización' },
  { patron: /^\/admin\/gestionar-cotizaciones/, titulo: 'Comparativa de Cotizaciones' },
  { patron: /^\/admin\/ordenes-compra/, titulo: 'Órdenes de Compra' },
  { patron: /^\/admin\/configuracion/, titulo: 'Configuración del Sistema' },
  { patron: /^\/admin\/zonas-cobertura/, titulo: 'Zonas de Cobertura y Tarifas' },
  { patron: /^\/admin\/inventario/, titulo: 'Inventario y Stock' },
  { patron: /^\/admin\/reparaciones/, titulo: 'Auditoría de Reparaciones' },
  { patron: /^\/admin\/medios-pago/, titulo: 'Medios de Pago' },
  { patron: /beneficios/, titulo: 'Motor Inteligente de Beneficios' },
  { patron: /logs/, titulo: 'Bitácora de Auditoría del Sistema' },
  { patron: /copias-seguridad|backups/, titulo: 'Copias de Seguridad y Respaldo' },
  { patron: /conversion/, titulo: 'Métricas • Conversión de Presupuestos' },
  { patron: /eficiencia/, titulo: 'Métricas • Demanda y Eficiencia' },
  { patron: /productividad/, titulo: 'Métricas • Productividad Técnica' },
  { patron: /logistica/, titulo: 'Métricas • Distribución y Logística' },
  { patron: /satisfaccion/, titulo: 'Métricas • Satisfacción y Calidad (CSAT)' },
  { patron: /^\/admin\/catalogos/, titulo: 'Catálogos y Taxonomías' }
];

/**
 * Actualiza dinámicamente `document.title` según la ruta activa o un título explícito (Fase 3 - F.4.7).
 */
export function useTituloPagina(tituloExplicito = '') {
  const location = useLocation();

  useEffect(() => {
    if (typeof document === 'undefined') return;

    if (tituloExplicito) {
      document.title = `${tituloExplicito} | ${NOMBRE_SISTEMA}`;
      return;
    }

    const ruta = location.pathname || '/';
    const coincidencia = MAPA_TITULOS_RUTA.find((item) => item.patron.test(ruta));
    document.title = coincidencia
      ? `${coincidencia.titulo} | ${NOMBRE_SISTEMA}`
      : `${NOMBRE_SISTEMA} — Gestión Integral y Servicio Técnico`;
  }, [location.pathname, tituloExplicito]);
}

export default useTituloPagina;

