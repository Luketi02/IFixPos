import { API_BASE_URL } from '../config/api';

/**
 * Utilidad de Impresión y Exportación a PDF de Informes Ejecutivos (IFixPos ERP)
 * - Suprime encabezados y pies nativos del navegador (@page { margin: 0mm }) para impedir
 *   que se filtren URLs o rutas internas del sistema (ej. http://localhost:5173/admin/...).
 * - Sanitiza cualquier ruta física o endpoint interno accidental en los textos.
 * - Incorpora encabezado y pie de página institucionales completos con datos fiscales del comercio,
 *   logo oficial, código de trazabilidad, período analizado, filtros aplicados y auditor responsable.
 */

let cacheEmpresaInstitucional = null;
let promesaCargaEmpresa = null;

function cargarConfiguracionInstitucional() {
  if (cacheEmpresaInstitucional) return Promise.resolve(cacheEmpresaInstitucional);
  if (promesaCargaEmpresa) return promesaCargaEmpresa;

  promesaCargaEmpresa = fetch(`${API_BASE_URL}/api/core/configuracion-publica/`, {
    method: 'GET',
    headers: { Accept: 'application/json' }
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && typeof data === 'object') {
        cacheEmpresaInstitucional = data;
      }
      return cacheEmpresaInstitucional;
    })
    .catch(() => null)
    .finally(() => {
      promesaCargaEmpresa = null;
    });

  return promesaCargaEmpresa;
}

// Pre-cargar en segundo plano al importar el módulo
if (typeof window !== 'undefined') {
  cargarConfiguracionInstitucional();
}

/**
 * Elimina rutas de sistema de archivos locales o URLs internas de desarrollo
 * que no deben exponerse jamás en un documento PDF oficial.
 */
