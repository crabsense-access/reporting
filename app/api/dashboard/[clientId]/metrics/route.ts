import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { withCache } from "@/lib/cache/withCache";
import { getPreviousPeriod, type DateRangeValue, type Granularity } from "@/lib/date-range";
import {
  fetchBasicMetrics,
  fetchBasicMetricsTimeSeries,
  fetchGA4ChannelBreakdown,
  fetchGA4CountryBreakdown,
  fetchGA4DayOfWeekBreakdown,
  fetchGA4DeviceBreakdown,
  fetchGA4HourlyBreakdown,
  fetchGA4LandingPageBreakdown,
  fetchGA4NewVsReturningBreakdown,
  fetchGA4OperatingSystemBreakdown,
  fetchGoalReport,
} from "@/lib/ga4/reports";
import type { DashboardMetricsResponse, GoalMetric } from "@/lib/ga4/types";
import type { GA4Config } from "@/lib/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const granularityParam = searchParams.get("granularity");
  const goalParam = searchParams.get("goal");
  const typeParam = searchParams.get("type");
  // Los 8 desgloses (dispositivo/SO/canal/país/página de destino/nuevo-
  // recurrente/hora/día) solo los pide la sección de insights o cuando el
  // usuario expande el desglose de una métrica básica — evita 8 llamadas
  // extra a la Data API en cada carga normal del tablero.
  const includeBreakdowns = searchParams.get("include_breakdowns") === "1";

  const granularity: Granularity =
    granularityParam === "week" || granularityParam === "month" ? granularityParam : "day";

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

  const { data: admin } = await supabase
    .from("admins")
    .select("id")
    .eq("email", user.email)
    .maybeSingle();

  if (!admin) {
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("email", user.email)
      .eq("client_id", clientId)
      .maybeSingle();

    if (!clientUser) {
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
    return NextResponse.json(
      { error: "Este cliente todavía no tiene una propiedad de GA4 configurada." },
      { status: 404 }
    );
  }

  const range: DateRangeValue = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    // Cuando viene `goal` + `type`, se recalcula un único objetivo (lo usa el
    // selector de agregación de cada GoalCard) sin volver a pedir todo lo
    // demás ni recomputar las métricas básicas.
    if (goalParam && (typeParam === "primary" || typeParam === "secondary")) {
      const result = await withCache(
        {
          clientId,
          source: "ga4",
          query: "fetchGoalReport",
          params: { propertyId: config.property_id, goal: goalParam, from: range.from, to: range.to, granularity },
        },
        () => fetchGoalReport(config.property_id, goalParam, range, previousRange, granularity)
      );

      const goal: GoalMetric = { name: goalParam, type: typeParam, ...result };
      const payload: DashboardMetricsResponse = {
        basicMetrics: null,
        basicMetricsPrevious: null,
        goals: [goal],
        timeSeries: null,
        breakdowns: null,
      };
      return NextResponse.json(payload);
    }

    const primaryGoals = config.primary_goals ?? [];
    const secondaryGoals = config.secondary_goals ?? [];

    const [basicMetrics, primaryResults, secondaryResults, timeSeries, breakdowns] = await Promise.all([
      withCache(
        {
          clientId,
          source: "ga4",
          query: "fetchBasicMetrics",
          params: { propertyId: config.property_id, from: range.from, to: range.to },
        },
        () => fetchBasicMetrics(config.property_id, range, previousRange)
      ),
      Promise.all(
        primaryGoals.map(async (name): Promise<GoalMetric> => ({
          name,
          type: "primary",
          ...(await withCache(
            {
              clientId,
              source: "ga4",
              query: "fetchGoalReport",
              params: { propertyId: config.property_id, goal: name, from: range.from, to: range.to, granularity },
            },
            () => fetchGoalReport(config.property_id, name, range, previousRange, granularity)
          )),
        }))
      ),
      Promise.all(
        secondaryGoals.map(async (name): Promise<GoalMetric> => ({
          name,
          type: "secondary",
          ...(await withCache(
            {
              clientId,
              source: "ga4",
              query: "fetchGoalReport",
              params: { propertyId: config.property_id, goal: name, from: range.from, to: range.to, granularity },
            },
            () => fetchGoalReport(config.property_id, name, range, previousRange, granularity)
          )),
        }))
      ),
      withCache(
        {
          clientId,
          source: "ga4",
          query: "fetchBasicMetricsTimeSeries",
          params: { propertyId: config.property_id, from: range.from, to: range.to, granularity },
        },
        () => fetchBasicMetricsTimeSeries(config.property_id, range, previousRange, granularity)
      ),
      includeBreakdowns
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
        : Promise.resolve(null),
    ]);

    const payload: DashboardMetricsResponse = {
      basicMetrics: basicMetrics.current,
      basicMetricsPrevious: basicMetrics.previous,
      goals: [...primaryResults, ...secondaryResults],
      timeSeries,
      breakdowns,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Google Analytics Data API", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Google Analytics." },
      { status: 502 }
    );
  }
}
