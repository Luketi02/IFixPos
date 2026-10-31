/**
 * Utilidad de Impresión y Exportación a PDF de Informes Ejecutivos (IFixPos ERP)
 * Resuelve definitivamente el problema de páginas en blanco al generar un documento
 * HTML aislado en alta resolución (300 DPI) con contraste adecuado para impresión/guardado en PDF.
 */

export function exportarInformePDF({
  titulo = 'Reporte Ejecutivo',
  subtitulo = 'Auditoría Gerencial',
  periodo = '',
  kpis = [], // [{ label, valor, detalle }]
  secciones = [], // [{ titulo, contenidoHtml }]
  tablas = [], // [{ titulo, columnas: [], filas: [] }]
  resumenTexto = '',
  resumenEjecutivo = '',
  usuario = null
}) {
  const fechaActual = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const usuarioNombre = usuario?.nombre || usuario?.email || 'Administrador del Sistema';
  const textoFinalResumen = resumenTexto || resumenEjecutivo || '';

  // Renderizar KPIs
  const kpisHtml = (kpis || [])
    .map(
      (k) => `
      <div style="flex: 1; min-width: 140px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 14px;">
        <div style="font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; margin-bottom: 4px;">
          ${k.label || ''}
        </div>
        <div style="font-size: 20px; font-weight: 800; color: #0f172a; font-family: monospace;">
          ${k.valor !== undefined ? k.valor : ''}
        </div>
        ${
          k.detalle
            ? `<div style="font-size: 10px; color: #475569; margin-top: 3px;">${k.detalle}</div>`
            : ''
        }
      </div>
    `
    )
    .join('');

  // Renderizar Secciones adicionales (gráficos o resúmenes)
  const seccionesHtml = (secciones || [])
    .map(
      (s) => `
      <div style="margin-top: 20px; page-break-inside: avoid;">
        <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px;">
          ${s.titulo || ''}
        </h3>
        <div>${s.contenidoHtml || ''}</div>
      </div>
    `
    )
    .join('');

  // Renderizar Tablas con soporte para columnas array/objetos y filas array/objetos
  const tablasHtml = (tablas || [])
    .map((t) => {
      // Normalizar definición de columnas
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
            `<th style="padding: 8px 10px; font-weight: bold; color: #334155; text-transform: uppercase; font-size: 10px; text-align: ${c.align};">${c.header}</th>`
        )
        .join('');

      // Normalizar filas
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
              return `<td style="padding: 7px 10px; color: #1e293b; text-align: ${
                col.align
              }; ${cIdx === 0 ? 'font-weight: 600;' : ''}">${
                val !== undefined && val !== null ? val : ''
              }</td>`;
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
        <div style="margin-top: 24px; page-break-inside: avoid;">
          <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; color: #1e293b; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px;">
            ${t.titulo || ''}
          </h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1.5px solid #cbd5e1;">
                ${ths}
              </tr>
            </thead>
            <tbody>
              ${trs}
            </tbody>
          </table>
        </div>
      `;
    })
    .join('');

  // Resumen Ejecutivo en texto
  const resumenHtml = textoFinalResumen
    ? `
      <div style="margin-top: 24px; background: #f8fafc; border: 1px solid #cbd5e1; border-left: 4px solid #06b6d4; border-radius: 6px; padding: 14px; page-break-inside: avoid;">
        <div style="font-size: 11px; font-weight: bold; text-transform: uppercase; color: #0e7490; margin-bottom: 6px;">
          Resumen Ejecutivo y Conclusiones de Auditoría
        </div>
        <pre style="font-family: inherit; font-size: 10.5px; color: #334155; white-space: pre-wrap; margin: 0; line-height: 1.5;">${textoFinalResumen}</pre>
      </div>
    `
    : '';

  // Documento HTML completo para impresión
  const documentoCompleto = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${titulo} - IFixPos ERP</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 12mm 15mm 15mm 15mm;
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
          padding: 0;
          font-size: 12px;
          line-height: 1.4;
        }
        @media print {
          body {
            background: #ffffff;
          }
        }
      </style>
    </head>
    <body>
      <!-- Cabecera Institucional Oficial -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #06b6d4; padding-bottom: 12px; margin-bottom: 16px;">
        <div>
          <div style="display: flex; items-center; gap: 8px;">
            <span style="font-size: 20px; font-weight: 900; color: #0891b2; letter-spacing: -0.5px;">IFixPos</span>
            <span style="font-size: 11px; font-weight: bold; color: #64748b; align-self: flex-end; margin-bottom: 2px;">ERP</span>
          </div>
          <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 4px;">
            ${titulo}
          </div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            ${subtitulo}
          </div>
        </div>

        <div style="text-align: right; font-size: 10.5px; color: #475569; font-family: monospace;">
          <div><strong>Fecha de Emisión:</strong> ${fechaActual}</div>
          ${periodo ? `<div><strong>Período Analizado:</strong> ${periodo}</div>` : ''}
          <div><strong>Auditor:</strong> ${usuarioNombre}</div>
        </div>
      </div>

      <!-- Fila de Tarjetas KPI -->
      ${kpis.length > 0 ? `<div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px;">${kpisHtml}</div>` : ''}

      <!-- Secciones y Gráficos -->
      ${seccionesHtml}

      <!-- Tablas de Datos -->
      ${tablasHtml}

      <!-- Resumen Ejecutivo -->
      ${resumenHtml}

      <!-- Pie de Página Institucional -->
      <div style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9.5px; color: #94a3b8; display: flex; justify-content: space-between; page-break-inside: avoid;">
        <span>IFixPos ERP - Sistema Integral de Gestión de Taller y Comercial</span>
        <span>Documento oficial de auditoría interna - Confidencial</span>
      </div>
    </body>
    </html>
  `;

  // Crear un iframe invisible para la impresión
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
      document.body.removeChild(iframe);
    }, 2000);
  }, 400);
}
