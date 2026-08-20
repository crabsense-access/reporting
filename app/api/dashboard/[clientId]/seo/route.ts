import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { buildGSCSegments, type GSCSegmentQuery } from "@/lib/gsc/segments";
import {
  fetchSegmentCountryBreakdown,
  fetchSegmentDeviceBreakdown,
  fetchSegmentMetrics,
  fetchSegmentPageBreakdown,
  fetchSegmentQueryBreakdown,
  fetchSegmentTimeSeries,
  type SeoBreakdownRow,
  type SeoSegmentMetrics,
  type SeoTimeSeriesPoint,
} from "@/lib/gsc/reports";
import { getDefaultGranularity, getPreviousPeriod, type DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

// Params base compartidos por toda consulta a un segmento: identifican
// unívocamente la consulta real a Search Console (siteUrl + filtros), no
// solo la etiqueta visible.
function segmentCacheParams(segment: GSCSegmentQuery): Record<string, unknown> {
  return { segmentLabel: segment.label, siteUrl: segment.siteUrl, dimensionFilterGroups: segment.dimensionFilterGroups };
}

interface SeoSegmentBreakdowns {
  query: SeoBreakdownRow[];
  page: SeoBreakdownRow[];
  country: SeoBreakdownRow[];
  device: SeoBreakdownRow[];
}

interface SeoMetricsResponse {
  connected: boolean;
  segments: SeoSegmentMetrics[];
  // Ambos quedan indexados por segment.name (Home / Blog - Portada / Blog -
  // Notas) — cada segmento es efectivamente una consulta
  // distinta a Search Console (siteUrl + filtro de página propio).
  timeSeries: Record<string, { current: SeoTimeSeriesPoint[]; previous: SeoTimeSeriesPoint[] }> | null;
  breakdowns: Record<string, SeoSegmentBreakdowns> | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // Los 4 desgloses (búsqueda/página/país/dispositivo) solo los pide la
  // sección de insights o cuando el usuario expande el desglose de una
  // métrica — evita 4×2×N-segmentos llamadas extra a Search Console en cada
  // carga normal del tablero.
  const includeBreakdowns = searchParams.get("include_breakdowns") === "1";

  if (!from || !to) {
    return NextResponse.json({ error: "Los parámetros from y to son obligatorios." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!(await isAdminEmail(supabase, user.email))) {
    if (!(await isClientUserOfClient(supabase, user.email, clientId))) {
      return NextResponse.json({ error: "No tenés acceso a este tablero." }, { status: 403 });
    }
  }

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "search_console")
    .maybeSingle();

  if (!dataSource) {
    const payload: SeoMetricsResponse = { connected: false, segments: [], timeSeries: null, breakdowns: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const range: DateRangeValue = { from, to };
  const previousRange = getPreviousPeriod(range);
  const granularity = getDefaultGranularity(range);
  const segmentQueries = buildGSCSegments(config);

  try {
    const [segments, timeSeriesEntries, breakdownEntries] = await Promise.all([
      Promise.all(
        segmentQueries.map((segment) =>
          withCache(
            { clientId, source: "search_console", query: "fetchSegmentMetrics", params: { ...segmentCacheParams(segment), from: range.from, to: range.to } },
            () => fetchSegmentMetrics(segment, range, previousRange)
          )
        )
      ),
      Promise.all(
        segmentQueries.map(async (segment) => [
          segment.label,
          await withCache(
            { clientId, source: "search_console", query: "fetchSegmentTimeSeries", params: { ...segmentCacheParams(segment), from: range.from, to: range.to, granularity } },
            () => fetchSegmentTimeSeries(segment, range, previousRange, granularity)
          ),
        ] as const)
      ),
      includeBreakdowns
        ? Promise.all(
            segmentQueries.map(async (segment) => {
              const [query, page, country, device] = await Promise.all([
                withCache(
                  { clientId, source: "search_console", query: "fetchSegmentQueryBreakdown", params: { ...segmentCacheParams(segment), from: range.from, to: range.to } },
                  () => fetchSegmentQueryBreakdown(segment, range, previousRange)
                ),
                withCache(
                  { clientId, source: "search_console", query: "fetchSegmentPageBreakdown", params: { ...segmentCacheParams(segment), from: range.from, to: range.to } },
                  () => fetchSegmentPageBreakdown(segment, range, previousRange)
                ),
                withCache(
                  { clientId, source: "search_console", query: "fetchSegmentCountryBreakdown", params: { ...segmentCacheParams(segment), from: range.from, to: range.to } },
                  () => fetchSegmentCountryBreakdown(segment, range, previousRange)
                ),
                withCache(
                  { clientId, source: "search_console", query: "fetchSegmentDeviceBreakdown", params: { ...segmentCacheParams(segment), from: range.from, to: range.to } },
                  () => fetchSegmentDeviceBreakdown(segment, range, previousRange)
                ),
              ]);
              return [segment.label, { query, page, country, device }] as const;
            })
          )
        : Promise.resolve(null),
    ]);

    const payload: SeoMetricsResponse = {
      connected: true,
      segments,
      timeSeries: Object.fromEntries(timeSeriesEntries),
      breakdowns: breakdownEntries ? Object.fromEntries(breakdownEntries) : null,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Search Console", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Search Console." },
      { status: 502 }
    );
  }
}
