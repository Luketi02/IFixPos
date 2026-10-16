from django.db import migrations


def poblar_catalogo_geografico(apps, schema_editor):
    Pais = apps.get_model('geo_app', 'Pais')
    Provincia = apps.get_model('geo_app', 'Provincia')
    Ciudad = apps.get_model('geo_app', 'Ciudad')

    # Solo insertar si el catálogo está vacío
    if Pais.objects.filter(nombre_pais='Argentina').exists():
        return

    pais_ar, _ = Pais.objects.get_or_create(
        nombre_pais='Argentina',
        defaults={'cobertura_habilitada': True}
    )

    datos_provincias_ciudades = {
        'Ciudad Autónoma de Buenos Aires': ['CABA', 'Palermo', 'Belgrano', 'Caballito', 'Recoleta'],
        'Buenos Aires': ['La Plata', 'Mar del Plata', 'Bahía Blanca', 'Quilmes', 'San Isidro', 'Tandil', 'Pilar'],
        'Catamarca': ['San Fernando del Valle de Catamarca'],
        'Chaco': ['Resistencia', 'Presidencia Roque Sáenz Peña'],
        'Chubut': ['Rawson', 'Comodoro Rivadavia', 'Puerto Madryn', 'Trelew'],
        'Córdoba': ['Córdoba Capital', 'Villa Carlos Paz', 'Río Cuarto', 'Villa María', 'Alta Gracia'],
        'Corrientes': ['Corrientes Capital', 'Goya', 'Paso de los Libres'],
        'Entre Ríos': ['Paraná', 'Concordia', 'Gualeguaychú'],
        'Formosa': ['Formosa Capital', 'Clorinda'],
        'Jujuy': ['San Salvador de Jujuy', 'Palpalá'],
        'La Pampa': ['Santa Rosa', 'General Pico'],
        'La Rioja': ['La Rioja Capital', 'Chilecito'],
        'Mendoza': ['Mendoza Capital', 'San Rafael', 'Godoy Cruz', 'Guaymallén'],
        'Misiones': ['Posadas', 'Puerto Iguazú', 'Oberá'],
        'Neuquén': ['Neuquén Capital', 'San Martín de los Andes'],
        'Río Negro': ['Viedma', 'San Carlos de Bariloche', 'Cipolletti', 'General Roca'],
        'Salta': ['Salta Capital', 'San Ramón de la Nueva Orán', 'Tartagal'],
        'San Juan': ['San Juan Capital', 'Rawson', 'Rivadavia'],
        'San Luis': ['San Luis Capital', 'Villa Mercedes'],
        'Santa Cruz': ['Río Gallegos', 'Caleta Olivia', 'El Calafate'],
        'Santa Fe': ['Santa Fe Capital', 'Rosario', 'Rafaela', 'Venado Tuerto'],
        'Santiago del Estero': ['Santiago del Estero Capital', 'La Banda'],
        'Tierra del Fuego': ['Ushuaia', 'Río Grande'],
        'Tucumán': ['San Miguel de Tucumán', 'Yerba Buena', 'Concepción']
    }

    for nombre_provincia, lista_ciudades in datos_provincias_ciudades.items():
        provincia, _ = Provincia.objects.get_or_create(
            nombre_provincia=nombre_provincia,
            id_pais=pais_ar,
            defaults={'cobertura_habilitada': True}
        )
        for nombre_ciudad in lista_ciudades:
            Ciudad.objects.get_or_create(
                nombre_ciudad=nombre_ciudad,
                id_provincia=provincia,
                defaults={'cobertura_habilitada': True}
            )


def revertir_poblado(apps, schema_editor):
    Pais = apps.get_model('geo_app', 'Pais')
    Pais.objects.filter(nombre_pais='Argentina').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('geo_app', '0002_direccion_is_active'),
    ]

    operations = [
        migrations.RunPython(poblar_catalogo_geografico, revertir_poblado),
    ]
