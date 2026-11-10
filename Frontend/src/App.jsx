import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/routes/ProtectedRoute';
import OnboardingGuard from './components/routes/OnboardingGuard';
import PublicRoute from './components/routes/PublicRoute';
import RoleRoute from './components/routes/RoleRoute';
import SessionExpiredModal from './components/auth/SessionExpiredModal';
import AccountConflictModal from './components/auth/AccountConflictModal';
import { instalarInterceptorSesion } from './utils/sesionExpirada';
import { useTituloPagina } from './hooks/useTituloPagina';

// =============================================================================
// CARGA DIFERIDA POR RUTA (CODE SPLITTING - FASE 2 F6)
// =============================================================================
const WelcomeHomeScreen = lazy(() => import('./pages/home/WelcomeHomeScreen'));

// Autenticación y Perfil
const LoginScreen = lazy(() => import('./pages/auth/LoginScreen'));
const RegisterScreen = lazy(() => import('./pages/auth/RegisterScreen'));
const RecoverPasswordScreen = lazy(() => import('./pages/auth/RecoverPasswordScreen'));
const CompleteProfileScreen = lazy(() => import('./pages/auth/CompleteProfileScreen'));
const EditProfileScreen = lazy(() => import('./pages/auth/EditProfileScreen'));
const UserAddressesScreen = lazy(() => import('./pages/profile/UserAddressesScreen'));
const UserPreferencesScreen = lazy(() => import('./pages/profile/UserPreferencesScreen'));

// Tienda, Portal Público y Cliente
const ClientStoreScreen = lazy(() => import('./pages/dashboards/ClientStoreScreen'));
const TerminosCondicionesScreen = lazy(() => import('./pages/public/TerminosCondicionesScreen'));
const PortalProveedorCotizarScreen = lazy(() => import('./pages/portal/PortalProveedorCotizarScreen'));
const RegisterDeviceScreen = lazy(() => import('./pages/client/RegisterDeviceScreen'));
const MisDispositivos = lazy(() => import('./pages/client/MisDispositivos'));
const DispositivoDetalle = lazy(() => import('./pages/client/DispositivoDetalle'));
const ReparacionDetalle = lazy(() => import('./pages/client/ReparacionDetalle'));

// Módulos de Técnico y Caja
const TechnicianTasksScreen = lazy(() => import('./pages/dashboards/TechnicianTasksScreen'));
const TechnicianModuleScreen = lazy(() => import('./pages/dashboards/TechnicianModuleScreen'));
const TecnicoReparacionDetalle = lazy(() => import('./pages/technician/TecnicoReparacionDetalle'));
const VentaPresencialScreen = lazy(() => import('./pages/sales/VentaPresencialScreen'));

// Panel de Administración y Abastecimiento
const AdminDashboardScreen = lazy(() => import('./pages/dashboards/AdminDashboardScreen'));
const AdminConfigScreen = lazy(() => import('./pages/admin/AdminConfigScreen'));
const CoverageZonesScreen = lazy(() => import('./pages/admin/CoverageZonesScreen'));
const AdminInventoryScreen = lazy(() => import('./pages/admin/AdminInventoryScreen'));
const AdminRepairsScreen = lazy(() => import('./pages/admin/AdminRepairsScreen'));
const MediosPagoScreen = lazy(() => import('./pages/admin/MediosPagoScreen'));
const AdminUsersScreen = lazy(() => import('./pages/admin/AdminUsersScreen'));
const AdminRolesScreen = lazy(() => import('./pages/admin/AdminRolesScreen'));
const AdminSuppliersScreen = lazy(() => import('./pages/admin/AdminSuppliersScreen'));
const AdminDirectPurchasesScreen = lazy(() => import('./pages/admin/AdminDirectPurchasesScreen'));
const AdminQuotationsScreen = lazy(() => import('./pages/admin/AdminQuotationsScreen'));
const AdminManageQuotationsScreen = lazy(() => import('./pages/admin/AdminManageQuotationsScreen'));
const AdminPurchaseOrdersScreen = lazy(() => import('./pages/admin/AdminPurchaseOrdersScreen'));
const AdminBenefitsScreen = lazy(() => import('./pages/admin/AdminBenefitsScreen'));
const AdminAuditLogsScreen = lazy(() => import('./pages/admin/AdminAuditLogsScreen'));
const AdminBackupsScreen = lazy(() => import('./pages/admin/AdminBackupsScreen'));

// Métricas y Reportes Gerenciales
const AdminConversionReportScreen = lazy(() => import('./pages/admin/metrics/AdminConversionReportScreen'));
const AdminEfficiencyReportScreen = lazy(() => import('./pages/admin/metrics/AdminEfficiencyReportScreen'));
const AdminProductivityReportScreen = lazy(() => import('./pages/admin/metrics/AdminProductivityReportScreen'));
const AdminLogisticsReportScreen = lazy(() => import('./pages/admin/metrics/AdminLogisticsReportScreen'));
const AdminSatisfactionReportScreen = lazy(() => import('./pages/admin/metrics/AdminSatisfactionReportScreen'));

