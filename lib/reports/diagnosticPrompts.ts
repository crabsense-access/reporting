import { MARKETING_SKILLS } from "@/lib/reports/marketingSkills";
import type { ReportPlatform } from "@/lib/reports/platforms";

// Resumen corto (nombre + descripción de MARKETING_SKILLS) de la(s) skill(s) relevante(s) para un
// bloque de diagnóstico, embebido como texto fijo "ROL:" dentro de cada defaultInstruction.
function rolLines(...skillIds: string[]): string[] {
  const bullets = skillIds
    .map((id) => MARKETING_SKILLS.find((skill) => skill.id === id))
    .filter((skill): skill is (typeof MARKETING_SKILLS)[number] => Boolean(skill))
    .map((skill) => `- ${skill.nombre}: ${skill.descripcion}`);
  return ["ROL:", ...bullets, ""];
}

// "Reglas fijas" del documento fuente (prompts-ads-analytics-seo.md) — ya están incluidas dentro
// de cada defaultInstruction de abajo (formato Dato→Insight→Impacto→Acción, categorías, etc.),
// pero también se mandan en el campo `reglas` del payload de generación para reforzarlas y
// reemplazar el DEFAULT_REGLAS genérico (🔴/🟡/🟢), que usa una taxonomía distinta.
export const DIAGNOSTIC_REGLAS_FIJAS = [
  "Máximo 5–7 insights totales por plataforma (mejor 4 excelentes que 7 rellenados).",
  "Cada insight se etiqueta con UNA categoría: Tendencia | Oportunidad | Hallazgo | Punto de",
  "mejora | Diagnóstico. No repetir el mismo insight en dos categorías.",
  "Formato obligatorio por insight: Dato → Insight → Impacto → Acción.",
  "No mostrar una métrica sin interpretación. No incluir métricas que no cambien una decisión.",
  "No inventar datos ni causas. No presentar hipótesis como hechos (marcar \"hipótesis a",
  "validar\" si no hay dato que la confirme).",
  "No confundir volumen con eficiencia, clics con conversiones, ni eventos secundarios con",
  "conversiones principales configuradas.",
  "Ordenar de mayor a menor impacto. Sin gráficos innecesarios, sin párrafos largos, sin reporte",
  "histórico extenso.",
  "Responder implícitamente: ¿qué pasó en el período? ¿qué funciona? ¿qué empeora? ¿dónde se",
  "pierden oportunidades? ¿qué hacer ahora para generar más leads/conversiones?",
].join("\n");

// Rol de respaldo cuando el campo de texto libre "Rol" queda vacío en Configuración v2 — cada uno
// de los 6 prompts ya trae su propio "ROL:" embebido, así que este solo cubre el caso en que la
// API exige `rol` no vacío.
export const DIAGNOSTIC_DEFAULT_ROL =
  "Actuá como consultor de marketing digital senior, con expertise en paid media (Google Ads, Meta Ads), analítica web (GA4) y SEO.";

export type DiagnosticPromptId =
  | "ads_solo"
  | "ads_ga4"
  | "ads_seo"
  | "analytics_solo"
  | "seo_solo"
  | "cross_platform";

export interface DiagnosticPromptDef {
  id: DiagnosticPromptId;
  titulo: string;
  subtitulo: string;
  defaultInstruction: string;
  /**
   * Dado el set de plataformas configuradas del cliente (fuente conectada + config cargada,
   * ver isSourceConfigured), devuelve las plataformas que activan este prompt, o null si no se
   * cumplen los requisitos mínimos.
   */
  requiredPlatforms: (configured: Set<ReportPlatform>) => ReportPlatform[] | null;
  requisitoLabel: string;
}

function adsPlatforms(configured: Set<ReportPlatform>): ReportPlatform[] {
  return (["google_ads", "meta_ads"] as const).filter((platform) => configured.has(platform));
}

