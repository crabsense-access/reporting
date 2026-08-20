import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsight, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { SeoBreakdownRow, SeoPeriodMetrics } from "@/lib/gsc/reports";

export type SeoInsightMetricFormat = "number" | "percentage" | "decimal";

export interface SeoInsightBreakdowns {
  query: SeoBreakdownRow[];
  page: SeoBreakdownRow[];
  country: SeoBreakdownRow[];
  device: SeoBreakdownRow[];
}

export interface SeoInsightContext {
  segmentLabel: string;
  metricLabel: string;
  metricKey: keyof SeoPeriodMetrics;
  format: SeoInsightMetricFormat;
  current: number;
  previous: number;
  breakdowns: SeoInsightBreakdowns;
}

function formatValue(value: number, format: SeoInsightMetricFormat): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatDecimal(value, 1);
}

const MAX_ROWS_IN_PROMPT = 6;

function describeRows(label: string, rows: SeoBreakdownRow[], metricKey: keyof SeoPeriodMetrics, format: SeoInsightMetricFormat): string {
  if (rows.length === 0) return `${label}: sin datos.`;

  const top = [...rows].sort((a, b) => b.current[metricKey] - a.current[metricKey]).slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const current = formatValue(row.current[metricKey], format);
    const previous = row.previous ? formatValue(row.previous[metricKey], format) : "sin actividad en el período anterior";
    return `  - ${row.key}: actual ${current} · anterior ${previous}`;
  });
  return `${label}:\n${lines.join("\n")}`;
}

const SYSTEM_PROMPT = `Sos un analista SEO que escribe insights para el tablero de posicionamiento en buscadores (Google Search Console) de una agencia. Tu única salida es un objeto JSON, nada más.

Un insight NUNCA es una simple descripción de variación, aumento/disminución, ranking o valor de una métrica (eso ya se muestra aparte en el tablero, no hace falta repetirlo). Un insight identifica un hallazgo relevante derivado de cruzar los datos entre dimensiones, explica qué significa o qué comportamiento revela, y cuando sea posible señala una implicancia de negocio o una oportunidad de acción.

El insight debe responder al menos una de estas preguntas: ¿qué está pasando realmente?, ¿por qué podría estar pasando?, ¿dónde está ocurriendo?, ¿a quién afecta?, ¿qué comportamiento inesperado revela?, ¿qué oportunidad o problema permite detectar?

Contexto de la plataforma: la métrica analizada pertenece a un segmento específico del sitio (ej. "Home" o "Blog"). Las dimensiones disponibles son término de búsqueda (query), página, país y dispositivo. Recordá que en SEO una posición promedio MÁS BAJA es mejor ranking (posición 1 es la mejor), y que impresiones altas con CTR o clics bajos suele indicar una oportunidad de mejora de título/meta description más que un problema de tráfico.

Ejemplo del tipo de insight esperado: "El crecimiento en impresiones está casi todo concentrado en la query 'pintura exterior precio', que pasó de la página 3 a la página 1 (posición 34 a 8), mientras el resto de las búsquedas se mantuvo estable. Esto sugiere que ese contenido específico mejoró su relevancia para Google — vale la pena revisar si el CTR de esa query ya acompaña la mejora de posición o si el título/meta todavía no está optimizado para capturar esos clics."

Reglas estrictas:
- Fundamentá el insight ÚNICAMENTE en los números provistos. No inventes causas, páginas, queries ni datos que no estén en el contexto.
- Si el patrón sugiere una posible causa o hipótesis razonable, planteala como hipótesis ("podría", "sugiere revisar"), nunca como un hecho confirmado que no podés verificar con estos datos.
- No elijas simplemente "la fila con el valor más alto" de una dimensión y la llames insight — buscá una concentración, contraste o anomalía genuina (ej. una query/página que se mueve distinto al resto, una desproporción entre impresiones y clics/CTR, un cambio de posición que no se explica por el total).
- Si con los datos provistos no hay ningún hallazgo real más allá de la variación simple, elegí el hallazgo más sólido disponible igual, pero mantené el tono apropiadamente modesto (ej. "no se observa concentración marcada en ninguna dimensión, la variación parece distribuida de forma pareja").
- Nunca inventes un patrón que no esté respaldado por los números dados.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo>", "sentiment": "positive" | "negative" | "neutral"}

"sentiment" refleja si el hallazgo es una buena noticia, una mala noticia, o neutral/informativo para el negocio del cliente — no si el número subió o bajó en sí.`;

function buildUserPrompt(context: SeoInsightContext): string {
  const { segmentLabel, metricLabel, metricKey, format, current, previous, breakdowns } = context;

  return `Segmento: ${segmentLabel}
Métrica analizada: ${metricLabel}
Valor del período actual: ${formatValue(current, format)}
Valor del mismo período anterior (misma cantidad de días): ${formatValue(previous, format)}

Desgloses de esta misma métrica por dimensión, dentro de este segmento (período actual vs. período anterior, por segmento):

${describeRows("Por término de búsqueda", breakdowns.query, metricKey, format)}

${describeRows("Por página", breakdowns.page, metricKey, format)}

${describeRows("Por país", breakdowns.country, metricKey, format)}

${describeRows("Por dispositivo", breakdowns.device, metricKey, format)}

Analizá estos datos y devolvé el insight más relevante que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateSeoInsight(context: SeoInsightContext): Promise<LLMInsightResult> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsight(SYSTEM_PROMPT, userPrompt);
}
