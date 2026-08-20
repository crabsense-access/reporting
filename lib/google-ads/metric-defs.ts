import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { GoogleAdsMetricKey } from "@/components/dashboard/GoogleAdsTrendChart";

// Server- y client-safe (mismo criterio que lib/meta-ads/metric-defs.ts):
// lo usa tanto GoogleAdsDashboard como la API route de insights.
export type GoogleAdsMetricFormat = "number" | "percentage" | "currency";

export interface GoogleAdsMetricDef {
  key: GoogleAdsMetricKey;
  label: string;
  format: GoogleAdsMetricFormat;
}

// Página "Visión General" — desempeño, sin nada de costo. A diferencia de
// Meta, Google Ads no distingue "link clicks" de clics totales (un clic ya
// es un clic al anuncio) ni tiene un equivalente directo a "frecuencia", así
// que quedan 5 en vez de 6.
export const OVERVIEW_METRIC_DEFS: GoogleAdsMetricDef[] = [
  { key: "impressions", label: "Impresiones", format: "number" },
  { key: "clicks", label: "Clics", format: "number" },
  { key: "ctr", label: "CTR", format: "percentage" },
  { key: "conversions", label: "Conversiones", format: "number" },
  { key: "conversionRate", label: "Tasa de conversión", format: "percentage" },
];

// Página "Costos" — mismo criterio que Meta Ads: costo total, costo por
// conversión, CPC y CPM como scorecards completos.
export const COST_METRIC_DEFS: GoogleAdsMetricDef[] = [
  { key: "spend", label: "Costo", format: "currency" },
  { key: "cpa", label: "Costo por conversión", format: "currency" },
  { key: "cpc", label: "CPC", format: "currency" },
  { key: "cpm", label: "CPM", format: "currency" },
];

export const ALL_METRIC_DEFS: GoogleAdsMetricDef[] = [...OVERVIEW_METRIC_DEFS, ...COST_METRIC_DEFS];

export function formatMetricValue(value: number, format: GoogleAdsMetricFormat, currencyCode: string): string {
  if (format === "number") return formatNumber(value);
  if (format === "percentage") return formatPercent(value);
  return formatCurrency(value, currencyCode);
}
