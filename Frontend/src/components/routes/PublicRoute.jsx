import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../context/useAuth';

/**
 * Guardia para rutas públicas (login, registro).
 * Si un usuario ya tiene una sesión iniciada:
 * - Si su perfil está incompleto -> lo envía a /completar-perfil.
 * - Si su perfil está completo -> lo envía al Dashboard (/).
 */
const PublicRoute = ({ children }) => {
  const { isAuthenticated, isProfileComplete, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-slate-200">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 tracking-wider uppercase font-mono">Iniciando aplicación...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return isProfileComplete ? <Navigate to="/" replace /> : <Navigate to="/completar-perfil" replace />;
  }

  return children ? children : <Outlet />;
};

export default PublicRoute;