export const DIAGNOSTIC_PROMPTS: DiagnosticPromptDef[] = [
  {
    id: "ads_solo",
    titulo: "Ads solo",
    subtitulo: "Diagnóstico semanal de Meta/Google Ads",
    requisitoLabel: "Requiere Google Ads y/o Meta Ads configurado en este cliente.",
    requiredPlatforms: (configured) => {
      const ads = adsPlatforms(configured);
      return ads.length > 0 ? ads : null;
    },
    defaultInstruction: [
      "Analizá el rendimiento de campañas activas de [Meta Ads / Google Ads] de [CLIENTE].",
      "",
      ...rolLines("ads"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Entregá máximo 5–7 insights, cada uno etiquetado como Tendencia, Oportunidad, Hallazgo, Punto",
      "de mejora o Diagnóstico (una sola categoría por insight, sin repetir), en formato:",
      "Dato → Insight → Impacto → Acción",
      "",
      "Reglas obligatorias:",
      "- No mostrar métricas sin interpretación ni métricas que no cambien una decisión.",
      "- No confundir clics con conversiones, ni volumen con eficiencia.",
      "- No inventar datos ni causas; si es hipótesis, marcalo como tal.",
      "- Ordenar de mayor a menor impacto en el CPA/ROAS/generación de leads.",
      "- Reporte corto, ejecutivo, sin gráficos innecesarios ni histórico extenso.",
      "",
      "Priorizá responder: ¿qué está funcionando, qué está empeorando, dónde se pierde presupuesto",
      "sin retorno, y qué acción tomar esta semana para generar más leads?",
    ].join("\n"),
  },
  {
    id: "ads_ga4",
    titulo: "Ads + Analytics (GA4)",
    subtitulo: "Cruza lo que reportan las plataformas de pago contra lo que GA4 confirma como conversión real",
    requisitoLabel: "Requiere Google Ads y/o Meta Ads, y GA4, configurados en este cliente.",
    requiredPlatforms: (configured) => {
      const ads = adsPlatforms(configured);
      if (ads.length === 0 || !configured.has("ga4")) return null;
      return [...ads, "ga4"];
    },
    defaultInstruction: [
      "Cruzá lo que reportan las plataformas de ads con lo que GA4 confirma como conversión real,",
      "usando datos de GA4 de [CLIENTE].",
      "",
      ...rolLines("ads", "analytics"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Foco del diagnóstico:",
      "- Comparar las conversiones registradas en el admin de cada plataforma publicitaria contra",
      "  los eventos de conversión reales registrados en GA4 (también configurado en el admin).",
      "- Detectar campañas con alto volumen de objetivos de conversión reportados por la plataforma",
      "  pero baja o nula conversión confirmada en GA4 (posible lead de baja calidad o problema de",
      "  tracking).",
      "- Señalar discrepancias grandes entre lo que la plataforma de ads considera \"conversión\" y",
      "  lo que GA4 confirma, para no seguir pagando por leads que no son leads reales.",
      "- Si hay suficiente información, indicar qué campañas/canales tienen mejor tasa de",
      "  conversión real (GA4) por sobre el volumen reportado por la plataforma.",
      "",
      "No repitas hallazgos que ya sean puramente de una sola plataforma sin cruce — el valor de",
      "este bloque está en el cruce entre ambas fuentes.",
      "",
      "Entregá máximo 5–7 insights totales (no por sección), etiquetados como Tendencia,",
      "Oportunidad, Hallazgo, Punto de mejora o Diagnóstico, formato:",
      "Dato (plataforma de ads) → Dato (GA4) → Insight → Impacto → Acción",
      "",
      "No confundas eventos secundarios (scroll, clicks internos) con la conversión principal",
      "configurada en GA4. No inventes causas si el dato no las confirma — marcalas como hipótesis",
      "a validar. Ordená de mayor a menor impacto en generación real de leads/conversión.",
    ].join("\n"),
  },
  {
    id: "ads_seo",
    titulo: "Ads + SEO",
    subtitulo: "Detecta canibalización y landing pages pagas con problemas técnicos",
    requisitoLabel: "Requiere Google Ads y/o Meta Ads, y Search Console, configurados en este cliente.",
    requiredPlatforms: (configured) => {
      const ads = adsPlatforms(configured);
      if (ads.length === 0 || !configured.has("search_console")) return null;
      return [...ads, "search_console"];
    },
    defaultInstruction: [
      "Analizá el cruce entre ads y SEO para [CLIENTE], sobre [URL o dominio].",
      "",
      ...rolLines("ads", "seo"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Cruzá:",
      "- Keywords en las que estás pagando CPC alto pero ya rankean orgánicamente en top 3",
      "  (canibalización de presupuesto).",
      "- Landing pages de campañas pagas con problemas técnicos o de contenido (velocidad, mobile,",
      "  E-E-A-T) que estén inflando el CPA.",
      "- Oportunidades donde SEO orgánico podría reemplazar spend pago en el mediano plazo.",
      "",
      "Entregá máximo 5–7 insights totales, etiquetados como Tendencia, Oportunidad, Hallazgo,",
      "Punto de mejora o Diagnóstico, formato:",
      "Dato (ads) → Dato (SEO) → Insight → Impacto → Acción",
      "",
      "No mezcles tráfico orgánico con pago al calcular eficiencia. No inventes datos de ranking si",
      "no los tenés — pedilos o marcalo como pendiente. Ordená por impacto en costo de adquisición y",
      "generación de leads.",
    ].join("\n"),
  },
  {
    id: "analytics_solo",
    titulo: "Analytics solo (GA4)",
    subtitulo: "Comportamiento y conversión",
    requisitoLabel: "Requiere GA4 configurado en este cliente.",
    requiredPlatforms: (configured) => (configured.has("ga4") ? ["ga4"] : null),
    defaultInstruction: [
      "Con datos de GA4 de [CLIENTE], enfocate únicamente en los eventos de conversión principales",
      "configurados (no en eventos secundarios ni vanity metrics).",
      "",
      ...rolLines("analytics"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Entregá máximo 5–7 insights totales, etiquetados como Tendencia, Oportunidad, Hallazgo,",
      "Punto de mejora o Diagnóstico (sin repetir insight en dos categorías), formato:",
      "Dato → Insight → Impacto → Acción",
      "",
      "No muestres una métrica sin interpretación. No confundas volumen de sesiones con eficiencia",
      "de conversión. Si detectás una caída o pico raro, indicá si hay una causa confirmada por el",
      "dato o si es hipótesis a validar — nunca la presentes como hecho.",
      "",
      "Priorizá: ¿qué canal/página está generando conversiones reales hoy?, ¿dónde se está",
      "perdiendo el funnel?, ¿qué acción concreta sube leads esta semana?",
    ].join("\n"),
  },
  {
    id: "seo_solo",
    titulo: "SEO solo",
    subtitulo: "Visibilidad orgánica vía Search Console",
    requisitoLabel: "Requiere Search Console configurado en este cliente.",
    requiredPlatforms: (configured) => (configured.has("search_console") ? ["search_console"] : null),
    defaultInstruction: [
      "Para [CLIENTE] / [URL], con datos de Search Console.",
      "",
      ...rolLines("seo"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Entregá máximo 5–7 insights totales, etiquetados como Tendencia, Oportunidad, Hallazgo,",
      "Punto de mejora o Diagnóstico, formato:",
      "Dato → Insight → Impacto → Acción",
      "",
      "No mezcles impresiones con clics reales, ni posición promedio con tráfico ganado. No",
      "inventes causas de caídas de ranking sin evidencia (algoritmo, técnico, contenido) —",
      "marcalas como hipótesis si no están confirmadas. Ordená de mayor a menor impacto en",
      "tráfico/leads orgánicos.",
    ].join("\n"),
  },
  {
    id: "cross_platform",
    titulo: "Cross-plataforma",
    subtitulo: "Informe ejecutivo consolidado, máximo 5–7 insights totales entre las tres fuentes",
    requisitoLabel: "Requiere al menos 2 de las 3 categorías (Ads, GA4, Search Console) configuradas en este cliente.",
    requiredPlatforms: (configured) => {
      const ads = adsPlatforms(configured);
      const categories = [ads.length > 0, configured.has("ga4"), configured.has("search_console")].filter(
        Boolean
      ).length;
      if (categories < 2) return null;
      return [...ads, ...(configured.has("ga4") ? (["ga4"] as const) : []), ...(configured.has("search_console") ? (["search_console"] as const) : [])];
    },
    defaultInstruction: [
      "Para [CLIENTE], consolidá en UN solo reporte ejecutivo lo que está pasando en pago",
      "(Meta/Google Ads), comportamiento/conversión (GA4) y orgánico (Search Console).",
      "",
      ...rolLines("ads", "analytics", "seo"),
      "Período: [PERÍODO]",
      "",
      "Instrucciones sobre el período:",
      "Analizá exclusivamente los días seleccionados. Cuando sea posible, compará contra la cantidad",
      "de días inmediatamente anteriores.",
      "Si existe suficiente información histórica, también podés utilizar períodos anteriores",
      "únicamente como contexto para detectar tendencias.",
      "No conviertas el reporte en un análisis histórico extenso.",
      "",
      "La prioridad siempre es: días seleccionados → cambios recientes → problemas actuales →",
      "oportunidades inmediatas.",
      "",
      "Entregá máximo 5–7 insights TOTALES para todo el reporte (no por plataforma) — priorizá",
      "calidad sobre cobertura: si solo hay 4 hallazgos realmente accionables, entregá 4. Cada",
      "insight etiquetado como Tendencia, Oportunidad, Hallazgo, Punto de mejora o Diagnóstico, sin",
      "repetir el mismo insight en dos categorías, formato:",
      "Dato → Insight → Impacto → Acción",
      "",
      "Reglas estrictas:",
      "- No mostrar métricas sin interpretación ni métricas que no aporten una decisión.",
      "- No confundir clics con conversiones, eventos secundarios con conversión principal, ni",
      "  volumen con eficiencia.",
      "- No inventar datos ni causas; toda causa no confirmada por el dato va marcada como",
      "  hipótesis.",
      "- Ordenar de mayor a menor impacto en generación de leads y conversiones configuradas.",
      "- Reporte breve, visual (sin gráficos innecesarios), ejecutivo, sin historial extenso.",
      "",
      "Cerrá con una sección corta \"Qué hacer esta semana\" de máximo 3 acciones, derivadas",
      "únicamente de los insights ya presentados (nada nuevo).",
    ].join("\n"),
  },
];
