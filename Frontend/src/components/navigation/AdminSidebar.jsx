import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import { normalizeRole } from '../../utils/roleRoutes';
import BranchedMenu from './BranchedMenu';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';
import {
  Home01Icon,
  DashboardSquare01Icon,
  Rocket01Icon,
  UserGroupIcon,
  PackageIcon,
  Settings02Icon,
  ShoppingBag01Icon,
  Layers01Icon,
  Notification03Icon,
  CursorPointer01Icon,
  SmartPhone01Icon,
  PlusSignCircleIcon,
  Clock01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  PackageReceiveIcon
} from '@hugeicons/core-free-icons';

// ==============================================================================
// MENÚ DE NAVEGACIÓN PARA ADMINISTRADORES
// ==============================================================================
export const ADMIN_MENU_ITEMS = [
  {
    label: 'Inicio & Métricas',
    children: [
      { value: 'overview', label: 'Panel Principal', icon: Home01Icon, route: '/admin/dashboard' },
      { value: 'kpis', label: 'Métricas Globales', icon: DashboardSquare01Icon },
      { value: 'quick-actions', label: 'Acciones Rápidas', icon: Rocket01Icon }
    ]
  },
  {
    label: 'Gestión de Usuarios',
    children: [
      { value: 'users-list', label: 'Usuarios y Roles', icon: UserGroupIcon },
      { value: 'users-clients', label: 'Cartera de Clientes', icon: UserGroupIcon },
      { value: 'users-techs', label: 'Personal Técnico', icon: UserGroupIcon }
    ]
  },
  {
    label: 'Catálogo & Inventario',
    children: [
      { value: 'admin-inventory', label: 'Catálogo e Inventario', icon: PackageIcon, route: '/admin/inventario' },
      { value: 'catalog-categories', label: 'Categorías y Familias', icon: Layers01Icon, route: '/admin/inventario' },
      { value: 'inventory-stock', label: 'Control de Stock', icon: PackageIcon, route: '/admin/inventario' }
    ]
  },
  {
    label: 'Catálogos y Taxonomías',
    children: [
      { value: 'catalog-marcas', label: 'Marcas', icon: Layers01Icon, route: '/admin/catalogos/marcas' },
      { value: 'catalog-modelos', label: 'Modelos de Dispositivo', icon: SmartPhone01Icon, route: '/admin/catalogos/modelos' },
      { value: 'catalog-tipos-dispositivo', label: 'Tipos de Dispositivo', icon: SmartPhone01Icon, route: '/admin/catalogos/tipos-dispositivo' },
      { value: 'catalog-categorias-producto', label: 'Categorías de Producto', icon: PackageIcon, route: '/admin/catalogos/categorias-producto' },
      { value: 'catalog-categorias-reparacion', label: 'Categorías de Reparación', icon: Settings02Icon, route: '/admin/catalogos/categorias-reparacion' }
    ]
  },
  {
    label: 'Taller & Reparaciones',
    children: [
      { value: 'workshop-orders', label: 'Órdenes de Reparación', icon: Settings02Icon },
      { value: 'workshop-diagnostics', label: 'Diagnósticos de Entrada', icon: CursorPointer01Icon },
      { value: 'workshop-logs', label: 'Bitácoras Técnicas', icon: Layers01Icon },
    ]
  },
  {
    label: 'Ventas & Facturación',
    children: [
      { value: 'sales-pos', label: 'Punto de Venta (POS)', icon: ShoppingBag01Icon },
      { value: 'sales-history', label: 'Historial de Ventas', icon: ShoppingBag01Icon },
      { value: 'sales-payments', label: 'Medios de Pago', icon: Layers01Icon }
    ]
  },
  {
    label: 'Configuración del Sistema',
    children: [
      { value: 'config-general', label: 'Parámetros Globales', icon: Settings02Icon, route: '/admin/configuracion' },
      { value: 'config-zones', label: 'Zonas de Cobertura', icon: Layers01Icon, route: '/admin/zonas-cobertura' },
      { value: 'config-notifications', label: 'Notificaciones & Correo', icon: Notification03Icon, route: '/admin/configuracion' },
      { value: 'config-audit', label: 'Auditoría & Logs', icon: Layers01Icon, route: '/admin/configuracion' }
    ]
  }
];

