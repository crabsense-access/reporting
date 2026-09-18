---
name: seo-audit
description: "Auditoría SEO completa de un sitio web con delegación paralela a subagentes. Rastrea hasta 500 páginas, detecta el tipo de negocio, delega en hasta 15 especialistas (8 siempre + 7 condicionales) y genera una puntuación de salud. Úsala cuando el usuario diga auditoría, revisión SEO completa, analiza mi sitio o chequeo de salud del sitio web."
user-invocable: true
argument-hint: "[url]"
license: MIT
metadata:
  author: Palo Seco S.L.
  version: "2.2.0"
  category: seo
---

# Auditoría SEO Completa de un Sitio Web

## Proceso

1. **Renderiza la home**: usa `python3 scripts/render_page.py <url> --mode auto --json` para capturar el HTML en bruto, el HTML renderizado, el texto extraído, el estado SPA y datos de accesibilidad cuando sea necesario
2. **Detecta el tipo de negocio**: analiza las señales de la home según el orquestador SEO
3. **Rastrea el sitio**: sigue los enlaces internos hasta 500 páginas, respetando robots.txt
4. **Delega en subagentes** (si están disponibles; si no, ejecuta de forma secuencial e integrada):
   - `seo-technical` -- robots.txt, sitemaps, canonicals, Core Web Vitals, cabeceras de seguridad
   - `seo-content` -- E-E-A-T, legibilidad, contenido escaso, preparación para citación por IA
   - `seo-schema` -- detección, validación, recomendaciones de generación
   - `seo-sitemap` -- análisis de estructura, controles de calidad, páginas faltantes
   - `seo-performance` -- mediciones de LCP, INP, CLS
   - `seo-visual` -- capturas de pantalla, pruebas móviles, análisis above-the-fold
   - `seo-geo` -- acceso de rastreadores IA, llms.txt, citabilidad, señales de menciones de marca
   - `seo-local` -- señales de GBP, consistencia NAP, reseñas, schema local, factores locales específicos del sector (se activa cuando se detecta negocio de servicio local: físico, SAB o híbrido)
   - `seo-maps` -- rastreo de rankings geogrid, auditoría de GBP, inteligencia de reseñas, mapeo de radio de competidores (se activa cuando se detecta servicio local Y hay disponible DataForSEO MCP)
   - `seo-google` -- datos de campo CWV (CrUX), estado de indexación de URLs (GSC), tráfico orgánico (GA4) (se activa cuando hay credenciales de Google API detectadas vía `python3 scripts/google_auth.py --check`)
   - `seo-backlinks` -- datos de perfil de backlinks: DA/PA, dominios referentes, anchor text, enlaces tóxicos (se activa cuando hay credenciales de Moz o Bing API detectadas vía `python3 scripts/backlinks_auth.py --check`, o incluye siempre métricas de dominio de Common Crawl)
   - `seo-cluster` -- análisis de clustering semántico (se activa cuando se detectan señales de estrategia de contenido: blog, páginas pilar, clusters de temas)
   - `seo-sxo` -- análisis de experiencia de búsqueda: desajuste de tipo de página, historias de usuario, puntuación de personas (incluir siempre en auditorías completas)
   - `seo-drift` -- análisis de deriva: comparación con la línea base almacenada (se activa cuando existe una línea base de deriva para la URL vía `python3 scripts/drift_history.py <url>`)
   - `seo-ecommerce` -- schema de producto, inteligencia de marketplace (se activa cuando se detecta un negocio de e-commerce)
5. **Puntúa** -- agrega todo en una Puntuación de Salud SEO (0-100)
6. **Persiste los artefactos de la auditoría** -- escribe todas las salidas en `{domain}-audit/`
7. **Informa** -- genera un plan de acción priorizado y un informe opcional en PDF/HTML

## Configuración del Rastreo

```
Páginas máximas: 500
Respetar robots.txt: Sí
Seguir redirecciones: Sí (máximo 3 saltos)
Timeout por página: 30 segundos
Peticiones concurrentes: 5
Retraso entre peticiones: 1 segundo
```

## Archivos de Salida

- `{domain}-audit/FULL-AUDIT-REPORT.md`: hallazgos completos
- `{domain}-audit/ACTION-PLAN.md`: recomendaciones priorizadas (Crítico > Alto > Medio > Bajo)
- `{domain}-audit/audit-data.json`: envoltorio de datos estructurado de la auditoría para generar el informe
- `{domain}-audit/findings/*.md`: hallazgos por categoría de cada especialista (`technical.md`, `content.md`, `schema.md`, `performance.md`, `visual.md`, etc.)
- `{domain}-audit/screenshots/`: capturas de escritorio + móvil (si Playwright está disponible)
- **Informe PDF** (recomendado): genera un informe profesional A4 con `scripts/google_report.py --type full --data {domain}-audit/audit-data.json --domain <domain> --output-dir {domain}-audit/`. Produce un informe corporativo con portada blanca, índice, resumen ejecutivo, gráficos (medidores Lighthouse, barras de consultas, donut de indexación), tarjetas de métricas, tablas de umbrales, recomendaciones priorizadas con estimaciones de esfuerzo y hoja de ruta de implementación. Ofrece siempre generar el PDF al terminar una auditoría.

