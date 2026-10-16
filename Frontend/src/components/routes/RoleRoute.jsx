import { Navigate, Outlet } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import { normalizeRole, getDashboardPath } from '../../utils/roleRoutes';

/**
 * Guardia de ruta basado en roles (Role-Based Route Guard).
 * - allowedRoles: Array de roles permitidos (ej: ['admin'], ['tecnico', 'admin'], etc.)
 * - Si el rol del usuario no coincide, lo redirige suavemente a su dashboard autorizado.
 */
export default function RoleRoute({ allowedRoles = [], children }) {
  const { user } = useAuth();
  const userRole = normalizeRole(user?.rol);

  const isAllowed = allowedRoles.length === 0 || allowedRoles.some((r) => normalizeRole(r) === userRole);

  if (!isAllowed) {
    const fallbackPath = getDashboardPath(user?.rol);
    return <Navigate to={fallbackPath} replace />;
  }

  return children ? children : <Outlet />;
}
