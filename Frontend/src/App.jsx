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

import ClientStoreScreen from './pages/dashboards/ClientStoreScreen';
import TechnicianTasksScreen from './pages/dashboards/TechnicianTasksScreen';
import AdminDashboardScreen from './pages/dashboards/AdminDashboardScreen';
import AdminConfigScreen from './pages/admin/AdminConfigScreen';
import CoverageZonesScreen from './pages/admin/CoverageZonesScreen';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH2_CLIENT_ID || '';

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <Router>
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

              {/* Vista de Técnico (/tareas-tecnico): Técnicos y Administradores */}
              <Route element={<RoleRoute allowedRoles={['tecnico', 'admin']} />}>
                <Route path="/tareas-tecnico" element={<TechnicianTasksScreen />} />
              </Route>

              {/* Vistas de Administrador: Exclusivo Administradores */}
              <Route element={<RoleRoute allowedRoles={['admin']} />}>
                <Route path="/admin/dashboard" element={<AdminDashboardScreen />} />
                <Route path="/admin/configuracion" element={<AdminConfigScreen />} />
                <Route path="/admin/zonas-cobertura" element={<CoverageZonesScreen />} />
              </Route>

              {/* Edición de Perfil (CU-05): Accesible para todo usuario autenticado */}
              <Route path="/editar-perfil" element={<EditProfileScreen />} />
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