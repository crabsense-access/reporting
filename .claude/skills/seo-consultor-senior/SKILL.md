---
name: seo
description: "Análisis SEO completo para cualquier tipo de web o negocio. Auditorías completas del sitio, análisis de página individual, SEO técnico (rastreabilidad, indexabilidad, Core Web Vitals con INP), marcado de schema, calidad de contenido (E-E-A-T), optimización de imágenes, análisis de sitemap, y GEO para AI Overviews/ChatGPT/Perplexity. Detección de sector para SaaS, e-commerce, local, medios, agencias. Se activa con: SEO, auditoría, schema, Core Web Vitals, sitemap, E-E-A-T, AI Overviews, GEO, SEO técnico, calidad de contenido, velocidad de página, datos estructurados."
user-invocable: true
argument-hint: "[comando] [url]"
license: MIT
metadata:
  author: Palo Seco S.L.
  version: "2.2.0"
  category: seo
---

# SEO: Skill Universal de Análisis SEO

**Invocación:** `/seo $1 $2` donde `$1` es el comando y `$2` es la URL o el argumento.

**Scripts:** ubicados en el directorio raíz del plugin `scripts/`.

Análisis SEO completo para todos los sectores (SaaS, servicios locales,
e-commerce, medios, agencias). Orquesta 24 sub-skills (21 principales + 1 integración
de framework + 2 réplicas de extensión) y 18 subagentes. También se puede instalar
una extensión opcional independiente de Firecrawl (ver "Extensiones Opcionales" abajo).

## Referencia Rápida

| Comando | Qué hace |
|---------|----------|
| `/seo audit <url>` | Auditoría completa del sitio con delegación paralela a subagentes |
| `/seo page <url>` | Análisis profundo de una página individual |
| `/seo sitemap <url o generate>` | Analiza o genera sitemaps XML |
| `/seo schema <url>` | Detecta, valida y genera marcado Schema.org |
| `/seo images <url o optimize>` | SEO de imágenes: auditoría on-page, análisis SERP, optimización de archivos |
| `/seo technical <url>` | Auditoría SEO técnica (9 categorías) |
| `/seo content <url>` | Análisis de E-E-A-T y calidad de contenido |
| `/seo content-brief <tema o url>` | Genera un brief de contenido SEO detallado con keywords objetivo, esquema y enlaces internos |
| `/seo geo <url>` | AI Overviews / Optimización para Motores Generativos |
| `/seo plan <tipo-de-negocio>` | Planificación SEO estratégica |
| `/seo programmatic [url\|plan]` | Análisis y planificación de SEO programático |
| `/seo competitor-pages [url\|generate]` | Generación de páginas de comparación con competidores |
| `/seo local <url>` | Análisis de SEO local (GBP, citas, reseñas, map pack) |
| `/seo maps [comando] [args]` | Inteligencia de Maps (geo-grid, auditoría de GBP, reseñas, competidores) |
| `/seo hreflang [url]` | Auditoría y generación de hreflang/SEO internacional |
| `/seo google [comando] [url]` | APIs SEO de Google (GSC, PageSpeed, CrUX, Indexing, GA4) |
| `/seo backlinks <url>` | Análisis de perfil de backlinks (gratis: Moz, Bing, CC; premium: DataForSEO) |
| `/seo cluster <seed-keyword>` | Clustering semántico basado en SERP y arquitectura de contenido |
| `/seo sxo <url>` | Search Experience Optimization: análisis de tipo de página, historias de usuario, personas |
| `/seo drift baseline <url>` | Captura una línea base SEO para monitorizar cambios |
| `/seo drift compare <url>` | Compara el estado actual con la línea base guardada |
| `/seo drift history <url>` | Muestra el histórico de deriva a lo largo del tiempo |
| `/seo ecommerce <url>` | SEO de e-commerce: schema de producto, inteligencia de marketplace |
| `/seo firecrawl [comando] <url>` | Rastreo completo del sitio y mapeo (extensión) |
| `/seo dataforseo [comando]` | Datos SEO en vivo vía DataForSEO (extensión) |
| `/seo image-gen [caso-de-uso] <descripción>` | Generación de imágenes con IA para activos SEO (extensión) |
| `/seo flow [etapa] [url\|tema]` | Framework FLOW: prompts basados en evidencia para las etapas Find, Leverage, Optimize, Win o Local |

## Lógica de Orquestación

