import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getPreviousPeriod } from "@/lib/date-range";
import { getOrGenerateInsight, type CachedInsight } from "@/lib/insights/insight-cache";
import { generateSeoInsight } from "@/lib/insights/gsc-llm-insight";
import { LLM_INSIGHT_MODEL } from "@/lib/insights/llm-client";
import { SEO_METRIC_DEFS } from "@/lib/gsc/metric-defs";
import { buildGSCSegments, type GSCSegmentQuery } from "@/lib/gsc/segments";
import {
  fetchSegmentCountryBreakdown,
  fetchSegmentDeviceBreakdown,
  fetchSegmentMetrics,
  fetchSegmentPageBreakdown,
  fetchSegmentQueryBreakdown,
  type SeoPeriodMetrics,
} from "@/lib/gsc/reports";
import type { GSCConfig } from "@/lib/types";

// GET /api/dashboard/[clientId]/seo/insights?from=...&to=...&dashboard=seo_vision_general&metrics=Home::clicks,Blog - Notas::position&force=0|1
// Mismo mecanismo que las otras 3 plataformas: un insight por LLM por
// (segmento, métrica) pedido, cruzando las 4 dimensiones de desglose
// (búsqueda/página/país/dispositivo) DENTRO de ese segmento — cada entrada
// de `metrics` viene como "<segmento>::<métrica>" porque acá, a diferencia
// de Ads/GA4, la misma métrica (ej. "clicks") existe una vez por segmento.
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dashboard = searchParams.get("dashboard");
  const metricsParam = searchParams.get("metrics");
  const forceRegenerate = searchParams.get("force") === "1";

  if (!from || !to || !dashboard || !metricsParam) {
    return NextResponse.json(
      { error: "Los parámetros from, to, dashboard y metrics son obligatorios." },
      { status: 400 }
    );
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
    return NextResponse.json({ error: "Este cliente no tiene Search Console conectado." }, { status: 404 });
  }

  const config = dataSource.config as GSCConfig;
  const segmentQueries = buildGSCSegments(config);
  const segmentByLabel = new Map<string, GSCSegmentQuery>(segmentQueries.map((segment) => [segment.label, segment]));
  const metricDefByKey = new Map(SEO_METRIC_DEFS.map((def) => [def.key as string, def]));

  const requestedEntries = metricsParam
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => {
      const separatorIndex = entry.lastIndexOf("::");
      if (separatorIndex === -1) return null;
      const segmentLabel = entry.slice(0, separatorIndex);
      const metricKey = entry.slice(separatorIndex + 2);
      const segment = segmentByLabel.get(segmentLabel);
      const def = metricDefByKey.get(metricKey);
      if (!segment || !def) return null;
      return { compositeKey: entry, segment, def };
    })
    .filter((entry): entry is { compositeKey: string; segment: GSCSegmentQuery; def: (typeof SEO_METRIC_DEFS)[number] } => !!entry);

  if (requestedEntries.length === 0) {
    return NextResponse.json({ error: "Ninguna métrica pedida es válida." }, { status: 400 });
  }

  const range = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const neededSegmentLabels = [...new Set(requestedEntries.map((entry) => entry.segment.label))];

    const segmentData = new Map<
      string,
      { totals: SeoPeriodMetrics; previous: SeoPeriodMetrics; breakdowns: { query: Awaited<ReturnType<typeof fetchSegmentQueryBreakdown>>; page: Awaited<ReturnType<typeof fetchSegmentPageBreakdown>>; country: Awaited<ReturnType<typeof fetchSegmentCountryBreakdown>>; device: Awaited<ReturnType<typeof fetchSegmentDeviceBreakdown>> } }
    >();

    await Promise.all(
      neededSegmentLabels.map(async (label) => {
        const segment = segmentByLabel.get(label)!;
        const segmentParams = { segmentLabel: segment.label, siteUrl: segment.siteUrl, dimensionFilterGroups: segment.dimensionFilterGroups, from: range.from, to: range.to };
        const [metrics, query, page, country, device] = await Promise.all([
          withCache({ clientId, source: "search_console", query: "fetchSegmentMetrics", params: segmentParams }, () => fetchSegmentMetrics(segment, range, previousRange)),
          withCache({ clientId, source: "search_console", query: "fetchSegmentQueryBreakdown", params: segmentParams }, () => fetchSegmentQueryBreakdown(segment, range, previousRange)),
          withCache({ clientId, source: "search_console", query: "fetchSegmentPageBreakdown", params: segmentParams }, () => fetchSegmentPageBreakdown(segment, range, previousRange)),
          withCache({ clientId, source: "search_console", query: "fetchSegmentCountryBreakdown", params: segmentParams }, () => fetchSegmentCountryBreakdown(segment, range, previousRange)),
          withCache({ clientId, source: "search_console", query: "fetchSegmentDeviceBreakdown", params: segmentParams }, () => fetchSegmentDeviceBreakdown(segment, range, previousRange)),
        ]);
        segmentData.set(label, {
          totals: metrics,
          previous: metrics.previous,
          breakdowns: { query, page, country, device },
        });
      })
    );

    const results = await Promise.all(
      requestedEntries.map(async ({ compositeKey, segment, def }) => {
        const data = segmentData.get(segment.label)!;
        const cached = await getOrGenerateInsight({
          supabase,
          clientId,
          dashboard,
          metricKey: compositeKey,
          rangeFrom: from,
          rangeTo: to,
          model: LLM_INSIGHT_MODEL,
          forceRegenerate,
          generate: () =>
            generateSeoInsight({
              segmentLabel: segment.label,
              metricLabel: def.label,
              metricKey: def.key,
              format: def.format,
              current: data.totals[def.key],
              previous: data.previous[def.key],
              breakdowns: data.breakdowns,
            }),
        });
        return [compositeKey, cached] as const;
      })
    );

    const payload: Record<string, CachedInsight> = Object.fromEntries(results);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insights de SEO", error);
    return NextResponse.json({ error: "No se pudieron generar los insights." }, { status: 502 });
  }
}
