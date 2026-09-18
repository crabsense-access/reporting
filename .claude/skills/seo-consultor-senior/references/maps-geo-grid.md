<!-- Actualizado: 2026-03-23 -->
# Algoritmo de Rastreo de Rankings Geo-Grid

## Concepto

El rastreo de rankings geo-grid simula búsquedas de Google Maps desde múltiples
coordenadas GPS alrededor de un negocio para mostrar cómo varía el ranking a lo
largo de un área geográfica. El resultado es un mapa de calor que revela dónde
posiciona bien el negocio (verde) y dónde dominan los competidores (rojo).

---

## Generación de la Cuadrícula (Basada en Haversine)

### Algoritmo

1. Toma las coordenadas centrales (ubicación del negocio): `center_lat`, `center_lng`
2. Define el tamaño de la cuadrícula (p. ej., 7x7 = 49 puntos) y el radio en km
3. Calcula el espaciado: `step = (2 * radius_km) / (grid_size - 1)`
4. Genera los puntos de la cuadrícula con la fórmula de offset:

```
Para cada fila i (0 a grid_size-1) y columna j (0 a grid_size-1):
  dy = (i - center_index) * step_km
  dx = (j - center_index) * step_km
  new_lat = center_lat + (dy / 111.32)
  new_lng = center_lng + (dx / (111.32 * cos(center_lat * pi/180)))
```

Donde `center_index = (grid_size - 1) / 2` y `111,32 km = 1 grado de latitud`.

### Tamaños de Cuadrícula y Casos de Uso

| Cuadrícula | Puntos | Radio Típico | Ideal Para | Coste Est. (Live) |
|------------|--------|----------------|------------|----------------------|
| 3x3 | 9 | 2 km | Instantánea rápida, presupuesto bajo | 0,018$/keyword |
| 5x5 | 25 | 3 km | Auditoría urbana estándar | 0,050$/keyword |
| **7x7** | **49** | **5 km** | **Por defecto. Mejor equilibrio entre cobertura y coste** | **0,098$/keyword** |
| 9x9 | 81 | 8 km | Área de servicio suburbana/amplia | 0,162$/keyword |
| 13x13 | 169 | 15 km | Área rural o gran área metropolitana | 0,338$/keyword |

**Directrices de radio:** urbano denso = 2-5 km, suburbano = 5-10 km, rural = 10-25 km.

---

## Integración con DataForSEO

Usa la API de SERP de Google Maps con el parámetro `location_coordinate`:

```json
{
  "keyword": "dentista",
  "location_coordinate": "30.2672,-97.7431,15z",
  "language_code": "es",
  "device": "mobile",
  "depth": 20
}
```

Para cada punto de la cuadrícula, lanza una llamada a la API con las coordenadas
de ese punto. Analiza el array `items` para encontrar la posición del negocio
objetivo (posición en los resultados).

**Optimización de peticiones:** DataForSEO permite hasta 100 tareas por POST.
Para una cuadrícula 7x7, agrupa las 49 tareas en una sola petición para minimizar
la sobrecarga HTTP.

---

## Share of Local Voice (SoLV)

Métrica pionera de Local Falcon. Mide la visibilidad a lo largo de la cuadrícula.

### Cálculo

```
SoLV = (puntos_en_top_3 / total_puntos_cuadrícula) * 100
```

### Interpretación

| SoLV | Interpretación |
|------|-----------------|
| 80-100% | Dominante. El negocio es dueño de la zona local. |
| 60-79% | Fuerte. Visible en la mayor parte del área de servicio. |
| 40-59% | Moderado. Carencias significativas de cobertura. |
| 20-39% | Débil. Los competidores dominan la mayoría de las zonas. |
| 0-19% | Crítico. Prácticamente invisible en los resultados de maps. |

### Métricas Extendidas

- **Ranking Medio**: posición media en todos los puntos de la cuadrícula (menor = mejor)
- **Puntuación de Visibilidad**: media ponderada donde top 3 = 3pts, 4-10 = 1pt, 10+ = 0pts
- **Peor Cuadrante**: identifica qué dirección cardinal tiene los rankings más débiles

---

## Renderizado de Mapa de Calor en ASCII

Para salida en terminal/Markdown, renderiza una cuadrícula usando símbolos de posición de ranking:

### Formato

```
Geo-Grid: "dentista" (7x7, radio 5km, centro: 30.267, -97.743)

     O -------- E
  N  1  1  2  3  5  8  -
  |  1  1  1  2  3  6  9
  |  2  1  [1] 1  2  4  7
  |  3  2  1  1  1  3  5
  |  5  3  2  1  2  4  8
  |  8  5  3  2  3  6  -
  S  -  8  5  4  5  9  -

Leyenda: [1]=centro, 1-3=top 3 (fuerte), 4-10=visible, -=sin ranking
SoLV: 57% (28/49 puntos de la cuadrícula en el top 3)
Ranking Medio: 3,4 | Más débil: cuadrante NE (ranking medio 7,2)
```

### Mapeo de Colores (para salida mejorada)

| Posición | Símbolo | Significado |
|----------|---------|--------------|
| 1 | `1` | Ranking nº1 (el mejor) |
| 2-3 | `2`, `3` | Top 3 (presencia local fuerte) |
| 4-10 | `4`-`9` | Visible pero no dominante |
| 11-20 | `+` | Enterrado en los resultados |
| No encontrado | `-` | Sin ranking en este punto |

---

## Cuadrícula Multi-Keyword

Para un análisis completo, escanea 2-3 keywords en la misma cuadrícula:

1. Keyword de servicio principal (p. ej., "dentista")
2. Marca + ubicación (p. ej., "Clínica Dental García Madrid")
3. Intención long-tail (p. ej., "dentista de urgencia cerca de mí")

**Coste de un escaneo 7x7 con 3 keywords:** 147 llamadas a la API = ~0,29$ (live) o ~0,088$ (estándar)

---

## Plantilla de Aviso de Coste

Antes de ejecutar un escaneo de geo-grid, muestra:

```
Estimación del Escaneo Geo-Grid:
  Cuadrícula: 7x7 (49 puntos)
  Keywords: 3
  Llamadas a la API: 147
  Coste estimado: 0,09$ (estándar) - 0,29$ (live)
  ¿Continuar? [Se consumirán créditos de DataForSEO]
```