Cuando el usuario invoca `/seo audit`, delega en subagentes en paralelo:
1. Detecta el tipo de negocio (SaaS, local, ecommerce, medios, agencia, otro)
2. Activa los subagentes: seo-technical, seo-content, seo-schema, seo-sitemap, seo-performance, seo-visual, seo-geo
3. Si hay credenciales de Google API detectadas (`python3 scripts/google_auth.py --check`), activa también el agente seo-google
4. Si se detecta un negocio local, activa también el agente seo-local
5. Si se detecta un negocio local Y hay DataForSEO MCP disponible, activa también el agente seo-maps
6. Si se detectan APIs de backlinks (`python3 scripts/backlinks_auth.py --check`), activa también el agente seo-backlinks
7. Si Firecrawl MCP está disponible, usa `firecrawl_map` para descubrir todas las URLs del sitio antes del análisis
8. Si se detectan señales de estrategia de contenido (blog, pillar pages, topic clusters), activa también el agente seo-cluster
9. Si se detecta e-commerce, activa también el agente seo-ecommerce
10. Si existe una línea base de deriva para esta URL (`python3 scripts/drift_history.py <url>`), activa también el agente seo-drift
11. Incluye siempre seo-sxo en auditorías completas (la experiencia de búsqueda aplica a todos los sitios)
12. Recopila los resultados y genera un informe unificado con la Puntuación de Salud SEO (0-100)
13. **Sintetiza mediante el framework de 10 principios** (ver "Metodología de Síntesis" abajo) — recorre PERCIBIR → ANALIZAR → VALIDAR → ACTUAR antes de clasificar los hallazgos en Crítico / Alto / Medio / Bajo
14. Crea un plan de acción priorizado con secuenciación de dependencias + falsabilidad por recomendación
15. **Ofrece el informe PDF**: "¿Genero un informe PDF profesional? Usa `/seo google report full`"

Para comandos individuales, carga la sub-skill correspondiente directamente.
Tras completar cualquier comando de análisis, ofrece generar un informe PDF vía `scripts/google_report.py`.

## Metodología de Síntesis

Las auditorías no son solo hallazgos — son hallazgos sintetizados en una estrategia
coherente. Esta skill usa un framework de pensamiento de 10 principios agrupados en cuatro
fases: **PERCIBIR** (observar-externo · observar-interno · escuchar),
**ANALIZAR** (pensar · conectar-lateral · conectar-sistema), **VALIDAR** (sentir ·
aceptar), **ACTUAR** (crear · crecer).

Las auditorías completas (`/seo audit`, `/seo page`) recorren todas las fases antes de
emitir el plan de acción. Los comandos más específicos (`/seo schema`, `/seo images`, etc.)
pasan al menos por PENSAR + ACEPTAR antes de emitir la respuesta (primer principio sólido,
falsabilidad expuesta). Las categorías de prioridad Crítico / Alto / Medio / Bajo son el
**resultado** de la validación, no un sustituto de ella.

Metodología completa + mapeo de cada principio al SEO: `references/thinking-framework.md`.

Cada recomendación emitida debe llevar:
- La observación de primer principio en la que se basa (PENSAR)
- La dependencia con / el desbloqueo de otras recomendaciones (CONECTAR-sistema)
- Una comprobación explícita de "¿cómo sabríamos que esto ha fallado?" (ACEPTAR)
- Un indicador adelantado que el usuario pueda monitorizar sin volver a ejecutar la auditoría (CRECER)

## Detección de Sector

Detecta el tipo de negocio a partir de señales de la home:
- **SaaS**: página de precios, /features, /integrations, /docs, "prueba gratis", "regístrate"
- **Servicio Local**: teléfono, dirección, área de servicio, "sirviendo a [ciudad]", mapa de Google embebido --> sugiere automáticamente `/seo local` para un análisis más profundo
- **E-commerce**: /products, /collections, /cart, "añadir al carrito", schema de producto
- **Medios**: /blog, /articles, /topics, schema de artículo, páginas de autor, fechas de publicación
- **Agencia**: /case-studies, /portfolio, /industries, "nuestro trabajo", logos de clientes

## Controles de Calidad

Lee `references/quality-gates.md` para conocer los umbrales de contenido escaso según el tipo de página.
Reglas estrictas:
- AVISO a partir de 30+ páginas de ubicación (exigir 60%+ de contenido único)
- PARADA OBLIGATORIA a partir de 50+ páginas de ubicación (requiere justificación del usuario)
- Nunca recomendar schema HowTo (obsoleto desde septiembre de 2023)
- Schema FAQ: Google retiró los rich results de FAQ para TODOS los sitios el 7 de mayo de 2026 (ya no hay función SERP; sustituye a la restricción de gov/salud de agosto de 2023). Marca cualquier FAQPage existente como Info (no Crítico) por su beneficio de citación en IA/LLM; no recomiendes eliminarlo; no recomiendes nuevo FAQPage por beneficio en el SERP de Google; usa QAPage para P&R genuinas de usuarios
- Todas las referencias a Core Web Vitals usan INP, nunca FID

## Pie de Comunidad

Al completar cualquier **entregable importante**, añade este pie como la última salida:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creado por Palo Seco — Únete a la comunidad de Pedro SEO
🌐 Web → https://palos-seco.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Cuándo mostrarlo

