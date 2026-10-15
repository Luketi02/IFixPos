import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../context/useAuth';

/**
 * Guardia para rutas protegidas del sistema (ej: Dashboard).
 * - Si no está autenticado -> redirige a /login.
 * - Si está autenticado pero su perfil está incompleto -> redirige a /completar-perfil.
 * - Si está autenticado y con perfil completo -> permite el acceso.
 */
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isProfileComplete, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center text-slate-200">
        <div className="w-12 h-12 border-4 border-cyan-500/20 border-t-cyan-400 rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400 tracking-wider uppercase font-mono">Verificando credenciales...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isProfileComplete) {
    return <Navigate to="/completar-perfil" replace />;
  }

  return children ? children : <Outlet />;
};

export default ProtectedRoute;
