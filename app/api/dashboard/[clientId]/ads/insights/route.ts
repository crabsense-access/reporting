import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { getPreviousPeriod } from "@/lib/date-range";
import { getOrGenerateInsight, type CachedInsight } from "@/lib/insights/insight-cache";
import { generateGoogleAdsInsight } from "@/lib/insights/google-ads-llm-insight";
import { LLM_INSIGHT_MODEL } from "@/lib/insights/llm-client";
import { ALL_METRIC_DEFS } from "@/lib/google-ads/metric-defs";
import {
  fetchGoogleAdsAdBreakdown,
  fetchGoogleAdsAdGroupBreakdown,
  fetchGoogleAdsCampaignBreakdown,
  fetchGoogleAdsDayOfWeekBreakdown,
  fetchGoogleAdsDeviceBreakdown,
  fetchGoogleAdsHourlyBreakdown,
  fetchGoogleAdsKeywordBreakdown,
  fetchGoogleAdsMetrics,
  fetchGoogleAdsNetworkBreakdown,
  type GoogleAdsPeriodMetrics,
} from "@/lib/google-ads/reports";
import type { GoogleAdsConfig } from "@/lib/types";

// GET /api/dashboard/[clientId]/ads/insights?from=...&to=...&dashboard=overview|costs&metrics=spend,cpa&force=0|1
// Mismo mecanismo que el equivalente de Meta Ads (ver
// app/api/dashboard/[clientId]/meta-ads/insights/route.ts): un insight por
// LLM por métrica pedida, cruzando las 8 dimensiones de desglose, cacheado
// 24hs en la misma tabla dashboard_insights (dashboard="google_ads_overview"
// / "google_ads_costs" para no chocar con las claves de Meta Ads).
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

  const requestedKeys = metricsParam.split(",").map((key) => key.trim());
  const metricDefs = requestedKeys
    .map((key) => ALL_METRIC_DEFS.find((def) => def.key === key))
    .filter((def): def is (typeof ALL_METRIC_DEFS)[number] => !!def);

  if (metricDefs.length === 0) {
    return NextResponse.json({ error: "Ninguna métrica pedida es válida." }, { status: 400 });
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
    .eq("source_type", "google_ads")
    .maybeSingle();

  if (!dataSource) {
    return NextResponse.json({ error: "Este cliente no tiene Google Ads conectado." }, { status: 404 });
  }

  const config = dataSource.config as GoogleAdsConfig;
  const range = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const [metrics, device, network, hourly, dayOfWeek, campaign, adGroup, ad, keyword] = await Promise.all([
      fetchGoogleAdsMetrics(config.customer_id, range, previousRange),
      fetchGoogleAdsDeviceBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsNetworkBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsHourlyBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsDayOfWeekBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsCampaignBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsAdGroupBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsAdBreakdown(config.customer_id, range, previousRange),
      fetchGoogleAdsKeywordBreakdown(config.customer_id, range, previousRange),
    ]);

    const breakdowns = { device, network, hourly, dayOfWeek, campaign, adGroup, ad, keyword };

    const results = await Promise.all(
      metricDefs.map(async (def) => {
        const cached = await getOrGenerateInsight({
          supabase,
          clientId,
          dashboard,
          metricKey: def.key,
          rangeFrom: from,
          rangeTo: to,
          model: LLM_INSIGHT_MODEL,
          forceRegenerate,
          generate: () =>
            generateGoogleAdsInsight({
              metricLabel: def.label,
              metricKey: def.key as keyof GoogleAdsPeriodMetrics,
              format: def.format,
              currencyCode: metrics.currencyCode,
              current: metrics[def.key as keyof GoogleAdsPeriodMetrics],
              previous: metrics.previous[def.key as keyof GoogleAdsPeriodMetrics],
              breakdowns,
            }),
        });
        return [def.key, cached] as const;
      })
    );

    const payload: Record<string, CachedInsight> = Object.fromEntries(results);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insights de Google Ads", error);
    return NextResponse.json({ error: "No se pudieron generar los insights." }, { status: 502 });
  }
}
