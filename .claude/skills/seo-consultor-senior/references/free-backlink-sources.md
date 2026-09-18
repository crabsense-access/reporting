# Fuentes Gratuitas de Datos de Backlinks

Referencia para la skill seo-backlinks. Se carga bajo demanda al analizar backlinks
con fuentes gratuitas.

## Comparativa de Fuentes

| Fuente | Autenticación | ¿Cualquier Dominio? | Calidad de Datos | Cobertura vs. Comercial | Límite de Peticiones |
|--------|----------------|------------------------|----------------------|------------------------------|------------------------|
| **Moz API** | Clave API (registro gratuito) | Sí | ★★★★☆ | ~70% para DA/PA | 1 petición/10s, 2.500 filas/mes |
| **Bing Webmaster** | Clave API (gratis) | Solo sitios verificados | ★★★☆☆ | ~15% (índice de Bing) | Generoso |
| **Common Crawl** | Ninguna (público) | Sí | ★★★☆☆ | ~25-40% de dominios | N/D |
| **Crawler de Verificación** | Ninguna | Sí | ★★★★★ (binario) | N/D (comprueba enlaces conocidos) | 1 petición/s por dominio |
| **DataForSEO** (de pago) | Clave API | Sí | ★★★★★ | ~90%+ | Según plan |

## Ponderación por Confianza

Al combinar datos de varias fuentes, aplica pesos de confianza a cada métrica:

| Fuente | Peso | Justificación |
|--------|------|----------------|
| DataForSEO | 1,00 | Nivel comercial, en tiempo real, completo |
| Crawler de Verificación | 0,95 | Observación directa (binario: el enlace existe o no) |
| Moz API | 0,85 | Índice grande (45,5 billones de enlaces), métricas consolidadas, retraso de actualización de 3 días |
| Bing Webmaster | 0,70 | Índice más pequeño (~15% de la web), pero fiable para páginas indexadas por Bing |
| Common Crawl | 0,50 | Solo a nivel de dominio, actualizaciones trimestrales, sin anchor text |

**Fórmula compuesta:**
```
puntuación_ponderada = Σ(puntuación_fuente × confianza × peso_factor) / Σ(confianza × peso_factor)
```

Cuando solo está disponible Common Crawl, limita la puntuación de salud máxima a 70/100 y
señala en el informe "limitado a métricas a nivel de dominio".

## Detalle de Fuentes

### Moz API (Nivel 1)
- **Endpoint:** `https://api.moz.com/jsonrpc` (JSON-RPC 2.0)
- **Plan gratuito:** 2.500 filas/mes, 1 petición cada 10 segundos (verifica los límites actuales en https://moz.com/products/api — los límites del plan gratuito pueden cambiar)
- **Registro:** https://moz.com/products/api (requiere tarjeta de crédito, no se cobra)
- **Datos:** Domain Authority (0-100), Page Authority, Spam Score (1-17%), recuento de enlaces,
  dominios referentes, distribución de anchor text
- **Script:** `scripts/moz_api.py`
- **Comandos:** `metrics`, `domains`, `anchors`, `pages`
- **Puntos ciegos:** sin velocidad de enlaces, sin patrones de enlaces tóxicos más allá del Spam Score,
  retraso de actualización de 3 días, índice más pequeño que Ahrefs/Semrush

### Bing Webmaster Tools (Nivel 2)
- **Endpoint:** `https://ssl.bing.com/webmaster/api.svc/json/`
- **Plan gratuito:** ilimitado para sitios verificados
- **Registro:** https://www.bing.com/webmasters (cuenta de Microsoft)
- **Función única:** comparación de backlinks con la competencia (ninguna otra herramienta gratuita lo ofrece)
- **Datos:** enlaces entrantes con anchor text, URL de origen, fecha de descubrimiento
- **Script:** `scripts/bing_webmaster.py`
- **Comandos:** `links`, `counts`, `compare`
- **Puntos ciegos:** solo páginas indexadas por Bing (~15% de la web), solo sitios verificados,
  sin métricas de autoridad, sin puntuación de spam

### Grafo Web de Common Crawl (Siempre Disponible)
- **Fuente de datos:** `s3://commoncrawl/projects/hyperlinkgraph/`
- **Publicaciones:** trimestrales (p. ej., cc-main-2025-18)
- **Sin autenticación necesaria:** datos públicos, descarga gratuita
- **Datos:** grado de entrada a nivel de dominio, PageRank, centralidad armónica, dominios referentes
- **Script:** `scripts/commoncrawl_graph.py`
- **Caché:** `~/.cache/claude-seo/commoncrawl/` (TTL de 90 días)
- **Puntos ciegos:** sin anchor text, sin datos a nivel de página, frescura mensual/trimestral,
  solo a nivel de dominio (p. ej., "nytimes.com enlaza a ejemplo.com" pero no se sabe desde qué página)

### Crawler de Verificación (Siempre Disponible)
- **Sin autenticación necesaria:** usa fetch_page.py + parse_html.py existentes
- **Datos:** verificación binaria (enlace existe/perdido/movido), anchor text, atributos rel
- **Script:** `scripts/verify_backlinks.py`
- **Entrada:** archivo JSON con entradas `[{"source_url": "..."}]`
- **Rastreo respetuoso:** retraso de 1 segundo entre peticiones al mismo dominio
- **Ideal para:** comprobar si los backlinks conocidos siguen existiendo, monitorizar la salud de los enlaces

## Cuándo Recomendar el Upgrade a DataForSEO

Sugiere la extensión de pago DataForSEO cuando:
- El usuario necesite **detección de enlaces tóxicos** más allá del Spam Score básico de Moz
- El usuario necesite **análisis de gap con competidores** a escala (Bing solo compara sitios verificados)
- El usuario necesite **tendencias de velocidad de enlaces** (enlaces nuevos/perdidos a lo largo del tiempo)
- El usuario necesite **datos en tiempo real** (las fuentes gratuitas se actualizan mensualmente como mucho)
- El usuario gestione **varios sitios de clientes** (los límites del plan gratuito son por cuenta)
- El usuario necesite **generación de archivo de disavow** con puntuación de confianza

## Realidad de la Calidad de los Datos

- Las herramientas comerciales indexan **entre 35 y 45 billones de enlaces** en más de 500M de dominios referentes
- Las fuentes gratuitas combinadas capturan **entre el 20% y el 40% de los datos brutos de backlinks**
- Pero **entre el 60% y el 70% de la inteligencia accionable**, ya que los enlaces de mayor autoridad aparecen en las muestras gratuitas
- En sitios con menos de 500 backlinks, las fuentes gratuitas pueden capturar **más del 50% del perfil relevante**
- **El número de dominios referentes importa más que el recuento bruto de backlinks** para el SEO
- Los 50-100 dominios referentes principales capturan la mayor parte de la autoridad de enlace

## Cinco Sesgos Sistemáticos en los Datos Gratuitos

1. **Sesgo de popularidad:** las herramientas gratuitas rastrean más los sitios populares, infrarrepresentando los de nicho
2. **Sesgo de truncamiento:** todas las herramientas gratuitas limitan a 100-1.000 enlaces, ocultando la cola larga
3. **Restricción de sitio propio:** GSC y Ahrefs Webmaster Tools solo funcionan para propiedades verificadas
4. **Métricas de calidad ausentes:** los datos brutos de CC carecen de puntuaciones de autoridad/toxicidad
5. **Retraso de actualización:** las fuentes gratuitas se actualizan mensualmente como mucho, frente a minutos en las comerciales
