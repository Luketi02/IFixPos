/**
 * Helper para asociar imágenes temáticas Cyber-Tech de alta fidelidad a cada producto
 * según su categoría y denominación técnica.
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const normalizarUrlImagen = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (trimmed.startsWith('/media/') || trimmed.startsWith('/static/')) {
    return `${API_BASE_URL.replace(/\/$/, '')}${trimmed}`;
  }
  return trimmed;
};

export const obtenerImagenProducto = (producto) => {
  if (producto?.imagen_principal && typeof producto.imagen_principal === 'string' && producto.imagen_principal.trim()) {
    return normalizarUrlImagen(producto.imagen_principal);
  }
  if (Array.isArray(producto?.imagenes) && producto.imagenes.length > 0 && typeof producto.imagenes[0] === 'string' && producto.imagenes[0].trim()) {
    return normalizarUrlImagen(producto.imagenes[0]);
  }

  const nombre = (producto?.nombre || '').toLowerCase();
  const cat = (producto?.categoria_nombre || '').toLowerCase();

  if (nombre.includes('pantalla') || nombre.includes('display') || nombre.includes('oled') || cat.includes('pantalla') || cat.includes('display')) {
    return 'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?auto=format&fit=crop&w=600&q=80';
  }
  if (nombre.includes('batería') || nombre.includes('bateria') || cat.includes('batería') || cat.includes('bateria')) {
    return 'https://images.unsplash.com/photo-1619725002198-6a689b72f41d?auto=format&fit=crop&w=600&q=80';
  }
  if (nombre.includes('funda') || nombre.includes('carcasa') || nombre.includes('case') || cat.includes('accesorio') || cat.includes('funda')) {
    return 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?auto=format&fit=crop&w=600&q=80';
  }
  if (nombre.includes('cargador') || nombre.includes('cable') || nombre.includes('usb') || nombre.includes('adaptador') || cat.includes('cargador')) {
    return 'https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=600&q=80';
  }
  if (nombre.includes('herramienta') || cat.includes('herramienta')) {
    return 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80';
  }

  // Hardware electrónico por defecto
  return 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80';
};

export const obtenerGaleriaImagenes = (producto) => {
  if (Array.isArray(producto?.imagenes) && producto.imagenes.length > 0) {
    const validas = producto.imagenes
      .filter((img) => typeof img === 'string' && img.trim())
      .map((img) => normalizarUrlImagen(img));
    if (validas.length > 0) return validas;
  }
  if (producto?.imagen_principal && typeof producto.imagen_principal === 'string' && producto.imagen_principal.trim()) {
    return [normalizarUrlImagen(producto.imagen_principal)];
  }
  return [obtenerImagenProducto(producto)];
};

export const formatearMoneda = (monto) => {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2
  }).format(Number(monto) || 0);
};
