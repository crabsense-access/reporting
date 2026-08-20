import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsight, type LLMInsightResult } from "@/lib/insights/llm-client";
import type {
  MetaAdsAgeGenderBreakdownRow,
  MetaAdsBreakdownRow,
  MetaAdsPeriodMetrics,
} from "@/lib/meta-ads/reports";

export type MetaAdsInsightMetricFormat = "number" | "decimal" | "percentage" | "currency";

export interface MetaAdsInsightBreakdowns {
  platform: MetaAdsBreakdownRow[];
  device: MetaAdsBreakdownRow[];
  ageGender: MetaAdsAgeGenderBreakdownRow[];
  hourly: MetaAdsBreakdownRow[];
  campaign: MetaAdsBreakdownRow[];
  adSet: MetaAdsBreakdownRow[];
  ad: MetaAdsBreakdownRow[];
  region: MetaAdsBreakdownRow[];
}

export interface MetaAdsInsightContext {
  metricLabel: string;
  metricKey: keyof MetaAdsPeriodMetrics;
  format: MetaAdsInsightMetricFormat;
  currencyCode: string;
  current: number;
  previous: number;
  breakdowns: MetaAdsInsightBreakdowns;
}

function formatValue(value: number, format: MetaAdsInsightMetricFormat, currencyCode: string): string {
  if (format === "number") return formatNumber(value);
  if (format === "decimal") return formatDecimal(value);
  if (format === "percentage") return formatPercent(value);
  return formatCurrency(value, currencyCode);
}

// Máximo de filas por dimensión que se le pasan al modelo — suficiente para
// que encuentre concentración/anomalías sin inflar el prompt con las 15
// filas que sí se muestran en la tabla de anuncios de la UI.
const MAX_ROWS_IN_PROMPT = 6;

function describeRows(
  label: string,
  rows: { key: string; current: MetaAdsPeriodMetrics; previous: MetaAdsPeriodMetrics | null }[],
  metricKey: keyof MetaAdsPeriodMetrics,
  format: MetaAdsInsightMetricFormat,
  currencyCode: string
): string {
  if (rows.length === 0) return `${label}: sin datos.`;

  const top = [...rows].sort((a, b) => b.current[metricKey] - a.current[metricKey]).slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const current = formatValue(row.current[metricKey], format, currencyCode);
    const previous = row.previous
      ? formatValue(row.previous[metricKey], format, currencyCode)
      : "sin actividad en el período anterior";
    return `  - ${row.key}: actual ${current} · anterior ${previous}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

function describeAgeGenderRows(
  rows: MetaAdsAgeGenderBreakdownRow[],
  metricKey: keyof MetaAdsPeriodMetrics,
  format: MetaAdsInsightMetricFormat,
  currencyCode: string
): string {
  if (rows.length === 0) return "Por edad y género: sin datos.";

  const top = [...rows].sort((a, b) => b.current[metricKey] - a.current[metricKey]).slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const current = formatValue(row.current[metricKey], format, currencyCode);
    const previous = row.previous
      ? formatValue(row.previous[metricKey], format, currencyCode)
      : "sin actividad en el período anterior";
    return `  - ${row.age} / ${row.gender === "female" ? "mujeres" : "hombres"}: actual ${current} · anterior ${previous}`;
  });
  return `Por edad y género:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `Sos un analista de marketing digital que escribe insights para el tablero de Meta Ads de una agencia. Tu única salida es un objeto JSON, nada más.

Un insight NUNCA es una simple descripción de variación, aumento/disminución, ranking o valor de una métrica (eso ya se muestra aparte en el tablero, no hace falta repetirlo). Un insight identifica un hallazgo relevante derivado de cruzar los datos entre dimensiones, explica qué significa o qué comportamiento revela, y cuando sea posible señala una implicancia de negocio o una oportunidad de acción.

El insight debe responder al menos una de estas preguntas: ¿qué está pasando realmente?, ¿por qué podría estar pasando?, ¿dónde está ocurriendo?, ¿a quién afecta?, ¿qué comportamiento inesperado revela?, ¿qué oportunidad o problema permite detectar?

Ejemplo del tipo de insight esperado: "Aunque el gasto total subió apenas 3%, la suba real está concentrada en el horario de 20 a 23hs (+45%), mientras el resto del día se mantuvo estable. Esto sugiere que vale la pena revisar si esa franja está generando resultados proporcionales al mayor gasto o si conviene reasignar presupuesto."

Reglas estrictas:
- Fundamentá el insight ÚNICAMENTE en los números provistos. No inventes causas, campañas, eventos externos ni datos que no estén en el contexto.
- Si el patrón sugiere una posible causa o hipótesis razonable, planteala como hipótesis ("podría", "sugiere revisar"), nunca como un hecho confirmado que no podés verificar con estos datos.
- No elijas simplemente "la fila con el valor más alto" de una dimensión y la llames insight — buscá una concentración, contraste o anomalía genuina (ej. un segmento que se mueve distinto al resto, una desproporción entre gasto y resultado, un cambio que no se explica por el total).
- Si con los datos provistos no hay ningún hallazgo real más allá de la variación simple, elegí el hallazgo más sólido disponible igual, pero mantené el tono apropiadamente modesto (ej. "no se observa concentración marcada en ninguna dimensión, la variación parece distribuida de forma pareja").
- Nunca inventes un patrón que no esté respaldado por los números dados.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo>", "sentiment": "positive" | "negative" | "neutral"}

"sentiment" refleja si el hallazgo es una buena noticia, una mala noticia, o neutral/informativo para el negocio del cliente — no si el número subió o bajó en sí.`;

function buildUserPrompt(context: MetaAdsInsightContext): string {
  const { metricLabel, metricKey, format, currencyCode, current, previous, breakdowns } = context;

  return `Métrica analizada: ${metricLabel}
Valor del período actual: ${formatValue(current, format, currencyCode)}
Valor del mismo período anterior (misma cantidad de días): ${formatValue(previous, format, currencyCode)}

Desgloses de esta misma métrica por dimensión (período actual vs. período anterior, por segmento):

${describeRows("Por plataforma", breakdowns.platform, metricKey, format, currencyCode)}

${describeRows("Por dispositivo", breakdowns.device, metricKey, format, currencyCode)}

${describeAgeGenderRows(breakdowns.ageGender, metricKey, format, currencyCode)}

${describeRows("Por horario del día", breakdowns.hourly, metricKey, format, currencyCode)}

${describeRows("Por campaña", breakdowns.campaign, metricKey, format, currencyCode)}

${describeRows("Por conjunto de anuncios", breakdowns.adSet, metricKey, format, currencyCode)}

${describeRows("Por anuncio", breakdowns.ad, metricKey, format, currencyCode)}

${describeRows("Por provincia", breakdowns.region, metricKey, format, currencyCode)}

Analizá estos datos y devolvé el insight más relevante que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateMetaAdsInsight(context: MetaAdsInsightContext): Promise<LLMInsightResult> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsight(SYSTEM_PROMPT, userPrompt);
}
