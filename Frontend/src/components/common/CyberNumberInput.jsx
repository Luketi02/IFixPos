import React, { useState, useEffect, useRef } from 'react';

/**
 * Convierte un valor numérico o string crudo a texto con formato de miles (.) y decimales (,).
 * Ejemplos:
 *   150000 -> "150.000"
 *   "150000.50" -> "150.000,50"
 *   "30000" -> "30.000"
 */
export const formatMilesConPunto = (val) => {
  if (val === null || val === undefined || val === '') return '';
  const str = String(val).trim();
  if (str === '-') return '-';

  // Si ya tiene comas o puntos decimales
  const tieneComa = str.includes(',');
  const tienePunto = str.includes('.');

  let parteEntera = str;
  let parteDecimal = '';
  let tieneSeparadorDecimal = false;

  if (tieneComa) {
    const parts = str.split(',');
    parteEntera = parts[0];
    parteDecimal = parts.slice(1).join('');
    tieneSeparadorDecimal = true;
  } else if (tienePunto) {
    const parts = str.split('.');
    parteEntera = parts[0];
    parteDecimal = parts.slice(1).join('');
    tieneSeparadorDecimal = true;
  }

  const esNegativo = parteEntera.startsWith('-');
  const soloDigitosEntera = parteEntera.replace(/\D/g, '');

  if (!soloDigitosEntera && !parteDecimal && !tieneSeparadorDecimal) {
    return esNegativo ? '-' : '';
  }

  // Separar cada 3 dígitos con punto (.)
  const enteraFormateada = soloDigitosEntera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const signo = esNegativo ? '-' : '';

  if (tieneSeparadorDecimal) {
    const soloDigitosDecimal = parteDecimal.replace(/\D/g, '');
    return `${signo}${enteraFormateada || '0'},${soloDigitosDecimal}`;
  }

  return `${signo}${enteraFormateada}`;
};

/**
 * Convierte una cadena formateada ("150.000,50") al string numérico estándar ("150000.5").
 */
export const parseRawNumber = (displayVal) => {
  if (displayVal === null || displayVal === undefined || displayVal === '') return '';
  const str = String(displayVal).trim();
  if (str === '-') return '-';

  // Eliminar los puntos separadores de miles
  let clean = str.replace(/\./g, '');
  // Convertir la coma decimal a punto estándar
  clean = clean.replace(/,/g, '.');

  const esNegativo = clean.startsWith('-');
  clean = clean.replace(/[^0-9.]/g, '');
  const parts = clean.split('.');
  if (parts.length > 2) {
    clean = parts[0] + '.' + parts.slice(1).join('');
  }

  return esNegativo ? `-${clean}` : clean;
};

/**
 * CyberNumberInput:
 * Componente numérico con estética Cyber-Tech Dark Mode para IFixPos.
 *
 * Muestra automáticamente el separador de miles con punto (.) para facilitar la lectura
 * de importes y cantidades grandes (ej. 150.000, 30.000).
 * Emite en onChange el valor numérico estándar en string ("150000", "30000.5") para total
 * compatibilidad con serializers de DRF y validaciones del Frontend.
 *
 * - variant="vertical": Flechas compactas arriba/abajo integradas a la derecha con acento Neón.
 * - variant="stepper": Botones laterales [-] [valor] [+] ideales para stock y cantidades.
 */