// Catálogos y Taxonomías Base
const MarcasScreen = lazy(() => import('./pages/admin/catalogs/MarcasScreen'));
const ModelosScreen = lazy(() => import('./pages/admin/catalogs/ModelosScreen'));
const TiposDispositivoScreen = lazy(() => import('./pages/admin/catalogs/TiposDispositivoScreen'));
const CategoriasProductoScreen = lazy(() => import('./pages/admin/catalogs/CategoriasProductoScreen'));
const CategoriasReparacionScreen = lazy(() => import('./pages/admin/catalogs/CategoriasReparacionScreen'));

// Interceptor global de axios: token inválido/expirado -> modal de sesión expirada
instalarInterceptorSesion();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH2_CLIENT_ID || '';

/**
 * Fallback visual Cyber-Tech Dark Mode sin saltos de layout (CLS) durante la descarga de chunks.
 */
function CargadorRutaCyberTech() {
  return (
    <div className="min-h-screen w-full bg-[#0F172A] text-slate-200 flex flex-col items-center justify-center p-6 select-none transition-opacity duration-200">
      <div className="bg-[#1E293B]/90 border border-slate-700/80 rounded-2xl px-8 py-6 shadow-2xl flex flex-col items-center gap-3.5">
        <div className="relative w-10 h-10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-[#06B6D4]/25"></div>
          <div className="w-10 h-10 rounded-full border-2 border-[#06B6D4] border-t-transparent animate-spin"></div>
        </div>
        <p className="text-xs font-semibold tracking-wider text-cyan-300 uppercase font-mono">
          Cargando módulo...
        </p>
      </div>
    </div>
  );
}

