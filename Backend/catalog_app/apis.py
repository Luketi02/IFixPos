from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.exceptions import ValidationError, PermissionDenied

from .serializers import (
    MarcaInputSerializer,
    MarcaOutputSerializer,
    MarcaCreateInputSerializer,
    ModeloInputSerializer,
    ModeloOutputSerializer,
    ModeloDispositivoOutputSerializer,
    ModeloDispositivoCreateInputSerializer
)
from .services import (
    crear_o_reactivar_marca,
    cambiar_estado_marca,
    crear_o_reactivar_modelo,
    cambiar_estado_modelo
)

class MarcaCreateApi(APIView):
    """
    API endpoint para registrar una marca. (CU-77 compatibilidad)
    """
    def post(self, request):
        serializer = MarcaInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            res = crear_o_reactivar_marca(
                nombre=serializer.validated_data.get('nombre'),
                usuario_admin=request.user if request.user and request.user.is_authenticated else None
            )
            marca = res[0] if isinstance(res, tuple) else res
        except ValidationError as e:
            return Response({"error": str(e.detail[0]) if isinstance(e.detail, list) else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = MarcaOutputSerializer(marca)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class MarcaApi(APIView):
    """
    CU-77: Registrar Marca y Listado de Marcas.
    - Requiere IsAuthenticated.
    - GET: Permite listar marcas. Llama a obtener_todas_marcas. Retorna serializado con MarcaOutputSerializer.
      Soporta query params opcionales: 'solo_activas' y 'buscar' (o 'q' / 'search' / 'texto_busqueda').
    - POST: Exige rol ADMIN. Consume MarcaCreateInputSerializer, llama a crear_o_reactivar_marca,
      y retorna 201 Created (o 200 OK si fue reactivada) junto a un mensaje aclaratorio.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['ADMIN', 'TECNICO']:
            raise PermissionDenied("Se requiere rol de Administrador o Técnico para gestionar marcas.")

    def get(self, request):
        from .selectors import obtener_todas_marcas
        from .serializers import MarcaOutputSerializer, FiltroMarcasInputSerializer

        input_serializer = FiltroMarcasInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        marcas = obtener_todas_marcas(
            solo_activas=filtros['solo_activas'],
            texto_busqueda=filtros['texto_busqueda'],
            estado_activo=filtros['estado_activo']
        )
        serializer = MarcaOutputSerializer(marcas, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        self._verificar_admin(request.user)

        from .serializers import MarcaCreateInputSerializer, MarcaOutputSerializer
        from .services import crear_o_reactivar_marca

        serializer = MarcaCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        marca, creada = crear_o_reactivar_marca(
            usuario_admin=request.user,
            nombre=serializer.validated_data['nombre']
        )

        output_serializer = MarcaOutputSerializer(marca)
        status_code = status.HTTP_201_CREATED if creada else status.HTTP_200_OK
        mensaje = (
            f"Marca '{marca.nombre}' registrada con éxito."
            if creada else
            f"Marca '{marca.nombre}' reactivada con éxito."
        )

        data = dict(output_serializer.data)
        data["mensaje"] = mensaje
        data["creada"] = creada
        data["marca"] = output_serializer.data
        return Response(data, status=status_code)


class MarcaEstadoApi(APIView):
    """
    CU-78: Cambiar Estado de Marca.
    - Requiere IsAuthenticated y rol ADMIN.
    - PATCH: Recibe id_marca por URL. No requiere payload. Llama a cambiar_estado_marca y retorna 200 OK.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para cambiar el estado de marcas.")

    def patch(self, request, id_marca: int):
        self._verificar_admin(request.user)

        from django.core.exceptions import ObjectDoesNotExist
        from .services import cambiar_estado_marca
        from .serializers import MarcaOutputSerializer

        try:
            marca_modificada = cambiar_estado_marca(
                usuario_admin=request.user,
                id_marca=id_marca
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró la marca con ID {id_marca}."},
                status=status.HTTP_404_NOT_FOUND
            )

        output_serializer = MarcaOutputSerializer(marca_modificada)
        data = dict(output_serializer.data)
        data["mensaje"] = f"Estado de la marca actualizado a {'Activo' if marca_modificada.estado_activo else 'Inactivo'}."
        data["marca"] = output_serializer.data
        return Response(data, status=status.HTTP_200_OK)


class ModeloCreateApi(APIView):
    """
    API endpoint para registrar un modelo de dispositivo. (CU-79 compatibilidad)
    """
    def post(self, request):
        serializer = ModeloInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        try:
            res = crear_o_reactivar_modelo(
                usuario_ejecutor=request.user if request.user and request.user.is_authenticated else None,
                nombre=serializer.validated_data.get('nombre'),
                id_marca=serializer.validated_data.get('id_marca'),
                id_tipo_dispositivo=serializer.validated_data.get('id_tipo_dispositivo')
            )
            modelo = res[0] if isinstance(res, tuple) else res
        except ValidationError as e:
            return Response({"error": str(e.detail[0]) if isinstance(e.detail, list) else str(e)}, status=status.HTTP_400_BAD_REQUEST)
            
        output_serializer = ModeloOutputSerializer(modelo)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class ModeloDispositivoApi(APIView):
    """
    CU-81: Filtrar Modelos y CU-79: Registrar Modelo de Dispositivo.
    - Requiere IsAuthenticated.
    - GET (CU-81): Permitido para ADMIN y TECNICO. Captura query params:
      'texto_busqueda' (o 'buscar' / 'q' / 'search'), 'id_marca', 'id_tipo_dispositivo', 'estado_activo'.
      Invoca filtrar_modelos y retorna HTTP 200 con ModeloDispositivoOutputSerializer.
    - POST (CU-79): Permitido para ADMIN y TECNICO. Consume ModeloDispositivoCreateInputSerializer,
      llama a crear_o_reactivar_modelo, y retorna 201 Created o 200 OK con mensaje indicativo.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin_o_tecnico(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['ADMIN', 'TECNICO']:
            raise PermissionDenied("Se requiere rol de Administrador o Técnico para consultar o gestionar modelos.")

    def get(self, request):
        self._verificar_admin_o_tecnico(request.user)

        from .selectors import filtrar_modelos
        from .serializers import ModeloDispositivoOutputSerializer, FiltroModelosInputSerializer

        input_serializer = FiltroModelosInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        modelos = filtrar_modelos(
            texto_busqueda=filtros['texto_busqueda'],
            id_marca=filtros['id_marca'],
            id_tipo_dispositivo=filtros['id_tipo_dispositivo'],
            estado_activo=filtros['estado_activo']
        )

        serializer = ModeloDispositivoOutputSerializer(modelos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        self._verificar_admin_o_tecnico(request.user)

        from .serializers import ModeloDispositivoCreateInputSerializer, ModeloDispositivoOutputSerializer
        from .services import crear_o_reactivar_modelo

        serializer = ModeloDispositivoCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        modelo, creado = crear_o_reactivar_modelo(
            usuario_ejecutor=request.user,
            nombre=serializer.validated_data['nombre'],
            id_marca=serializer.validated_data['id_marca'],
            id_tipo_dispositivo=serializer.validated_data['id_tipo_dispositivo']
        )

        output_serializer = ModeloDispositivoOutputSerializer(modelo)
        status_code = status.HTTP_201_CREATED if creado else status.HTTP_200_OK
        mensaje = (
            f"Modelo '{modelo.nombre}' registrado con éxito."
            if creado else
            f"Modelo '{modelo.nombre}' reactivado con éxito para esta marca."
        )

        data = dict(output_serializer.data)
        data["mensaje"] = mensaje
        data["creado"] = creado
        data["modelo"] = output_serializer.data
        return Response(data, status=status_code)


class ModeloDispositivoEstadoApi(APIView):
    """
    CU-80: Cambiar Estado de Modelo.
    - Requiere IsAuthenticated y rol EXCLUSIVO de ADMIN.
    - PATCH: Recibe id_modelo por URL. No requiere payload. Llama a cambiar_estado_modelo y retorna 200 OK.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para cambiar el estado de modelos.")

    def patch(self, request, id_modelo: int):
        self._verificar_admin(request.user)

        from django.core.exceptions import ObjectDoesNotExist
        from .services import cambiar_estado_modelo
        from .serializers import ModeloDispositivoOutputSerializer

        try:
            modelo_modificado = cambiar_estado_modelo(
                usuario_admin=request.user,
                id_modelo=id_modelo
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró el modelo con ID {id_modelo}."},
                status=status.HTTP_404_NOT_FOUND
            )

        output_serializer = ModeloDispositivoOutputSerializer(modelo_modificado)
        data = dict(output_serializer.data)
        data["mensaje"] = f"Estado del modelo actualizado a {'Activo' if modelo_modificado.estado_activo else 'Inactivo'}."
        data["modelo"] = output_serializer.data
        return Response(data, status=status.HTTP_200_OK)


class CategoriaListApi(APIView):
    """
    API endpoint para listar categorías de productos habilitadas.
    Accesible para poblar filtros en el catálogo de clientes y vistas generales.
    """
    def get(self, request):
        from .selectors import obtener_categorias_activas
        from .serializers import CategoriaProductoOutputSerializer

        categorias = obtener_categorias_activas()
        serializer = CategoriaProductoOutputSerializer(categorias, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductoTiendaListApi(APIView):
    """
    API endpoint para listar productos aptos para la venta en el portal de clientes (Tienda).
    Permite filtrar por búsqueda de texto y por ID de categoría, calculando el stock disponible.
    """
    def get(self, request):
        from .selectors import obtener_productos_tienda
        from .serializers import ProductoTiendaOutputSerializer, FiltroProductosTiendaInputSerializer

        input_serializer = FiltroProductosTiendaInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        usuario = request.user if (request.user and request.user.is_authenticated) else None
        productos = obtener_productos_tienda(
            search=filtros['search'],
            id_categoria=filtros['id_categoria'],
            usuario=usuario
        )
        serializer = ProductoTiendaOutputSerializer(productos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ProductoCreateApi(APIView):
    """
    CU-12: Registrar Producto.
    Permite al administrador dar de alta manualmente un producto en el catálogo
    definiendo sus especificaciones, precio, propósitos operativos y stock inicial/mínimo.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para registrar productos.")

    def post(self, request):
        self._verificar_admin(request.user)

        from .serializers import ProductoCreateInputSerializer, ProductoCreateOutputSerializer
        from .services import registrar_producto
        from django.core.exceptions import ValidationError as DjangoValidationError

        serializer = ProductoCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            producto = registrar_producto(
                usuario_admin=request.user,
                datos_validados=serializer.validated_data
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = ProductoCreateOutputSerializer(producto)
        return Response(
            {
                "mensaje": f"Producto '{producto.nombre}' registrado con éxito.",
                "id_producto": producto.id_producto,
                "producto": output.data
            },
            status=status.HTTP_201_CREATED
        )


class ProductoSubirImagenApi(APIView):
    """
    Subida de imagen de producto desde el dispositivo local.
    Almacena el archivo en MEDIA_ROOT/productos/ y retorna la URL relativa servida por Django.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def _verificar_admin_o_tecnico(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol not in ['ADMIN', 'TECNICO']:
            raise PermissionDenied("Permisos insuficientes para subir imágenes de productos.")

    def post(self, request):
        self._verificar_admin_o_tecnico(request.user)
        import os
        import uuid
        from django.conf import settings

        archivo = request.FILES.get('imagen') or request.FILES.get('file')
        if not archivo:
            return Response(
                {"error": "No se proporcionó ningún archivo de imagen."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar tamaño máximo (5MB)
        max_tamano = 5 * 1024 * 1024
        if archivo.size > max_tamano:
            return Response(
                {"error": "La imagen excede el tamaño máximo permitido de 5 MB."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validar extensión
        nombre_original = archivo.name
        ext = os.path.splitext(nombre_original)[1].lower()
        extensiones_validas = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.jfif']
        if ext not in extensiones_validas:
            return Response(
                {"error": f"Formato no válido. Extensiones permitidas: {', '.join(extensiones_validas)}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Guardar archivo en MEDIA_ROOT/productos
        directorio_destino = os.path.join(settings.MEDIA_ROOT, 'productos')
        os.makedirs(directorio_destino, exist_ok=True)

        nombre_seguro = f"prod_{uuid.uuid4().hex[:12]}{ext}"
        ruta_archivo = os.path.join(directorio_destino, nombre_seguro)

        with open(ruta_archivo, 'wb+') as destino:
            for chunk in archivo.chunks():
                destino.write(chunk)

        url_imagen = f"{settings.MEDIA_URL.rstrip('/')}/productos/{nombre_seguro}"

        return Response(
            {
                "url_imagen": url_imagen,
                "nombre_original": nombre_original,
                "mensaje": "Imagen subida exitosamente al servidor."
            },
            status=status.HTTP_201_CREATED
        )


class ProductoDetailApi(APIView):
    """
    CU-68: Modificar Producto y Consulta Detallada.
    - GET: Retorna la información vigente completa del producto (datos descriptivos,
      comerciales, imágenes, banderas operativas y stock mínimo).
    - PUT / PATCH: Valida y aplica las modificaciones sobre el producto.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para gestionar productos.")

    def get(self, request, id_producto: int):
        from django.core.exceptions import ObjectDoesNotExist
        from .selectors import obtener_producto
        from .serializers import ProductoDetailOutputSerializer

        try:
            producto = obtener_producto(id_producto)
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró el producto con ID {id_producto}."},
                status=status.HTTP_404_NOT_FOUND
            )

        serializer = ProductoDetailOutputSerializer(producto)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request, id_producto: int):
        return self._procesar_modificacion(request, id_producto)

    def patch(self, request, id_producto: int):
        return self._procesar_modificacion(request, id_producto)

    def _procesar_modificacion(self, request, id_producto: int):
        self._verificar_admin(request.user)
        from django.core.exceptions import ObjectDoesNotExist, ValidationError as DjangoValidationError
        from .serializers import ProductoUpdateInputSerializer, ProductoDetailOutputSerializer
        from .services import modificar_producto

        serializer = ProductoUpdateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            producto = modificar_producto(
                usuario_admin=request.user,
                id_producto=id_producto,
                datos_validados=serializer.validated_data
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró el producto con ID {id_producto}."},
                status=status.HTTP_404_NOT_FOUND
            )
        except DjangoValidationError as e:
            msg = e.messages if hasattr(e, 'messages') else [str(e)]
            return Response(
                {"error": msg[0] if len(msg) == 1 else msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        output = ProductoDetailOutputSerializer(producto)
        return Response(
            {
                "mensaje": f"Producto '{producto.nombre}' actualizado con éxito.",
                "id_producto": producto.id_producto,
                "producto": output.data
            },
            status=status.HTTP_200_OK
        )


class TipoDispositivoApi(APIView):
    """
    CU-65: Crear Tipo de Dispositivo y Listado de Tipos de Dispositivos.
    - GET: Retorna la lista completa de tipos de dispositivos (autenticado).
    - POST: Registra un nuevo tipo de dispositivo (exclusivo ADMIN).
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para registrar tipos de dispositivos.")

    def get(self, request):
        from .selectors import obtener_todos_tipos_dispositivos
        from .serializers import TipoDispositivoOutputSerializer, FiltroTiposDispositivosInputSerializer

        input_serializer = FiltroTiposDispositivosInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        tipos = obtener_todos_tipos_dispositivos(
            solo_activos=filtros['solo_activos'],
            estado_activo=filtros['estado_activo']
        )
        serializer = TipoDispositivoOutputSerializer(tipos, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        self._verificar_admin(request.user)

        from .serializers import TipoDispositivoCreateInputSerializer, TipoDispositivoOutputSerializer
        from .services import crear_tipo_dispositivo

        serializer = TipoDispositivoCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tipo_dispositivo = crear_tipo_dispositivo(
            usuario_admin=request.user,
            nombre=serializer.validated_data['nombre']
        )

        output_serializer = TipoDispositivoOutputSerializer(tipo_dispositivo)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class TipoDispositivoEstadoApi(APIView):
    """
    CU-66: Cambiar Estado de Tipo de Dispositivo.
    - PATCH: Invierte el valor del atributo estado_activo (exclusivo ADMIN).
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para cambiar el estado de tipos de dispositivos.")

    def patch(self, request, id_tipo: int):
        self._verificar_admin(request.user)

        from django.core.exceptions import ObjectDoesNotExist
        from .services import cambiar_estado_tipo_dispositivo
        from .serializers import TipoDispositivoOutputSerializer

        try:
            tipo_actualizado = cambiar_estado_tipo_dispositivo(
                usuario_admin=request.user,
                id_tipo=id_tipo
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró el tipo de dispositivo con ID {id_tipo}."},
                status=status.HTTP_404_NOT_FOUND
            )

        output_serializer = TipoDispositivoOutputSerializer(tipo_actualizado)
        data = dict(output_serializer.data)
        data["mensaje"] = f"Estado del tipo de dispositivo actualizado a {'Activo' if tipo_actualizado.estado_activo else 'Inactivo'}."
        data["tipo_dispositivo"] = output_serializer.data
        return Response(data, status=status.HTTP_200_OK)


class CategoriaProductoApi(APIView):
    """
    CU-39: Filtrar Categorías de Producto y CU-29: Agregar Categoría de Producto.
    - Requiere IsAuthenticated y rol de ADMIN.
    - GET (CU-39): Captura query param 'buscar' (o 'q'/'search'), filtra con selector y serializa.
    - POST (CU-29): Valida con CategoriaProductoCreateInputSerializer y crea con crear_categoria_producto.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para gestionar categorías de productos.")

    def get(self, request):
        self._verificar_admin(request.user)

        from .selectors import filtrar_categorias_producto
        from .serializers import CategoriaProductoOutputSerializer, FiltroCategoriasProductoInputSerializer

        input_serializer = FiltroCategoriasProductoInputSerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filtros = input_serializer.validated_data

        categorias = filtrar_categorias_producto(
            texto_busqueda=filtros['texto_busqueda'],
            estado_activo=filtros['estado_activo']
        )
        serializer = CategoriaProductoOutputSerializer(categorias, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        self._verificar_admin(request.user)

        from .serializers import CategoriaProductoCreateInputSerializer, CategoriaProductoOutputSerializer
        from .services import crear_categoria_producto

        serializer = CategoriaProductoCreateInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        categoria = crear_categoria_producto(
            usuario_admin=request.user,
            nombre=serializer.validated_data['nombre'],
            descripcion=serializer.validated_data.get('descripcion', '')
        )

        output_serializer = CategoriaProductoOutputSerializer(categoria)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)


class CategoriaProductoEstadoApi(APIView):
    """
    CU-30: Cambiar Estado de Categoría de Producto.
    - Requiere IsAuthenticated y rol ADMIN.
    - PATCH (CU-30): Recibe id_categoria por URL, no requiere payload.
      Invoca cambiar_estado_categoria_producto y retorna HTTP 200 OK.
    """
    permission_classes = [IsAuthenticated]

    def _verificar_admin(self, user):
        rol = getattr(user, 'id_rol', None) or getattr(user, 'rol', None)
        codigo_rol = (getattr(rol, 'codigo', '') or '').upper()
        if codigo_rol != 'ADMIN':
            raise PermissionDenied("Se requiere rol de Administrador para cambiar el estado de categorías de productos.")

    def patch(self, request, id_categoria: int):
        self._verificar_admin(request.user)

        from django.core.exceptions import ObjectDoesNotExist
        from .services import cambiar_estado_categoria_producto
        from .serializers import CategoriaProductoOutputSerializer

        try:
            categoria_modificada = cambiar_estado_categoria_producto(
                usuario_admin=request.user,
                id_categoria=id_categoria
            )
        except ObjectDoesNotExist:
            return Response(
                {"error": f"No se encontró la categoría de producto con ID {id_categoria}."},
                status=status.HTTP_404_NOT_FOUND
            )

        output_serializer = CategoriaProductoOutputSerializer(categoria_modificada)
        data = dict(output_serializer.data)
        data["mensaje"] = f"Estado de la categoría actualizado a {'Activo' if categoria_modificada.estado_activo else 'Inactivo'}."
        data["categoria"] = output_serializer.data
        return Response(data, status=status.HTTP_200_OK)
