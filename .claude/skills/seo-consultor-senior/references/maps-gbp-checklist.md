<!-- Actualizado: 2026-03-23 -->
# Checklist de Completitud del Perfil de GBP (Vía API)

Esta checklist puntúa un Google Business Profile usando datos obtenidos de
la API My Business Info de DataForSEO. Mide la completitud del perfil en la
PLATAFORMA de maps, no las señales on-page (de eso se encarga seo-local).

## Fuentes

- Oficial de Google: https://support.google.com/business/answer/7091
- Whitespark 2026 Local Search Ranking Factors (Estudio)
- BrightLocal LCRS 2026 (Estudio)

---

## Sistema de Puntuación

Cada campo: **Presente + Optimizado = 2pts**, **Presente = 1pt**, **Ausente = 0pts**

Total posible: 50 puntos. Normalizar a escala 0-100: `(puntuación / 50) * 100`

---

## Campos Críticos (Impacto Directo en el Ranking)

| # | Campo | Puntos | Criterio de Optimización |
|---|-------|--------|-----------------------------|
| 1 | **Categoría principal** | 2 | Subtipo más específico para el sector (p. ej., "Dentista Estético" en lugar de "Dentista") |
| 2 | **Categorías adicionales** | 2 | 3-5 categorías relevantes (óptimo: 4 adicionales según BrightLocal) |
| 3 | **Nombre del negocio** | 2 | Coincide exactamente con el nombre real (sin keyword stuffing) |
| 4 | **Dirección física** | 2 | Completa, coincide con el NAP de la web |
| 5 | **Número de teléfono** | 2 | Número local (no de tarificación especial), coincide con la web |
| 6 | **URL de la web** | 2 | Apunta a la página correcta (no la página con más fuerza -- riesgo de la Actualización de Diversidad) |
| 7 | **Horario del negocio** | 2 | Completo con horarios especiales/festivos. Abierto en el momento de la búsqueda = factor #5 |
| 8 | **Estado de verificación** | 2 | Insignia Google Verified activa |

**Subtotal: 16 puntos (8 campos)**

---

## Campos Importantes (Influencia Significativa)

| # | Campo | Puntos | Criterio de Optimización |
|---|-------|--------|-----------------------------|
| 9 | **Descripción del negocio** | 2 | 250-750 caracteres, incluye el servicio principal + keywords de ubicación de forma natural |
| 10 | **Lista de servicios** | 2 | Todos los servicios principales listados con descripciones |
| 11 | **Productos** | 2 | Productos/servicios clave con precios (si aplica) |
| 12 | **Fotos** | 2 | 10+ fotos de distintos tipos: logo, portada, interior, exterior, equipo, productos |
| 13 | **Recencia de fotos** | 2 | Fotos subidas en los últimos 30 días |
| 14 | **Atributos** | 2 | Atributos relevantes configurados (accesibilidad, pagos, servicios, identidad) |
| 15 | **Áreas de servicio** | 2 | Definidas para SABs, hasta 20 áreas (ciudades o códigos postales) |
| 16 | **Enlace a menú/servicios** | 2 | URL de menú (restaurantes) o de servicios (otros) |

**Subtotal: 16 puntos (8 campos)**

---

## Campos Complementarios (Señales de Apoyo)

| # | Campo | Puntos | Criterio de Optimización |
|---|-------|--------|-----------------------------|
| 17 | **Posts de Google** | 2 | Publicación activa (1+/semana). Tipos: novedad, oferta, evento, producto |
| 18 | **Recencia de posts** | 2 | Post en los últimos 7 días |
| 19 | **Enlace de reserva** | 2 | URL de cita/reserva configurada |
| 20 | **Perfiles sociales** | 2 | Vinculados vía `sameAs` o enlaces sociales de GBP |
| 21 | **Logo** | 2 | Logo cuadrado de alta calidad subido |
| 22 | **Foto de portada** | 2 | Imagen de portada acorde a marca y de alta resolución |
| 23 | **Vídeos** | 2 | Al menos 1 vídeo subido |
| 24 | **Respuestas del propietario** | 2 | Responde a las reseñas (objetivo: 80%+ de tasa de respuesta) |
| 25 | **Interacción en P&R** | 2 | Contenido de FAQ en la web (la sección de P&R de GBP quedó obsoleta en dic. 2025) |

