import { useNavigate } from 'react-router-dom';
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
  CursorPointer01Icon
} from '@hugeicons/core-free-icons';

export const ADMIN_MENU_ITEMS = [
  {
    label: 'Inicio & Métricas',
    children: [
      { value: 'overview', label: 'Panel Principal', icon: Home01Icon },
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
      { value: 'workshop-logs', label: 'Bitácoras Técnicas', icon: Layers01Icon }
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
      { value: 'config-general', label: 'Parámetros Globales', icon: Settings02Icon },
      { value: 'config-notifications', label: 'Notificaciones & Correo', icon: Notification03Icon },
      { value: 'config-audit', label: 'Auditoría & Logs', icon: Layers01Icon }
    ]
  }
];

export default function AdminSidebar({
  activeMenu = 'overview',
  onSelectMenu
}) {
  const navigate = useNavigate();

  const handleSelect = (val, item) => {
    if (onSelectMenu) {
      onSelectMenu(val, item);
      return;
    }

    if (val === 'config-general' || val === 'config-notifications' || val === 'config-audit') {
      navigate('/admin/configuracion');
    } else {
      navigate('/admin/dashboard', { state: { activeMenu: val } });
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
            className="w-10 h-10 object-contain drop-shadow-[0_2px_10px_rgba(139,92,246,0.4)]"
          />
          <div>
            <span className="font-extrabold text-lg tracking-tight text-white">
              IFix<span className="text-[#06B6D4]">Pos</span>
            </span>
            <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/30 uppercase font-mono tracking-wider font-semibold">
              Admin ERP
            </span>
          </div>
        </div>
      </div>

      {/* Navegación Vertical con BranchedMenu */}
      <div className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
        <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 px-3 mb-2 font-semibold">
          Módulos del Sistema
        </p>

        <BranchedMenu
          items={ADMIN_MENU_ITEMS}
          defaultOpen={defaultOpenIndices}
          defaultActive={activeMenu}
          onSelect={handleSelect}
          color="#94A3B8"
          accentColor="#8B5CF6"
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
