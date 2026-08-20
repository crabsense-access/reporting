import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getPreviousPeriod } from "@/lib/date-range";
import { getOrGenerateInsight, type CachedInsight } from "@/lib/insights/insight-cache";
import { generateGA4Insight, goalBreakdownToInsightRows, projectBasicBreakdown } from "@/lib/insights/ga4-llm-insight";
import { LLM_INSIGHT_MODEL } from "@/lib/insights/llm-client";
import { BASIC_METRIC_DEFS, type GA4BasicMetricKey } from "@/lib/ga4/metric-defs";
import {
  fetchBasicMetrics,
  fetchGA4ChannelBreakdown,
  fetchGA4CountryBreakdown,
  fetchGA4DayOfWeekBreakdown,
  fetchGA4DeviceBreakdown,
  fetchGA4GoalBreakdowns,
  fetchGA4HourlyBreakdown,
  fetchGA4LandingPageBreakdown,
  fetchGA4NewVsReturningBreakdown,
  fetchGA4OperatingSystemBreakdown,
  fetchGoalReport,
  type GA4GoalBreakdowns,
} from "@/lib/ga4/reports";
import type { GA4Config } from "@/lib/types";

const BASIC_METRIC_KEYS = new Set(BASIC_METRIC_DEFS.map((def) => def.key as string));

