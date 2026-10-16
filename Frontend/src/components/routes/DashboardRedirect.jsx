import { Navigate } from 'react-router-dom';
import useAuth from '../../context/useAuth';
import { getDashboardPath } from '../../utils/roleRoutes';

/**
 * Componente que redirige dinámicamente desde la ruta raíz "/"
 * hacia la pantalla principal que le corresponde al usuario según su rol:
 * - Cliente -> /tienda
 * - Técnico -> /tareas-tecnico
 * - Administrador -> /admin/dashboard
 */
export default function DashboardRedirect() {
  const { user } = useAuth();
  const targetPath = getDashboardPath(user?.rol);

  return <Navigate to={targetPath} replace />;
}
