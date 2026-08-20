import { generateInsight, type Insight } from "@/lib/insights/generateInsight";
import type { BasicMetrics, GoalMetric } from "@/lib/ga4/types";
import type { SeoSegmentMetrics } from "@/lib/gsc/reports";
import type { GoogleAdsPeriodMetrics } from "@/lib/google-ads/reports";
import type { MetaAdsPeriodMetrics } from "@/lib/meta-ads/reports";

// Funciones puras compartidas entre los tableros reales (que las usan con el
// rango de fechas que el usuario tiene elegido) y el precálculo del sidebar
// (que las corre con un rango por defecto para secciones que todavía no se
// visitaron en la sesión) — una sola definición de qué es cada insight.

export function buildBasicInsights(current: BasicMetrics, previous: BasicMetrics): Insight[] {
  return [
    generateInsight({
      label: "Usuarios activos",
      current: current.activeUsers,
      previous: previous.activeUsers,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Sesiones",
      current: current.sessions,
      previous: previous.sessions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Tasa de interacción",
      current: current.engagementRate,
      previous: previous.engagementRate,
      format: "percentage",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Duración media de interacción",
      current: current.averageSessionDuration,
      previous: previous.averageSessionDuration,
      format: "duration",
      higherIsBetter: true,
    }),
  ];
}

export function buildGoalInsights(goals: GoalMetric[]): Insight[] {
  const primary = goals.filter((goal) => goal.type === "primary");
  const secondary = goals.filter((goal) => goal.type === "secondary");

  return [...primary, ...secondary].map((goal) =>
    generateInsight({
      label: goal.name,
      current: goal.total,
      previous: goal.previousTotal,
      format: "number",
      higherIsBetter: true,
    })
  );
}

export function buildSegmentInsights(segment: SeoSegmentMetrics): Insight[] {
  return [
    generateInsight({
      label: "Clics",
      current: segment.clicks,
      previous: segment.previous.clicks,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Impresiones",
      current: segment.impressions,
      previous: segment.previous.impressions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "CTR",
      current: segment.ctr,
      previous: segment.previous.ctr,
      format: "percentage",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Posición promedio",
      current: segment.position,
      previous: segment.previous.position,
      format: "number",
      // En Search Console, un número de posición más bajo es mejor ranking.
      higherIsBetter: false,
    }),
  ];
}

export function buildGoogleAdsInsights(
  current: GoogleAdsPeriodMetrics,
  previous: GoogleAdsPeriodMetrics,
  currencyCode: string
): Insight[] {
  return [
    generateInsight({
      label: "Clics",
      current: current.clicks,
      previous: previous.clicks,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Impresiones",
      current: current.impressions,
      previous: previous.impressions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "CTR",
      current: current.ctr,
      previous: previous.ctr,
      format: "percentage",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Conversiones",
      current: current.conversions,
      previous: previous.conversions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Costo",
      current: current.spend,
      previous: previous.spend,
      format: "currency",
      currencyCode,
      // Un aumento de costo no es en sí mismo bueno ni malo (puede reflejar
      // más volumen), pero se marca como "no mejor" para que una suba fuerte
      // se destaque y valga la pena revisarla — mismo criterio que la
      // posición promedio de Search Console.
      higherIsBetter: false,
    }),
  ];
}

// Mismo criterio que buildAdsInsights (Google Ads) pero con las 8 métricas
// que se muestran en los scorecards de Meta Ads (ver MetaAdsDashboard) — el
// pill de "ads" del sidebar refleja lo mismo que ve el usuario en el
// tablero. Meta reporta el costo directo en la unidad de la moneda de la
// cuenta (a diferencia de Google Ads, que lo da en micros).
export function buildMetaAdsInsights(
  current: MetaAdsPeriodMetrics,
  previous: MetaAdsPeriodMetrics,
  currencyCode: string,
  conversionEvent: string
): Insight[] {
  return [
    generateInsight({
      label: "Impresiones",
      current: current.impressions,
      previous: previous.impressions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Frecuencia",
      current: current.frequency,
      previous: previous.frequency,
      format: "decimal",
      // Una frecuencia más alta no es en sí buena ni mala (puede ser fatiga
      // de audiencia o simplemente menos alcance nuevo) — mismo criterio de
      // "no mejor" que el costo, para que una suba fuerte se destaque.
      higherIsBetter: false,
    }),
    generateInsight({
      label: "Clics en el enlace",
      current: current.linkClicks,
      previous: previous.linkClicks,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "CTR (clics en el enlace)",
      current: current.linkClickCtr,
      previous: previous.linkClickCtr,
      format: "percentage",
      higherIsBetter: true,
    }),
    generateInsight({
      label: `Conversiones (${conversionEvent})`,
      current: current.conversions,
      previous: previous.conversions,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: `Tasa de conversión (${conversionEvent})`,
      current: current.conversionRate,
      previous: previous.conversionRate,
      format: "percentage",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Costo",
      current: current.spend,
      previous: previous.spend,
      format: "currency",
      currencyCode,
      // Mismo criterio que Google Ads: un aumento de costo no es en sí mismo
      // bueno ni malo, pero se marca "no mejor" para que una suba fuerte se
      // destaque y valga la pena revisarla.
      higherIsBetter: false,
    }),
    generateInsight({
      label: `Costo por conversión (${conversionEvent})`,
      current: current.cpa,
      previous: previous.cpa,
      format: "currency",
      currencyCode,
      higherIsBetter: false,
    }),
  ];
}