// ==============================================================================
// MENÚ DE NAVEGACIÓN PARA CLIENTES (Portal Personal)
// ==============================================================================
export const CLIENT_MENU_ITEMS = [
  {
    label: 'Catálogo & Tienda',
    children: [
      { value: 'client-store', label: 'Explorar Tienda', icon: ShoppingBag01Icon, route: '/tienda' }
    ]
  },
  {
    label: 'Mis Dispositivos',
    children: [
      { value: 'client-devices-list', label: 'Mis Dispositivos', icon: SmartPhone01Icon, route: '/cliente/dispositivos' }
    ]
  },
  {
    label: 'Servicios Técnicos',
    children: [
      { value: 'client-repairs', label: 'Estado de Reparaciones', icon: Settings02Icon, route: '/tienda' }
    ]
  }
];

// ==============================================================================
// MENÚ DE NAVEGACIÓN PARA TÉCNICOS (Taller)
// Opciones Maestras en Acordeón con estructura estricta y rutas jerárquicas
// ==============================================================================
export const TECH_MENU_ITEMS = [
  {
    label: '📱 Dispositivos',
    children: [
      {
        value: 'tech-repairs-new',
        label: 'Nueva Reparación',
        icon: PlusSignCircleIcon,
        route: '/tecnico/dispositivos/nueva-reparacion'
      },
      {
        value: 'tech-repairs-ongoing',
        label: 'Reparaciones en curso',
        icon: Clock01Icon,
        route: '/tecnico/dispositivos/en-curso'
      },
      {
        value: 'tech-repairs-finished',
        label: 'Reparaciones finalizadas',
        icon: CheckmarkCircle01Icon,
        route: '/tecnico/dispositivos/finalizadas'
      }
    ]
  },
  {
    label: '💰 Caja',
    children: [
      {
        value: 'tech-cash-purchase',
        label: 'Registrar compra',
        icon: Coins01Icon,
        route: '/tecnico/caja/registrar-compra'
      },
      {
        value: 'tech-cash-receive-device',
        label: 'Recepcionar dispositivo',
        icon: SmartPhone01Icon,
        route: '/tecnico/caja/recepcionar-dispositivo'
      }
    ]
  },
  {
    label: '📦 Insumos',
    children: [
      {
        value: 'tech-supplies-receive',
        label: 'Recepcionar compra',
        icon: PackageReceiveIcon,
        route: '/tecnico/insumos/recepcionar-compra'
      }
    ]
  },
  {
    label: '⚡ Taller & Tareas',
    children: [
      {
        value: 'tech-tasks',
        label: 'Resumen y Tareas del Día',
        icon: Settings02Icon,
        route: '/tareas-tecnico'
      }
    ]
  }
];

