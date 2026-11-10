import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from '../../components/common/CodigoQRDiferido';
import useAuth from '../../context/useAuth';
import { normalizeRole } from '../../utils/roleRoutes';
import AdminSidebar from '../../components/navigation/AdminSidebar';
import AdminHeader from '../../components/navigation/AdminHeader';
import { obtenerImagenProducto } from '../../utils/productImages';

import { API_BASE_URL } from '../../config/api';
export default function VentaPresencialScreen() {
  const { user, token } = useAuth();
  const effectiveRole = normalizeRole(user?.rol);
  const activeMenu = effectiveRole === 'tecnico' ? 'tech-pos-sale' : 'admin-pos-sale';

  // ============================================================================
  // ESTADOS GENERALES Y NOTIFICACIONES (REGLA 6)
  // ============================================================================
  const [alerta, setAlerta] = useState(null);
  const alertaTimeoutRef = useRef(null);

  const dispararAlerta = useCallback((tipo, mensaje, duracion = 4000) => {
    if (alertaTimeoutRef.current) {
      clearTimeout(alertaTimeoutRef.current);
    }
    setAlerta({ tipo, mensaje });
    alertaTimeoutRef.current = setTimeout(() => {
      setAlerta(null);
    }, duracion);
  }, []);

  useEffect(() => {
    return () => {
      if (alertaTimeoutRef.current) {
        clearTimeout(alertaTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // ESTADO DEL CLIENTE ASOCIADO (PASO 2)
  // ============================================================================
  // null = Consumidor Final (por defecto para agilidad operativa en mostrador)
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
  const [mostrarModalBuscarCliente, setMostrarModalBuscarCliente] = useState(false);
  const [busquedaClienteDni, setBusquedaClienteDni] = useState('');
  const [busquedaClienteEmail, setBusquedaClienteEmail] = useState('');
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [buscandoClientes, setBuscandoClientes] = useState(false);

  // ============================================================================
  // ESTADOS DEL CATÁLOGO DE PRODUCTOS (PASOS 3 & 4)
  // ============================================================================
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('TODAS');
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);

  // ============================================================================
  // ESTADO DEL LECTOR DE CÓDIGO DE BARRAS / ESCÁNER POS
  // ============================================================================
  const [lectorConectado, setLectorConectado] = useState(false);
  const [codigoBarrasInput, setCodigoBarrasInput] = useState('');
  const barcodeInputRef = useRef(null);

  // Detección automática de lector (WebHID + Preferencia persistida)
  useEffect(() => {
    const pref = localStorage.getItem('ifixpos_lector_conectado');
    if (pref === 'true') {
      setLectorConectado(true);
    }

    if ('hid' in navigator) {
      navigator.hid.getDevices().then((devices) => {
        if (devices && devices.length > 0) {
          setLectorConectado(true);
        }
      }).catch(() => {});

      const handleHidConnect = (e) => {
        setLectorConectado(true);
        localStorage.setItem('ifixpos_lector_conectado', 'true');
        dispararAlerta('success', `Lector detectado: ${e.device?.productName || 'Dispositivo USB conectado'}`, 4000);
      };

      const handleHidDisconnect = () => {
        navigator.hid.getDevices().then((devices) => {
          if (!devices || devices.length === 0) {
            setLectorConectado(false);
            localStorage.setItem('ifixpos_lector_conectado', 'false');
            dispararAlerta('info', 'Lector desconectado.', 4000);
          }
        }).catch(() => {});
      };

      navigator.hid.addEventListener('connect', handleHidConnect);
      navigator.hid.addEventListener('disconnect', handleHidDisconnect);

      return () => {
        navigator.hid.removeEventListener('connect', handleHidConnect);
        navigator.hid.removeEventListener('disconnect', handleHidDisconnect);
      };
    }
  }, [dispararAlerta]);

  // Auto-enfoque al cargar o activar el lector
  useEffect(() => {
    if (lectorConectado) {
      barcodeInputRef.current?.focus();
    }
  }, [lectorConectado]);

  // ============================================================================
  // ESTADO DEL TICKET DE VENTA / CARRITO (PASO 5)
  // ============================================================================
  // Cada ítem: { id_producto, nombre, precio_venta, cantidad, stock_disponible, categoria, imagen }
  const [ticketItems, setTicketItems] = useState([]);

  // ============================================================================
  // ESTADOS DEL FLUJO DE CONFIRMACIÓN Y COBRO (PASOS 6, 7 & 8 - CU-21)
  // ============================================================================
  const [procesandoVenta, setProcesandoVenta] = useState(false);
  const [ventaConfirmada, setVentaConfirmada] = useState(null); // Objeto de venta creada
  const [mostrarModalCobro, setMostrarModalCobro] = useState(false);

  // Formulario de cobro
  // Unificado: el medio de pago seleccionado define directamente el flujo de cobro
  const [mediosPagoDisponibles, setMediosPagoDisponibles] = useState([]);
  const [cargandoMediosPago, setCargandoMediosPago] = useState(false);
  const [medioPagoElegido, setMedioPagoElegido] = useState('Efectivo');
  const [montoEntregado, setMontoEntregado] = useState('');
  const [numeroOperacion, setNumeroOperacion] = useState('');
  const [detalleCobro, setDetalleCobro] = useState('');
  const [procesandoCobro, setProcesandoCobro] = useState(false);

  // Estados específicos para Cobro con QR Mercado Pago
  const [cargandoQR, setCargandoQR] = useState(false);
  const [datosQR, setDatosQR] = useState(null);
  const [preferenciaMP, setPreferenciaMP] = useState(null);
  const [esperandoPagoQR, setEsperandoPagoQR] = useState(false);
  const [verificandoAcreditacionQR, setVerificandoAcreditacionQR] = useState(false);
  const [errorQR, setErrorQR] = useState('');

  // Comprobante emitido con éxito (Paso 9)
  const [comprobanteEmitido, setComprobanteEmitido] = useState(null);

  // ============================================================================
  // CARGA DE DATOS: PRODUCTOS Y CATEGORÍAS
  // ============================================================================
  const cargarCatalogo = useCallback(async () => {
    setCargandoCatalogo(true);
    try {
      // 1. Obtener inventario de productos aptos para venta
      const resProds = await axios.get(`${API_BASE_URL}/api/inventory/stock/`, {
        params: { proposito: 'venta' },
        headers: { Authorization: `Bearer ${token}` }
      });
      const dataProds = Array.isArray(resProds.data) ? resProds.data : [];
      setProductos(dataProds);

      // 2. Extraer categorías únicas para el filtro rápido
      const categoriasSet = new Set();
      dataProds.forEach((p) => {
        if (p.categoria && typeof p.categoria === 'string') {
          categoriasSet.add(p.categoria.trim());
        }
      });
      setCategorias(Array.from(categoriasSet).sort());
    } catch (err) {
      console.error('Error al cargar inventario para mostrador:', err);
      dispararAlerta('error', 'No fue posible sincronizar el stock del mostrador.');
    } finally {
      setCargandoCatalogo(false);
    }
  }, [token, dispararAlerta]);

  // Cargar medios de pago activos
  const cargarMediosPago = useCallback(async () => {
    setCargandoMediosPago(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sales/medios-pago/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(res.data) ? res.data : [];
      const activos = data.filter((m) => m.estado !== false);
      setMediosPagoDisponibles(activos);
      if (activos.length > 0) {
        // Seleccionar Efectivo por defecto si existe, o el primero
        const tieneEfectivo = activos.find((m) => (m.nombre || m.nombre_medio_pago || '').toLowerCase().includes('efectivo'));
        setMedioPagoElegido(tieneEfectivo ? (tieneEfectivo.nombre || tieneEfectivo.nombre_medio_pago) : (activos[0].nombre || activos[0].nombre_medio_pago));
      }
    } catch (err) {
      console.error('Error al cargar medios de pago:', err);
      // Fallback seguro si la API de medios de pago no está disponible
      setMediosPagoDisponibles([
        { id_mediopago: 1, nombre: 'Efectivo' },
        { id_mediopago: 2, nombre: 'Tarjeta de Débito' },
        { id_mediopago: 3, nombre: 'Tarjeta de Crédito' },
        { id_mediopago: 4, nombre: 'Transferencia Bancaria' }
      ]);
    } finally {
      setCargandoMediosPago(false);
    }
  }, [token]);

  useEffect(() => {
    cargarCatalogo();
    cargarMediosPago();
  }, [cargarCatalogo, cargarMediosPago]);

  // ============================================================================
  // BÚSQUEDA DE CLIENTES REGISTRADOS (PASO 2)
  // ============================================================================
  const handleBuscarClientes = async (e) => {
    if (e) e.preventDefault();
    if (!busquedaClienteDni.trim() && !busquedaClienteEmail.trim()) {
      dispararAlerta('error', 'Ingresa un DNI o correo para buscar el cliente.');
      return;
    }

    setBuscandoClientes(true);
    try {
      const params = {};
      if (busquedaClienteDni.trim()) params.dni = busquedaClienteDni.trim();
      if (busquedaClienteEmail.trim()) params.email = busquedaClienteEmail.trim();

      const res = await axios.get(`${API_BASE_URL}/api/users/filtrar/`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = Array.isArray(res.data) ? res.data : [];
      setClientesEncontrados(data);
      if (data.length === 0) {
        dispararAlerta('error', 'No se encontraron clientes registrados con esos datos.');
      }
    } catch (err) {
      console.error('Error al buscar clientes:', err);
      dispararAlerta('error', 'Ocurrió un error al buscar los clientes en el padrón.');
    } finally {
      setBuscandoClientes(false);
    }
  };

  const seleccionarCliente = (cliente) => {
    setClienteSeleccionado(cliente);
    setMostrarModalBuscarCliente(false);
    setBusquedaClienteDni('');
    setBusquedaClienteEmail('');
    setClientesEncontrados([]);
    const nombreCompleto = cliente.perfil?.nombre
      ? `${cliente.perfil.nombre} ${cliente.perfil.apellido || ''}`.trim()
      : cliente.email;
    dispararAlerta('success', `Cliente ${nombreCompleto} asignado a la venta en curso.`);
  };

  const restablecerAConsumidorFinal = () => {
    setClienteSeleccionado(null);
    dispararAlerta('success', 'Cliente restablecido a Consumidor Final para venta rápida.');
  };

  // ============================================================================
  // FILTRADO DEL CATÁLOGO DE PRODUCTOS EN PANTALLA
  // ============================================================================
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      // Solo activos y aptos para venta
      if (p.estado === false || p.apto_venta === false) return false;

      // Filtro de categoría
      if (categoriaSeleccionada !== 'TODAS' && p.categoria !== categoriaSeleccionada) {
        return false;
      }

      // Filtro de texto (nombre, modelo, categoría)
      if (busquedaTexto.trim()) {
        const query = busquedaTexto.toLowerCase();
        const nom = (p.nombre || '').toLowerCase();
        const mod = (p.modelo || '').toLowerCase();
        const cat = (p.categoria || '').toLowerCase();
        const desc = (p.descripcion || '').toLowerCase();
        return nom.includes(query) || mod.includes(query) || cat.includes(query) || desc.includes(query);
      }

      return true;
    });
  }, [productos, categoriaSeleccionada, busquedaTexto]);

  // ============================================================================
  // GESTIÓN DEL TICKET / CARRITO DE VENTA EN VIVO (PASO 5)
  // ============================================================================
  const agregarProductoAlTicket = (producto) => {
    const stockDisponible = Number(producto.cantidad_actual || 0);

    if (stockDisponible <= 0) {
      dispararAlerta('error', `El artículo "${producto.nombre}" está agotado en inventario.`);
      return;
    }

    setTicketItems((prevItems) => {
      const index = prevItems.findIndex((item) => item.id_producto === producto.id_producto);
      if (index >= 0) {
        const itemActual = prevItems[index];
        const nuevaCantidad = itemActual.cantidad + 1;

        if (nuevaCantidad > stockDisponible) {
          dispararAlerta('error', `Stock máximo disponible alcanzado (${stockDisponible} un.).`);
          return prevItems;
        }

        const actualizados = [...prevItems];
        actualizados[index] = {
          ...itemActual,
          cantidad: nuevaCantidad
        };
        return actualizados;
      } else {
        const nuevoItem = {
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          precio_venta: parseFloat(producto.precio_venta || 0),
          cantidad: 1,
          stock_disponible: stockDisponible,
          categoria: producto.categoria || 'General',
          imagen: obtenerImagenProducto(producto)
        };
        return [...prevItems, nuevoItem];
      }
    });

    // Mensaje de éxito requerido con duración de 4 segundos
    dispararAlerta('success', `Se agregó el producto ${producto.nombre} al carrito`, 4000);
  };

  // ============================================================================
  // ESCÁNER DE CÓDIGO DE BARRAS Y PROCESAMIENTO AUTOMÁTICO AL CARRITO
  // ============================================================================
  const procesarCodigo = useCallback((codigoRaw) => {
    const codigo = (codigoRaw || '').trim();
    if (!codigo) return;

    const codigoLower = codigo.toLowerCase();

    // Búsqueda en catálogo de productos aptos para la venta
    const productoEncontrado = productos.find((p) => {
      if (p.estado === false || p.apto_venta === false) return false;

      const idStr = String(p.id_producto);
      const padded4 = idStr.padStart(4, '0');
      const padded6 = idStr.padStart(6, '0');
      const padded8 = idStr.padStart(8, '0');
      const padded12 = idStr.padStart(12, '0');
      const padded13 = idStr.padStart(13, '0');

      if (
        idStr === codigo ||
        padded4 === codigo ||
        padded6 === codigo ||
        padded8 === codigo ||
        padded12 === codigo ||
        padded13 === codigo
      ) {
        return true;
      }

      if (
        `prod-${idStr}`.toLowerCase() === codigoLower ||
        `prd-${idStr}`.toLowerCase() === codigoLower ||
        `art-${idStr}`.toLowerCase() === codigoLower
      ) {
        return true;
      }

      if (p.codigo && p.codigo.toLowerCase() === codigoLower) return true;
      if (p.codigo_barra && p.codigo_barra.toLowerCase() === codigoLower) return true;
      if (p.sku && p.sku.toLowerCase() === codigoLower) return true;
      if ((p.nombre || '').toLowerCase() === codigoLower) return true;

      return false;
    });

    if (!productoEncontrado) {
      dispararAlerta('error', 'No se encontró el producto con el código establecido.', 4000);
      setCodigoBarrasInput('');
      barcodeInputRef.current?.focus();
      return;
    }

    const stockDisponible = Number(productoEncontrado.cantidad_actual || 0);
    const itemEnTicket = ticketItems.find((it) => it.id_producto === productoEncontrado.id_producto);
    const cantidadActual = itemEnTicket ? itemEnTicket.cantidad : 0;

    if (stockDisponible <= 0) {
      dispararAlerta('error', `El artículo "${productoEncontrado.nombre}" está agotado en inventario.`, 4000);
      setCodigoBarrasInput('');
      barcodeInputRef.current?.focus();
      return;
    }

    if (cantidadActual >= stockDisponible) {
      dispararAlerta('error', `Stock máximo disponible alcanzado (${stockDisponible} un.).`, 4000);
      setCodigoBarrasInput('');
      barcodeInputRef.current?.focus();
      return;
    }

    agregarProductoAlTicket(productoEncontrado);
    setCodigoBarrasInput('');
    barcodeInputRef.current?.focus();
  }, [productos, ticketItems, dispararAlerta]);

  const handleEscanearCodigoBarras = (e) => {
    if (e) e.preventDefault();
    if (!lectorConectado) {
      dispararAlerta('error', 'El lector se encuentra inactivo. Conecta o habilita el lector para escanear.', 4000);
      return;
    }
    procesarCodigo(codigoBarrasInput);
  };

  const handleActivarLector = async () => {
    if ('hid' in navigator) {
      try {
        const devices = await navigator.hid.requestDevice({ filters: [] });
        if (devices && devices.length > 0) {
          setLectorConectado(true);
          localStorage.setItem('ifixpos_lector_conectado', 'true');
          dispararAlerta('success', `Lector vinculado: ${devices[0].productName || 'Dispositivo USB'}`, 4000);
          setTimeout(() => barcodeInputRef.current?.focus(), 100);
          return;
        }
      } catch (err) {
        // Cuadro cancelado o emulador
      }
    }
    setLectorConectado(true);
    localStorage.setItem('ifixpos_lector_conectado', 'true');
    dispararAlerta('success', 'Lector de código de barras habilitado.', 4000);
    setTimeout(() => barcodeInputRef.current?.focus(), 100);
  };

  const handleDesactivarLector = () => {
    setLectorConectado(false);
    localStorage.setItem('ifixpos_lector_conectado', 'false');
    dispararAlerta('info', 'Lector de código de barras desactivado.', 4000);
  };

  // Detección automática por ráfaga rápida de escaneo (<45ms entre pulsaciones)
  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e) => {
      const target = e.target;
      const esOtroInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && target !== barcodeInputRef.current;

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (diff > 50) {
        buffer = '';
      }

      if (e.key === 'Enter') {
        if (buffer.length >= 3) {
          // Ráfaga de escaneo detectada
          if (!lectorConectado) {
            setLectorConectado(true);
            localStorage.setItem('ifixpos_lector_conectado', 'true');
          }
          if (esOtroInput || target !== barcodeInputRef.current) {
            e.preventDefault();
            procesarCodigo(buffer);
            buffer = '';
            return;
          }
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
        if (buffer.length >= 3 && diff < 45) {
          if (!lectorConectado) {
            setLectorConectado(true);
            localStorage.setItem('ifixpos_lector_conectado', 'true');
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [lectorConectado, procesarCodigo]);

  const modificarCantidadTicket = (idProducto, nuevaCantidad) => {
    const cant = parseInt(nuevaCantidad, 10);
    if (isNaN(cant) || cant <= 0) {
      eliminarRenglonTicket(idProducto);
      return;
    }

    setTicketItems((prevItems) => {
      return prevItems.map((item) => {
        if (item.id_producto === idProducto) {
          if (cant > item.stock_disponible) {
            dispararAlerta('error', `No puedes superar las ${item.stock_disponible} unidades disponibles.`);
            return { ...item, cantidad: item.stock_disponible };
          }
          return { ...item, cantidad: cant };
        }
        return item;
      });
    });
  };

  const eliminarRenglonTicket = (idProducto) => {
    setTicketItems((prev) => prev.filter((item) => item.id_producto !== idProducto));
  };

  const vaciarTicket = () => {
    if (ticketItems.length === 0) return;
    setTicketItems([]);
    dispararAlerta('success', 'Ticket de venta cancelado y vaciado correctamente.');
  };

  // Cálculos financieros del ticket
  const totalRenglones = ticketItems.length;
  const totalUnidades = useMemo(() => {
    return ticketItems.reduce((acc, item) => acc + item.cantidad, 0);
  }, [ticketItems]);

  const totalPagar = useMemo(() => {
    return ticketItems.reduce((acc, item) => acc + item.cantidad * item.precio_venta, 0);
  }, [ticketItems]);

  // ============================================================================
  // CONFIRMACIÓN DE LA VENTA Y APERTURA DE COBRO (TICKET EN MEMORIA)
  // ============================================================================
  const handleConfirmarVenta = () => {
    if (ticketItems.length === 0) {
      dispararAlerta('error', 'El ticket no tiene ningún producto cargado.', 4000);
      return;
    }
    // Preconfigurar monto en memoria sin tocar la BD para evitar ventas a medias
    setMontoEntregado(totalPagar.toFixed(2));
    setVentaConfirmada(null);
    setDatosQR(null);
    setEsperandoPagoQR(false);
    setErrorQR('');
    setMostrarModalCobro(true);
  };

  // ============================================================================
  // PROCESAMIENTO DEL COBRO EN CAJA (ATÓMICO EN MOSTRADOR)
  // ============================================================================
  const esMercadoPagoQR = useMemo(() => {
    const m = (medioPagoElegido || '').toLowerCase();
    return m.includes('mercado') || m.includes('qr');
  }, [medioPagoElegido]);

  const esEfectivo = useMemo(() => {
    return (medioPagoElegido || '').toLowerCase().includes('efectivo');
  }, [medioPagoElegido]);

  const esTransferencia = useMemo(() => {
    const m = (medioPagoElegido || '').toLowerCase();
    return m.includes('transferencia') || m.includes('banc');
  }, [medioPagoElegido]);

  const totalOperacionNum = useMemo(() => {
    return totalPagar;
  }, [totalPagar]);

  const montoEntregadoNum = useMemo(() => {
    return parseFloat(montoEntregado) || 0;
  }, [montoEntregado]);

  const vueltoCalculado = useMemo(() => {
    if (!esEfectivo) return 0;
    return Math.max(0, montoEntregadoNum - totalOperacionNum);
  }, [esEfectivo, montoEntregadoNum, totalOperacionNum]);

  const puedeCompletarCobro = useMemo(() => {
    if (ticketItems.length === 0) return false;
    if (procesandoCobro) return false;
    if (esMercadoPagoQR) return false; // Mercado Pago se procesa a través del flujo QR
    if (esEfectivo && montoEntregadoNum < totalOperacionNum) return false;
    if (esTransferencia && !numeroOperacion.trim()) return false;
    return true;
  }, [ticketItems, procesandoCobro, esMercadoPagoQR, esEfectivo, montoEntregadoNum, totalOperacionNum, esTransferencia, numeroOperacion]);

  const handleCompletarCobro = async (e) => {
    if (e) e.preventDefault();
    if (!puedeCompletarCobro) return;

    setProcesandoCobro(true);
    try {
      const payload = {
        id_cliente: clienteSeleccionado ? clienteSeleccionado.id_usuario : null,
        productos: ticketItems.map((item) => ({
          id_producto: item.id_producto,
          cantidad: item.cantidad
        })),
        medio_pago: medioPagoElegido.toUpperCase(),
        monto_pagado: totalOperacionNum.toFixed(2),
        numero_operacion: esTransferencia ? numeroOperacion.trim() : (numeroOperacion.trim() || null),
        detalle: detalleCobro.trim() || undefined
      };

      const response = await axios.post(`${API_BASE_URL}/api/sales/ventas/presencial/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = response.data;
      setComprobanteEmitido({
        codigoSeguridad: data.codigo_seguridad,
        cliente: data.cliente || (clienteSeleccionado ? clienteSeleccionado.email : 'Consumidor Final'),
        totalPagado: totalOperacionNum.toFixed(2),
        medioPago: medioPagoElegido,
        vuelto: esEfectivo ? vueltoCalculado.toFixed(2) : '0.00',
        rutaComprobante: data.ruta_comprobante
      });

      setMostrarModalCobro(false);
      setTicketItems([]); // Vaciar ticket consumido
      setVentaConfirmada(null);
      dispararAlerta('success', '¡Venta registrada y cobrada exitosamente en mostrador!');
      // Refrescar inventario en segundo plano para sincronizar existencias reales
      cargarCatalogo();
    } catch (err) {
      console.error('Error al registrar cobro en caja:', err);
      const msg = err.response?.data?.detail || err.response?.data?.error || 'No fue posible asentar la venta y cobro en caja.';
      dispararAlerta('error', typeof msg === 'object' ? JSON.stringify(msg) : msg);
    } finally {
      setProcesandoCobro(false);
    }
  };

  // ============================================================================
  // GESTIÓN DE COBRO CON CÓDIGO QR MERCADO PAGO Y RESTITUCIÓN DE STOCK
  // ============================================================================
  const cancelarOrdenProvisionalQR = useCallback(async () => {
    if (!ventaConfirmada?.id_venta || !token) return;
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/compras/virtual/${ventaConfirmada.id_venta}/cancelar/`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      dispararAlerta('info', 'Orden de cobro cancelada y stock restituido.');
      cargarCatalogo();
    } catch (err) {
      console.warn('Inconveniente al restituir stock de la orden cancelada:', err);
    } finally {
      setVentaConfirmada(null);
      setDatosQR(null);
      setEsperandoPagoQR(false);
      setPreferenciaMP(null);
    }
  }, [ventaConfirmada, token, dispararAlerta, cargarCatalogo]);

  const handleCerrarModalCobro = async () => {
    if (ventaConfirmada?.id_venta) {
      await cancelarOrdenProvisionalQR();
    }
    setMostrarModalCobro(false);
    setEsperandoPagoQR(false);
  };

  const handleSeleccionarMedioPago = async (nombreMp) => {
    if (nombreMp.toLowerCase() === (medioPagoElegido || '').toLowerCase()) return;
    // Si teníamos una orden provisional de QR y el operador cambia a otro medio, cancelamos y restituimos stock
    if (ventaConfirmada?.id_venta && datosQR) {
      await cancelarOrdenProvisionalQR();
    }
    setMedioPagoElegido(nombreMp);
    setDatosQR(null);
    setEsperandoPagoQR(false);
    setErrorQR('');
  };

  const handleIniciarCobroQR = async () => {
    setCargandoQR(true);
    setErrorQR('');
    try {
      let idVenta = ventaConfirmada?.id_venta;

      if (!idVenta) {
        const payload = {
          id_cliente: clienteSeleccionado ? clienteSeleccionado.id_usuario : null,
          productos: ticketItems.map((item) => ({
            id_producto: item.id_producto,
            cantidad: item.cantidad
          }))
        };
        const resVenta = await axios.post(`${API_BASE_URL}/api/sales/ventas/presencial/`, payload, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          }
        });
        const orden = resVenta.data;
        setVentaConfirmada(orden);
        idVenta = orden.id_venta;
      }

      await generarQRMercadoPago(idVenta);
    } catch (err) {
      console.error('Error al inicializar orden para QR:', err);
      const msg = err.response?.data?.error || err.response?.data?.detail || 'No fue posible preparar la orden para QR.';
      setErrorQR(typeof msg === 'object' ? JSON.stringify(msg) : msg);
      dispararAlerta('error', typeof msg === 'object' ? JSON.stringify(msg) : msg, 4000);
    } finally {
      setCargandoQR(false);
    }
  };

  const handleCancelarQROpcional = async () => {
    if (ventaConfirmada?.id_venta) {
      await cancelarOrdenProvisionalQR();
    }
    setDatosQR(null);
    setEsperandoPagoQR(false);
    setErrorQR('');
    const efectivo = mediosPagoDisponibles.find((m) =>
      (m.nombre || m.nombre_medio_pago || '').toLowerCase().includes('efectivo')
    );
    if (efectivo) {
      setMedioPagoElegido(efectivo.nombre || efectivo.nombre_medio_pago);
    }
  };

  const generarQRMercadoPago = useCallback(async (idVenta) => {
    if (!idVenta) return;
    setCargandoQR(true);
    setErrorQR('');
    try {
      const res = await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/crear-preferencia/`,
        { id_venta: idVenta },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPreferenciaMP(res.data);
      const urlPago = res.data.init_point || res.data.sandbox_init_point;
      setDatosQR(urlPago);
      setEsperandoPagoQR(true);
    } catch (err) {
      console.error('Error al generar QR de Mercado Pago:', err);
      const msg = err.response?.data?.error || 'No fue posible generar el código QR de Mercado Pago en este momento.';
      setErrorQR(msg);
      dispararAlerta('error', msg);
    } finally {
      setCargandoQR(false);
    }
  }, [token, dispararAlerta]);

  // Sondeo en tiempo real para detección automática de pago acreditado por QR
  useEffect(() => {
    if (!esperandoPagoQR || !ventaConfirmada?.id_venta || !token) return;

    const interval = setInterval(async () => {
      try {
        const res = await axios.get(
          `${API_BASE_URL}/api/sales/compras/virtual/${ventaConfirmada.id_venta}/estado/`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.data?.pagada) {
          setEsperandoPagoQR(false);
          setMostrarModalCobro(false);
          setComprobanteEmitido({
            codigoSeguridad: ventaConfirmada.codigo_seguridad,
            cliente: ventaConfirmada.cliente || 'Consumidor Final',
            totalPagado: totalOperacionNum.toFixed(2),
            medioPago: 'Mercado Pago (QR)',
            vuelto: '0.00',
            rutaComprobante: res.data.ruta_comprobante || `/media/comprobantes/factura_venta_${ventaConfirmada.id_venta}.pdf`
          });
          setTicketItems([]); // Vaciar ticket
          setVentaConfirmada(null);
          dispararAlerta('success', '¡Pago acreditado exitosamente por Mercado Pago!');
          cargarCatalogo();
        }
      } catch (err) {
        // Sondeo silencioso
      }
    }, 3500);

    return () => clearInterval(interval);
  }, [esperandoPagoQR, ventaConfirmada, token, totalOperacionNum, dispararAlerta, cargarCatalogo]);

  const handleVerificarAcreditacionQR = async () => {
    if (!ventaConfirmada?.id_venta || !token) return;
    setVerificandoAcreditacionQR(true);
    setErrorQR('');
    try {
      const res = await axios.get(
        `${API_BASE_URL}/api/sales/compras/virtual/${ventaConfirmada.id_venta}/estado/`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data?.pagada) {
        setEsperandoPagoQR(false);
        setMostrarModalCobro(false);
        setComprobanteEmitido({
          codigoSeguridad: ventaConfirmada.codigo_seguridad,
          cliente: ventaConfirmada.cliente || 'Consumidor Final',
          totalPagado: totalOperacionNum.toFixed(2),
          medioPago: 'Mercado Pago (QR)',
          vuelto: '0.00',
          rutaComprobante: res.data.ruta_comprobante || `/media/comprobantes/factura_venta_${ventaConfirmada.id_venta}.pdf`
        });
        setTicketItems([]); // Vaciar ticket
        setVentaConfirmada(null);
        dispararAlerta('success', '¡Pago acreditado exitosamente por Mercado Pago!');
        cargarCatalogo();
      } else {
        dispararAlerta('info', 'Mercado Pago aún no reportó la acreditación. Si el cliente ya abonó, aguarda unos instantes.');
      }
    } catch (err) {
      dispararAlerta('error', 'No fue posible consultar el estado del pago con el servidor.');
    } finally {
      setVerificandoAcreditacionQR(false);
    }
  };

  const handleSimularPagoQR = async () => {
    // Protección estricta: simulación solo permitida en desarrollo local (Fase 1 - F1)
    if (!import.meta.env.DEV) return;
    if (!ventaConfirmada?.id_venta) return;
    setVerificandoAcreditacionQR(true);
    try {
      await axios.post(
        `${API_BASE_URL}/api/sales/mercadopago/webhook/?data.id=SIMULADO-${ventaConfirmada.id_venta}`,
        {
          type: 'payment',
          data: { id: `SIMULADO-${ventaConfirmada.id_venta}` }
        }
      );
      setEsperandoPagoQR(false);
      setMostrarModalCobro(false);
      setComprobanteEmitido({
        codigoSeguridad: ventaConfirmada.codigo_seguridad,
        cliente: ventaConfirmada.cliente || 'Consumidor Final',
        totalPagado: totalOperacionNum.toFixed(2),
        medioPago: 'Mercado Pago (QR Simulado)',
        vuelto: '0.00',
        rutaComprobante: `/media/comprobantes/factura_venta_${ventaConfirmada.id_venta}.pdf`
      });
      setTicketItems([]); // Vaciar ticket
      setVentaConfirmada(null);
      dispararAlerta('success', '¡Pago QR simulado y acreditado con éxito en mostrador!');
      cargarCatalogo();
    } catch (err) {
      console.error('Error al simular pago QR:', err);
      dispararAlerta('error', 'No fue posible simular la acreditación.');
    } finally {
      setVerificandoAcreditacionQR(false);
    }
  };

  const iniciarNuevaVenta = () => {
    setTicketItems([]);
    setClienteSeleccionado(null);
    setVentaConfirmada(null);
    setMostrarModalCobro(false);
    setComprobanteEmitido(null);
    setMontoEntregado('');
    setNumeroOperacion('');
    setDetalleCobro('');
    setCodigoBarrasInput('');
    setDatosQR(null);
    barcodeInputRef.current?.focus();
    setPreferenciaMP(null);
    setEsperandoPagoQR(false);
    setErrorQR('');
    dispararAlerta('success', 'Mostrador listo para una nueva venta presencial.');
  };

  // ============================================================================
  // RENDER PRINCIPAL
  // ============================================================================
  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 font-sans overflow-hidden">
      {/* Sidebar Unificado con activeMenu exacto */}
      <AdminSidebar activeMenu={activeMenu} />

      {/* Contenedor Central */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Encabezado Unificado */}
        <AdminHeader
          category="Caja"
          pageName="Venta Presencial"
          title="Venta Presencial en Mostrador"
        />

        {/* Notificación Cyber-Tech Flotante */}
        <AnimatePresence>
          {alerta && (
            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
              className={`mx-6 mt-4 p-4 rounded-xl border flex items-center justify-between text-sm shadow-xl z-20 ${
                alerta.tipo === 'success'
                  ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200 shadow-emerald-950/50'
                  : 'bg-rose-950/90 border-rose-500/50 text-rose-200 shadow-rose-950/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{alerta.tipo === 'success' ? '✓' : '⚠'}</span>
                <span className="font-medium">{alerta.mensaje}</span>
              </div>
              <button
                onClick={() => setAlerta(null)}
                className="text-xs px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                Cerrar
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Cuerpo Principal del Mostrador */}
        <main className="flex-1 p-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* ===================================================================== */}
          {/* PASO 2: ASIGNACIÓN DE CLIENTE (CONSUMIDOR FINAL O REGISTRADO)         */}
          {/* ===================================================================== */}
          <section className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 font-bold">
                  {clienteSeleccionado ? 'CR' : 'CF'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">Cliente de Mostrador:</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
                        clienteSeleccionado
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      }`}
                    >
                      {clienteSeleccionado ? 'Cliente Registrado' : 'Consumidor Final (Venta Rápida)'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    {clienteSeleccionado
                      ? clienteSeleccionado.perfil?.nombre
                        ? `${clienteSeleccionado.perfil.nombre} ${clienteSeleccionado.perfil.apellido || ''}`.trim()
                        : clienteSeleccionado.email
                      : 'Consumidor Final'}
                  </h3>
                  {clienteSeleccionado && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      {clienteSeleccionado.perfil?.dni && `DNI: ${clienteSeleccionado.perfil.dni} • `}
                      Email: {clienteSeleccionado.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setMostrarModalBuscarCliente(true)}
                  className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-semibold hover:border-cyan-500 transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {clienteSeleccionado ? 'Cambiar Cliente' : 'Buscar Cliente Registrado'}
                </button>

                {clienteSeleccionado && (
                  <button
                    type="button"
                    onClick={restablecerAConsumidorFinal}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-all"
                    title="Restablecer a Consumidor Final"
                  >
                    Restablecer
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* LAYOUT PRINCIPAL: CATÁLOGO (IZQUIERDA) + TICKET POS (DERECHA)         */}
          {/* ===================================================================== */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* ------------------------------------------------------------------- */}
            {/* COLUMNA IZQUIERDA: CATÁLOGO DE PRODUCTOS (7 COLUMNAS)               */}
            {/* ------------------------------------------------------------------- */}
            <div className="lg:col-span-7 space-y-4">
              {/* Lector de Código de Barras (Escáner POS Mostrador) */}
              <div
                className={`rounded-2xl p-4 transition-all duration-300 relative overflow-hidden group shadow-xl ${
                  lectorConectado
                    ? 'bg-[#1E293B] border-2 border-cyan-500/40 hover:border-cyan-500/70 shadow-cyan-950/20 opacity-100'
                    : 'bg-[#1E293B]/60 border border-slate-800 opacity-50 hover:opacity-75 backdrop-blur-sm'
                }`}
              >
                {lectorConectado && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                )}

                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <svg
                      className={`w-5 h-5 transition-colors ${lectorConectado ? 'text-cyan-400' : 'text-slate-500'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 5v14" /><path d="M8 5v14" /><path d="M12 5v14" /><path d="M17 5v14" /><path d="M21 5v14" />
                    </svg>
                    <span className={`text-xs font-mono font-bold uppercase tracking-wider transition-colors ${
                      lectorConectado ? 'text-white' : 'text-slate-400'
                    }`}>
                      Lector de Código de Barras (Escáner POS)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {lectorConectado ? (
                      <>
                        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm shadow-cyan-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                          Lector Activo
                        </span>
                        <button
                          type="button"
                          onClick={handleDesactivarLector}
                          className="text-[10px] font-mono text-slate-500 hover:text-rose-400 transition-colors cursor-pointer px-1 py-0.5"
                          title="Desconectar o pausar lector"
                        >
                          ✕ Desactivar
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 border border-slate-700 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          Lector Inactivo
                        </span>
                        <button
                          type="button"
                          onClick={handleActivarLector}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-mono font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                        >
                          <span>⚡</span>
                          <span>Habilitar</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <form onSubmit={handleEscanearCodigoBarras} className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      disabled={!lectorConectado}
                      placeholder={
                        lectorConectado
                          ? 'Escanear código de barras o ingresar código del producto... (Enter)'
                          : 'Lector inactivo. Conecta un lector USB o presiona "Habilitar" para activar...'
                      }
                      value={codigoBarrasInput}
                      onChange={(e) => setCodigoBarrasInput(e.target.value)}
                      className={`w-full px-4 py-2.5 rounded-xl text-xs font-mono font-semibold transition-all shadow-inner ${
                        lectorConectado
                          ? 'bg-[#0F172A] border border-cyan-500/40 text-cyan-200 placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400'
                          : 'bg-[#0F172A]/50 border border-slate-800 text-slate-500 placeholder-slate-600 cursor-not-allowed'
                      }`}
                    />
                    {codigoBarrasInput && lectorConectado && (
                      <button
                        type="button"
                        onClick={() => {
                          setCodigoBarrasInput('');
                          barcodeInputRef.current?.focus();
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={!lectorConectado || !codigoBarrasInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-mono text-xs font-bold transition-all shadow-md shadow-cyan-500/20 whitespace-nowrap flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>+ Agregar</span>
                  </button>
                </form>

                <p className="text-[11px] text-slate-400 mt-2 font-mono flex items-center gap-1.5">
                  <span className={lectorConectado ? 'text-cyan-400' : 'text-slate-500'}>💡</span>
                  <span>
                    {lectorConectado
                      ? 'Lector listo: apuntá al código de barras del producto para sumarlo automáticamente al ticket.'
                      : 'Lector atenuado: conectá tu escáner USB o dispará sobre un código para activarlo de forma automática.'}
                  </span>
                </p>
              </div>

              {/* Barra de Filtros y Búsqueda */}
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Buscador de texto */}
                  <div className="relative flex-1">
                    <svg
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Buscar por código, artículo o modelo..."
                      value={busquedaTexto}
                      onChange={(e) => setBusquedaTexto(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                    {busquedaTexto && (
                      <button
                        onClick={() => setBusquedaTexto('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Selector de Categorías */}
                  <select
                    value={categoriaSeleccionada}
                    onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                    className="bg-[#0F172A] border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-colors sm:w-48"
                  >
                    <option value="TODAS">Todas las Categorías</option>
                    {categorias.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Grilla de Productos */}
              {cargandoCatalogo ? (
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center">
                  <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs text-slate-400">Sincronizando existencias de almacén...</p>
                </div>
              ) : productosFiltrados.length === 0 ? (
                <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-12 text-center">
                  <p className="text-slate-400 text-sm">No se encontraron artículos disponibles para la venta con ese criterio.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {productosFiltrados.map((prod) => {
                    const stock = Number(prod.cantidad_actual || 0);
                    const stockMinimo = Number(prod.stock_minimo || 2);
                    const estaAgotado = stock <= 0;
                    const esStockBajo = stock > 0 && stock <= stockMinimo;

                    // Verificar cuántas unidades ya están en el ticket
                    const itemEnTicket = ticketItems.find((t) => t.id_producto === prod.id_producto);
                    const cantidadEnTicket = itemEnTicket ? itemEnTicket.cantidad : 0;
                    const puedeAgregarMas = stock > cantidadEnTicket;

                    return (
                      <div
                        key={prod.id_producto}
                        className={`bg-[#1E293B] border rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-200 ${
                          estaAgotado
                            ? 'border-rose-900/40 opacity-60'
                            : 'border-slate-700/80 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-950/20'
                        }`}
                      >
                        <div className="flex gap-3">
                          <img
                            src={obtenerImagenProducto(prod)}
                            alt={prod.nombre}
                            className="w-16 h-16 rounded-xl object-cover bg-slate-900 border border-slate-800 flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-cyan-400 border border-slate-700">
                                {prod.categoria || 'Repuesto'}
                              </span>
                              {prod.modelo && (
                                <span className="text-[10px] text-slate-400 truncate">
                                  {prod.modelo}
                                </span>
                              )}
                            </div>
                            <h4 className="text-xs font-bold text-white truncate mt-1" title={prod.nombre}>
                              {prod.nombre}
                            </h4>
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-sm font-bold font-mono text-cyan-400">
                                ${parseFloat(prod.precio_venta || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span
                                className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full ${
                                  estaAgotado
                                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                                    : esStockBajo
                                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                }`}
                              >
                                {estaAgotado
                                  ? 'Agotado'
                                  : esStockBajo
                                  ? `Bajo (${stock} un.)`
                                  : `${stock} un.`}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Botón de Agregar */}
                        <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center justify-between">
                          {cantidadEnTicket > 0 && (
                            <span className="text-[11px] font-mono text-violet-300">
                              En ticket: <strong className="text-white">{cantidadEnTicket}</strong>
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={estaAgotado || !puedeAgregarMas}
                            onClick={() => agregarProductoAlTicket(prod)}
                            className={`ml-auto px-3.5 py-1.5 rounded-xl text-xs font-bold tracking-wide transition-all flex items-center gap-1.5 ${
                              estaAgotado || !puedeAgregarMas
                                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                                : 'bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 active:scale-95'
                            }`}
                          >
                            <span>+</span>
                            <span>{cantidadEnTicket > 0 ? 'Sumar 1' : 'Agregar'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* COLUMNA DERECHA: TICKET POS EN VIVO / CAJA (5 COLUMNAS)             */}
            {/* ------------------------------------------------------------------- */}
            <div className="lg:col-span-5 sticky top-20">
              <div className="bg-[#1E293B] border border-slate-700/80 rounded-2xl p-5 shadow-2xl space-y-4">
                {/* Cabecera del Ticket */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                      Ticket de Venta
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {totalRenglones === 0
                        ? 'Mostrador vacío'
                        : `${totalRenglones} renglón${totalRenglones > 1 ? 'es' : ''} • ${totalUnidades} unidad${totalUnidades > 1 ? 'es' : ''}`}
                    </p>
                  </div>
                  {totalRenglones > 0 && (
                    <button
                      type="button"
                      onClick={vaciarTicket}
                      className="px-2.5 py-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-mono transition-colors"
                      title="Cancelar y vaciar ticket"
                    >
                      Vaciar Ticket
                    </button>
                  )}
                </div>

                {/* Lista de Renglones Cargados */}
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {ticketItems.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 space-y-2">
                      <div className="w-12 h-12 mx-auto rounded-full bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400 text-lg">
                        🛒
                      </div>
                      <p className="text-xs">No hay productos en el ticket actual.</p>
                      <p className="text-[11px] text-slate-600">
                        Selecciona artículos del catálogo o escanea para comenzar.
                      </p>
                    </div>
                  ) : (
                    ticketItems.map((item) => {
                      const subtotalRenglon = item.cantidad * item.precio_venta;
                      return (
                        <div
                          key={item.id_producto}
                          className="bg-[#0F172A] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <h5 className="text-xs font-bold text-white truncate" title={item.nombre}>
                              {item.nombre}
                            </h5>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                              ${item.precio_venta.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} c/u
                            </p>
                          </div>

                          {/* Control Interactivo de Cantidad */}
                          <div className="flex items-center gap-1.5 bg-[#1E293B] border border-slate-700 rounded-lg p-1">
                            <button
                              type="button"
                              onClick={() => modificarCantidadTicket(item.id_producto, item.cantidad - 1)}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-bold transition-colors"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-xs font-mono font-bold text-cyan-400">
                              {item.cantidad}
                            </span>
                            <button
                              type="button"
                              onClick={() => modificarCantidadTicket(item.id_producto, item.cantidad + 1)}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-bold transition-colors"
                            >
                              +
                            </button>
                          </div>

                          {/* Subtotal del renglón */}
                          <div className="text-right min-w-[70px]">
                            <span className="text-xs font-bold font-mono text-emerald-400 block">
                              ${subtotalRenglon.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <button
                              type="button"
                              onClick={() => eliminarRenglonTicket(item.id_producto)}
                              className="text-[10px] text-rose-400 hover:text-rose-300 mt-0.5 underline transition-colors"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Resumen Financiero y Acciones */}
                {ticketItems.length > 0 && (
                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Total de Artículos:</span>
                      <span className="font-mono text-white">{totalUnidades} un.</span>
                    </div>

                    <div className="bg-gradient-to-r from-slate-900 to-[#0F172A] border border-cyan-500/30 rounded-xl p-3.5 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 block">
                          Total a Cobrar
                        </span>
                        <span className="text-xs text-slate-400">Moneda de Curso Legal</span>
                      </div>
                      <span className="text-2xl font-black font-mono text-white tracking-tight">
                        ${totalPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={procesandoVenta}
                      onClick={handleConfirmarVenta}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-cyan-400 to-violet-500 hover:opacity-95 text-slate-950 text-sm font-extrabold tracking-wide shadow-xl shadow-cyan-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {procesandoVenta ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Asentando Venta...</span>
                        </>
                      ) : (
                        <>
                          <span>⚡</span>
                          <span>Confirmar Venta y Cobrar</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: BÚSQUEDA Y ASIGNACIÓN DE CLIENTE (PASO 2)                        */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {mostrarModalBuscarCliente && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">Buscar y Asignar Cliente</h3>
                <button
                  type="button"
                  onClick={() => setMostrarModalBuscarCliente(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleBuscarClientes} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase">DNI del Cliente</label>
                    <input
                      type="text"
                      placeholder="Ej: 38123456"
                      value={busquedaClienteDni}
                      onChange={(e) => setBusquedaClienteDni(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase">Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="cliente@email.com"
                      value={busquedaClienteEmail}
                      onChange={(e) => setBusquedaClienteEmail(e.target.value)}
                      className="w-full mt-1 px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={buscandoClientes}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {buscandoClientes ? 'Buscando...' : 'Buscar en Padrón'}
                  </button>
                </div>
              </form>

              {/* Resultados */}
              <div className="max-h-60 overflow-y-auto space-y-2 pt-2 border-t border-slate-800">
                {clientesEncontrados.length > 0 ? (
                  clientesEncontrados.map((cli) => {
                    const nombre = cli.perfil?.nombre
                      ? `${cli.perfil.nombre} ${cli.perfil.apellido || ''}`.trim()
                      : cli.email;
                    return (
                      <div
                        key={cli.id_usuario}
                        onClick={() => seleccionarCliente(cli)}
                        className="p-3 bg-[#0F172A] border border-slate-800 hover:border-cyan-500 rounded-xl cursor-pointer flex items-center justify-between transition-colors"
                      >
                        <div>
                          <h5 className="text-xs font-bold text-white">{nombre}</h5>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {cli.perfil?.dni && `DNI: ${cli.perfil.dni} • `}
                            {cli.email}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-cyan-400">Seleccionar →</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500 text-center py-4">
                    Ingresa datos de búsqueda para listar los clientes coincidentes.
                  </p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 2: COBRO EN CAJA / COMPLETAR PAGO (ATÓMICO EN MOSTRADOR)           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {mostrarModalCobro && ticketItems.length > 0 && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-slate-700 rounded-2xl p-6 w-full max-w-xl shadow-2xl space-y-5"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider block">
                    Caja Operativa • Cobro de Mostrador
                  </span>
                  <h3 className="text-lg font-black text-white tracking-tight">
                    Completar Cobro de Venta
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleCerrarModalCobro}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Resumen de Operación */}
              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-mono">Comprobante / Código:</span>
                  <p className="font-mono font-bold text-cyan-400 text-sm mt-0.5">
                    {ventaConfirmada?.codigo_seguridad || 'TICKET-MOSTRADOR'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 font-mono">Cliente:</span>
                  <p className="font-semibold text-white truncate mt-0.5">
                    {ventaConfirmada?.cliente || (clienteSeleccionado ? (clienteSeleccionado.perfil?.nombre ? `${clienteSeleccionado.perfil.nombre} ${clienteSeleccionado.perfil.apellido || ''}`.trim() : clienteSeleccionado.email) : 'Consumidor Final')}
                  </p>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="font-mono text-slate-300 font-bold uppercase">Total Adeudado:</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    ${totalPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Selector de Medios de Pago desde la Base de Datos */}
              <div>
                <label className="text-xs font-mono text-slate-300 uppercase block mb-1.5">
                  Canal o Medio de Pago
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {mediosPagoDisponibles.map((mp) => {
                    const nombreMp = mp.nombre || mp.nombre_medio_pago;
                    const seleccionado = (medioPagoElegido || '').toLowerCase() === nombreMp.toLowerCase();
                    const esMP = nombreMp.toLowerCase().includes('mercado') || nombreMp.toLowerCase().includes('qr');
                    return (
                      <button
                        key={mp.id_mediopago || nombreMp}
                        type="button"
                        onClick={() => handleSeleccionarMedioPago(nombreMp)}
                        className={`p-2.5 rounded-xl border text-xs font-bold text-center transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                          seleccionado
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-md shadow-cyan-500/20 ring-1 ring-cyan-500'
                            : 'bg-[#0F172A] border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                        }`}
                      >
                        <span className="text-base">{esMP ? '📲' : (nombreMp.toLowerCase().includes('efectivo') ? '💵' : '💳')}</span>
                        <span className="truncate max-w-full">{nombreMp}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* FLUJO 1: MEDIOS DE PAGO MANUALES (Efectivo / Tarjeta / Transferencia) */}
              {!esMercadoPagoQR && (
                <form onSubmit={handleCompletarCobro} className="space-y-4">
                  {/* Si es Efectivo: Monto Recibido y Vuelto */}
                  {esEfectivo && (
                    <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                        <div>
                          <label className="text-xs font-mono text-slate-400 uppercase">
                            Monto Recibido del Cliente ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={montoEntregado}
                            onChange={(e) => setMontoEntregado(e.target.value)}
                            className="w-full mt-1 px-3 py-2 bg-[#1E293B] border border-slate-700 rounded-xl text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                        <div className="text-right sm:text-right">
                          <span className="text-xs font-mono text-slate-400 uppercase block">Vuelto / Cambio</span>
                          <span
                            className={`text-xl font-mono font-black ${
                              montoEntregadoNum < totalOperacionNum ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            ${vueltoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          {montoEntregadoNum < totalOperacionNum && (
                            <span className="text-[10px] text-rose-400 block mt-0.5">
                              Faltan ${(totalOperacionNum - montoEntregadoNum).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de Atajo Rápido de Efectivo */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setMontoEntregado(totalOperacionNum.toFixed(2))}
                          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono transition-colors"
                        >
                          Monto Exacto
                        </button>
                        {[1000, 2000, 5000, 10000, 20000].map((billete) => (
                          <button
                            key={billete}
                            type="button"
                            onClick={() => setMontoEntregado((prev) => ((parseFloat(prev) || 0) + billete).toFixed(2))}
                            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono transition-colors"
                          >
                            +${billete.toLocaleString('es-AR')}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Si es Transferencia o Tarjeta: N° de Operación */}
                  {!esEfectivo && (
                    <div>
                      <label className="text-xs font-mono text-slate-300 uppercase block mb-1">
                        N° de Operación / Comprobante Bancario {esTransferencia && <span className="text-rose-400">*</span>}
                      </label>
                      <input
                        type="text"
                        placeholder="Ej: TRX-98432176"
                        value={numeroOperacion}
                        onChange={(e) => setNumeroOperacion(e.target.value)}
                        className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                      />
                    </div>
                  )}

                  {/* Observaciones Opcionales */}
                  <div>
                    <label className="text-xs font-mono text-slate-400 uppercase block mb-1">
                      Detalle u Observaciones (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: Pago directo mostrador turno tarde"
                      value={detalleCobro}
                      onChange={(e) => setDetalleCobro(e.target.value)}
                      className="w-full px-3 py-2 bg-[#0F172A] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Botón de Confirmación de Cobro Manual */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={!puedeCompletarCobro}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {procesandoCobro ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          <span>Asentando Cobro y Facturando...</span>
                        </>
                      ) : (
                        <>
                          <span>✓</span>
                          <span>Registrar Cobro y Emitir Comprobante</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* FLUJO 2: COBRO CON QR DE MERCADO PAGO */}
              {esMercadoPagoQR && (
                <div className="space-y-4">
                  {cargandoQR ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-3">
                      <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-mono text-cyan-300">
                        Generando código QR dinámico de Mercado Pago...
                      </p>
                    </div>
                  ) : errorQR ? (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-center space-y-3">
                      <p className="text-xs text-rose-300">{errorQR}</p>
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <button
                          type="button"
                          onClick={handleIniciarCobroQR}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-mono font-bold transition-all"
                        >
                          Reintentar Generar QR
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelarQROpcional}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-mono transition-all"
                        >
                          Cambiar Medio de Pago
                        </button>
                      </div>
                    </div>
                  ) : datosQR ? (
                    <div className="flex flex-col items-center justify-center py-2 space-y-3.5">
                      {/* Contenedor del Código QR */}
                      <div className="p-3.5 bg-white rounded-2xl shadow-2xl border-2 border-cyan-500/50 shadow-cyan-500/20 inline-flex items-center justify-center">
                        <QRCodeSVG
                          value={datosQR}
                          size={195}
                          level="M"
                          includeMargin={false}
                        />
                      </div>

                      {/* Instrucción visual para el cliente y el cajero */}
                      <div className="text-center space-y-1">
                        <p className="text-xs font-bold text-slate-100 flex items-center justify-center gap-1.5">
                          <span>📲</span>
                          <span>Escaneá con la app de Mercado Pago</span>
                        </p>
                        <p className="text-[11px] text-slate-400 max-w-sm">
                          Escaneá el código en pantalla para abonar el importe exacto desde tu dispositivo móvil.
                        </p>
                      </div>

                      {/* Indicador de Espera y Sondeo en Vivo */}
                      <div className="w-full bg-[#0F172A] border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5">
                          <div className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                          </div>
                          <span className="text-cyan-300 font-mono text-[11px] font-medium">
                            Esperando acreditación del pago...
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={verificandoAcreditacionQR}
                          onClick={handleVerificarAcreditacionQR}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[11px] font-mono font-bold transition-all border border-cyan-500/30 active:scale-95 disabled:opacity-50"
                        >
                          {verificandoAcreditacionQR ? 'Verificando...' : '🔄 Comprobar'}
                        </button>
                      </div>

                      {/* Acciones de Cancelación y Simulación en QR */}
                      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2 pt-1 border-t border-slate-800">
                        <button
                          type="button"
                          onClick={handleCancelarQROpcional}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-mono font-medium transition-all border border-slate-700 flex items-center justify-center gap-1.5 active:scale-95"
                        >
                          <span>← Cambiar Medio de Pago</span>
                        </button>
                        {import.meta.env.DEV && (
                          <button
                            type="button"
                            onClick={handleSimularPagoQR}
                            disabled={verificandoAcreditacionQR}
                            className="text-[11px] text-slate-500 hover:text-cyan-400 underline font-mono transition-colors"
                          >
                            [Modo Pruebas] Simular Pago QR
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Tarjeta Informativa antes de generar el QR con botón Continuar */
                    <div className="bg-[#0F172A] border border-cyan-500/30 rounded-2xl p-5 text-center space-y-4">
                      <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 text-2xl">
                        📲
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-bold text-white tracking-tight">
                          Cobro con Código QR dinámico de Mercado Pago
                        </h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                          Al presionar continuar, se generará el código QR por un total de{' '}
                          <strong className="text-emerald-400 font-mono">${totalPagar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>{' '}
                          en pantalla para que el cliente lo escanee y pague desde su dispositivo móvil.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleIniciarCobroQR}
                        className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-sky-500 hover:from-cyan-400 hover:to-sky-400 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mx-auto"
                      >
                        <span>📲 Continuar con Cobro QR</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================================= */}
      {/* MODAL 3: COMPROBANTE EMITIDO CON ÉXITO (PASO 9)                           */}
      {/* ========================================================================= */}
      <AnimatePresence>
        {comprobanteEmitido && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#1E293B] border border-emerald-500/50 rounded-2xl p-6 w-full max-w-md shadow-2xl text-center space-y-4"
            >
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-2xl font-bold">
                ✓
              </div>

              <div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  ¡Venta Completada con Éxito!
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  La transacción y el comprobante fiscal fueron registrados debidamente.
                </p>
              </div>

              <div className="bg-[#0F172A] border border-slate-800 rounded-xl p-4 text-xs space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Comprobante:</span>
                  <span className="font-mono font-bold text-cyan-400">{comprobanteEmitido.codigoSeguridad}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Cliente:</span>
                  <span className="text-white font-semibold">{comprobanteEmitido.cliente}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-mono">Medio de Pago:</span>
                  <span className="text-slate-300 font-semibold">{comprobanteEmitido.medioPago}</span>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-2">
                  <span className="text-slate-300 font-bold font-mono">Total Abonado:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    ${parseFloat(comprobanteEmitido.totalPagado).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                {parseFloat(comprobanteEmitido.vuelto) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-mono">Vuelto Entregado:</span>
                    <span className="font-mono font-bold text-cyan-300">
                      ${parseFloat(comprobanteEmitido.vuelto).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2.5 pt-2">
                {comprobanteEmitido.rutaComprobante && (
                  <a
                    href={`${API_BASE_URL}${comprobanteEmitido.rutaComprobante}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <span>📄</span>
                    <span>Descargar Factura / Ticket PDF</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={iniciarNuevaVenta}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-400 hover:to-cyan-500 text-slate-950 text-xs font-extrabold tracking-wide shadow-lg shadow-cyan-500/20 active:scale-95 transition-all"
                >
                  Volver
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

