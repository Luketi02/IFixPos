import json
import os
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.conf import settings
from geo_app.models import Pais, Provincia, Ciudad


class Command(BaseCommand):
    help = (
        "Puebla masivamente la geografía mundial (Países, Provincias y Ciudades) "
        "desde un archivo JSON estándar de alta jerarquía."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--limpiar',
            action='store_true',
            dest='limpiar',
            default=False,
            help='Limpia previamente las tablas Pais, Provincia y Ciudad para evitar duplicados.'
        )
        parser.add_argument(
            '--archivo',
            type=str,
            dest='archivo',
            default='geografia_mundial.json',
            help='Nombre o ruta relativa/absoluta del archivo JSON (por defecto: geografia_mundial.json junto a manage.py).'
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            dest='batch_size',
            default=5000,
            help='Tamaño de bloque para Ciudad.objects.bulk_create (por defecto: 5000).'
        )

    def handle(self, *args, **options):
        limpiar = options['limpiar']
        nombre_archivo = options['archivo']
        batch_size = options['batch_size']

        # 1. Localización y apertura del archivo JSON
        # Si es ruta relativa, resolver respecto a BASE_DIR (directorio donde vive manage.py)
        if os.path.isabs(nombre_archivo):
            ruta_archivo = nombre_archivo
        else:
            base_dir = getattr(settings, 'BASE_DIR', os.getcwd())
            ruta_archivo = os.path.join(base_dir, nombre_archivo)

        self.stdout.write(self.style.NOTICE(f"Buscando dataset geográfico en: {ruta_archivo}"))

        if not os.path.exists(ruta_archivo):
            raise CommandError(
                f"No se encontró el archivo '{nombre_archivo}' en '{ruta_archivo}'. "
                "Por favor, asegúrate de colocar el dataset 'geografia_mundial.json' junto a manage.py "
                "o indicar la ruta con --archivo /ruta/al/dataset.json."
            )

        self.stdout.write(self.style.HTTP_INFO("Cargando y parseando archivo JSON en memoria..."))
        try:
            with open(ruta_archivo, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except json.JSONDecodeError as exc:
            raise CommandError(f"Error al decodificar el archivo JSON: {exc}")
        except Exception as exc:
            raise CommandError(f"No se pudo leer el archivo '{ruta_archivo}': {exc}")

        if not isinstance(data, list):
            raise CommandError("El formato del JSON debe ser una lista de países [ { 'name': ..., 'states': ... } ].")

        total_paises_json = len(data)
        self.stdout.write(self.style.SUCCESS(f"Dataset cargado con éxito. Se detectaron {total_paises_json} países."))

        # 2. Transacción y procesamiento de datos
        try:
            with transaction.atomic():
                if limpiar:
                    self.stdout.write(self.style.WARNING("Limpiando tablas de geografía existentes (Ciudad, Provincia, Pais)..."))
                    try:
                        Ciudad.objects.all().delete()
                        Provincia.objects.all().delete()
                        Pais.objects.all().delete()
                        self.stdout.write(self.style.SUCCESS("Tablas limpiadas exitosamente."))
                    except Exception as e:
                        raise CommandError(
                            "No se pudieron limpiar las tablas de geografía. Es probable que existan direcciones "
                            f"asociadas a ciudades existentes en la base de datos (RestrictedError). Detalle: {e}"
                        )

                lista_ciudades = []
                paises_creados = 0
                provincias_creadas = 0
                total_ciudades_creadas = 0

                # 3. Iteración jerárquica
                for idx_pais, pais_data in enumerate(data, start=1):
                    # Priorizar traducción al español ('es') en el diccionario de traducciones
                    traducciones = pais_data.get('translations') or {}
                    nombre_es = traducciones.get('es') if isinstance(traducciones, dict) else None

                    nombre_pais = (
                        (nombre_es.strip() if isinstance(nombre_es, str) and nombre_es.strip() else None)
                        or pais_data.get('name')
                        or pais_data.get('nombre')
                        or f"Pais_{idx_pais}"
                    ).strip()
                    if not nombre_pais:
                        continue

                    # Cobertura por defecto: True para Argentina, False para el resto de países
                    nombre_en = str(pais_data.get('name', '')).strip().lower()
                    codigo_iso2 = str(pais_data.get('iso2', '')).strip().upper()
                    codigo_iso3 = str(pais_data.get('iso3', '')).strip().upper()
                    cobertura_pais = (
                        nombre_pais.lower() == 'argentina'
                        or nombre_en == 'argentina'
                        or codigo_iso2 == 'AR'
                        or codigo_iso3 == 'ARG'
                    )

                    # Guardar país individualmente para obtener la PK
                    pais_obj = Pais.objects.create(
                        nombre_pais=nombre_pais[:150],
                        cobertura_habilitada=cobertura_pais
                    )
                    paises_creados += 1

                    # Tolerancia a diferentes formatos de lista de estados/provincias
                    states = (
                        pais_data.get('states')
                        or pais_data.get('provincias')
                        or pais_data.get('departments')
                        or pais_data.get('regions')
                        or []
                    )
                    for idx_prov, prov_data in enumerate(states, start=1):
                        nombre_provincia = (prov_data.get('name') or prov_data.get('nombre') or f"Provincia_{idx_prov}").strip()
                        if not nombre_provincia:
                            continue

                        # Guardar provincia vinculando foreign key a pais_obj
                        provincia_obj = Provincia.objects.create(
                            nombre_provincia=nombre_provincia[:150],
                            cobertura_habilitada=cobertura_pais,
                            id_pais=pais_obj
                        )
                        provincias_creadas += 1

                        cities = prov_data.get('cities') or prov_data.get('ciudades') or []
                        for idx_ciudad, ciudad_data in enumerate(cities, start=1):
                            if isinstance(ciudad_data, dict):
                                nombre_ciudad = (ciudad_data.get('name') or ciudad_data.get('nombre') or f"Ciudad_{idx_ciudad}").strip()
                            elif isinstance(ciudad_data, str):
                                nombre_ciudad = ciudad_data.strip()
                            else:
                                continue

                            if not nombre_ciudad:
                                continue

                            # Instanciamos el objeto Ciudad en memoria vinculando foreign key a provincia_obj
                            lista_ciudades.append(
                                Ciudad(
                                    nombre_ciudad=nombre_ciudad[:150],
                                    cobertura_habilitada=cobertura_pais,
                                    id_provincia=provincia_obj
                                )
                            )

                            # Vaciar buffer a la base de datos cada batch_size registros para mantener RAM plana
                            if len(lista_ciudades) >= batch_size:
                                Ciudad.objects.bulk_create(lista_ciudades, batch_size=batch_size)
                                total_ciudades_creadas += len(lista_ciudades)
                                self.stdout.write(
                                    f"  -> Inyectado bloque masivo: {total_ciudades_creadas} ciudades persistidas..."
                                )
                                lista_ciudades = []

                    if idx_pais % 25 == 0 or idx_pais == total_paises_json:
                        self.stdout.write(
                            f"Progreso: {idx_pais}/{total_paises_json} países procesados "
                            f"({provincias_creadas} provincias, {total_ciudades_creadas + len(lista_ciudades)} ciudades)..."
                        )

                # 4. Inserción del remanente final de ciudades
                if lista_ciudades:
                    Ciudad.objects.bulk_create(lista_ciudades, batch_size=batch_size)
                    total_ciudades_creadas += len(lista_ciudades)
                    lista_ciudades = []

                self.stdout.write(self.style.SUCCESS("=" * 65))
                self.stdout.write(
                    self.style.SUCCESS(
                        f"POBLACIÓN MUNDIAL COMPLETADA EXITOSAMENTE:\n"
                        f" - Países creados y vinculados: {paises_creados}\n"
                        f" - Provincias creadas y vinculadas: {provincias_creadas}\n"
                        f" - Ciudades creadas y vinculadas: {total_ciudades_creadas}"
                    )
                )
                self.stdout.write(self.style.SUCCESS("=" * 65))

        except Exception as exc:
            raise CommandError(f"Error crítico durante la inserción masiva en la base de datos: {exc}")
