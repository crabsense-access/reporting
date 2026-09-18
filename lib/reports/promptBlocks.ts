import type { ReportPlatform } from "@/lib/reports/platforms";

// Defaults compartidos de los bloques de texto libre del formulario de generación de informes.
// Extraídos de NewReportForm.tsx (Bloque "Nuevo informe") para que Configuración v2 pueda mandar
// el mismo contrato de formato al pipeline de generación sin duplicar el texto.

// Precarga del Bloque Período (instrucciones sobre cómo analizar el rango elegido) — editable.
export const DEFAULT_PERIODO_INSTRUCCIONES = [
  "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad de",
  "días inmediatamente anteriores.",
  "Si existe suficiente información histórica, también podés utilizar períodos anteriores únicamente",
  "como contexto para detectar tendencias.",
  "No conviertas el reporte en un análisis histórico extenso.",
  "",
  "La prioridad siempre es:",
  "días seleccionados → cambios recientes → problemas actuales → oportunidades inmediatas.",
].join("\n");

// Precarga del bloque "Regla principal del análisis" — editable.
export const DEFAULT_REGLA_PRINCIPAL = [
  "No muestres información simplemente porque está disponible.",
  "",
  "Para cada plataforma:",
  "Analizá todos los datos necesarios internamente, pero mostrale al usuario solamente los 5 a 7",
  "hallazgos más importantes.",
  "",
  "Los puntos seleccionados deben ser aquellos que tengan mayor:",
  "·       Impacto potencial",
  "·       Relevancia para conversión",
  "·       Cambio reciente",
  "·       Valor para la toma de decisiones",
  "·       Confianza en la conclusión",
  "",
  "Si una métrica no genera un insight o no ayuda a tomar una decisión, no la incluyas.",
].join("\n");

// Precarga del bloque "Formato del entregable" — editable.
export const DEFAULT_FORMATO_ENTREGABLE = [
  "El reporte final debe ser muy corto y ejecutivo.",
  "Cada plataforma debe tener entre 5 y 7 puntos como máximo.",
  "No superar: 7 insights por plataforma.",
  "No rellenes hasta llegar a 7 si solamente existen 4 hallazgos relevantes.",
  "Es preferible entregar: 4 insights excelentes antes que: 7 insights irrelevantes.",
].join("\n");

// Precarga del bloque "Estructura final" — editable.
export const DEFAULT_ESTRUCTURA_FINAL = [
  "Antes de entrar en cada plataforma, mostrar solamente:",
  "3 principales conclusiones de los últimos 7 días",
  "Cada conclusión debe ser breve y accionable.",
  "Ejemplo:",
  "Meta: El CPL aumentó 28% principalmente por el deterioro de la campaña X.",
  "Analytics: Mobile genera 62% del tráfico pero convierte 41% peor que Desktop.",
  "SEO: La página X aumentó 35% sus impresiones y está en posición 7, representando una oportunidad",
  "de crecimiento.",
].join("\n");

// Precarga del bloque "Métricas & Insights" — un default por plataforma, editable. Google Ads
// queda sin default (placeholder únicamente), a completar más adelante.
export const DEFAULT_METRICAS_INSIGHTS: Partial<Record<ReportPlatform, string>> = {
  ga4: [
    "Mostrar: KPI PRINCIPAL que debe ser el que está definido en la config",
    "Incluir solamente los KPIs indispensables para contextualizarlo.",
    "",
    "Después:",
    "5–7 insights principales",
    "Cada insight debe contener:",
    "Hallazgo → Evidencia → Interpretación → Acción recomendada",
    "Cuando corresponda, incluir un gráfico pequeño que ayude a visualizar el hallazgo.",
  ].join("\n"),
  meta_ads: [
    "Mostrar: KPI PRINCIPAL que debe ser el que está definido en la config + las métricas de Leads,",
    "CPM e Inversión.",
    "y únicamente otras métricas si ayudan a explicar el resultado.",
    "",
    "Después:",
    "5–7 insights principales",
    "Cada insight debe contener:",
    "Hallazgo → Evidencia → Interpretación → Acción recomendada",
    "Incluir gráficos solamente cuando aporten claridad.",
  ].join("\n"),
  search_console: [
    "Mostrar:",
    "* Clics",
    "* Impresiones",
    "* CTR",
    "* Posición promedio",
    "",
    "Después:",
    "5–7 insights principales",
    "Priorizar oportunidades de SEO con impacto potencial sobre negocio y generación de leads.",
    "Cuando sea posible, relacionar los hallazgos con el evento de conversión principal de Google",
    "Analytics.",
  ].join("\n"),
};

