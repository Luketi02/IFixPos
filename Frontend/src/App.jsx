import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/routes/ProtectedRoute';
import OnboardingGuard from './components/routes/OnboardingGuard';
import PublicRoute from './components/routes/PublicRoute';
import RoleRoute from './components/routes/RoleRoute';
import DashboardRedirect from './components/routes/DashboardRedirect';

import LoginScreen from './pages/auth/LoginScreen';
import RegisterScreen from './pages/auth/RegisterScreen';
import RecoverPasswordScreen from './pages/auth/RecoverPasswordScreen';
import CompleteProfileScreen from './pages/auth/CompleteProfileScreen';
import EditProfileScreen from './pages/auth/EditProfileScreen';
import UserAddressesScreen from './pages/profile/UserAddressesScreen';

import ClientStoreScreen from './pages/dashboards/ClientStoreScreen';
import TechnicianTasksScreen from './pages/dashboards/TechnicianTasksScreen';
import TechnicianModuleScreen from './pages/dashboards/TechnicianModuleScreen';
import AdminDashboardScreen from './pages/dashboards/AdminDashboardScreen';
import AdminConfigScreen from './pages/admin/AdminConfigScreen';
import CoverageZonesScreen from './pages/admin/CoverageZonesScreen';
import AdminInventoryScreen from './pages/admin/AdminInventoryScreen';
import AdminRepairsScreen from './pages/admin/AdminRepairsScreen';
import MarcasScreen from './pages/admin/catalogs/MarcasScreen';
import ModelosScreen from './pages/admin/catalogs/ModelosScreen';
import TiposDispositivoScreen from './pages/admin/catalogs/TiposDispositivoScreen';
import CategoriasProductoScreen from './pages/admin/catalogs/CategoriasProductoScreen';
import CategoriasReparacionScreen from './pages/admin/catalogs/CategoriasReparacionScreen';
import RegisterDeviceScreen from './pages/client/RegisterDeviceScreen';
import MisDispositivos from './pages/client/MisDispositivos';
import DispositivoDetalle from './pages/client/DispositivoDetalle';
import ReparacionDetalle from './pages/client/ReparacionDetalle';
import SessionExpiredModal from './components/auth/SessionExpiredModal';
import { instalarInterceptorSesion } from './utils/sesionExpirada';

// Interceptor global de axios: token inválido/expirado -> modal de sesión expirada
instalarInterceptorSesion();

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH2_CLIENT_ID || '';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Router>
          <SessionExpiredModal />
          <Routes>
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

            {/* Rutas Protegidas: Requiere autenticación Y perfil 100% completo */}
            <Route element={<ProtectedRoute />}>
              {/* Redirección dinámica desde la raíz hacia el dashboard según el rol */}
              <Route path="/" element={<DashboardRedirect />} />

              {/* Vista de Cliente (/tienda) */}
              <Route path="/tienda" element={<ClientStoreScreen />} />

              {/* Dispositivos y Reparaciones del Cliente */}
              <Route path="/cliente/dispositivos" element={<MisDispositivos />} />
              <Route path="/cliente/dispositivos/nuevo" element={<RegisterDeviceScreen />} />
              <Route path="/cliente/dispositivos/:id_dispositivo" element={<DispositivoDetalle />} />
              <Route path="/cliente/reparaciones/:id_reparacion" element={<ReparacionDetalle />} />

              {/* Vistas y Módulos de Técnico: Técnicos y Administradores */}
              <Route element={<RoleRoute allowedRoles={['tecnico', 'admin']} />}>
                <Route path="/tareas-tecnico" element={<TechnicianTasksScreen />} />
                <Route path="/tecnico/dispositivos/nueva-reparacion" element={<TechnicianModuleScreen forcedModule="nueva-reparacion" />} />
                <Route path="/tecnico/dispositivos/en-curso" element={<TechnicianModuleScreen forcedModule="en-curso" />} />
                <Route path="/tecnico/dispositivos/finalizadas" element={<TechnicianModuleScreen forcedModule="finalizadas" />} />
                <Route path="/tecnico/caja/registrar-compra" element={<TechnicianModuleScreen forcedModule="registrar-compra" />} />
                <Route path="/tecnico/caja/recepcionar-dispositivo" element={<TechnicianModuleScreen forcedModule="recepcionar-dispositivo" />} />
                <Route path="/tecnico/insumos/recepcionar-compra" element={<TechnicianModuleScreen forcedModule="recepcionar-compra" />} />
              </Route>

              {/* Vistas de Administrador: Exclusivo Administradores */}
              <Route element={<RoleRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboardScreen />} />
                <Route path="/admin/configuracion" element={<AdminConfigScreen />} />
                <Route path="/admin/zonas-cobertura" element={<CoverageZonesScreen />} />
                <Route path="/admin/inventario" element={<AdminInventoryScreen />} />
                <Route path="/admin/reparaciones" element={<AdminRepairsScreen />} />
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
            </Route>

            {/* Ruta comodín / fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}

export default App;