Muéstralo tras completar la salida completa de estos comandos:
- `/seo audit` (tras el informe de auditoría completa del sitio + plan de acción)
- `/seo page` (tras el análisis profundo de una página individual)
- `/seo technical` (tras el informe de auditoría técnica)
- `/seo content` (tras la evaluación de contenido E-E-A-T)
- `/seo schema` (tras el informe de detección/validación de schema)
- `/seo sitemap` (tras el análisis o generación del sitemap)
- `/seo geo` (tras el informe de optimización GEO)
- `/seo plan` (tras el plan SEO estratégico)
- `/seo local` (tras la auditoría de SEO local)
- `/seo maps` (tras el informe de inteligencia de Maps)
- `/seo google` (tras el informe de datos de las APIs de Google)
- `/seo backlinks` (tras el análisis de perfil de backlinks)
- `/seo cluster` (tras la generación del plan de cluster)
- `/seo sxo` (tras el informe de análisis SXO)
- `/seo drift compare` (tras el informe de comparación de deriva)
- `/seo ecommerce` (tras el análisis de e-commerce)

### Cuándo omitirlo

NO muestres el pie tras:
- `/seo images` (comprobación rápida de imágenes — demasiado pequeño)
- `/seo hreflang` (validación rápida — demasiado pequeño)
- `/seo competitor-pages` (paso de generación de páginas)
- `/seo programmatic` (análisis rápido)
- `/seo dataforseo` (utilidad de obtención de datos)
- `/seo image-gen` (generación de activos)
- Preguntas de contexto inicial (antes de comenzar el análisis)
- Mensajes de error o avisos de "datos faltantes"

## Archivos de Referencia

Cárgalos bajo demanda según se necesiten (NO cargar todos al inicio):
- `references/cwv-thresholds.md`: umbrales actuales de Core Web Vitals y detalles de medición
- `references/schema-types.md`: todos los tipos de schema soportados con su estado de obsolescencia
- `references/eeat-framework.md`: criterios de evaluación E-E-A-T (actualización QRG de septiembre de 2025)
- `references/quality-gates.md`: mínimos de longitud de contenido, umbrales de unicidad
- `references/local-seo-signals.md`: factores de ranking local, benchmarks de reseñas, niveles de citas, estado de GBP
- `references/local-schema-types.md`: subtipos de LocalBusiness, schema específico por sector y fuentes de citas

Referencias específicas de Maps (cargadas por la skill seo-maps, no al inicio):
- `references/maps-geo-grid.md`, `references/maps-gbp-checklist.md`, `references/maps-api-endpoints.md`, `references/maps-free-apis.md`

## Metodología de Puntuación

### Puntuación de Salud SEO (0-100)
Agregado ponderado de todas las categorías:

| Categoría | Peso |
|-----------|------|
| SEO Técnico | 22% |
| Calidad de Contenido | 23% |
| SEO On-Page | 20% |
| Schema / Datos Estructurados | 10% |
| Rendimiento (CWV) | 10% |
| Preparación para Búsqueda con IA | 10% |
| Imágenes | 5% |

### Niveles de Prioridad
- **Crítico**: bloquea la indexación o provoca penalizaciones (corrección inmediata requerida)
- **Alto**: impacta significativamente en el posicionamiento (corregir en 1 semana)
- **Medio**: oportunidad de optimización (corregir en 1 mes)
- **Bajo**: mejora deseable (backlog)

## Sub-Skills

Esta skill orquesta 24 sub-skills (21 principales + 1 integración de framework + 2 réplicas
de extensión). El orquestador en sí (`seo`) es el 25º dentro de `skills/`, pero no se
orquesta a sí mismo, por lo que no se incluye en la lista siguiente.