function SincronizadorTituloRuta() {
  useTituloPagina();
  return null;
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Router>
          <SincronizadorTituloRuta />
          <SessionExpiredModal />
          <AccountConflictModal />
          <Suspense fallback={<CargadorRutaCyberTech />}>
            <Routes>
            {/* Portal Público de Proveedores (Acceso directo seguro vía Token) */}
            <Route path="/portal-proveedor/cotizar" element={<PortalProveedorCotizarScreen />} />
            <Route path="/portal-proveedor/cotizar/:tokenAcceso" element={<PortalProveedorCotizarScreen />} />

            {/* Rutas Públicas: Redirigen si ya existe una sesión activa */}
            <Route element={<PublicRoute />}>
              <Route path="/login" element={<LoginScreen />} />
              <Route path="/register" element={<RegisterScreen />} />
              <Route path="/recuperar-acceso" element={<RecoverPasswordScreen />} />
            </Route>

            {/* Ruta de Onboarding: Solo para autenticados pero con perfil incompleto */}
            <Route element={<OnboardingGuard />}>
              <Route path="/completar-perfil" element={<CompleteProfileScreen />} />
            </Route>

            {/* Rutas Públicas de Bienvenida y Tienda (Acceso libre sin cuenta) */}
            <Route path="/" element={<WelcomeHomeScreen />} />
            <Route path="/tienda" element={<ClientStoreScreen />} />
            <Route path="/terminos" element={<TerminosCondicionesScreen />} />

            {/* Rutas Protegidas: Requiere autenticación Y perfil 100% completo */}
            <Route element={<ProtectedRoute />}>
              {/* Dispositivos y Reparaciones del Cliente */}
              <Route path="/cliente/dispositivos" element={<MisDispositivos />} />
              <Route path="/cliente/dispositivos/nuevo" element={<RegisterDeviceScreen />} />
              <Route path="/cliente/dispositivos/:id_dispositivo" element={<DispositivoDetalle />} />
              <Route path="/cliente/reparaciones/:id_reparacion" element={<ReparacionDetalle />} />

              {/* Vistas y Módulos de Técnico: Técnicos y Administradores */}
              <Route element={<RoleRoute allowedRoles={['tecnico', 'admin']} />}>
                <Route path="/tecnico/dashboard" element={<TechnicianTasksScreen />} />
                <Route path="/tareas-tecnico" element={<TechnicianTasksScreen />} />
                <Route path="/tecnico/dispositivos/nueva-reparacion" element={<TechnicianModuleScreen forcedModule="nueva-reparacion" />} />
                <Route path="/tecnico/dispositivos/en-curso" element={<TechnicianModuleScreen forcedModule="en-curso" />} />
                <Route path="/tecnico/dispositivos/finalizadas" element={<TechnicianModuleScreen forcedModule="finalizadas" />} />
                <Route path="/tecnico/caja/cobros" element={<TechnicianModuleScreen forcedModule="cobros" />} />
                <Route path="/tecnico/caja/venta-presencial" element={<VentaPresencialScreen />} />
                <Route path="/admin/caja/venta-presencial" element={<VentaPresencialScreen />} />
                <Route path="/admin/caja/cobros" element={<TechnicianModuleScreen forcedModule="cobros" />} />
                <Route path="/admin/cobros" element={<TechnicianModuleScreen forcedModule="cobros" />} />
                <Route path="/tecnico/cobros" element={<TechnicianModuleScreen forcedModule="cobros" />} />
                <Route path="/caja/venta-presencial" element={<VentaPresencialScreen />} />
                <Route path="/tecnico/caja/entregar-dispositivo" element={<TechnicianModuleScreen forcedModule="entregar-dispositivo" />} />
                <Route path="/tecnico/caja/registrar-compra" element={<TechnicianModuleScreen forcedModule="registrar-compra" />} />
                <Route path="/tecnico/caja/recepcionar-dispositivo" element={<TechnicianModuleScreen forcedModule="recepcionar-dispositivo" />} />
                <Route path="/tecnico/insumos/recepcionar-compra" element={<TechnicianModuleScreen forcedModule="recepcionar-compra" />} />
                <Route path="/tecnico/reparaciones/:id_reparacion" element={<TecnicoReparacionDetalle />} />
              </Route>


              {/* Vistas de Administrador: Exclusivo Administradores */}
              <Route element={<RoleRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboardScreen />} />
                <Route path="/admin/usuarios" element={<AdminUsersScreen />} />
                <Route path="/admin/roles" element={<AdminRolesScreen />} />
                <Route path="/admin/proveedores" element={<AdminSuppliersScreen />} />
                <Route path="/admin/recepcion-compras" element={<AdminDirectPurchasesScreen />} />
                <Route path="/admin/cotizaciones" element={<AdminQuotationsScreen />} />
                <Route path="/admin/gestionar-cotizaciones" element={<AdminManageQuotationsScreen />} />
                <Route path="/admin/ordenes-compra" element={<AdminPurchaseOrdersScreen />} />
                <Route path="/admin/ordenes-compra/:id_orden" element={<AdminPurchaseOrdersScreen />} />
                <Route path="/admin/configuracion" element={<AdminConfigScreen />} />
                <Route path="/admin/zonas-cobertura" element={<CoverageZonesScreen />} />
                <Route path="/admin/inventario" element={<AdminInventoryScreen />} />
                <Route path="/admin/reparaciones" element={<AdminRepairsScreen />} />
                <Route path="/admin/medios-pago" element={<MediosPagoScreen />} />
                <Route path="/admin/beneficios" element={<AdminBenefitsScreen />} />
                <Route path="/admin/auditoria/beneficios" element={<AdminBenefitsScreen />} />
                <Route path="/admin/auditoria/logs" element={<AdminAuditLogsScreen />} />
                <Route path="/admin/logs" element={<AdminAuditLogsScreen />} />
                <Route path="/admin/auditoria/copias-seguridad" element={<AdminBackupsScreen />} />
                <Route path="/admin/backups" element={<AdminBackupsScreen />} />
                <Route path="/admin/copias-seguridad" element={<AdminBackupsScreen />} />
                {/* Métricas y Análisis (CU-72, CU-73, CU-74, CU-75 & CU-76) */}
                <Route path="/admin/metricas/conversion-presupuestos" element={<AdminConversionReportScreen />} />
                <Route path="/admin/metricas/demanda-eficiencia" element={<AdminEfficiencyReportScreen />} />
                <Route path="/admin/metricas/productividad-tecnica" element={<AdminProductivityReportScreen />} />
                <Route path="/admin/metricas/distribucion-logistica" element={<AdminLogisticsReportScreen />} />
                <Route path="/admin/metricas" element={<Navigate to="/admin/metricas/conversion-presupuestos" replace />} />
                <Route path="/admin/reportes/conversion" element={<AdminConversionReportScreen />} />
                <Route path="/admin/reportes/eficiencia" element={<AdminEfficiencyReportScreen />} />
                <Route path="/admin/reportes/productividad" element={<AdminProductivityReportScreen />} />
                <Route path="/admin/reportes/logistica" element={<AdminLogisticsReportScreen />} />
                <Route path="/admin/metricas/satisfaccion-calidad" element={<AdminSatisfactionReportScreen />} />
                <Route path="/admin/reportes/satisfaccion" element={<AdminSatisfactionReportScreen />} />
                {/* Catálogos y Taxonomías Base */}
                <Route path="/admin/catalogos/marcas" element={<MarcasScreen />} />
                <Route path="/admin/catalogos/modelos" element={<ModelosScreen />} />
                <Route path="/admin/catalogos/tipos-dispositivo" element={<TiposDispositivoScreen />} />
                <Route path="/admin/catalogos/categorias-producto" element={<CategoriasProductoScreen />} />
                <Route path="/admin/catalogos/categorias-reparacion" element={<CategoriasReparacionScreen />} />
              </Route>

              {/* Edición de Perfil (CU-05) y Libreta de Direcciones (CU-47, CU-48, CU-49): Accesible para todo usuario autenticado */}
              <Route path="/editar-perfil" element={<EditProfileScreen />} />
              <Route path="/perfil/direcciones" element={<UserAddressesScreen />} />
              <Route path="/perfil/preferencias" element={<UserPreferencesScreen />} />
            </Route>

            {/* Ruta comodín / fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;