// Precarga del bloque "Formato del Insight" — editable.
export const DEFAULT_FORMATO_INSIGHT = [
  "Utilizá esta estructura:",
  "🔴 / 🟡 / 🟢 [Título corto del insight]",
  "Qué pasó: explicación breve.",
  "Evidencia: datos que sustentan el hallazgo.",
  "Por qué importa: impacto sobre leads, conversión, tráfico o eficiencia.",
  "Qué hacer: acción concreta recomendada.",
  "Confianza: Alta / Media / Baja.",
  "Mantener cada insight breve.",
  "No escribir análisis largos.",
].join("\n");

// Precarga del bloque "Priorización" — editable.
export const DEFAULT_PRIORIZACION = [
  "Clasificá cada insight como:",
  "",
  "🔴 Alta prioridad",
  "Puede generar un impacto significativo o requiere atención inmediata.",
  "",
  "🟡 Media prioridad",
  "Oportunidad relevante, pero no crítica.",
  "",
  "🟢 Baja prioridad",
  "Optimización secundaria.",
  "",
  "Priorizá siempre:",
  "1. Generación de Leads",
  "2. Eventos configurados en cada fuente de datos",
  "3. Tasa de conversión",
  "4. Eficiencia de adquisición",
  "5. Escalabilidad",
  "6. Reducción de desperdicio",
  "7. Oportunidades de CRO",
  "8. Oportunidades SEO de valor comercial",
].join("\n");

// Precarga del bloque "Reglas" — editable.
export const DEFAULT_REGLAS = [
  "Estas reglas son obligatorias:",
  "·       Máximo 5–7 insights por plataforma.",
  "·       No repetir el mismo insight en diferentes secciones.",
  "·       No mostrar métricas sin interpretación.",
  "·       No incluir métricas que no aporten una decisión.",
  "·       No crear gráficos innecesarios.",
  "·       No escribir párrafos extensos.",
  "·       No generar un reporte histórico extenso.",
  "·       No inventar datos.",
  "·       No inventar causas.",
  "·       No presentar hipótesis como hechos.",
  "·       No confundir volumen con eficiencia.",
  "·       No confundir clics con conversiones.",
  "·       No confundir eventos secundarios con conversiones principales.",
].join("\n");

// Precarga del bloque "TOP 10 - Acciones finales" — editable.
export const DEFAULT_TOP10_ACCIONES = [
  "Al final del reporte generar un máximo de:",
  "10 acciones prioritarias.",
  "No es obligatorio llegar a 10. Si solamente existen 6 acciones realmente importantes, mostrar 6.",
  "",
  "Para cada acción indicar:",
  "Prioridad",
  "Plataforma",
  "Acción",
  "Motivo",
  "Impacto esperado",
  "Dificultad",
  "Ordenar de mayor a menor impacto.",
].join("\n");

// Precarga del bloque "Principio final" — editable.
export const DEFAULT_PRINCIPIO_FINAL = [
  "El reporte debe seguir esta lógica:",
  "Datos → Insight → Impacto → Acción",
  "",
  "No quiero un dashboard que simplemente diga qué ocurrió.",
  "",
  "Quiero un análisis que permita responder rápidamente:",
  "¿Qué pasó en los últimos 7 días?",
  "¿Qué está funcionando?",
  "¿Qué está empeorando?",
  "¿Dónde estamos perdiendo oportunidades?",
  "¿Qué deberíamos hacer ahora para generar más Leads y los eventos de conversión configurados en",
  "cada fuente de datos?",
  "",
  "El análisis interno debe ser exhaustivo, pero el resultado que recibe el usuario debe ser breve,",
  "visual, ejecutivo y accionable.",
  "",
  "La regla más importante es:",
  "Menos información, pero mejores insights.",
].join("\n");
