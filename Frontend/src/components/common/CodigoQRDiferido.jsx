import React, { Suspense, lazy } from 'react';

const QRCodeSVGLazy = lazy(() =>
  import('qrcode.react').then((modulo) => ({ default: modulo.QRCodeSVG }))
);

/**
 * Wrapper de carga diferida (Code Splitting) para el generador de códigos QR (`qrcode.react`).
 * Solo descarga el chunk `vendor-qr` cuando el usuario abre efectivamente un paso de pago con QR (Auditoría F8).
 */
export const CodigoQRDiferido = ({ size = 200, ...props }) => {
  return (
    <Suspense
      fallback={
        <div
          style={{ width: size, height: size }}
          className="flex items-center justify-center rounded-xl bg-slate-200/80 animate-pulse text-xs font-medium text-slate-600"
          role="status"
          aria-label="Generando código QR..."
        >
          Cargando QR...
        </div>
      }
    >
      <QRCodeSVGLazy size={size} {...props} />
    </Suspense>
  );
};

export { CodigoQRDiferido as QRCodeSVG };
export default CodigoQRDiferido;