function sanitizarTextoSensible(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/file:\/\/\/[^\s"'<>]+/gi, '[Ruta protegida]')
    .replace(/[A-Za-z]:\\(?:[^\\\s"'<>]+\\)+[^\\\s"'<>]*/g, '[Ruta interna omitida]')
    .replace(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/[^\s"'<>)]*/gi, '')
    .replace(/\/api\/[a-z0-9/_-]+/gi, '')
    .trim();
}

/**
 * Obtiene los datos del usuario autenticado (auditor emisor) desde el parámetro
 * o haciendo fallback seguro a la sesión activa en localStorage.
 */
function resolverDatosAuditor(usuarioParam) {
  let u = usuarioParam;
  if (!u || (!u.nombre && !u.email)) {
    try {
      const rawUser = localStorage.getItem('user') || localStorage.getItem('usuario');
      if (rawUser) {
        u = { ...JSON.parse(rawUser), ...(u || {}) };
      }
    } catch {
      // Fallback silencioso
    }
  }

  const nombreCompleto =
    [u?.nombre, u?.apellido].filter(Boolean).join(' ').trim() ||
    u?.nombre_completo ||
    u?.nombre ||
    '';
  const email = u?.email || u?.correo || '';
  const rolRaw =
    u?.rol?.nombre_rol ||
    u?.id_rol?.nombre_rol ||
    (typeof u?.rol === 'string' ? u.rol : '') ||
    'Administrador';

  return {
    nombre: nombreCompleto || email || 'Administrador del Sistema',
    email: email || 'Sin correo especificado',
    rol: rolRaw || 'Administrador'
  };
}

/**
 * Resuelve los datos institucionales del comercio emisor para el encabezado y pie de página.
 */
function resolverDatosEmpresa(empresaParam) {
  const src = { ...(cacheEmpresaInstitucional || {}), ...(empresaParam || {}) };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const nombreLocal =
    src.nombreLocal && src.nombreLocal !== 'S/N'
      ? src.nombreLocal
      : 'IFixPos — Servicio Técnico & Store';

  const cuilLocal =
    src.cuilLocal && src.cuilLocal !== 'S/N' && src.cuilLocal !== '00-00000000-0'
      ? src.cuilLocal
      : '30-71548963-9';

  // Evitar mostrar un ID numérico si direccionLocal aún no fue resuelta
  const dirRaw = String(src.direccionLocal || '').trim();
  const direccionLocal =
    dirRaw && dirRaw !== 'S/N' && !/^\d+$/.test(dirRaw)
      ? dirRaw
      : 'Sede Central Operativa';

  const telefonoLocal =
    src.telefonoLocal && src.telefonoLocal !== 'S/N' ? src.telefonoLocal : '';
  const emailLocal =
    src.emailLocal && src.emailLocal !== 'S/N'
      ? src.emailLocal
      : src.emailSoporte || 'contacto@ifixpos.com';

  let logoUrl = `${origin}/itemLogoVentana.svg`;
  if (src.imagenLocal && typeof src.imagenLocal === 'string' && src.imagenLocal !== 'S/N') {
    if (src.imagenLocal.startsWith('http') || src.imagenLocal.startsWith('data:')) {
      logoUrl = src.imagenLocal;
    } else if (src.imagenLocal.startsWith('/media/')) {
      logoUrl = `${API_BASE_URL}${src.imagenLocal}`;
    } else if (src.imagenLocal.startsWith('/')) {
      logoUrl = `${origin}${src.imagenLocal}`;
    }
  }

  return {
    nombreLocal: sanitizarTextoSensible(nombreLocal),
    cuilLocal: sanitizarTextoSensible(cuilLocal),
    direccionLocal: sanitizarTextoSensible(direccionLocal),
    telefonoLocal: sanitizarTextoSensible(telefonoLocal),
    emailLocal: sanitizarTextoSensible(emailLocal),
    logoUrl
  };
}

export async function exportarInformePDF({
  titulo = 'Reporte Ejecutivo',
  subtitulo = 'Auditoría Gerencial',
  periodo = '',
  filtros = '', // String o Array de filtros aplicados
  codigoReferencia = '',
  kpis = [], // [{ label, valor, detalle }]
  secciones = [], // [{ titulo, contenidoHtml }]
  tablas = [], // [{ titulo, columnas: [], filas: [] }]
  resumenTexto = '',
  resumenEjecutivo = '',
  usuario = null,
  empresa = null
}) {
  // Asegurar datos institucionales cargados (espera máximo 350ms si aún no estaban en caché)
  if (!cacheEmpresaInstitucional) {
    try {
      await Promise.race([
        cargarConfiguracionInstitucional(),
        new Promise((resolve) => setTimeout(resolve, 350))
      ]);
    } catch {
      // Continuar con valores por defecto seguros
    }
  }

  const ahora = new Date();
  const fechaActual = ahora.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const stampCodigo = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(
    ahora.getDate()
  ).padStart(2, '0')}-${String(ahora.getHours()).padStart(2, '0')}${String(
    ahora.getMinutes()
  ).padStart(2, '0')}`;
  const codigoDoc = sanitizarTextoSensible(codigoReferencia || `REP-${stampCodigo}`);

  const datosAuditor = resolverDatosAuditor(usuario);
  const datosEmpresa = resolverDatosEmpresa(empresa);

  // Extraer período del subtítulo si no se pasó explícitamente
  let periodoFinal = sanitizarTextoSensible(periodo);
  if (!periodoFinal && subtitulo) {
    const matchPeriodo = String(subtitulo).match(
      /(?:Per[íi]odo(?:\s+\w+)?|Horizonte(?:\s+\w+)?)\s*:\s*([^|]+)/i
    );
    if (matchPeriodo && matchPeriodo[1]) {
      periodoFinal = sanitizarTextoSensible(matchPeriodo[1].trim());
    }
  }
  if (!periodoFinal) {
    periodoFinal = 'Corte Actual / Tiempo Real';
  }

  const filtrosTexto = Array.isArray(filtros)
    ? sanitizarTextoSensible(filtros.filter(Boolean).join(' • '))
    : sanitizarTextoSensible(filtros || 'Padrón General (Sin restricciones adicionales)');

  const tituloLimpio = sanitizarTextoSensible(titulo);
  const subtituloLimpio = sanitizarTextoSensible(subtitulo);
  const textoFinalResumen = sanitizarTextoSensible(resumenTexto || resumenEjecutivo || '');

  // Renderizar KPIs
  const kpisHtml = (kpis || [])
    .map(
      (k) => `
      <div style="flex: 1; min-width: 135px; background: #f8fafc; border: 1px solid #cbd5e1; border-top: 3px solid #0891b2; border-radius: 8px; padding: 10px 12px;">
        <div style="font-size: 9.5px; font-weight: 800; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px;">
          ${sanitizarTextoSensible(k.label || '')}
        </div>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a; font-family: monospace;">
          ${k.valor !== undefined ? sanitizarTextoSensible(k.valor) : ''}
        </div>
        ${
          k.detalle
            ? `<div style="font-size: 9.5px; color: #475569; margin-top: 3px;">${sanitizarTextoSensible(k.detalle)}</div>`
            : ''
        }
      </div>
    `
    )
    .join('');

  // Renderizar Secciones adicionales
  const seccionesHtml = (secciones || [])
    .map(
      (s) => `
      <div style="margin-top: 18px; page-break-inside: avoid;">
        <h3 style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; color: #0f172a; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 10px;">
          ${sanitizarTextoSensible(s.titulo || '')}
        </h3>
        <div>${s.contenidoHtml || ''}</div>
      </div>
    `
    )
    .join('');

  // Renderizar Tablas
  const tablasHtml = (tablas || [])
    .map((t) => {
      const cols = (t.columnas || []).map((col) => {
        if (typeof col === 'string') {
          return { header: col, key: col, align: 'left' };
        }
        return {
          header: col.header || col.titulo || col.key || '',
          key: col.key || '',
          align: col.align || 'left',
          render: col.render
        };
      });

      const ths = cols
        .map(
          (c) =>
            `<th style="padding: 8px 10px; font-weight: 800; color: #1e293b; text-transform: uppercase; font-size: 9.5px; text-align: ${
              c.align
            }; letter-spacing: 0.3px;">${sanitizarTextoSensible(c.header)}</th>`
        )
        .join('');

      const trs = (t.filas || [])
        .map((fila, idx) => {
          const celdas = cols
            .map((col, cIdx) => {
              let val = '';
              if (Array.isArray(fila)) {
                val = fila[cIdx] !== undefined ? fila[cIdx] : '';
              } else if (typeof fila === 'object' && fila !== null) {
                if (typeof col.render === 'function') {
                  val = col.render(fila);
                } else {
                  val = fila[col.key] !== undefined ? fila[col.key] : '';
                }
              } else {
                val = String(fila);
              }
              const textoCelda =
                val !== undefined && val !== null ? sanitizarTextoSensible(val) : '';
              return `<td style="padding: 7px 10px; color: #1e293b; text-align: ${
                col.align
              }; ${cIdx === 0 ? 'font-weight: 600;' : ''}">${textoCelda}</td>`;
            })
            .join('');

          return `
            <tr style="border-bottom: 1px solid #e2e8f0; background: ${
              idx % 2 === 0 ? '#ffffff' : '#f8fafc'
            };">
              ${celdas}
            </tr>
          `;
        })
        .join('');

      return `
        <div style="margin-top: 20px; page-break-inside: avoid;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #cbd5e1; padding-bottom: 5px; margin-bottom: 8px;">
            <h3 style="font-size: 12.5px; font-weight: 800; text-transform: uppercase; color: #0f172a; margin: 0;">
              ${sanitizarTextoSensible(t.titulo || '')}
            </h3>
            <span style="font-size: 9.5px; color: #64748b; font-family: monospace;">
              Total de registros: ${(t.filas || []).length}
            </span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 10.5px; text-align: left;">
            <thead>
              <tr style="background: #e2e8f0; border-bottom: 1.5px solid #94a3b8;">
                ${ths}
              </tr>
            </thead>
            <tbody>
              ${
                trs ||
                `<tr><td colspan="${cols.length || 1}" style="padding: 12px; text-align: center; color: #64748b;">Sin registros para mostrar en este período.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `;
    })
    .join('');

  // Resumen Ejecutivo en texto
  const resumenHtml = textoFinalResumen
    ? `
      <div style="margin-top: 22px; background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #0891b2; border-radius: 6px; padding: 12px 14px; page-break-inside: avoid;">
        <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: #0e7490; margin-bottom: 6px; letter-spacing: 0.4px;">
          Síntesis Ejecutiva y Conclusiones de Auditoría
        </div>
        <pre style="font-family: inherit; font-size: 10px; color: #334155; white-space: pre-wrap; margin: 0; line-height: 1.5;">${textoFinalResumen}</pre>
      </div>
    `
    : '';

  const lineaContactoEmpresa = [
    `CUIT/CUIL: ${datosEmpresa.cuilLocal}`,
    `Domicilio: ${datosEmpresa.direccionLocal}`,
    datosEmpresa.telefonoLocal ? `Tel: ${datosEmpresa.telefonoLocal}` : null,
    datosEmpresa.emailLocal ? `Email: ${datosEmpresa.emailLocal}` : null
  ]
    .filter(Boolean)
    .join('  •  ');

  // Documento HTML completo para impresión con @page { margin: 0mm } para suprimir
  // por completo las rutas/URLs confidenciales que el navegador agrega por defecto.
  const documentoCompleto = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${tituloLimpio}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 0mm;
        }
        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #0f172a;
          background: #ffffff;
          margin: 0;
          padding: 13mm 14mm 16mm 14mm;
          font-size: 11.5px;
          line-height: 1.4;
        }
        thead {
          display: table-header-group;
        }
        tr {
          page-break-inside: avoid;
        }
        @media print {
          body {
            background: #ffffff;
          }
        }
      </style>
    </head>
    <body>
      <!-- Barra Superior Institucional -->
      <div style="height: 4px; width: 100%; background: linear-gradient(90deg, #0891b2 0%, #6366f1 100%); border-radius: 2px; margin-bottom: 12px;"></div>

      <!-- ENCABEZADO OFICIAL COMPLETO -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0891b2; padding-bottom: 12px; margin-bottom: 14px;">
        <!-- Bloque Izquierdo: Identidad Corporativa y Título del Informe -->
        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <img
              src="${datosEmpresa.logoUrl}"
              alt="Logo"
              onerror="this.style.display='none'"
              style="width: 30px; height: 30px; object-fit: contain; border-radius: 6px;"
            />
            <div>
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 16px; font-weight: 900; color: #0f172a; letter-spacing: -0.3px;">
                  ${datosEmpresa.nombreLocal}
                </span>
                <span style="font-size: 9px; font-weight: 800; color: #0891b2; background: #ecfeff; border: 1px solid #a5f3fc; padding: 1px 6px; border-radius: 4px; text-transform: uppercase;">
                  IFixPos ERP • Documento Oficial
                </span>
              </div>
              <div style="font-size: 9px; color: #475569; margin-top: 1px;">
                ${lineaContactoEmpresa}
              </div>
            </div>
          </div>

          <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 8px; line-height: 1.25;">
            ${tituloLimpio}
          </div>
          ${
            subtituloLimpio
              ? `<div style="font-size: 10.5px; color: #475569; margin-top: 3px;">${subtituloLimpio}</div>`
              : ''
          }
          <div style="font-size: 9.5px; color: #334155; margin-top: 5px; background: #f1f5f9; display: inline-block; padding: 3px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">
            <strong>Alcance / Filtros Aplicados:</strong> ${filtrosTexto}
          </div>
        </div>

        <!-- Bloque Derecho: Metadatos de Auditoría y Trazabilidad -->
        <div style="min-width: 225px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 11px; text-align: right; font-size: 9.5px; color: #334155; font-family: monospace; line-height: 1.55;">
          <div style="font-weight: 800; color: #0891b2; font-size: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; margin-bottom: 4px;">
            CONTROL DE EMISIÓN: ${codigoDoc}
          </div>
          <div><strong>Fecha y Hora:</strong> ${fechaActual}</div>
          <div><strong>Período Auditado:</strong> ${periodoFinal}</div>
          <div><strong>Auditor Emisor:</strong> ${sanitizarTextoSensible(datosAuditor.nombre)}</div>
          <div><strong>Rol / Cargo:</strong> ${sanitizarTextoSensible(datosAuditor.rol)}</div>
          ${
            datosAuditor.email && datosAuditor.email !== 'Sin correo especificado'
              ? `<div><strong>Correo Auditor:</strong> ${sanitizarTextoSensible(datosAuditor.email)}</div>`
              : ''
          }
        </div>
      </div>

      <!-- Fila de Tarjetas KPI -->
      ${
        kpis.length > 0
          ? `<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px;">${kpisHtml}</div>`
          : ''
      }

      <!-- Secciones y Gráficos -->
      ${seccionesHtml}

      <!-- Tablas de Datos -->
      ${tablasHtml}

      <!-- Resumen Ejecutivo -->
      ${resumenHtml}

      <!-- PIE DE PÁGINA INSTITUCIONAL COMPLETO -->
      <div style="margin-top: 26px; border-top: 1.5px solid #cbd5e1; padding-top: 8px; font-size: 9px; color: #64748b; page-break-inside: avoid;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
          <div>
            <div style="font-weight: 700; color: #334155;">
              ${datosEmpresa.nombreLocal} (CUIT/CUIL: ${datosEmpresa.cuilLocal}) — ${datosEmpresa.direccionLocal}
            </div>
            <div style="margin-top: 2px;">
              Contacto Institucional: ${datosEmpresa.emailLocal}${
                datosEmpresa.telefonoLocal ? ` • Tel: ${datosEmpresa.telefonoLocal}` : ''
              } • Emitido mediante IFixPos ERP
            </div>
          </div>
          <div style="text-align: right; font-family: monospace;">
            <div style="font-weight: 700; color: #334155;">
              Ref: ${codigoDoc} • Fecha: ${fechaActual}
            </div>
            <div style="margin-top: 2px;">
              Responsable: ${sanitizarTextoSensible(datosAuditor.nombre)} • Documento Confidencial de Auditoría Interna
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Crear un iframe aislado para la impresión
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(documentoCompleto);
  doc.close();

  // Disparar la impresión tras asegurar renderizado
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(() => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    }, 2000);
  }, 400);
}