export default function AdminSidebar({
  activeMenu,
  onSelectMenu,
  onNavigate,
  role: roleProp
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Determinar rol efectivo: prop role o el del usuario autenticado
  const effectiveRole = normalizeRole(roleProp || user?.rol);

  let items = ADMIN_MENU_ITEMS;
  let badgeLabel = 'Admin ERP';
  let badgeColor = 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  let sectionTitle = 'Módulos del Sistema';
  let accentColor = '#8B5CF6';
  let lineColor = '#334155';

  if (effectiveRole === 'cliente') {
    items = CLIENT_MENU_ITEMS;
    badgeLabel = 'Portal Clientes';
    badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    sectionTitle = 'Mi Cuenta & Servicios';
    accentColor = '#06B6D4';
    lineColor = '#334155';
  } else if (effectiveRole === 'tecnico') {
    items = TECH_MENU_ITEMS;
    badgeLabel = 'Taller Técnico';
    badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    sectionTitle = 'Gestión de Taller';
    // Cyber-Tech: enlace activo en Turquesa Neón (#06B6D4) y línea jerárquica en Púrpura Eléctrico (#8B5CF6)
    accentColor = '#06B6D4';
    lineColor = '#8B5CF6';
  }

  // Identificar el ítem correspondiente a la ruta actual para el resaltado automático
  const itemMatchByRoute = items
    .flatMap((sec) => sec.children || [])
    .find(
      (kid) =>
        kid.route &&
        (location.pathname === kid.route ||
          (kid.route !== '/admin/dashboard' &&
            kid.route !== '/tienda' &&
            kid.route !== '/tareas-tecnico' &&
            location.pathname.startsWith(kid.route)))
    );

  const effectiveActiveMenu =
    activeMenu || itemMatchByRoute?.value || items[0]?.children?.[0]?.value || 'overview';

  const handleSelect = (val, item) => {
    // 1. Si el ítem tiene una ruta explícita y es diferente a la ruta actual, navegar directamente
    if (item?.route && item.route !== location.pathname) {
      navigate(item.route);
      return;
    }

    // 2. Si el contenedor padre maneja la selección interna (ej. tabs o secciones en la misma página)
    if (onSelectMenu) {
      onSelectMenu(val, item);
      return;
    }

    if (onNavigate) {
      onNavigate(val, item);
      return;
    }

    // 3. Fallbacks si no había handler padre
    if (item?.route) {
      navigate(item.route);
      return;
    }

    if (val === 'client-devices-new' || val === 'tech-register-device' || val === 'admin-register-device') {
      navigate('/cliente/dispositivos/nuevo');
      return;
    }

    if (val === 'config-general' || val === 'config-notifications' || val === 'config-audit') {
      navigate('/admin/configuracion');
    } else if (val === 'config-zones') {
      navigate('/admin/zonas-cobertura');
    } else if (val === 'admin-inventory' || val === 'catalog-products' || val === 'catalog-categories' || val === 'inventory-stock') {
      navigate('/admin/inventario');
    } else if (val === 'catalog-marcas') {
      navigate('/admin/catalogos/marcas');
    } else if (val === 'catalog-modelos') {
      navigate('/admin/catalogos/modelos');
    } else if (val === 'catalog-tipos-dispositivo') {
      navigate('/admin/catalogos/tipos-dispositivo');
    } else if (val === 'catalog-categorias-producto') {
      navigate('/admin/catalogos/categorias-producto');
    } else if (val === 'catalog-categorias-reparacion') {
      navigate('/admin/catalogos/categorias-reparacion');
    } else {
      if (effectiveRole === 'cliente') {
        navigate('/tienda');
      } else if (effectiveRole === 'tecnico') {
        navigate('/tareas-tecnico');
      } else {
        navigate('/admin/dashboard', { state: { activeMenu: val } });
      }
    }
  };

  // Expandir automáticamente la categoría padre que contenga la opción o ruta activa
  const activeSectionIndex = items.findIndex((section) =>
    section.children?.some(
      (kid) =>
        kid.value === effectiveActiveMenu ||
        (kid.route &&
          (location.pathname === kid.route ||
            (kid.route !== '/admin/dashboard' &&
              kid.route !== '/tienda' &&
              kid.route !== '/tareas-tecnico' &&
              location.pathname.startsWith(kid.route))))
    )
  );
  const defaultOpenIndices = activeSectionIndex >= 0 ? [activeSectionIndex] : [0];

  return (
    <aside className="w-full md:w-72 bg-[#1E293B] border-r border-slate-700/80 flex flex-col shrink-0 md:sticky md:top-0 md:h-screen z-40">
      
      {/* Cabecera del Sidebar: Logo IFixPos */}
      <div className="p-5 border-b border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={logoEmpresa}
            alt="Logo IFixPos"
            className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(6,182,212,0.4)]"
          />
          <div>
            <span className="font-extrabold text-lg tracking-tight text-white">
              IFix<span className="text-[#06B6D4]">Pos</span>
            </span>
            <span className={`text-[10px] ml-2 px-1.5 py-0.5 rounded-full border uppercase font-mono tracking-wider font-semibold ${badgeColor}`}>
              {badgeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Navegación Vertical con BranchedMenu */}
      <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 px-3 mb-2 font-semibold">
          {sectionTitle}
        </p>

        <BranchedMenu
          items={items}
          defaultOpen={defaultOpenIndices}
          defaultActive={effectiveActiveMenu}
          onSelect={handleSelect}
          color="#94A3B8"
          accentColor={accentColor}
          lineColor={lineColor}
          width={260}
          rowHeight={38}
          indent={36}
          trunk={12}
          radius={10}
          lineWidth={1.5}
          fontSize={13.5}
          drawDuration={360}
          foldDuration={300}
        />
      </div>
    </aside>
  );
}
