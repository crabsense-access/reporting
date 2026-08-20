import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { MetaAdsMetricKey } from "@/components/dashboard/MetaAdsTrendChart";

// Server- y client-safe (nada de "use client" acá): lo usa tanto
// MetaAdsDashboard (para armar los scorecards) como la API route de
// insights (para saber la etiqueta/formato de cada métrica al armar el
// prompt del LLM), sin que una tenga que importar de la otra.
export type MetaAdsMetricFormat = "number" | "decimal" | "percentage" | "currency";

export interface MetaAdsMetricDef {
  key: MetaAdsMetricKey;
  label: string;
  format: MetaAdsMetricFormat;
}

// Página "Visión General" — métricas de alcance/desempeño, sin nada de costo.
export const OVERVIEW_METRIC_DEFS: MetaAdsMetricDef[] = [
  { key: "impressions", label: "Impresiones", format: "number" },
  { key: "frequency", label: "Frecuencia", format: "decimal" },
  { key: "linkClicks", label: "Clics en el enlace", format: "number" },
  { key: "linkClickCtr", label: "CTR (clics en el enlace)", format: "percentage" },
  { key: "conversions", label: "Conversiones", format: "number" },
  { key: "conversionRate", label: "Tasa de conversión", format: "percentage" },
];

// Página "Costos" — todo lo que es plata: costo total, costo por
// conversión, y los dos "costo por X" que antes eran tarjetas fijas
// sueltas (CPC, CPM) y ahora son scorecards completos.
export const COST_METRIC_DEFS: MetaAdsMetricDef[] = [
  { key: "spend", label: "Costo", format: "currency" },
  { key: "cpa", label: "Costo por conversión", format: "currency" },
  { key: "cpc", label: "CPC", format: "currency" },
  { key: "cpm", label: "CPM", format: "currency" },
];

export const ALL_METRIC_DEFS: MetaAdsMetricDef[] = [...OVERVIEW_METRIC_DEFS, ...COST_METRIC_DEFS];

export function formatMetricValue(value: number, format: MetaAdsMetricFormat, currencyCode: string): string {
  if (format === "number") return formatNumber(value);
  if (format === "decimal") return formatDecimal(value);
  if (format === "percentage") return formatPercent(value);
  return formatCurrency(value, currencyCode);
}