**Subtotal: 18 puntos (9 campos)**

---

## Ajustes de Peso Específicos por Sector

Al puntuar, aplica multiplicadores a los campos que importan más en sectores concretos:

### Restaurante
- Enlace a menú/servicios: **x2** (crítico para búsquedas de comida)
- Fotos: **x1.5** (las fotos de comida impulsan el engagement)
- Enlace de reserva: **x1.5** (se espera sistema de reservas)
- Atributos: **x1.5** (dieta, comer allí/para llevar/reparto son críticos)

### Sanidad
- Horario del negocio: **x1.5** (los pacientes necesitan horarios precisos)
- Atributos: **x1.5** (seguro, accesibilidad, telemedicina)
- Lista de servicios: **x2** (coincidencia con seguro y procedimientos)

### Legal
- Descripción del negocio: **x1.5** (claridad del área de práctica)
- Lista de servicios: **x2** (la coincidencia de área de práctica impulsa la visibilidad)
- Fotos: **x0,5** (menos impacto en el sector legal)

### Servicios para el Hogar
- Áreas de servicio: **x2** (el modelo SAB depende de esto)
- Horario del negocio: **x1.5** (disponibilidad de urgencias)
- Fotos: **x1.5** (fotos de antes/después de proyectos)

### Inmobiliaria
- Fotos: **x2** (las fotos de propiedades son críticas)
- Perfiles sociales: **x1.5** (branding del agente)
- Posts: **x1.5** (actualizaciones de anuncios)

### Automoción
- Productos: **x2** (inventario de vehículos)
- Fotos: **x2** (fotos de vehículos)
- Lista de servicios: **x1.5** (departamentos de venta + taller)

### Re-normalización Tras los Multiplicadores

Tras aplicar los multiplicadores del sector, re-normaliza para que el total siga siendo 0-100:
```
puntuación_final = (puntuación_ponderada_bruta / puntuación_ponderada_máxima_posible) * 100
```
Esto asegura una puntuación consistente independientemente de qué multiplicadores de sector estén activos.

---

## Interpretación de la Puntuación

| Puntuación | Valoración | Acción |
|------------|-------------|--------|
| 90-100 | Excelente | Mantener el ritmo de publicación y la frescura de fotos |
| 75-89 | Bueno | Rellenar las carencias restantes en campos complementarios |
| 50-74 | Necesita Trabajo | Faltan campos importantes, abordar carencias de Críticos + Importantes |
| 25-49 | Deficiente | Carencias importantes en el perfil que dañan la visibilidad. Priorizar campos Críticos |
| 0-24 | Crítico | El perfil apenas existe o no está reclamado. Empezar por la verificación + campos Críticos |

---

## Mapeo de Datos (DataForSEO → Checklist)

| Campo de la Checklist | Campo de DataForSEO My Business Info |
|---------------------------|-------------------------------------------|
| Categoría principal | `category` |
| Categorías adicionales | `additional_categories` |
| Nombre del negocio | `title` |
| Dirección | `address_info` |
| Teléfono | `contact_info` (tipo: phone) |
| Web | `domain`, `url` |
| Horario | `work_hours` |
| Descripción | `description` |
| Servicios | (API separada o atributos) |
| Fotos | `photos_count`, `main_image` |
| Atributos | `attributes` (agrupados por tipo) |
| Horas populares | `popular_times` |
| Posts | My Business Updates API |
| Estado de verificación | No expuesto directamente — inferir a partir de la completitud del perfil + presencia en el SERP de Maps, o marcar como "Desconocido (requiere comprobación manual)" |
