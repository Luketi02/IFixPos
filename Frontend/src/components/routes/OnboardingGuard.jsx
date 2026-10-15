import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../context/useAuth';

/**
 * Guardia anti-fugas para la ruta /completar-perfil.
 * - Si no está autenticado -> redirige a /login.
 * - Si ya tiene su perfil al 100% -> redirige al Dashboard (/) para prevenir sobreescrituras accidentales.
 * - Si está autenticado pero le faltan datos -> concede acceso a la pantalla de onboarding.
 */
const OnboardingGuard = ({ children }) => {
  const { isAuthenticated, isProfileComplete, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-slate-200">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 tracking-wider uppercase font-mono">Cargando perfil...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isProfileComplete) {
    return <Navigate to="/" replace />;
  }

  return children ? children : <Outlet />;
};

export default OnboardingGuard;
