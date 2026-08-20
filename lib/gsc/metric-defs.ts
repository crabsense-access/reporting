import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { SeoPeriodMetrics } from "@/lib/gsc/reports";

// Server- y client-safe, mismo criterio que lib/meta-ads/metric-defs.ts.
export type SeoMetricFormat = "number" | "percentage" | "decimal";
export type SeoMetricKey = keyof SeoPeriodMetrics;

export interface SeoMetricDef {
  key: SeoMetricKey;
  label: string;
  format: SeoMetricFormat;
}

// Las mismas 4 métricas que ya mostraba SeoDashboard, sin split de Costos
// (Search Console no tiene un concepto de costo propio).
export const SEO_METRIC_DEFS: SeoMetricDef[] = [
  { key: "clicks", label: "Clics", format: "number" },
  { key: "impressions", label: "Impresiones", format: "number" },
  { key: "ctr", label: "CTR", format: "percentage" },
  { key: "position", label: "Posición promedio", format: "decimal" },
];

export function formatSeoMetricValue(value: number, format: SeoMetricFormat): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatDecimal(value, 1);
}
