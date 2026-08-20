import { formatDuration, formatNumber, formatPercent } from "@/lib/format";
import type { BasicMetrics } from "@/lib/ga4/types";

// Server- y client-safe, mismo criterio que lib/meta-ads/metric-defs.ts.
export type GA4MetricFormat = "number" | "percentage" | "duration";
export type GA4BasicMetricKey = keyof BasicMetrics;

export interface GA4MetricDef {
  key: GA4BasicMetricKey;
  label: string;
  format: GA4MetricFormat;
}

// Las 4 métricas básicas de la página "Audiencia" — sin split de Costos
// (GA4 no tiene un concepto de costo propio).
export const BASIC_METRIC_DEFS: GA4MetricDef[] = [
  { key: "activeUsers", label: "Usuarios activos", format: "number" },
  { key: "sessions", label: "Sesiones", format: "number" },
  { key: "engagementRate", label: "Tasa de interacción", format: "percentage" },
  { key: "averageSessionDuration", label: "Duración media de interacción", format: "duration" },
];

export function formatBasicMetricValue(value: number, format: GA4MetricFormat): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatDuration(value);
}
