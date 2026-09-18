<!-- Actualizado: 2026-03-23 -->
# Endpoints de las APIs de Maps y Business Data de DataForSEO

## Clave de Fuentes

- **Docs**: docs.dataforseo.com (documentación oficial de la API)
- **Precios**: dataforseo.com/pricing (páginas oficiales de precios)

---

## Autenticación y Límites

- HTTP Basic Auth (login:contraseña)
- Límite de peticiones: **2.000 llamadas API/minuto** en todos los endpoints
- Cada POST admite hasta **100 tareas** en una sola petición
- Depósito mínimo: 50$. 1$ de crédito de prueba gratuito. Los créditos no caducan.

---

## API de SERP de Google Maps (Base del Geo-Grid)

**Endpoint:** `POST https://api.dataforseo.com/v3/serp/google/maps/live/advanced`
**Fuente de precios:** https://dataforseo.com/pricing/serp-api

### Parámetros de la Petición

| Parámetro | Obligatorio | Descripción |
|-----------|--------------|--------------|
| `keyword` | Sí | Consulta de búsqueda (p. ej., "dentista") |
| `location_name` | No | Ubicación con nombre (p. ej., "Madrid,España") |
| `location_code` | No | Código de ubicación de DataForSEO (p. ej., 1026339 para Austin) |
| `location_coordinate` | No | `"latitud,longitud,zoom"` (máx. 7 decimales, zoom 3z-21z) |
| `language_code` | No | Por defecto: "en" |
| `device` | No | "desktop" o "mobile" |
| `depth` | No | Número de resultados a devolver |

**Crítico para el geo-grid:** usa `location_coordinate` para simular búsquedas desde puntos GPS específicos. Formato: `"40.7128,-74.0060,15z"`.

### Campos de la Respuesta (por ficha de negocio)

`cid`, `place_id`, `feature_id`, `title`, `domain`, `url`, `category`, `additional_categories`, `address`, `phone` (vía array `contact_info`), `rating.value`, `rating.votes_count`, `rating.rating_distribution` (desglose de 1 a 5 estrellas), `price_level`, `attributes` (agrupados: accesibilidad, pagos, niños), `work_time` (horario por día + `current_status`), `popular_times` (por hora y día), `latitude`, `longitude`, `local_business_links` (URLs de reserva, menú, pedido)

### Precios

| Método | Coste por tarea | Tiempo de Entrega |
|--------|--------------------|----------------------|
| Estándar | 0,0006$ (100 resultados desktop / 20 mobile) | Hasta 5 min |
| Priority | 0,0012$ | Hasta 1 min |
| **Live** | **0,002$** | Hasta 6 seg |

Los operadores de búsqueda en la keyword multiplican el coste x5.

---

## API My Business Info de Google (Análisis Profundo de un Negocio)

**Endpoint:** `POST https://api.dataforseo.com/v3/business_data/google/my_business_info/live`
**Fuente de precios:** https://dataforseo.com/pricing/business-data

### Opciones de Entrada

- `keyword`: nombre del negocio + ubicación (p. ej., "Starbucks Madrid")
- `"cid:XXXX"`: búsqueda directa por CID
- `"place_id:XXXX"`: búsqueda directa por Place ID

### Campos de la Respuesta

Perfil completo: `title`, `description`, `category`, `additional_categories`, `category_ids`, `attributes` (disponibles + no disponibles, agrupados por tipo), `contact_info` (array de teléfonos), `domain`, `url`, `work_hours` (por día con horas de apertura/cierre), `popular_times`, `cid`, `place_id`, `rating` (con distribución), `address_info` (desglose completo), `latitude`/`longitude`, `photos_count`, `main_image`

**Coste:** 0,0015$ por perfil (cola estándar)

**Caso de uso:** análisis profundo del negocio OBJETIVO. SERP de Maps para descubrir competidores.

---

## API de Reseñas de Google (Sentimiento y Velocidad)

**Endpoint:** `POST https://api.dataforseo.com/v3/business_data/google/reviews/task_post`
**Fuente de precios:** https://dataforseo.com/pricing/business-data

### Parámetros

| Parámetro | Descripción |
|-----------|--------------|
| `keyword` | Nombre del negocio + ubicación (o CID/place_id) |
| `depth` | Número de reseñas a obtener |
| `sort_by` | `"highest_rating"`, `"lowest_rating"`, `"most_relevant"`, `"newest"` |

### Campos de la Respuesta (por reseña)

`review_text`, `original_review_text`, `time_ago`, `timestamp`, `rating.value`, `review_id`, `profile_name`, `profile_url`, `profile_image_url`, `owner_answer` (texto + timestamp), `review_images`

### Precios

| Método | Tipo de Entrada | Coste |
|--------|--------------------|-------|
| Estándar (por 10 reseñas) | keyword | 0,003$ |
| Extendido (por 20 reseñas) | keyword | 0,003$ |
| Extendido (por 20 reseñas) | place_id/CID | **0,00075$** |

**Optimización:** usa siempre `place_id` o `cid` como entrada (4 veces más barato que keyword).

---

## API de P&R de Google

**Endpoint:** `POST https://api.dataforseo.com/v3/business_data/google/questions_and_answers/live`

Devuelve preguntas, respuestas, votos, fechas, fuentes de las respuestas. Disponibles los métodos live y standard.

**Caso de uso:** identificar preguntas sin responder, análisis de vacíos de FAQ.

**Nota:** Google dio de baja la sección de P&R de GBP en dic. 2025 (sustituida por Ask Maps Gemini AI). Este endpoint devuelve datos históricos.

---

## Búsqueda de Fichas de Negocio (Base de Datos Preindexada)

**Endpoint:** `POST https://api.dataforseo.com/v3/business_data/business_listings/search/live`

Consulta la base de datos preindexada de DataForSEO (no Google en vivo). Más rápida para consultas masivas basadas en categoría. Hasta 700+ resultados por consulta.

**Agregación de Categorías:** `/v3/business_data/business_listings/categories_aggregation/live` proporciona la taxonomía de categorías.

**Nombre de la herramienta MCP:** `business_data_business_listings_search`

---

## APIs de Reseñas Multiplataforma

### Tripadvisor

- Búsqueda: `/v3/business_data/tripadvisor/search/task_post`
- Reseñas: `/v3/business_data/tripadvisor/reviews/task_post`
- Facturado por cada 30 reseñas. Solo método estándar.

### Trustpilot

- Búsqueda: `/v3/business_data/trustpilot/search/task_post`
- Reseñas: `/v3/business_data/trustpilot/reviews/task_post`
- ~0,00075$/tarea. Solo método estándar.

---

## Tabla de Estimación de Costes

| Operación | Llamadas API | Coste Est. (Live) |
|-----------|-----------------|------------------------|
| Geo-grid 7x7, 1 keyword | 49 | 0,098$ |
| Geo-grid 7x7, 3 keywords | 147 | 0,294$ |
| Geo-grid 3x3, 1 keyword | 9 | 0,018$ |
| Perfil del negocio objetivo | 1 | 0,0015$ |
| 100 reseñas (vía place_id) | 5 | 0,00375$ |
| 20 perfiles de competidores | 20 | 0,03$ |
| Auditoría de posts de GBP | 1 | ~0,002$ |
| Obtención de P&R | 1 | ~0,002$ |
| **Auditoría completa (grid de 1 keyword)** | **~73** | **~0,13$** |
| **Auditoría completa (grid de 3 keywords)** | **~171** | **~0,33$** |

**Fórmula:** `tamaño_grid^2 x keywords x 0,002$` (live) o `x 0,0006$` (estándar)
