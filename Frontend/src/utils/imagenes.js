const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/** Convierte la ruta relativa de imagen del backend en una URL absoluta. */
export const resolverUrlImagen = (url) => {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};
