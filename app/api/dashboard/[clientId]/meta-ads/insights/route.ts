import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { getPreviousPeriod } from "@/lib/date-range";
import { getOrGenerateInsight, type CachedInsight } from "@/lib/insights/insight-cache";
import { generateMetaAdsInsight } from "@/lib/insights/meta-ads-llm-insight";
import { LLM_INSIGHT_MODEL } from "@/lib/insights/llm-client";
import { ALL_METRIC_DEFS } from "@/lib/meta-ads/metric-defs";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsAdBreakdown,
  fetchMetaAdsAdSetBreakdown,
  fetchMetaAdsAgeGenderBreakdown,
  fetchMetaAdsCampaignBreakdown,
  fetchMetaAdsDeviceBreakdown,
  fetchMetaAdsHourlyBreakdown,
  fetchMetaAdsMetrics,
  fetchMetaAdsPlatformBreakdown,
  fetchMetaAdsRegionBreakdown,
  type MetaAdsPeriodMetrics,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

// GET /api/dashboard/[clientId]/meta-ads/insights?from=...&to=...&dashboard=overview|costs&metrics=spend,cpa&conversion_event=...&force=0|1
// Devuelve un insight generado por LLM por cada métrica pedida, cruzando
// las 8 dimensiones de desglose (ver lib/insights/meta-ads-llm-insight.ts)
// — no un simple % de variación, eso ya se muestra aparte en el scorecard.
// Cacheado 24hs por (cliente, tablero, métrica, rango, evento) en la tabla
// dashboard_insights; force=1 (botón "Generar insights" del tablero)
// saltea el caché y regenera.
export async function GET(request: NextRequest, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const dashboard = searchParams.get("dashboard");
  const metricsParam = searchParams.get("metrics");
  const conversionEvent = searchParams.get("conversion_event")?.trim() || DEFAULT_CONVERSION_ACTION_TYPE;
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
    .eq("source_type", "meta_ads")
    .maybeSingle();

  if (!dataSource) {
    return NextResponse.json({ error: "Este cliente no tiene Meta Ads conectado." }, { status: 404 });
  }

  const config = dataSource.config as MetaAdsConfig;
  const range = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const [{ metrics }, platform, device, ageGender, hourly, campaign, adSet, ad, region] = await Promise.all([
      fetchMetaAdsMetrics(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsPlatformBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsDeviceBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsAgeGenderBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsHourlyBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsCampaignBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsAdSetBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsAdBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsRegionBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
    ]);

    const breakdowns = { platform, device, ageGender, hourly, campaign, adSet, ad, region };

    const results = await Promise.all(
      metricDefs.map(async (def) => {
        const cached = await getOrGenerateInsight({
          supabase,
          clientId,
          dashboard,
          metricKey: def.key,
          rangeFrom: from,
          rangeTo: to,
          conversionEvent,
          model: LLM_INSIGHT_MODEL,
          forceRegenerate,
          generate: () =>
            generateMetaAdsInsight({
              metricLabel: def.label,
              metricKey: def.key as keyof MetaAdsPeriodMetrics,
              format: def.format,
              currencyCode: metrics.currencyCode,
              current: metrics[def.key as keyof MetaAdsPeriodMetrics],
              previous: metrics.previous[def.key as keyof MetaAdsPeriodMetrics],
              breakdowns,
            }),
        });
        return [def.key, cached] as const;
      })
    );

    const payload: Record<string, CachedInsight> = Object.fromEntries(results);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insights de Meta Ads", error);
    return NextResponse.json({ error: "No se pudieron generar los insights." }, { status: 502 });
  }
}