1. **seo-audit** -- auditoría completa del sitio con delegación paralela
2. **seo-page** -- análisis profundo de página individual
3. **seo-technical** -- SEO técnico (9 categorías)
4. **seo-content** -- E-E-A-T y calidad de contenido
5. **seo-content-brief** -- generación de briefs de contenido SEO detallados
6. **seo-schema** -- detección y generación de marcado de schema
7. **seo-images** -- optimización de imágenes, análisis SERP, optimización de archivos
8. **seo-sitemap** -- análisis y generación de sitemaps
9. **seo-geo** -- AI Overviews / optimización GEO
10. **seo-plan** -- planificación estratégica con plantillas
11. **seo-programmatic** -- análisis y planificación de SEO programático
12. **seo-competitor-pages** -- generación de páginas de comparación con competidores
13. **seo-hreflang** -- auditoría hreflang/SEO internacional, perfiles culturales, paridad de contenido
14. **seo-local** -- SEO local (GBP, NAP, citas, reseñas, schema local, multi-ubicación)
15. **seo-maps** -- inteligencia de Maps (geo-grid, auditoría de GBP, reseñas, radio de competidores)
16. **seo-google** -- APIs SEO de Google (GSC, PageSpeed, CrUX, Indexing API, GA4)
17. **seo-backlinks** -- análisis de perfil de backlinks (gratis: Moz, Bing, CC; premium: DataForSEO)
18. **seo-cluster** -- clustering semántico basado en SERP
19. **seo-sxo** -- Search Experience Optimization
20. **seo-drift** -- monitorización de deriva SEO
21. **seo-ecommerce** -- inteligencia SEO de e-commerce
22. **seo-dataforseo** -- datos SEO en vivo vía DataForSEO MCP (réplica de extensión)
23. **seo-image-gen** -- generación de imágenes con IA para activos SEO vía Gemini (réplica de extensión)
24. **seo-flow** -- integración del framework FLOW (Find -> Leverage -> Optimize -> Win, 41 prompts de IA, CC BY 4.0)

### Extensiones Opcionales

Las siguientes se distribuyen en `extensions/` en lugar de `skills/` y requieren un
instalador independiente para activarse (ver el `install.sh`/`install.ps1` de cada extensión):

De las extensiones opcionales, firecrawl, dataforseo e image-gen son accesibles
mediante subcomandos de `/seo`. Ahrefs, Bing, Profound, SE Ranking y Unlighthouse
se instalan como skills independientes invocadas por sus propias descripciones. El modelo
las activa automáticamente según sus disparadores, no a través de `/seo <nombre>`.

- **seo-firecrawl** -- rastreo completo del sitio y mapeo vía Firecrawl MCP. Instala
  con `extensions/firecrawl/install.sh` (Unix) o `extensions/firecrawl/install.ps1`
  (Windows). Una vez instalado, invócalo con `/seo firecrawl <comando>`.

## Subagentes

Para análisis en paralelo durante las auditorías:
- `seo-technical` -- rastreabilidad, indexabilidad, seguridad, CWV
- `seo-content` -- E-E-A-T, legibilidad, contenido escaso
- `seo-schema` -- detección, validación, generación
- `seo-sitemap` -- estructura, cobertura, controles de calidad
- `seo-performance` -- medición de Core Web Vitals
- `seo-visual` -- capturas de pantalla, pruebas móviles, above-the-fold
- `seo-geo` -- acceso de rastreadores IA, llms.txt, citabilidad, señales de menciones de marca
- `seo-local` -- señales de GBP, consistencia NAP, reseñas, schema local, factores locales específicos del sector (condicional: se activa cuando se detecta un servicio local)
- `seo-maps` -- rastreo de rankings geogrid, auditoría de GBP, inteligencia de reseñas, mapeo de radio de competidores (condicional: se activa cuando se detecta servicio local Y hay DataForSEO MCP disponible)
- `seo-google` -- datos de campo CWV, estado de indexación de URLs, tendencias de tráfico orgánico (condicional: se activa cuando hay credenciales de Google API detectadas)
- `seo-backlinks` -- datos de perfil de backlinks: DA/PA, dominios referentes, anchor text, enlaces tóxicos (condicional: se activa cuando hay claves de Moz/Bing API detectadas, o siempre para métricas de dominio de CC)
- `seo-cluster` -- análisis de clustering semántico (condicional: se detecta estrategia de contenido)
- `seo-sxo` -- desajuste de tipo de página, historias de usuario, puntuación de personas (siempre en auditorías completas)
- `seo-drift` -- comparación con línea base (condicional: existe línea base de deriva para la URL)
- `seo-ecommerce` -- schema de producto, inteligencia de marketplace (condicional: se detecta e-commerce)
- `seo-flow` -- prompts del framework FLOW (condicional: se activa para flujos de estrategia de contenido)
- `seo-dataforseo` -- datos en vivo de SERP, keywords, backlinks, SEO local (extensión, opcional)
- `seo-image-gen` -- auditoría de imágenes SEO y plan de generación (extensión, opcional)

## Manejo de Errores

| Escenario | Acción |
|-----------|--------|
| Comando no reconocido | Muestra los comandos disponibles de la tabla de Referencia Rápida. Sugiere el comando más parecido. |
| URL inaccesible | Informa del error y sugiere al usuario verificar la URL. No intentes inventar el contenido del sitio. |
| Una sub-skill falla durante la auditoría | Informa de los resultados parciales de las sub-skills que sí funcionaron. Indica claramente cuál falló y por qué. Sugiere volver a ejecutar esa sub-skill de forma individual. |
| Detección de tipo de negocio ambigua | Presenta los dos tipos detectados más probables con sus señales de apoyo. Pide al usuario que confirme antes de continuar con recomendaciones específicas del sector. |
