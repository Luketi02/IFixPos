import { API_BASE_URL } from '../config/api';

/**
 * Helper para asociar imágenes temáticas Cyber-Tech de alta fidelidad a cada producto
 * según su categoría y denominación técnica, sin depender de servidores externos (Fase 3 - F5).
 */

/**
 * Genera una ilustración SVG Cyber-Tech embebida (0 ms de carga, funciona 100% offline).
 */
const crearPlaceholderCyberSvg = (etiqueta, subtitulo, colorPrimario = '#06B6D4', colorSecundario = '#8B5CF6', iconoPath = '') => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0F172A"/>
        <stop offset="55%" stop-color="#1E293B"/>
        <stop offset="100%" stop-color="#0F172A"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${colorPrimario}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${colorSecundario}" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="600" height="400" fill="url(#bg)"/>
    <circle cx="490" cy="80" r="140" fill="${colorPrimario}" fill-opacity="0.07"/>
    <circle cx="110" cy="320" r="140" fill="${colorSecundario}" fill-opacity="0.07"/>
    <rect x="235" y="95" width="130" height="130" rx="28" fill="#0F172A" stroke="url(#accent)" stroke-width="2.5"/>
    <g transform="translate(268, 128)" stroke="${colorPrimario}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${iconoPath}
    </g>
    <text x="300" y="272" text-anchor="middle" fill="#F8FAFC" font-family="Lexend, sans-serif" font-weight="700" font-size="20" letter-spacing="1">${etiqueta}</text>
    <text x="300" y="298" text-anchor="middle" fill="#94A3B8" font-family="monospace" font-size="13" letter-spacing="2">${subtitulo}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const PLACEHOLDERS_CATEGORIA = Object.freeze({
  pantalla: crearPlaceholderCyberSvg(
    'MÓDULO DISPLAY / OLED',
    'REPUESTO OFICIAL IFIXPOS',
    '#06B6D4',
    '#38BDF8',
    '<rect x="12" y="4" width="40" height="56" rx="6"/><line x1="26" y1="52" x2="38" y2="52"/>'
  ),
  bateria: crearPlaceholderCyberSvg(
    'BATERÍA DE ALTA DENSIDAD',
    'ENERGÍA & AUTONOMÍA CERTIFICADA',
    '#10B981',
    '#06B6D4',
    '<rect x="6" y="16" width="46" height="32" rx="5"/><line x1="56" y1="26" x2="56" y2="38"/><path d="M32 22L24 32h10l-4 10"/>'
  ),
  accesorio: crearPlaceholderCyberSvg(
    'PROTECCIÓN & ACCESORIOS',
    'LÍNEA CYBER-TECH ORIGINAL',
    '#8B5CF6',
    '#06B6D4',
    '<path d="M32 6l20 8v16c0 14-9 24-20 28-11-4-20-14-20-28V14l20-8z"/>'
  ),
  cargador: crearPlaceholderCyberSvg(
    'CARGA RÁPIDA & CONECTIVIDAD',
    'TRANSMISIÓN ESTABLE DE ENERGÍA',
    '#06B6D4',
    '#8B5CF6',
    '<path d="M22 8v12M42 8v12M14 20h36v12c0 10-8 18-18 18s-18-8-18-18V20zM32 50v10"/>'
  ),
  herramienta: crearPlaceholderCyberSvg(
    'INSTRUMENTAL DE PRECISIÓN',
    'EQUIPAMIENTO DE LABORATORIO',
    '#F59E0B',
    '#06B6D4',
    '<path d="M40 12a12 12 0 0 0-15 15L10 42l8 8 15-15a12 12 0 0 0 15-15l-7 7-5-5 7-7z"/>'
  ),
  hardware: crearPlaceholderCyberSvg(
    'COMPONENTE ELECTRÓNICO',
    'CATÁLOGO TÉCNICO IFIXPOS',
    '#06B6D4',
    '#8B5CF6',
    '<rect x="14" y="14" width="36" height="36" rx="4"/><rect x="24" y="24" width="16" height="16"/><line x1="22" y1="6" x2="22" y2="14"/><line x1="42" y1="6" x2="42" y2="14"/><line x1="22" y1="50" x2="22" y2="58"/><line x1="42" y1="50" x2="42" y2="58"/>'
  )
});

export const PLACEHOLDER_PRODUCTO_DEFAULT = PLACEHOLDERS_CATEGORIA.hardware;

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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(monto) || 0);
};

export const formatearPorcentaje = (valor, decimales = 2) => {
  const num = Number(valor) || 0;
  return `${num.toFixed(decimales)}%`;
};
