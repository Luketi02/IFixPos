import { useState, isValidElement } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import { normalizeRole } from '../../utils/roleRoutes';
import BranchedMenu from './BranchedMenu';
import logoEmpresa from '../../assets/img/itemLogoVentana.png';
import { HugeiconsIcon } from '@hugeicons/react';
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

const renderIcon = (icon) => {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  return <HugeiconsIcon icon={icon} size={15} strokeWidth={1.8} />;
};

// ==============================================================================
// MENÚ DE NAVEGACIÓN PARA ADMINISTRADORES
// ==============================================================================
export const ADMIN_MENU_ITEMS = [
  {
    label: 'Inicio & Métricas',
    children: [
      { value: 'overview', label: 'Panel Principal', icon: Home01Icon, route: '/admin/dashboard' }
    ]
  },
  {
    label: 'Gestión de Roles',
    children: [
      { value: 'admin-users', label: 'Usuarios', icon: UserGroupIcon, route: '/admin/usuarios' },
      { value: 'admin-roles', label: 'Roles', icon: Layers01Icon, route: '/admin/roles' }
    ]
  },
  {
    label: 'Compras & Abastecimiento',
    children: [
      { value: 'purchases-suppliers', label: 'Gestión de Proveedores', icon: PackageReceiveIcon, route: '/admin/proveedores' },
      { value: 'purchases-direct', label: 'Recepción de Compras', icon: ShoppingBag01Icon, route: '/admin/recepcion-compras' }
    ]
  },
  {
    label: 'Catálogo & Inventario',
    children: [
      { value: 'admin-inventory', label: 'Catálogo e Inventario', icon: PackageIcon, route: '/admin/inventario' }
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
      { value: 'admin-repairs', label: 'Reparaciones', icon: Settings02Icon, route: '/admin/reparaciones' }
    ]
  },
  {
    label: 'Ventas & Facturación',
    children: [
      { value: 'sales-payments', label: 'Medios de Pago', icon: Layers01Icon, route: '/admin/medios-pago' }
    ]
  },
  {
    label: 'Configuración del Sistema',
    children: [
      { value: 'config-general', label: 'Parámetros Globales', icon: Settings02Icon, route: '/admin/configuracion' },
      { value: 'config-zones', label: 'Zonas de Cobertura', icon: Layers01Icon, route: '/admin/zonas-cobertura' }
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
      }
    ]
  },
  {
    label: '💰 Caja',
    children: [
      {
        value: 'tech-cash-charges',
        label: 'Cobrar Operación',
        icon: Coins01Icon,
        route: '/tecnico/caja/cobros'
      },
      {
        value: 'tech-cash-receive-device',
        label: 'Recepcionar dispositivo',
        icon: SmartPhone01Icon,
        route: '/tecnico/caja/recepcionar-dispositivo'
      },
      {
        value: 'tech-cash-deliver-device',
        label: 'Entregar Dispositivo',
        icon: CheckmarkCircle01Icon,
        route: '/tecnico/caja/entregar-dispositivo'
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
    } else if (val === 'admin-repairs') {
      navigate('/admin/reparaciones');
    } else if (val === 'sales-payments') {
      navigate('/admin/medios-pago');
    } else if (val === 'admin-users') {
      navigate('/admin/usuarios');
    } else if (val === 'admin-roles') {
      navigate('/admin/roles');
    } else if (val === 'purchases-suppliers') {
      navigate('/admin/proveedores');
    } else {
      if (effectiveRole === 'cliente') {
        navigate('/tienda');
      } else if (effectiveRole === 'tecnico') {
        navigate('/tecnico/dispositivos/en-curso');
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

  // Estado para colapsar y retraer categorías en modo móvil (ej. Caja ▽)
  const [categoriaAbiertaMovil, setCategoriaAbiertaMovil] = useState(null);

  const handleToggleCategoriaMovil = (label) => {
    setCategoriaAbiertaMovil((prev) => (prev === label ? null : label));
  };

  return (
    <>
      {/* ================================================================= */}
      {/* 1. MODO RESPONSIVE: BARRA DE NAVEGACIÓN SUPERIOR (< md)          */}
      {/* ================================================================= */}
      <div className="block md:hidden bg-[#1E293B] border-b border-slate-700/80 sticky top-0 z-40 w-full shadow-lg shadow-slate-950/20">
        
        {/* Cabecera Móvil: Logo y Rol */}
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <img
              src={logoEmpresa}
              alt="Logo IFixPos"
              className="w-7 h-7 object-contain drop-shadow-[0_2px_8px_rgba(6,182,212,0.4)]"
            />
            <span className="font-extrabold text-base tracking-tight text-white">
              IFix<span className="text-[#06B6D4]">Pos</span>
            </span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border uppercase font-mono tracking-wider font-semibold ${badgeColor}`}>
              {badgeLabel}
            </span>
          </div>

          {/* Indicador de opción activa actual */}
          <span className="text-[11px] text-cyan-400 font-mono truncate max-w-[150px] font-medium">
            {itemMatchByRoute?.label || 'Panel'}
          </span>
        </div>

        {/* Barra de Opciones / Categorías (Estilo: Caja ▽) */}
        <div className="px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
          {items.map((cat) => {
            const hasKids = Boolean(cat.children && cat.children.length > 0);
            const isOpen = categoriaAbiertaMovil === cat.label;
            const containsActive = cat.children?.some(
              (kid) =>
                kid.value === effectiveActiveMenu ||
                (kid.route && location.pathname.startsWith(kid.route))
            );

            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => {
                  if (hasKids) {
                    handleToggleCategoriaMovil(cat.label);
                  } else {
                    handleSelect(cat.value ?? cat.label, cat);
                    setCategoriaAbiertaMovil(null);
                  }
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                  isOpen
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400 shadow-md shadow-cyan-950/30'
                    : containsActive
                    ? 'bg-slate-800 text-white border-cyan-500/50 shadow-sm'
                    : 'bg-slate-800/60 text-slate-300 hover:text-white border-slate-700/70 hover:border-slate-600'
                }`}
              >
                <span>{cat.label}</span>
                {hasKids && (
                  <span
                    className={`text-[10px] font-bold transition-transform duration-200 ${
                      isOpen ? 'rotate-180 text-cyan-400' : 'text-slate-400'
                    }`}
                  >
                    ▽
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Panel Desplegable de Subopciones de la Categoría Seleccionada */}
        {categoriaAbiertaMovil && (
          <div className="px-3 pb-3 pt-1 border-t border-slate-700/40 bg-slate-900/95 backdrop-blur-md space-y-1 animate-fadeIn">
            <div className="flex items-center justify-between px-1 py-1 text-[11px] font-mono uppercase text-slate-400 border-b border-slate-800/80 mb-1">
              <span>Opciones de {categoriaAbiertaMovil}</span>
              <button
                type="button"
                onClick={() => setCategoriaAbiertaMovil(null)}
                className="text-cyan-400 hover:text-cyan-300 text-[10px] font-bold tracking-wide"
              >
                ▲ Retraer
              </button>
            </div>

            <div className="grid grid-cols-1 gap-1 max-h-60 overflow-y-auto pr-1">
              {items
                .find((cat) => cat.label === categoriaAbiertaMovil)
                ?.children?.map((kid) => {
                  const isKidActive =
                    kid.value === effectiveActiveMenu ||
                    (kid.route && location.pathname.startsWith(kid.route));
                  return (
                    <button
                      key={kid.value}
                      type="button"
                      onClick={() => {
                        handleSelect(kid.value, kid);
                        setCategoriaAbiertaMovil(null);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs text-left transition-all ${
                        isKidActive
                          ? 'bg-gradient-to-r from-cyan-500/20 to-purple-500/10 text-cyan-300 font-bold border-l-2 border-cyan-400 shadow-sm'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {kid.icon && (
                        <span className={`shrink-0 ${isKidActive ? 'text-cyan-400' : 'text-slate-400'}`}>
                          {renderIcon(kid.icon)}
                        </span>
                      )}
                      <span className="truncate">{kid.label}</span>
                      {isKidActive && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_#06B6D4]" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================= */}
      {/* 2. MODO DESKTOP: SIDEBAR LATERAL CLÁSICO CON BRANCHED MENU (>= md)*/}
      {/* ================================================================= */}
      <aside className="hidden md:flex w-72 bg-[#1E293B] border-r border-slate-700/80 flex-col shrink-0 sticky top-0 h-screen z-40">
        
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
    </>
  );
}
