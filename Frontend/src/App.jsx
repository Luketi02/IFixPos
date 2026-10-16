import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/routes/ProtectedRoute';
import OnboardingGuard from './components/routes/OnboardingGuard';
import PublicRoute from './components/routes/PublicRoute';
import LoginScreen from './pages/auth/LoginScreen';
import RegisterScreen from './pages/auth/RegisterScreen';
import RecoverPasswordScreen from './pages/auth/RecoverPasswordScreen';
import CompleteProfileScreen from './pages/auth/CompleteProfileScreen';
import DashboardScreen from './pages/dashboard/DashboardScreen';

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

            {/* Ruta de Onboarding: Solo para autenticados pero incompletos (Blindaje Anti-Fugas) */}
            <Route element={<OnboardingGuard />}>
              <Route path="/completar-perfil" element={<CompleteProfileScreen />} />
            </Route>

            {/* Rutas Protegidas: Requiere autenticación Y perfil 100% completo */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<DashboardScreen />} />
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