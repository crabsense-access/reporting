---
name: seo-content
description: >
  Análisis de calidad de contenido y E-E-A-T con evaluación de preparación
  para citación por IA. Úsala cuando el usuario diga "calidad de contenido",
  "E-E-A-T", "análisis de contenido", "comprobación de legibilidad",
  "contenido escaso" o "auditoría de contenido".
user-invocable: true
argument-hint: "[url]"
license: MIT
metadata:
  author: Palo Seco S.L.
  version: "2.2.0"
  category: seo
---

# Análisis de Calidad de Contenido y E-E-A-T

## El Test "Quién / Cómo / Por Qué" de Google (heurística canónica)

Antes de puntuar los subfactores de E-E-A-T, toda auditoría de página debe
pasar la heurística de tres preguntas propia de Google, extraída de la guía
de contenido útil:

| Pregunta | Qué buscar |
|---|---|
| **Quién** lo creó? | Firma visible, página de bio del autor, credenciales profesionales. Obligatorio donde los lectores lo esperan; innegociable para contenido YMYL. |
| **Cómo** se creó? | Divulgación del proceso donde los lectores razonablemente lo preguntarían — especialmente para contenido asistido por IA. Investigación original / evidencia de primera mano / experiencia vivida. |
| **Por qué** existe? | "Para ayudar a la gente" en lugar de "para atraer clics de búsqueda". Vigila la entrada en un nicho sin expertise, la rotación de contenido solo por señales de frescura, o el contenido escrito para cumplir un objetivo de recuento de palabras. |

Fuente primaria:
https://developers.google.com/search/docs/fundamentals/creating-helpful-content

Cuando las tres respuestas son débiles, la página está en riesgo bajo las
señales de utilidad del sistema de ranking principal (antes el Helpful
Content System independiente, fusionado en el core durante la actualización
de marzo de 2024).

## Framework E-E-A-T (actualizado según las QRG de sept. 2025)

Lee `skills/seo/references/eeat-framework.md` para los criterios completos.

### Experiencia (señales de primera mano)
- Investigación original, casos prácticos, resultados de antes/después
- Anécdotas personales, documentación de procesos
- Datos únicos, insights propios
- Fotos/vídeos de experiencia directa

### Expertise
- Credenciales del autor, certificaciones, bio
- Trayectoria profesional relevante para el tema
- Profundidad técnica adecuada para la audiencia
- Afirmaciones precisas y bien fundamentadas

### Autoridad
- Citas externas, backlinks de fuentes autorizadas
- Menciones de marca, reconocimiento del sector
- Publicado en medios reconocidos
- Citado por otros expertos

### Fiabilidad
- Información de contacto, dirección física
- Política de privacidad, términos de servicio
- Testimonios y reseñas de clientes
- Fechas visibles, correcciones transparentes
- Sitio seguro (HTTPS)

## Métricas de Contenido

### Análisis de Recuento de Palabras
Compara con los mínimos por tipo de página:
| Tipo de Página | Mínimo |
|-----------------|---------|
| Home | 500 |
| Página de servicio | 800 |
| Post de blog | 1.500 |
| Página de producto | 300+ (400+ para productos complejos) |
| Página de ubicación | 500-600 |

> **Importante:** estos son **suelos de cobertura temática**, no objetivos. Google ha confirmado que el recuento de palabras NO es un factor de ranking directo. El objetivo es la cobertura temática completa; una página de 500 palabras que responda a fondo la consulta superará a una de 2.000 palabras que no lo haga. Usa estas cifras como orientación de profundidad de cobertura adecuada, no como requisitos rígidos.

### Legibilidad
- Flesch Reading Ease: objetivo 60-70 para audiencia general

> **Nota:** Flesch Reading Ease es un proxy útil de la accesibilidad del contenido, pero NO es un factor de ranking directo de Google. John Mueller ha confirmado que Google no usa puntuaciones básicas de legibilidad para el ranking. Yoast despriorizó las puntuaciones Flesch en la v19.3. Usa el análisis de legibilidad como indicador de calidad de contenido, no como métrica SEO a optimizar directamente.
- Nivel educativo: acorde a la audiencia objetivo
- Longitud de frase: media de 15-20 palabras
- Longitud de párrafo: 2-4 frases

### Optimización de Keywords
- Keyword primaria en el título, H1, primeras 100 palabras
- Densidad natural (1-3%)
- Presencia de variaciones semánticas
- Sin keyword stuffing

### Estructura del Contenido
- Jerarquía lógica de encabezados (H1 -> H2 -> H3)
- Secciones escaneables con encabezados descriptivos
- Listas con viñetas/numeradas donde corresponda
- Índice para contenido largo

### Multimedia
- Imágenes relevantes con alt text adecuado
- Vídeos donde corresponda
- Infografías para datos complejos
- Gráficos para estadísticas

### Enlazado Interno
- 3-5 enlaces internos relevantes por cada 1.000 palabras
- Anchor text descriptivo
- Enlaces a contenido relacionado
- Sin páginas huérfanas

### Enlazado Externo
- Cita fuentes autorizadas
- Abrir en nueva pestaña por experiencia de usuario
- Cantidad razonable (no excesiva)

## Evaluación de Contenido con IA (incorporación de las QRG de sept. 2025)

Los evaluadores de Google ahora valoran formalmente si el contenido parece generado por IA.

### Contenido con IA Aceptable
- Demuestra E-E-A-T genuino
- Aporta valor único
- Tiene supervisión y edición humana
- Contiene ideas originales

### Señales de Contenido con IA de Baja Calidad
- Redacción genérica, falta de especificidad
- Sin ideas originales
- Estructura repetitiva entre páginas
- Sin atribución de autoría
- Inexactitudes fácticas