// GET /api/dashboard/[clientId]/metrics/insights?from=...&to=...&dashboard=analitica_audiencia&metrics=activeUsers,contact_submit&force=0|1
// Mismo mecanismo que Meta Ads / Google Ads: un insight por LLM por métrica
// pedida — acá "métrica" puede ser una de las 4 básicas de audiencia o el
// nombre de un objetivo (goal) configurado por el cliente, cruzando las 8
// dimensiones de desglose (dispositivo/SO/canal/país/página de destino/
// nuevo-recurrente/hora/día). Cacheado 24hs en la misma tabla
// dashboard_insights que las otras plataformas.
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
    .eq("source_type", "ga4")
    .maybeSingle();

  const config = dataSource?.config as GA4Config | undefined;
  if (!config?.property_id) {
    return NextResponse.json({ error: "Este cliente no tiene GA4 conectado." }, { status: 404 });
  }

  const configuredGoals = new Set([...(config.primary_goals ?? []), ...(config.secondary_goals ?? [])]);
  const requestedKeys = metricsParam.split(",").map((key) => key.trim());
  const basicKeys = requestedKeys.filter((key) => BASIC_METRIC_KEYS.has(key)) as GA4BasicMetricKey[];
  const goalNames = requestedKeys.filter((key) => configuredGoals.has(key));

  if (basicKeys.length === 0 && goalNames.length === 0) {
    return NextResponse.json({ error: "Ninguna métrica pedida es válida." }, { status: 400 });
  }

  const range = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const [basicMetrics, basicBreakdowns, goalTotals, goalBreakdowns] = await Promise.all([
      basicKeys.length > 0
        ? withCache(
            { clientId, source: "ga4", query: "fetchBasicMetrics", params: { propertyId: config.property_id, from: range.from, to: range.to } },
            () => fetchBasicMetrics(config.property_id, range, previousRange)
          )
        : null,
      basicKeys.length > 0
        ? Promise.all([
            withCache(
              { clientId, source: "ga4", query: "fetchGA4DeviceBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4DeviceBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4OperatingSystemBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4OperatingSystemBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4ChannelBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4ChannelBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4CountryBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4CountryBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4LandingPageBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4LandingPageBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4NewVsReturningBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4NewVsReturningBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4HourlyBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4HourlyBreakdown(config.property_id, range, previousRange)
            ),
            withCache(
              { clientId, source: "ga4", query: "fetchGA4DayOfWeekBreakdown", params: { propertyId: config.property_id, from: range.from, to: range.to } },
              () => fetchGA4DayOfWeekBreakdown(config.property_id, range, previousRange)
            ),
          ]).then(([device, operatingSystem, channel, country, landingPage, newVsReturning, hourly, dayOfWeek]) => ({
            device,
            operatingSystem,
            channel,
            country,
            landingPage,
            newVsReturning,
            hourly,
            dayOfWeek,
          }))
        : null,
      Promise.all(
        goalNames.map(async (name) => [
          name,
          await withCache(
            { clientId, source: "ga4", query: "fetchGoalReport", params: { propertyId: config.property_id, goal: name, from: range.from, to: range.to, granularity: "day" } },
            () => fetchGoalReport(config.property_id, name, range, previousRange, "day")
          ),
        ] as const)
      ),
      goalNames.length > 0
        ? withCache(
            { clientId, source: "ga4", query: "fetchGA4GoalBreakdowns", params: { propertyId: config.property_id, from: range.from, to: range.to, goals: goalNames } },
            () => fetchGA4GoalBreakdowns(config.property_id, range, previousRange, goalNames)
          )
        : Promise.resolve({} as Record<string, GA4GoalBreakdowns>),
    ]);

    const goalTotalsByName = new Map(goalTotals);

    const basicResults = await Promise.all(
      basicKeys.map(async (key) => {
        const def = BASIC_METRIC_DEFS.find((item) => item.key === key)!;
        const cached = await getOrGenerateInsight({
          supabase,
          clientId,
          dashboard,
          metricKey: key,
          rangeFrom: from,
          rangeTo: to,
          model: LLM_INSIGHT_MODEL,
          forceRegenerate,
          generate: () =>
            generateGA4Insight({
              metricLabel: def.label,
              format: def.format,
              current: basicMetrics!.current[key],
              previous: basicMetrics!.previous[key],
              breakdowns: {
                device: projectBasicBreakdown(basicBreakdowns!.device, key),
                operatingSystem: projectBasicBreakdown(basicBreakdowns!.operatingSystem, key),
                channel: projectBasicBreakdown(basicBreakdowns!.channel, key),
                country: projectBasicBreakdown(basicBreakdowns!.country, key),
                landingPage: projectBasicBreakdown(basicBreakdowns!.landingPage, key),
                newVsReturning: projectBasicBreakdown(basicBreakdowns!.newVsReturning, key),
                hourly: projectBasicBreakdown(basicBreakdowns!.hourly, key),
                dayOfWeek: projectBasicBreakdown(basicBreakdowns!.dayOfWeek, key),
              },
            }),
        });
        return [key, cached] as const;
      })
    );

    const goalResults = await Promise.all(
      goalNames.map(async (name) => {
        const total = goalTotalsByName.get(name)!;
        const breakdowns = goalBreakdowns[name];
        const cached = await getOrGenerateInsight({
          supabase,
          clientId,
          dashboard,
          metricKey: name,
          rangeFrom: from,
          rangeTo: to,
          model: LLM_INSIGHT_MODEL,
          forceRegenerate,
          generate: () =>
            generateGA4Insight({
              metricLabel: name,
              format: "number",
              current: total.total,
              previous: total.previousTotal,
              breakdowns: {
                device: goalBreakdownToInsightRows(breakdowns?.device ?? []),
                operatingSystem: goalBreakdownToInsightRows(breakdowns?.operatingSystem ?? []),
                channel: goalBreakdownToInsightRows(breakdowns?.channel ?? []),
                country: goalBreakdownToInsightRows(breakdowns?.country ?? []),
                landingPage: goalBreakdownToInsightRows(breakdowns?.landingPage ?? []),
                newVsReturning: goalBreakdownToInsightRows(breakdowns?.newVsReturning ?? []),
                hourly: goalBreakdownToInsightRows(breakdowns?.hourly ?? []),
                dayOfWeek: goalBreakdownToInsightRows(breakdowns?.dayOfWeek ?? []),
              },
            }),
        });
        return [name, cached] as const;
      })
    );

    const payload: Record<string, CachedInsight> = Object.fromEntries([...basicResults, ...goalResults]);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insights de Analítica", error);
    return NextResponse.json({ error: "No se pudieron generar los insights." }, { status: 502 });
  }
}