## Envoltorio de Datos Estructurado de la Auditoría

Escribe `{domain}-audit/audit-data.json` con esta forma para que `python3 scripts/google_report.py --type full --data {domain}-audit/audit-data.json --domain <domain> --output-dir {domain}-audit/` pueda generar un informe incluso cuando los datos de Google API no estén disponibles:

```json
{
  "summary": {
    "health_score": 0,
    "business_type": "tipo detectado",
    "top_findings": [],
    "quick_wins": []
  },
  "categories": [
    {
      "name": "SEO Técnico",
      "score": 0,
      "what_works": [],
      "findings": [
        {
          "title": "Título del hallazgo",
          "severity": "Critical|High|Medium|Low|Info",
          "description": "Detalle respaldado por evidencia",
          "recommendation": "Solución específica"
        }
      ]
    }
  ],
  "action_plan": {
    "phases": [
      {"name": "Fase 1: Correcciones Críticas", "timeframe": "Semana 1", "items": []},
      {"name": "Fase 2: Mejoras de Alto Impacto", "timeframe": "Semanas 2-3", "items": []},
      {"name": "Fase 3: Contenido y Autoridad", "timeframe": "Mes 2", "items": []},
      {"name": "Fase 4: Monitorización e Iteración", "timeframe": "Continuo", "items": []}
    ]
  },
  "artifacts": {
    "findings_dir": "findings/",
    "screenshots_dir": "screenshots/"
  }
}
```

## Pesos de la Puntuación

| Categoría | Peso |
|-----------|------|
| SEO Técnico | 22% |
| Calidad de Contenido | 23% |
| SEO On-Page | 20% |
| Schema / Datos Estructurados | 10% |
| Rendimiento (CWV) | 10% |
| Preparación para Búsqueda con IA | 10% |
| Imágenes | 5% |

## Estructura del Informe

### Resumen Ejecutivo
- Puntuación de Salud SEO global (0-100)
- Tipo de negocio detectado
- Top 5 problemas críticos
- Top 5 quick wins

### SEO Técnico
- Problemas de rastreabilidad
- Problemas de indexabilidad
- Preocupaciones de seguridad
- Estado de Core Web Vitals

### Calidad de Contenido
- Evaluación E-E-A-T
- Páginas con contenido escaso
- Problemas de contenido duplicado
- Puntuaciones de legibilidad

### SEO On-Page
- Problemas de title tags
- Problemas de meta description
- Estructura de encabezados
- Carencias de enlazado interno

### Schema y Datos Estructurados
- Implementación actual
- Errores de validación
- Oportunidades faltantes

### Rendimiento
- Puntuaciones de LCP, INP, CLS
- Necesidades de optimización de recursos
- Impacto de scripts de terceros

### Imágenes
- Alt text faltante
- Imágenes con peso excesivo
- Recomendaciones de formato

### Preparación para Búsqueda con IA
- Puntuación de citabilidad
- Mejoras estructurales
- Señales de autoridad

## Definiciones de Prioridad

- **Crítico**: bloquea la indexación o provoca penalizaciones (corregir de inmediato)
- **Alto**: impacta significativamente en el posicionamiento (corregir en 1 semana)
- **Medio**: oportunidad de optimización (corregir en 1 mes)
- **Bajo**: mejora deseable (backlog)

## Integración con DataForSEO (Opcional)

Si las herramientas DataForSEO MCP están disponibles, activa el agente `seo-dataforseo` junto a los demás subagentes para enriquecer la auditoría con datos en vivo: posiciones reales en SERP, perfiles de backlinks con spam scores, análisis on-page (Lighthouse), fichas de negocio y comprobaciones de visibilidad en IA (scraper de ChatGPT, menciones LLM).

## Integración con Google API (Opcional)

Si hay credenciales de Google API configuradas (`python3 scripts/google_auth.py --check`), activa el agente `seo-google` para enriquecer la auditoría con datos de campo reales de Google: Core Web Vitals de CrUX (sustituye las estimaciones solo de laboratorio), estado de indexación de URLs en GSC, rendimiento de búsqueda (clics, impresiones, CTR) y tendencias de tráfico orgánico de GA4. La categoría de Rendimiento (CWV) es la que más se beneficia de los datos de campo.

## Manejo de Errores

| Escenario | Acción |
|-----------|--------|
| URL inaccesible (fallo de DNS, conexión rechazada) | Informa el error con claridad. No inventes contenido del sitio. Sugiere al usuario verificar la URL y volver a intentarlo. |
| robots.txt bloquea el rastreo | Informa qué rutas están bloqueadas. Analiza solo las páginas accesibles y señala la limitación en el informe. |
| Rate limiting (respuestas 429) | Reduce el ritmo y las peticiones concurrentes. Informa resultados parciales indicando qué secciones no se pudieron completar. |
| Timeout en sitios grandes (500+ páginas) | Limita el rastreo al tiempo máximo. Informa los hallazgos de las páginas rastreadas y estima el alcance total del sitio. |
