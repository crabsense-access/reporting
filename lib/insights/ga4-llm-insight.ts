import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsight, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { GA4BasicMetricKey } from "@/lib/ga4/metric-defs";
import type { GA4BreakdownRow, GA4GoalBreakdownRow } from "@/lib/ga4/reports";

export type GA4InsightMetricFormat = "number" | "percentage" | "duration";

// Forma unificada para las 8 dimensiones, sea la fila de una métrica básica
// (proyectada a un solo número desde BasicMetrics) o de un objetivo (ya es
// un solo número, eventCount) — así el prompt no necesita saber cuál de los
// dos casos está describiendo.
export interface GA4InsightBreakdownRow {
  key: string;
  current: number;
  previous: number | null;
}

export interface GA4InsightBreakdowns {
  device: GA4InsightBreakdownRow[];
  operatingSystem: GA4InsightBreakdownRow[];
  channel: GA4InsightBreakdownRow[];
  country: GA4InsightBreakdownRow[];
  landingPage: GA4InsightBreakdownRow[];
  newVsReturning: GA4InsightBreakdownRow[];
  hourly: GA4InsightBreakdownRow[];
  dayOfWeek: GA4InsightBreakdownRow[];
}

export interface GA4InsightContext {
  metricLabel: string;
  format: GA4InsightMetricFormat;
  current: number;
  previous: number;
  breakdowns: GA4InsightBreakdowns;
}

function formatValue(value: number, format: GA4InsightMetricFormat): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatDuration(value);
}

const MAX_ROWS_IN_PROMPT = 6;

function describeRows(label: string, rows: GA4InsightBreakdownRow[], format: GA4InsightMetricFormat): string {
  if (rows.length === 0) return `${label}: sin datos.`;

  const top = [...rows].sort((a, b) => b.current - a.current).slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const current = formatValue(row.current, format);
    const previous = row.previous !== null ? formatValue(row.previous, format) : "sin actividad en el período anterior";
    return `  - ${row.key}: actual ${current} · anterior ${previous}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `Sos un analista de analítica web que escribe insights para el tablero de Analítica (Google Analytics 4) de una agencia. Tu única salida es un objeto JSON, nada más.

Un insight NUNCA es una simple descripción de variación, aumento/disminución, ranking o valor de una métrica (eso ya se muestra aparte en el tablero, no hace falta repetirlo). Un insight identifica un hallazgo relevante derivado de cruzar los datos entre dimensiones, explica qué significa o qué comportamiento revela, y cuando sea posible señala una implicancia de negocio o una oportunidad de acción.

El insight debe responder al menos una de estas preguntas: ¿qué está pasando realmente?, ¿por qué podría estar pasando?, ¿dónde está ocurriendo?, ¿a quién afecta?, ¿qué comportamiento inesperado revela?, ¿qué oportunidad o problema permite detectar?

Contexto de la plataforma: es un sitio con Google Analytics 4. Las dimensiones disponibles son dispositivo, sistema operativo, canal de adquisición (Direct, Organic Search, Referral, Paid, Social, etc.), país, página de destino, usuarios nuevos vs. recurrentes, horario y día de la semana. La métrica puede ser una métrica básica de audiencia (usuarios activos, sesiones, tasa de interacción, duración media) o un objetivo/conversión específico configurado por el cliente.

Ejemplo del tipo de insight esperado: "El tráfico desde 'Organic Social' casi se duplicó, pero su tasa de interacción es notablemente más baja que la del resto de los canales, lo que sugiere que ese tráfico nuevo podría no estar tan calificado como el que llega por búsqueda orgánica. Vale la pena revisar qué contenido está impulsando esa suba antes de invertir en amplificarlo."

Reglas estrictas:
- Fundamentá el insight ÚNICAMENTE en los números provistos. No inventes causas, campañas, páginas ni datos que no estén en el contexto.
- Si el patrón sugiere una posible causa o hipótesis razonable, planteala como hipótesis ("podría", "sugiere revisar"), nunca como un hecho confirmado que no podés verificar con estos datos.
- No elijas simplemente "la fila con el valor más alto" de una dimensión y la llames insight — buscá una concentración, contraste o anomalía genuina (ej. un segmento que se mueve distinto al resto, una desproporción entre volumen y calidad/conversión, un cambio que no se explica por el total, tráfico de un país inesperado para el negocio).
- Si con los datos provistos no hay ningún hallazgo real más allá de la variación simple, elegí el hallazgo más sólido disponible igual, pero mantené el tono apropiadamente modesto (ej. "no se observa concentración marcada en ninguna dimensión, la variación parece distribuida de forma pareja").
- Nunca inventes un patrón que no esté respaldado por los números dados.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo>", "sentiment": "positive" | "negative" | "neutral"}

"sentiment" refleja si el hallazgo es una buena noticia, una mala noticia, o neutral/informativo para el negocio del cliente — no si el número subió o bajó en sí.`;

function buildUserPrompt(context: GA4InsightContext): string {
  const { metricLabel, format, current, previous, breakdowns } = context;

  return `Métrica analizada: ${metricLabel}
Valor del período actual: ${formatValue(current, format)}
Valor del mismo período anterior (misma cantidad de días): ${formatValue(previous, format)}

Desgloses de esta misma métrica por dimensión (período actual vs. período anterior, por segmento):

${describeRows("Por dispositivo", breakdowns.device, format)}

${describeRows("Por sistema operativo", breakdowns.operatingSystem, format)}

${describeRows("Por canal de adquisición", breakdowns.channel, format)}

${describeRows("Por país", breakdowns.country, format)}

${describeRows("Por página de destino", breakdowns.landingPage, format)}

${describeRows("Por nuevo/recurrente", breakdowns.newVsReturning, format)}

${describeRows("Por horario del día", breakdowns.hourly, format)}

${describeRows("Por día de la semana", breakdowns.dayOfWeek, format)}

Analizá estos datos y devolvé el insight más relevante que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateGA4Insight(context: GA4InsightContext): Promise<LLMInsightResult> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsight(SYSTEM_PROMPT, userPrompt);
}

// Proyecta el desglose "bundle de 4 métricas" de una métrica básica (ver
// lib/ga4/reports.ts) a la forma plana {key, current, previous} que espera
// el prompt — un objetivo (goal) ya viene así de por sí (eventCount es un
// solo número), así que solo las métricas básicas necesitan este paso.
export function projectBasicBreakdown(rows: GA4BreakdownRow[], metricKey: GA4BasicMetricKey): GA4InsightBreakdownRow[] {
  return rows.map((row) => ({
    key: row.key,
    current: row.current[metricKey],
    previous: row.previous ? row.previous[metricKey] : null,
  }));
}

export function goalBreakdownToInsightRows(rows: GA4GoalBreakdownRow[]): GA4InsightBreakdownRow[] {
  return rows.map((row) => ({ key: row.key, current: row.current, previous: row.previous }));
}
