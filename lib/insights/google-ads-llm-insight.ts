import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsight, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { GoogleAdsBreakdownRow, GoogleAdsPeriodMetrics } from "@/lib/google-ads/reports";

export type GoogleAdsInsightMetricFormat = "number" | "percentage" | "currency";

export interface GoogleAdsInsightBreakdowns {
  device: GoogleAdsBreakdownRow[];
  network: GoogleAdsBreakdownRow[];
  hourly: GoogleAdsBreakdownRow[];
  dayOfWeek: GoogleAdsBreakdownRow[];
  campaign: GoogleAdsBreakdownRow[];
  adGroup: GoogleAdsBreakdownRow[];
  ad: GoogleAdsBreakdownRow[];
  keyword: GoogleAdsBreakdownRow[];
}

export interface GoogleAdsInsightContext {
  metricLabel: string;
  metricKey: keyof GoogleAdsPeriodMetrics;
  format: GoogleAdsInsightMetricFormat;
  currencyCode: string;
  current: number;
  previous: number;
  breakdowns: GoogleAdsInsightBreakdowns;
}

function formatValue(value: number, format: GoogleAdsInsightMetricFormat, currencyCode: string): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatCurrency(value, currencyCode);
}

// Mismo límite que meta-ads-llm-insight.ts: suficiente para encontrar
// concentración/anomalías sin inflar el prompt con las 15 filas que sí se
// muestran en la tabla de anuncios/palabras clave de la UI.
const MAX_ROWS_IN_PROMPT = 6;

function describeRows(label: string, rows: GoogleAdsBreakdownRow[], metricKey: keyof GoogleAdsPeriodMetrics, format: GoogleAdsInsightMetricFormat, currencyCode: string): string {
  if (rows.length === 0) return `${label}: sin datos.`;

  const top = [...rows].sort((a, b) => b.current[metricKey] - a.current[metricKey]).slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const current = formatValue(row.current[metricKey], format, currencyCode);
    const previous = row.previous ? formatValue(row.previous[metricKey], format, currencyCode) : "sin actividad en el período anterior";
    return `  - ${row.key}: actual ${current} · anterior ${previous}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `Sos un analista de marketing digital que escribe insights para el tablero de Google Ads de una agencia. Tu única salida es un objeto JSON, nada más.

Un insight NUNCA es una simple descripción de variación, aumento/disminución, ranking o valor de una métrica (eso ya se muestra aparte en el tablero, no hace falta repetirlo). Un insight identifica un hallazgo relevante derivado de cruzar los datos entre dimensiones, explica qué significa o qué comportamiento revela, y cuando sea posible señala una implicancia de negocio o una oportunidad de acción.

El insight debe responder al menos una de estas preguntas: ¿qué está pasando realmente?, ¿por qué podría estar pasando?, ¿dónde está ocurriendo?, ¿a quién afecta?, ¿qué comportamiento inesperado revela?, ¿qué oportunidad o problema permite detectar?

Contexto de la plataforma: es una cuenta de Google Ads, principalmente de Search. Las dimensiones disponibles son dispositivo, red (Búsqueda propia vs. Socios de Búsqueda vs. Display vs. otras), horario, día de la semana, campaña, grupo de anuncios, anuncio y palabra clave (esta última es específica de Search: qué término de búsqueda del usuario disparó el anuncio).

Ejemplo del tipo de insight esperado: "El 68% del gasto de la campaña principal está concentrado en la palabra clave 'rhinoshield house paint', con una tasa de conversión muy superior al resto de las keywords. Esto sugiere que vale la pena ampliar el presupuesto o replicar esa intención de búsqueda en otras campañas, en vez de repartir el gasto de forma pareja entre todas las keywords activas."

Reglas estrictas:
- Fundamentá el insight ÚNICAMENTE en los números provistos. No inventes causas, campañas, palabras clave ni datos que no estén en el contexto.
- Si el patrón sugiere una posible causa o hipótesis razonable, planteala como hipótesis ("podría", "sugiere revisar"), nunca como un hecho confirmado que no podés verificar con estos datos.
- No elijas simplemente "la fila con el valor más alto" de una dimensión y la llames insight — buscá una concentración, contraste o anomalía genuina (ej. un segmento que se mueve distinto al resto, una desproporción entre gasto y resultado, un cambio que no se explica por el total).
- Si con los datos provistos no hay ningún hallazgo real más allá de la variación simple, elegí el hallazgo más sólido disponible igual, pero mantené el tono apropiadamente modesto (ej. "no se observa concentración marcada en ninguna dimensión, la variación parece distribuida de forma pareja").
- Nunca inventes un patrón que no esté respaldado por los números dados.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo>", "sentiment": "positive" | "negative" | "neutral"}

"sentiment" refleja si el hallazgo es una buena noticia, una mala noticia, o neutral/informativo para el negocio del cliente — no si el número subió o bajó en sí.`;

function buildUserPrompt(context: GoogleAdsInsightContext): string {
  const { metricLabel, metricKey, format, currencyCode, current, previous, breakdowns } = context;

  return `Métrica analizada: ${metricLabel}
Valor del período actual: ${formatValue(current, format, currencyCode)}
Valor del mismo período anterior (misma cantidad de días): ${formatValue(previous, format, currencyCode)}

Desgloses de esta misma métrica por dimensión (período actual vs. período anterior, por segmento):

${describeRows("Por dispositivo", breakdowns.device, metricKey, format, currencyCode)}

${describeRows("Por red", breakdowns.network, metricKey, format, currencyCode)}

${describeRows("Por horario del día", breakdowns.hourly, metricKey, format, currencyCode)}

${describeRows("Por día de la semana", breakdowns.dayOfWeek, metricKey, format, currencyCode)}

${describeRows("Por campaña", breakdowns.campaign, metricKey, format, currencyCode)}

${describeRows("Por grupo de anuncios", breakdowns.adGroup, metricKey, format, currencyCode)}

${describeRows("Por anuncio", breakdowns.ad, metricKey, format, currencyCode)}

${describeRows("Por palabra clave", breakdowns.keyword, metricKey, format, currencyCode)}

Analizá estos datos y devolvé el insight más relevante que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateGoogleAdsInsight(context: GoogleAdsInsightContext): Promise<LLMInsightResult> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsight(SYSTEM_PROMPT, userPrompt);
}