export const CyberNumberInput = ({
  id,
  name,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  placeholder = '0',
  className = '',
  inputClassName = '',
  prefix = null,
  suffix = null,
  variant = 'vertical', // 'vertical' | 'stepper'
  required = false,
  ...rest
}) => {
  const numericStep = Number(step) || 1;
  const isDecimal = String(step).includes('.');
  const inputRef = useRef(null);

  // Estado interno para el texto visual formateado
  const [displayValue, setDisplayValue] = useState(() => formatMilesConPunto(value));

  // Sincronizar displayValue cuando el value prop cambia externamente
  useEffect(() => {
    const rawActual = parseRawNumber(displayValue);
    const rawNuevo = value === null || value === undefined ? '' : String(value).trim();
    if (rawActual !== rawNuevo) {
      setDisplayValue(formatMilesConPunto(value));
    }
  }, [value]);

  const emitirCambio = (rawVal) => {
    if (onChange) {
      const syntheticEvent = {
        target: {
          id,
          name,
          value: rawVal,
        },
      };
      onChange(syntheticEvent);
    }
  };

  const handleInputChange = (e) => {
    if (disabled) return;
    const inputValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;

    // Calcular cuántos dígitos numéricos había antes de la posición del cursor
    const digitosAntes = (inputValue.slice(0, cursorPos).match(/[0-9]/g) || []).length;
    const terminaEnSeparador = inputValue.endsWith(',') || inputValue.endsWith('.');

    // Obtener valor numérico crudo (para onChange)
    const rawVal = parseRawNumber(inputValue);

    // Formatear visualmente con puntos de miles
    let nuevoDisplay = formatMilesConPunto(inputValue);
    if (terminaEnSeparador && !nuevoDisplay.includes(',')) {
      nuevoDisplay = `${nuevoDisplay || '0'},`;
    }

    setDisplayValue(nuevoDisplay);
    emitirCambio(rawVal);

    // Reposicionar el cursor después de la misma cantidad de dígitos numéricos
    requestAnimationFrame(() => {
      if (!inputRef.current) return;
      let nuevoIndex = 0;
      let contados = 0;
      for (let i = 0; i < nuevoDisplay.length; i++) {
        if (/[0-9]/.test(nuevoDisplay[i])) {
          contados++;
        }
        if (contados === digitosAntes) {
          nuevoIndex = i + 1;
          break;
        }
      }
      if (contados < digitosAntes || nuevoIndex === 0) {
        nuevoIndex = nuevoDisplay.length;
      }
      inputRef.current.setSelectionRange(nuevoIndex, nuevoIndex);
    });
  };

  const handleStepChange = (direction) => {
    if (disabled) return;
    const rawVal = parseRawNumber(value !== undefined && value !== null && value !== '' ? value : displayValue);
    const currentVal = rawVal === '' ? 0 : parseFloat(rawVal);
    const validCurrent = isNaN(currentVal) ? 0 : currentVal;
    let nextVal = direction === 'up' ? validCurrent + numericStep : validCurrent - numericStep;

    if (min !== undefined && min !== null && nextVal < Number(min)) {
      nextVal = Number(min);
    }
    if (max !== undefined && max !== null && nextVal > Number(max)) {
      nextVal = Number(max);
    }

    const precision = isDecimal ? (String(step).split('.')[1] || '').length : 0;
    const formatted = precision > 0 ? parseFloat(nextVal.toFixed(precision)) : nextVal;
    const formattedStr = String(formatted);

    setDisplayValue(formatMilesConPunto(formattedStr));
    emitirCambio(formattedStr);
  };

  const currentRawNum = Number(parseRawNumber(value !== undefined && value !== null ? value : displayValue));
  const isMinReached = min !== undefined && min !== null && !isNaN(currentRawNum) && currentRawNum <= Number(min);
  const isMaxReached = max !== undefined && max !== null && !isNaN(currentRawNum) && currentRawNum >= Number(max);

  if (variant === 'stepper') {
    return (
      <div
        className={`inline-flex items-center rounded-xl bg-slate-900/90 border border-slate-700/80 transition-all focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/50 ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        } ${className}`}
      >
        <button
          type="button"
          onClick={() => handleStepChange('down')}
          disabled={disabled || isMinReached}
          title="Disminuir"
          className="px-2.5 py-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 active:bg-cyan-500/20 rounded-l-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        <div className="relative flex items-center justify-center min-w-[3.5rem]">
          {prefix && <span className="text-slate-500 font-mono text-xs pl-2">{prefix}</span>}
          <input
            ref={inputRef}
            id={id}
            name={name}
            type="text"
            inputMode={isDecimal ? 'decimal' : 'numeric'}
            value={displayValue}
            disabled={disabled}
            placeholder={placeholder}
            required={required}
            onChange={handleInputChange}
            className={`w-full bg-transparent text-center font-mono font-bold text-white text-sm outline-none px-2 py-1.5 ${inputClassName}`}
            {...rest}
          />
          {suffix && <span className="text-slate-500 font-mono text-xs pr-2">{suffix}</span>}
        </div>

        <button
          type="button"
          onClick={() => handleStepChange('up')}
          disabled={disabled || isMaxReached}
          title="Aumentar"
          className="px-2.5 py-2 text-slate-400 hover:text-cyan-300 hover:bg-slate-800/80 active:bg-cyan-500/20 rounded-r-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  // Variante vertical (Flechas arriba y abajo integradas con estética Cyber-Tech)
  return (
    <div
      className={`group relative flex items-center rounded-xl bg-slate-900/90 border border-slate-700/80 transition-all focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/50 hover:border-slate-600 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      } ${className}`}
    >
      {prefix && (
        <span className="pl-3.5 pr-1 text-slate-500 font-mono font-bold text-sm select-none">
          {prefix}
        </span>
      )}

      <input
        ref={inputRef}
        id={id}
        name={name}
        type="text"
        inputMode={isDecimal ? 'decimal' : 'numeric'}
        value={displayValue}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        onChange={handleInputChange}
        className={`w-full bg-transparent text-white font-mono text-sm py-2.5 pl-3 pr-8 outline-none ${
          prefix ? 'pl-1' : ''
        } ${inputClassName}`}
        {...rest}
      />

      {suffix && (
        <span className="pr-8 pl-1 text-slate-400 font-mono text-xs select-none">
          {suffix}
        </span>
      )}

      {/* Micro-controles Cyber-Tech Arriba / Abajo */}
      <div className="absolute right-1 top-1 bottom-1 flex flex-col justify-center gap-0.5 pr-0.5">
        <button
          type="button"
          tabIndex={-1}
          onClick={() => handleStepChange('up')}
          disabled={disabled || isMaxReached}
          title="Incrementar"
          className="w-5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 active:bg-cyan-500/30 transition-all disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => handleStepChange('down')}
          disabled={disabled || isMinReached}
          title="Decrementar"
          className="w-5 h-3.5 flex items-center justify-center rounded text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/15 active:bg-cyan-500/30 transition-all disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-400 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default CyberNumberInput;
