<!-- Actualizado: 2026-03-23 -->
# APIs de Maps Gratuitas para esta Skill

## Clave de Fuentes

- **Docs**: documentación oficial de la API de cada servicio
- **Política**: políticas y términos de uso oficiales

---

## Overpass API (Mejor Opción Gratuita para Descubrir Competidores)

**URL Base:** `https://overpass-api.de/api/interpreter`
**Docs:** https://wiki.openstreetmap.org/wiki/Overpass_API
**Licencia:** ODbL (requiere atribución: "Datos de OpenStreetMap")

### Límites de Peticiones

- Basado en slots: ~2 consultas concurrentes por IP
- Orientativo: ~10.000 peticiones/día, ~1 GB/día de descarga
- Timeout por defecto: 180 segundos, 512 MiB de memoria por consulta
- Usa `[timeout:25]` para consultas más ligeras

### Plantillas de Consulta

**Restaurantes en un radio de 5km:**
```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:25];(node["amenity"="restaurant"](around:5000,LAT,LNG);way["amenity"="restaurant"](around:5000,LAT,LNG););out body;>;out skel qt;'
```

**Todos los negocios de una calle:**
```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:25];way["name"="NOMBRE_CALLE"]["addr:city"="CIUDAD"];(._;>;);out body;'
```

**POIs de competidores por categoría en un cuadro delimitador:**
```bash
curl -s "https://overpass-api.de/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:25];(node["amenity"="dentist"](SUR,OESTE,NORTE,ESTE);way["amenity"="dentist"](SUR,OESTE,NORTE,ESTE););out body;>;out skel qt;'
```

### Etiquetas OSM Clave para SEO Local

| Categoría | Etiqueta OSM | Ejemplos |
|-----------|--------------|----------|
| Comida y Bebida | `amenity=restaurant`, `amenity=cafe`, `amenity=fast_food` | Restaurantes, cafeterías, comida para llevar |
| Sanidad | `amenity=dentist`, `amenity=doctors`, `amenity=pharmacy` | Dental, médico, farmacia |
| Legal | `office=lawyer`, `office=notary` | Despachos, notarías |
| Servicios para el Hogar | `craft=plumber`, `craft=electrician`, `craft=hvac` | Oficios, contratistas |
| Retail | `shop=supermarket`, `shop=clothes`, `shop=car` | Todos los tipos de comercio |
| Automoción | `shop=car`, `shop=car_repair`, `amenity=fuel` | Concesionarios, talleres, gasolineras |
| Hostelería | `tourism=hotel`, `tourism=motel`, `tourism=guest_house` | Alojamiento |
| Financiero | `amenity=bank`, `office=insurance`, `office=accountant` | Bancos, seguros, asesorías |

### Campos de Respuesta

Cada elemento devuelve: `id`, `lat`, `lon`, objeto `tags` con `name`, `phone`, `website`, `opening_hours`, `addr:street`, `addr:housenumber`, `addr:city`, `addr:postcode`, `cuisine`, `brand`, etc.

### Limitaciones

- Sin reseñas, valoraciones ni datos de popularidad
- Sin información específica de GBP
- La calidad de los datos varía según la región (excelente en Europa, irregular en otras zonas)
- Datos aportados por voluntarios; pueden estar desactualizados
- Tester interactivo: https://overpass-turbo.eu/

---

## Geoapify Places API (Búsqueda Estructurada de POIs)

**URL Base:** `https://api.geoapify.com/v2/places`
**Docs:** https://apidocs.geoapify.com/docs/places/
**Precios:** https://www.geoapify.com/pricing

### Plan Gratuito

- **3.000 créditos/día** (1 crédito = 20 lugares devueltos)
- 5 peticiones/segundo
- Requiere clave API (registro gratuito, sin tarjeta de crédito)
- **Caché y almacenamiento explícitamente permitidos** (a diferencia de Google)

### Plantilla de Consulta

```bash
curl -s "https://api.geoapify.com/v2/places?categories=catering.restaurant&filter=circle:LNG,LAT,5000&limit=20&apiKey=TU_CLAVE"
```

### Jerarquía de Categorías

Usa categorías separadas por puntos: `catering.restaurant`, `commercial.supermarket`, `healthcare.dentist`, `service.financial.accounting`, `commercial.vehicle.car_dealer`

### Formato de Respuesta

GeoJSON FeatureCollection. Cada feature tiene `properties`: `name`, `city`, `state`, `postcode`, `country`, `street`, `housenumber`, `phone`, `website`, `categories`, `lat`, `lon`, `place_id`, `formatted` (dirección completa formateada)

### Ventajas Frente a Overpass en Bruto

- Respuestas más limpias y estructuradas
- Datos agregados (OSM + OpenAddresses + WhosOnFirst + GeoNames)
- Taxonomía jerárquica de categorías
- Sin sorpresas de rate limit (sistema de créditos claro)

---

## Nominatim (Solo Geocodificación)

**URL Base:** `https://nominatim.openstreetmap.org`
**Docs:** https://nominatim.org/release-docs/latest/api/Overview/
**Política:** https://operations.osmfoundation.org/policies/nominatim/

### Límites de Peticiones (ESTRICTOS)

- **1 petición/segundo** (absoluto)
- Debe incluir una cabecera `User-Agent` válida (se rechazan los agentes por defecto de las librerías)
- Las consultas de autocompletado están **prohibidas**
- La geocodificación masiva está **prohibida** en la instancia pública
- Las consultas idénticas repetidas provocan baneos (cachea los resultados)

### Geocodificación Directa

```bash
curl -s "https://nominatim.openstreetmap.org/search?q=Calle+Mayor+123+Madrid&format=json&addressdetails=1" \
  -H "User-Agent: palo-seco-seo/1.7.0"
```

### Geocodificación Inversa

```bash
curl -s "https://nominatim.openstreetmap.org/reverse?lat=40.7128&lon=-74.0060&format=json" \
  -H "User-Agent: palo-seco-seo/1.7.0"
```

### Campos de Respuesta

`place_id`, `lat`, `lon`, `display_name`, `importance`, `category`, `type`, objeto `address` (house_number, road, city, state, postcode, country)

### Mejor Uso

- Conversión de dirección a coordenadas para el punto central del geo-grid
- Geocodificación inversa para validar direcciones de negocios
- **NO adecuada** para descubrir fichas de negocio (usa Overpass o Geoapify)

---

## Patrón de Aplicación de Rate Limits

```bash
# Nominatim: forzar 1 petición/seg con sleep
for addr in "${addresses[@]}"; do
  curl -s "https://nominatim.openstreetmap.org/search?q=${addr}&format=json" \
    -H "User-Agent: palo-seco-seo/1.7.0"
  sleep 1.1
done

# Overpass: sin límite explícito, pero usa timeouts razonables
# Si se devuelve HTTP 429, implementa backoff exponencial

# Geoapify: 5 peticiones/seg en el plan gratuito, no requiere control explícito
```

---

## Tabla Comparativa

| Función | Overpass | Geoapify | Nominatim |
|---------|----------|----------|-----------|
| Descubrimiento de negocios | Sí (tags) | Sí (categorías) | Limitado |
| Reseñas/valoraciones | No | No | No |
| Geocodificación | No | Sí | **La mejor** |
| Límite de peticiones | ~10k/día | 3k créditos/día | 1 petición/seg |
| Requiere autenticación | No | Clave API | No |
| Caché permitida | Sí | **Explícitamente** | **Obligatoria** |
| Calidad de datos | Regional | Agregada | Regional |
| Ideal para | Búsqueda de competidores por radio | Búsqueda estructurada de POIs | Resolución de direcciones |
