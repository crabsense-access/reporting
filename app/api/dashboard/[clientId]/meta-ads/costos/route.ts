import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
import type { Granularity } from "@/lib/date-range";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsAgeGenderBreakdown,
  fetchMetaAdsCountryBreakdown,
  fetchMetaAdsDayOfWeekBreakdown,
  fetchMetaAdsDeviceBreakdown,
  fetchMetaAdsHourlyBreakdown,
  fetchMetaAdsMetrics,
  fetchMetaAdsPlatformBreakdown,
  fetchMetaAdsRegionBreakdown,
  fetchMetaAdsTimeSeries,
  type MetaAdsAgeGenderBreakdownRow,
  type MetaAdsBreakdownRow,
  type MetaAdsConversionEventOption,
  type MetaAdsMetrics,
  type MetaAdsSimpleStat,
  type MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

// Las 7 dimensiones que usa la sección "Desgloses" de Costos por ahora
// (Prompts 79-81) — plataforma/dispositivo/país/región/edad-género/día de
// la semana/horario. Campaña/conjunto/anuncio quedan para un próximo
// prompt, no se piden todavía (menos llamadas a la API de Meta en cada
// carga).
interface MetaAdsBreakdowns {
  platform: MetaAdsBreakdownRow[];
  device: MetaAdsBreakdownRow[];
  country: MetaAdsBreakdownRow[];
  region: MetaAdsBreakdownRow[];
  ageGender: MetaAdsAgeGenderBreakdownRow[];
  dayOfWeek: MetaAdsSimpleStat[];
  hourly: MetaAdsBreakdownRow[];
}

interface MetaAdsCostosResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  breakdowns: MetaAdsBreakdowns | null;
}

// Ruta dedicada a Meta Ads > Costos (Prompt 78) — separada de
// /api/dashboard/[clientId]/meta-ads (que sigue usando Visión General, sin
// tocar) para poder envolver acá la consulta con la utilidad de cache del
// Prompt 39 sin afectarle el TTL/comportamiento a esa otra hoja. Llama a las
// MISMAS funciones de lib/meta-ads/reports.ts que ya usaba Visión General
// (fetchMetaAdsMetrics/fetchMetaAdsTimeSeries), sin modificarlas.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const conversionEvent = searchParams.get("conversion_event")?.trim() || DEFAULT_CONVERSION_ACTION_TYPE;
  const granularityParam = searchParams.get("granularity");

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
    .eq("source_type", "meta_ads")
    .maybeSingle();

  if (!dataSource) {
    const payload: MetaAdsCostosResponse = {
      connected: false,
      metrics: null,
      availableConversionEvents: [],
      selectedConversionEvent: conversionEvent,
      timeSeries: null,
      breakdowns: null,
    };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as MetaAdsConfig;
  const range = { from, to };
  const previousRange = getPreviousPeriod(range);
  const granularity: Granularity =
    granularityParam === "day" || granularityParam === "week" || granularityParam === "month"
      ? granularityParam
      : getDefaultGranularity(range);

  try {
    const [{ metrics, availableConversionEvents }, timeSeries, breakdowns] = await Promise.all([
      withCache(
        {
          clientId,
          source: "meta_ads",
          query: "fetchMetaAdsMetrics",
          params: { conversionEvent, from: range.from, to: range.to },
        },
        () => fetchMetaAdsMetrics(config.ad_account_id, range, previousRange, conversionEvent)
      ),
      withCache(
        {
          clientId,
          source: "meta_ads",
          query: "fetchMetaAdsTimeSeries",
          params: { conversionEvent, granularity, from: range.from, to: range.to },
        },
        () => fetchMetaAdsTimeSeries(config.ad_account_id, range, previousRange, granularity, conversionEvent)
      ),
      // Plataforma/Dispositivo/País/Región/Edad-Género/Día de la
      // Semana/Horario — Costo y CPA por dimensión (Prompts 79-81) usan
      // estas 7 en paralelo, así que se piden siempre junto con lo demás
      // (no dependen de la granularidad del gráfico compartido, un solo
      // cálculo por rango/evento alcanza).
      withCache(
        {
          clientId,
          source: "meta_ads",
          query: "fetchMetaAdsBreakdowns",
          params: { conversionEvent, from: range.from, to: range.to },
        },
        (): Promise<MetaAdsBreakdowns> =>
          Promise.all([
            fetchMetaAdsPlatformBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsDeviceBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsCountryBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsRegionBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsAgeGenderBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsDayOfWeekBreakdown(config.ad_account_id, range, conversionEvent),
            fetchMetaAdsHourlyBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
          ]).then(([platform, device, country, region, ageGender, dayOfWeek, hourly]) => ({
            platform,
            device,
            country,
            region,
            ageGender,
            dayOfWeek,
            hourly,
          }))
      ),
    ]);
    const payload: MetaAdsCostosResponse = {
      connected: true,
      metrics,
      availableConversionEvents,
      selectedConversionEvent: conversionEvent,
      timeSeries,
      breakdowns,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Costos de Meta Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Costos de Meta Ads." },
      { status: 502 }
    );
  }
}
