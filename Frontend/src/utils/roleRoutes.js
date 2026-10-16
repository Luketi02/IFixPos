/**
 * Utilidades para normalización de roles y enrutamiento dinámico en IFixPos.
 */

export const normalizeRole = (role) => {
  if (!role || typeof role !== 'string') return 'cliente';
  
  // Normalizar removiendo tildes y pasando a minúsculas
  const clean = role
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (clean.includes('admin')) {
    return 'admin';
  }
  if (clean.includes('tecnic')) {
    return 'tecnico';
  }
  return 'cliente';
};

/**
 * Devuelve la ruta principal (Dashboard) asignada al rol del usuario.
 */
export const getDashboardPath = (role) => {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case 'admin':
      return '/admin/dashboard';
    case 'tecnico':
      return '/tareas-tecnico';
    case 'cliente':
    default:
      return '/tienda';
  }
};

/**
 * Formatea el saludo del cliente con la inicial del apellido seguida del nombre y el emoticón ^-^
 * Ejemplo: Lucas Miño -> "M. Lucas ^-^"
 */
export const formatearSaludoCliente = (user) => {
  const nombre = user?.nombre?.trim() || '';
  const apellido = user?.apellido?.trim() || '';

  if (apellido && nombre) {
    const inicialApellido = apellido.charAt(0).toUpperCase();
    return `${inicialApellido}. ${nombre} ^-^`;
  }
  if (nombre) {
    return `${nombre} ^-^`;
  }
  const emailPrefix = user?.email?.split('@')[0] || 'Cliente';
  return `${emailPrefix} ^-^`;
};

/**
 * Formatea el nombre con la inicial del apellido si está disponible.
 * Ejemplo: Lucas Miño -> "M. Lucas"
 */
export const formatearNombreConInicial = (user, fallback = 'Usuario') => {
  const nombre = user?.nombre?.trim() || '';
  const apellido = user?.apellido?.trim() || '';

  if (apellido && nombre) {
    const inicialApellido = apellido.charAt(0).toUpperCase();
    return `${inicialApellido}. ${nombre}`;
  }
  if (nombre) {
    return nombre;
  }
  return user?.email?.split('@')[0] || fallback;
};

