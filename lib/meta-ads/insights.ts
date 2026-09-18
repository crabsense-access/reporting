// Fetch de insights a nivel cuenta para varios rangos de fecha en una sola
// llamada (parámetro time_ranges de la Marketing API), usado por el tablero
// de reporting (ver app/api/clients/[id]/reporting-metrics/route.ts). Mismo
// patrón de autenticación que lib/reports/tools.ts (query_meta_ads): System
// User token de agencia vía fetchMetaGraphApi. A diferencia de query_meta_ads
// (que desglosa por campaign/adset/ad), acá se pide level: "account" porque
// solo interesa el total de la cuenta para el KPI del filtro semana/mes.
import { fetchMetaGraphApi } from "@/lib/meta-ads/client";

export interface MetaAccountInsightsRange {
  from: string;
  to: string;
}

export interface MetaAccountInsightsResult {
  from: string;
  to: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface MetaInsightsRow {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
}

export async function fetchAccountInsightsForRanges(
  accountId: string,
  ranges: MetaAccountInsightsRange[],
  token?: string
): Promise<{ currency: string; results: MetaAccountInsightsResult[] }> {
  const [insights, accountInfo] = await Promise.all([
    fetchMetaGraphApi<MetaInsightsResponse>(
      `${accountId}/insights`,
      {
        level: "account",
        time_ranges: JSON.stringify(ranges.map((r) => ({ since: r.from, until: r.to }))),
        fields: "spend,impressions,clicks",
      },
      token
    ),
    fetchMetaGraphApi<{ currency?: string }>(accountId, { fields: "currency" }, token),
  ]);

  // La Marketing API devuelve una fila por rango (en el mismo orden que
  // time_ranges) marcada con date_start/date_stop — se matchea por esos
  // valores en vez de confiar ciegamente en el orden de respuesta, y se
  // completa con 0 cualquier rango sin fila (Meta a veces omite el rango si
  // no hubo actividad en esos días).
  const byRange = new Map<string, MetaInsightsRow>();
  insights.data.forEach((row) => {
    if (row.date_start && row.date_stop) {
      byRange.set(`${row.date_start}_${row.date_stop}`, row);
    }
  });

  const results = ranges.map((range) => {
    const row = byRange.get(`${range.from}_${range.to}`);
    return {
      from: range.from,
      to: range.to,
      spend: Number(row?.spend ?? 0),
      impressions: Number(row?.impressions ?? 0),
      clicks: Number(row?.clicks ?? 0),
    };
  });

  return { currency: accountInfo.currency ?? "USD", results };
}
