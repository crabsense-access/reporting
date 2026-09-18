<!-- Actualizado: 2026-02-07 -->
# Umbrales de Core Web Vitals (Febrero 2026)

## Métricas Actuales

| Métrica | Bien | Necesita Mejora | Deficiente |
|---------|------|-------------------|------|
| LCP (Largest Contentful Paint) | ≤2,5s | 2,5s–4,0s | >4,0s |
| INP (Interaction to Next Paint) | ≤200ms | 200ms–500ms | >500ms |
| CLS (Cumulative Layout Shift) | ≤0,1 | 0,1–0,25 | >0,25 |

## Datos Clave
- INP sustituyó a FID (First Input Delay) el **12 de marzo de 2024**. FID se eliminó por completo de todas las herramientas de Chrome (CrUX API, PageSpeed Insights, Lighthouse) el **9 de septiembre de 2024**. INP es la única métrica de interactividad.
- La evaluación usa el **percentil 75** de datos reales de usuarios (datos de campo de CrUX).
- Google evalúa tanto a **nivel de página** como a **nivel de origen**.
- Core Web Vitals es una señal de ranking de **desempate**: importa sobre todo cuando la calidad del contenido es similar entre competidores.
- **Los umbrales no han cambiado desde su definición original**: ignora las afirmaciones de "umbrales más estrictos" de algunos blogs de SEO.
- La actualización de core de diciembre de 2025 pareció dar **más peso a los CWV móviles**.
- A octubre de 2025: el **57,1%** de los sitios de escritorio y el **49,7%** de los sitios móviles superan los tres CWV.

## Subpartes de LCP (Incorporación de CrUX de Febrero de 2025)

Ahora el LCP se puede desglosar en subpartes de diagnóstico:

| Subparte | Qué Mide | Objetivo |
|----------|----------|----------|
| **TTFB** | Time to First Byte (respuesta del servidor) | <800ms |
| **Retraso de Carga de Recursos** | Tiempo desde TTFB hasta el inicio de la petición del recurso | Minimizar |
| **Tiempo de Carga de Recursos** | Tiempo de descarga del recurso LCP | Depende del tamaño |
| **Retraso de Renderizado del Elemento** | Tiempo desde que el recurso se carga hasta que se renderiza | Minimizar |

**LCP Total = TTFB + Retraso de Carga de Recursos + Tiempo de Carga de Recursos + Retraso de Renderizado del Elemento**

Usa este desglose para identificar qué fase está causando los problemas de LCP.

## Soft Navigations API (Experimental)

**Origin Trial de Chrome 139+ (Julio 2025)**: primer paso hacia la medición de CWV en SPAs.

- Aborda el histórico punto ciego de medición en SPAs
- Actualmente experimental, **aún sin impacto en el ranking**
- Detecta "soft navigations" (cambios de URL sin carga completa de página)
- Podría afectar a la futura medición de CWV en SPAs

**Detección:** comprueba si hay frameworks SPA (React, Vue, Angular, Svelte) y avisa sobre las limitaciones actuales de medición de CWV.

## Fuentes de Medición

### Datos de Campo (Usuarios Reales)
- Chrome User Experience Report (CrUX)
- PageSpeed Insights (usa datos de CrUX)
- Informe de Core Web Vitals de Search Console

### Datos de Laboratorio (Simulados)
- Lighthouse
- WebPageTest
- Chrome DevTools

> Los datos de campo son los que usa Google para el ranking. Los datos de laboratorio son útiles para depurar.

## Cuellos de Botella Habituales

### LCP (Largest Contentful Paint)
- Imágenes hero sin optimizar (comprimir, usar WebP/AVIF, añadir preload)
- CSS/JS que bloquean el renderizado (defer, async, inlining de CSS crítico)
- Respuesta lenta del servidor (TTFB >200ms: usar CDN edge, caché)
- Scripts de terceros que bloquean (defer en analytics, widgets de chat)
- Retraso en la carga de fuentes web (usar font-display: swap + preload)

### INP (Interaction to Next Paint)
- Tareas JavaScript largas en el hilo principal (dividir en tareas más pequeñas <50ms)
- Manejadores de eventos pesados (debounce, usar requestAnimationFrame)
- Tamaño de DOM excesivo (más de 1.500 elementos es preocupante)
- Scripts de terceros que secuestran el hilo principal
- Operaciones síncronas de XHR o localStorage
- Layout thrashing (múltiples reflows forzados)

### CLS (Cumulative Layout Shift)
- Imágenes/iframes sin dimensiones de ancho/alto
- Contenido inyectado dinámicamente por encima del contenido existente
- Fuentes web que provocan saltos de layout (usar font-display: swap + preload)
- Anuncios/embeds sin espacio reservado
- Contenido de carga tardía que desplaza la página hacia abajo

## Prioridad de Optimización

1. **LCP**: el más impactante para el rendimiento percibido
2. **CLS**: el problema más común que afecta a la experiencia de usuario
3. **INP**: el más importante en aplicaciones interactivas

## Herramientas

```bash
# API de PageSpeed Insights
curl -H "X-Goog-Api-Key: $GOOGLE_API_KEY" \
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=URL"

# Lighthouse CLI
npx lighthouse URL --output json --output-path report.json
```

## Actualizaciones de Herramientas de Rendimiento (2025)

- **Lighthouse 13.0** (octubre de 2025): reestructuración importante de las auditorías, con categorías de rendimiento reorganizadas y pesos de puntuación actualizados. Lighthouse es una herramienta de laboratorio (condiciones simuladas): compara siempre con los datos de campo de CrUX para conocer el rendimiento real.
- **CrUX Vis** sustituyó al CrUX Dashboard (noviembre de 2025). El antiguo dashboard de Looker Studio quedó obsoleto. Usa [CrUX Vis](https://cruxvis.withgoogle.com) o la API de CrUX directamente.
- **Subpartes de LCP** añadidas a CrUX (febrero de 2025): Time to First Byte (TTFB), retraso de carga de recursos, tiempo de carga de recursos y retraso de renderizado del elemento ya están disponibles como subcomponentes de LCP en los datos de CrUX.
- **Funciones de Google Search Console 2025** (diciembre de 2025): configuración con IA para análisis automatizado. Filtro de consultas de marca vs. sin marca. Datos horarios disponibles en la API. Anotaciones personalizadas en gráficos. Seguimiento de canales sociales.

> La **indexación mobile-first** está completa al 100% desde el 5 de julio de 2024. Google ahora rastrea e indexa TODOS los sitios web exclusivamente con el user-agent móvil de Googlebot. Asegúrate de que tu versión móvil contiene todo el contenido crítico, los datos estructurados y las meta etiquetas.