> **Helpful Content System (marzo 2024):** el Helpful Content System se fusionó con el algoritmo de ranking principal de Google durante la actualización de core de marzo de 2024. Ya no opera como un clasificador independiente. Las señales de utilidad ahora se ponderan dentro de cada actualización de core. Los mismos principios aplican (contenido pensado para personas, demostrar E-E-A-T, satisfacer la intención del usuario), pero la aplicación es continua en lugar de mediante actualizaciones HCU separadas.

## Preparación para Citación por IA (señales GEO)

Optimiza para motores de búsqueda con IA (ChatGPT, Perplexity, Google AI Overviews):

- Afirmaciones claras y citables con estadísticas/datos
- Datos estructurados (especialmente para cifras concretas)
- Jerarquía de encabezados sólida (flujo H1->H2->H3)
- Formato de respuesta-primero para preguntas clave
- Tablas y listas para datos comparativos
- Atribución clara y citas de fuentes

### Visibilidad en Búsqueda con IA y GEO (2025-2026)

**Google AI Mode** es la superficie de búsqueda conversacional con IA de Google — impulsada por **Gemini 3.5 Flash** desde el I/O 2026 (mayo 2026) y con más de **1.000 millones de usuarios mensuales** en todo el mundo. A diferencia de AI Overviews (que aparece encima de los resultados orgánicos), AI Mode es una experiencia totalmente conversacional con **cero enlaces azules orgánicos**, lo que convierte la citación por IA en el único mecanismo de visibilidad. Es un *motor de citación distinto* de AI Overviews — ambos comparten solo ~14% de las URLs citadas — así que optimiza para ambas superficies, no solo una (ver la skill `seo-geo`).

**Estrategias clave de optimización para la citación por IA:**
- **Respuestas estructuradas:** formatos claros de pregunta-respuesta, patrones de definición e instrucciones paso a paso que los sistemas de IA puedan extraer y citar
- **Datos propios:** la investigación original, estadísticas, casos prácticos y datasets únicos son muy citados por los sistemas de IA
- **Marcado de schema:** Article, FAQPage (Google retiró los *rich results* de FAQ en mayo de 2026, pero el marcado sigue ayudando al parsing/resolución de entidades de la IA) o QAPage para P&R genuinas de usuarios, y los schemas de contenido estructurado ayudan a los sistemas de IA a analizar y atribuir el contenido
- **Autoridad temática:** los sistemas de IA citan preferentemente fuentes que demuestran expertise profunda. Construye clusters de contenido, no páginas aisladas
- **Claridad de entidades:** asegúrate de que la marca, los autores y los conceptos clave estén claramente definidos con datos estructurados (schema de Organization, Person)
- **Seguimiento multiplataforma:** monitoriza la visibilidad en Google AI Overviews, AI Mode, ChatGPT, Perplexity y Bing Copilot, no solo en los rankings tradicionales. Trata la citación por IA como un KPI independiente junto a los rankings y el tráfico orgánico.

**Generative Engine Optimization (GEO):**
Según la guía de optimización para IA de Google, "AEO" y "GEO" son etiquetas rebautizadas del SEO — AI Overviews y AI Mode se basan en los mismos sistemas de ranking y calidad que la Búsqueda clásica. Las señales de optimización que importan (citabilidad, atribución, jerarquía de encabezados, frescura) son fundamentos de SEO aplicados a las superficies de búsqueda con IA, no una disciplina aparte. Consulta la skill `seo-geo` para flujos de trabajo detallados; ambas superficies comparten la síntesis de fuente primaria en `skills/seo-geo/references/google-ai-optimization-guide.md`.

## Frescura del Contenido

- Fecha de publicación visible
- Fecha de última actualización si el contenido se ha revisado
- Marca el contenido de más de 12 meses sin actualizar en temas de rápida evolución

## Salida

### Puntuación de Calidad de Contenido: XX/100

### Desglose de E-E-A-T
| Factor | Puntuación | Señales Clave |
|--------|------------|-------------------|
| Experiencia | XX/25 | ... |
| Expertise | XX/25 | ... |
| Autoridad | XX/25 | ... |
| Fiabilidad | XX/25 | ... |

### Preparación para Citación por IA: XX/100

### Problemas Encontrados
### Recomendaciones

## Integración con DataForSEO (Opcional)

Si las herramientas DataForSEO MCP están disponibles, usa `kw_data_google_ads_search_volume` para datos reales de volumen de keywords, `dataforseo_labs_bulk_keyword_difficulty` para puntuaciones de dificultad, `dataforseo_labs_search_intent` para clasificación de intención, y `content_analysis_summary` para el análisis de calidad de contenido.

## Manejo de Errores

| Escenario | Acción |
|-----------|--------|
| URL inaccesible (fallo de DNS, conexión rechazada) | Informa el error con claridad. No inventes el contenido de la página. Sugiere al usuario verificar la URL y volver a intentarlo. |
| Contenido tras un paywall (402/403, muro de login) | Informa de que el contenido no es accesible públicamente. Analiza solo la parte visible (meta tags, cabeceras) y señala la limitación. |
| Contenido escaso (menos de 100 palabras obtenibles) | Informa de los hallazgos tal cual, sin inventar. Marca la página como potencialmente renderizada con JavaScript o restringida, y sugiere al usuario que aporte el texto completo directamente. |

## Integración con el Framework FLOW

Para optimización de contenido guiada por prompts, usa `/seo flow optimize <url>` y `/seo flow win <url>` — los prompts de optimize y win de FLOW ofrecen flujos estructurados de mejora de E-E-A-T y de conversión BOFU.
