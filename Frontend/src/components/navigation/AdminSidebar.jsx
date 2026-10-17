import { useNavigate } from 'react-router-dom';
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
  SmartPhone01Icon
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
      { value: 'catalog-products', label: 'Productos & Repuestos', icon: PackageIcon },
      { value: 'catalog-categories', label: 'Categorías y Familias', icon: Layers01Icon },
      { value: 'inventory-stock', label: 'Control de Stock', icon: PackageIcon }
    ]
  },
  {
    label: 'Taller & Reparaciones',
    children: [
      { value: 'workshop-orders', label: 'Órdenes de Reparación', icon: Settings02Icon },
      { value: 'workshop-diagnostics', label: 'Diagnósticos de Entrada', icon: CursorPointer01Icon },
      { value: 'workshop-logs', label: 'Bitácoras Técnicas', icon: Layers01Icon },
      { value: 'admin-register-device', label: 'Empadronar Dispositivo', icon: SmartPhone01Icon, route: '/cliente/dispositivos/nuevo' }
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
      { value: 'client-devices-new', label: 'Registrar Dispositivo', icon: SmartPhone01Icon, route: '/cliente/dispositivos/nuevo' },
      { value: 'client-devices-list', label: 'Mis Equipos Registrados', icon: PackageIcon, route: '/tienda' }
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
// ==============================================================================
export const TECH_MENU_ITEMS = [
  {
    label: 'Taller & Diagnósticos',
    children: [
      { value: 'tech-tasks', label: 'Tareas y Reparaciones', icon: Settings02Icon, route: '/tareas-tecnico' },
      { value: 'tech-register-device', label: 'Empadronar Dispositivo', icon: SmartPhone01Icon, route: '/cliente/dispositivos/nuevo' }
    ]
  }
];

export default function AdminSidebar({
  activeMenu = 'overview',
  onSelectMenu,
  role: roleProp
}) {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Determinar rol efectivo: prop role o el del usuario autenticado
  const effectiveRole = normalizeRole(roleProp || user?.rol);

  let items = ADMIN_MENU_ITEMS;
  let badgeLabel = 'Admin ERP';
  let badgeColor = 'bg-violet-500/10 text-violet-400 border-violet-500/30';
  let sectionTitle = 'Módulos del Sistema';

  if (effectiveRole === 'cliente') {
    items = CLIENT_MENU_ITEMS;
    badgeLabel = 'Portal Clientes';
    badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    sectionTitle = 'Mi Cuenta & Servicios';
  } else if (effectiveRole === 'tecnico') {
    items = TECH_MENU_ITEMS;
    badgeLabel = 'Taller Técnico';
    badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    sectionTitle = 'Gestión de Taller';
  }

  const handleSelect = (val, item) => {
    if (onSelectMenu) {
      onSelectMenu(val, item);
      return;
    }

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

  // Todas las secciones colapsadas por defecto según preferencia de UX
  const defaultOpenIndices = [];

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
          defaultActive={activeMenu}
          onSelect={handleSelect}
          color="#94A3B8"
          accentColor={effectiveRole === 'cliente' ? '#06B6D4' : '#8B5CF6'}
          lineColor="#334155"
          width={260}
          rowHeight={38}
          indent={36}
          trunk={12}
          radius={10}
          lineWidth={1.5}
          fontSize={13.5}
          drawDuration={360}
          foldDuration={260}
        />
      </div>
    </aside>
  );
}
