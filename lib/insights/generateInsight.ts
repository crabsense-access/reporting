import { formatCurrency, formatDecimal, formatDuration, formatNumber, formatPercent } from "@/lib/format";

// "multiplier" (Prompt 93) — para ratios tipo ROAS ("3,2x"): mismo tope de 1
// decimal que "decimal" (ver formatInsightValue), con un sufijo "x" que
// ningún otro format tiene.
export type InsightFormat = "number" | "percentage" | "duration" | "currency" | "decimal" | "multiplier";
export type InsightSentiment = "positive" | "negative" | "neutral";

export interface GenerateInsightInput {
  label: string;
  current: number;
  previous: number;
  format: InsightFormat;
  // Solo se usa (y es obligatorio) cuando format === "currency".
  currencyCode?: string;
  // true si un aumento es bueno (usuarios, sesiones, clics, objetivos...),
  // false si un aumento es malo (ej. posición promedio en Search Console).
  higherIsBetter: boolean;
}

export interface InsightLink {
  label: string;
  url: string;
}

export interface Insight {
  label: string;
  current: number;
  previous: number;
  variationPct: number;
  sentiment: InsightSentiment;
  isSpike: boolean;
  text: string;
  /** Opcional: link de referencia mostrado al final del insight (ej. "Ver guía oficial de Google →"). */
  link?: InsightLink;
}

const SPIKE_THRESHOLD = 25;
const NEUTRAL_THRESHOLD = 5;

// Variantes del cierre para insights "pico" — evita que todas las cards se
// lean idénticas cuando hay varias en pantalla. La elección es determinística
// por label (ver pickPhrase), no aleatoria en cada render.
const POSITIVE_SPIKE_PHRASES = [
  "una suba bastante por encima de lo normal — vale la pena revisar qué la generó.",
  "esto está muy por arriba del comportamiento habitual, conviene identificar la causa.",
  "un salto llamativo, buen momento para ver qué lo impulsó.",
  "una mejora notable, bastante fuera de lo que veníamos viendo.",
  "un envión importante, distinto al patrón habitual de esta métrica.",
];

const NEGATIVE_SPIKE_PHRASES = [
  "una baja bastante por encima de lo normal — vale la pena revisar qué la generó.",
  "esto se aleja bastante de lo habitual, conviene entender por qué.",
  "una caída marcada que merece revisión.",
  "un retroceso notable, bastante fuera de lo que veníamos viendo.",
  "una baja llamativa, distinta al patrón habitual de esta métrica.",
];

// Hash simple y estable (no criptográfico) para elegir siempre la misma
// variante para el mismo label.
function hashLabel(label: string): number {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickPhrase(label: string, phrases: string[]): string {
  return phrases[hashLabel(label) % phrases.length] ?? phrases[0]!;
}

// Delega enteramente en lib/format.ts en vez de reimplementar el
// formateo acá — una sola fuente de verdad para el tope de 1 decimal.
// Exportada (Prompt 92) para que MetricScorecardGroup formatee el valor
// grande/badge de cada tarjeta con el mismo criterio exacto que ya usa el
// texto del insight, en vez de reimplementar este mismo switch una 4ta vez.
export function formatInsightValue(value: number, format: InsightFormat, currencyCode?: string): string {
  if (format === "percentage") return formatPercent(value);
  if (format === "duration") return formatDuration(value);
  if (format === "currency") return formatCurrency(value, currencyCode ?? "USD");
  if (format === "decimal") return formatDecimal(value, 1);
  if (format === "multiplier") return `${formatDecimal(value, 1)}x`;
  return formatNumber(value);
}

// Motor de insights basado en reglas con umbrales fijos — sin IA ni llamadas
// externas. Compara el período actual contra el inmediatamente anterior
// (mismo largo de días) y clasifica la variación en positiva / negativa /
// neutral, marcando como "pico" las variaciones fuera de lo habitual.
export function generateInsight({
  label,
  current,
  previous,
  format,
  currencyCode,
  higherIsBetter,
}: GenerateInsightInput): Insight {
  const currentText = formatInsightValue(current, format, currencyCode);

  if (previous === 0 && current === 0) {
    return {
      label,
      current,
      previous,
      variationPct: 0,
      sentiment: "neutral",
      isSpike: false,
      text: `${label}: sin actividad registrada en ninguno de los dos períodos.`,
    };
  }

  if (previous === 0 && current > 0) {
    const sentiment: InsightSentiment = higherIsBetter ? "positive" : "negative";
    return {
      label,
      current,
      previous,
      variationPct: 100,
      sentiment,
      isSpike: true,
      text: `${label} pasó de 0 a ${currentText} — actividad nueva en este período.`,
    };
  }

  const previousText = formatInsightValue(previous, format, currencyCode);
  const variationPct = ((current - previous) / previous) * 100;
  // La clasificación invierte el signo cuando un aumento es malo (ej. una
  // baja en posición promedio de Search Console es una mejora).
  const classificationPct = higherIsBetter ? variationPct : -variationPct;
  const absClassificationPct = Math.abs(classificationPct);

  const direction = variationPct >= 0 ? "subió" : "bajó";
  const pctText = Math.abs(variationPct).toFixed(0);

  if (absClassificationPct < NEUTRAL_THRESHOLD) {
    return {
      label,
      current,
      previous,
      variationPct,
      sentiment: "neutral",
      isSpike: false,
      text: `${label} se mantuvo estable en ${currentText}.`,
    };
  }

  const sentiment: InsightSentiment = classificationPct > 0 ? "positive" : "negative";
  const isSpike = absClassificationPct >= SPIKE_THRESHOLD;

  let text: string;
  if (isSpike) {
    const closer = pickPhrase(label, sentiment === "positive" ? POSITIVE_SPIKE_PHRASES : NEGATIVE_SPIKE_PHRASES);
    text = `${label} ${direction} un ${pctText}% respecto al período anterior (de ${previousText} a ${currentText}) — ${closer}`;
  } else {
    text = `${label} ${direction} un ${pctText}% respecto al período anterior, llegando a ${currentText}.`;
  }

  return { label, current, previous, variationPct, sentiment, isSpike, text };
}
