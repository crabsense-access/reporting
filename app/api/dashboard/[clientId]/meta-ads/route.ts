import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
import type { Granularity } from "@/lib/date-range";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsActiveAdCount,
  fetchMetaAdsAdBreakdown,
  fetchMetaAdsAdSetBreakdown,
  fetchMetaAdsAgeGenderBreakdown,
  fetchMetaAdsCampaignBreakdown,
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
  type MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

interface MetaAdsBreakdowns {
  platform: MetaAdsBreakdownRow[];
  device: MetaAdsBreakdownRow[];
  ageGender: MetaAdsAgeGenderBreakdownRow[];
  hourly: MetaAdsBreakdownRow[];
  campaign: MetaAdsBreakdownRow[];
  adSet: MetaAdsBreakdownRow[];
  ad: MetaAdsBreakdownRow[];
  region: MetaAdsBreakdownRow[];
}

interface MetaAdsMetricsResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  breakdowns: MetaAdsBreakdowns | null;
  /** Cantidad de anuncios con actividad en el período — solo se calcula si se pide con include_ad_count=1 (ver Meta Ads > Visión General, insight dinámico de CTR). */
  activeAdCount: number | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // El usuario elige el evento de conversión desde el propio tablero (no es
  // una config fija por cliente) — si no manda nada, se usa el default.
  const conversionEvent = searchParams.get("conversion_event")?.trim() || DEFAULT_CONVERSION_ACTION_TYPE;
  // Los desgloses (plataforma/dispositivo/edad-género/horario/campaña/
  // conjunto/anuncio/región) solo los pide la página de Costos (ver
  // MetaAdsBreakdownCharts) — evita 8 llamadas extra a Meta en cada carga
  // de la página de Visión General, que no los muestra. El generador de
  // insights (ver app/api/.../meta-ads/insights/route.ts) los pide por su
  // cuenta cuando hace falta, sin depender de este flag.
  const includeBreakdowns = searchParams.get("include_breakdowns") === "1";
  // Opcional: fuerza una granularidad puntual para el time series (ej.
  // "day" para que Meta Ads > Visión General pueda re-bucketizar Semana/Mes
  // del lado del cliente con precisión diaria). Si no se manda, se mantiene
  // el comportamiento de siempre (granularidad automática según el rango).
  const granularityParam = searchParams.get("granularity");
  // Opcional y liviano (una sola llamada, sin límite de filas): cantidad
  // real de anuncios con actividad en el período, para el insight dinámico
  // de CTR en Meta Ads > Visión General — separado de include_breakdowns
  // porque ese trae 8 llamadas (recortadas a 15 filas c/u) que esta hoja no
  // necesita.
  const includeAdCount = searchParams.get("include_ad_count") === "1";

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
    const payload: MetaAdsMetricsResponse = {
      connected: false,
      metrics: null,
      availableConversionEvents: [],
      selectedConversionEvent: conversionEvent,
      timeSeries: null,
      breakdowns: null,
      activeAdCount: null,
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
    const [{ metrics, availableConversionEvents }, timeSeries, breakdowns, activeAdCount] = await Promise.all([
      fetchMetaAdsMetrics(config.ad_account_id, range, previousRange, conversionEvent),
      fetchMetaAdsTimeSeries(config.ad_account_id, range, previousRange, granularity, conversionEvent),
      includeBreakdowns
        ? Promise.all([
            fetchMetaAdsPlatformBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsDeviceBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsAgeGenderBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsHourlyBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsCampaignBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsAdSetBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsAdBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
            fetchMetaAdsRegionBreakdown(config.ad_account_id, range, previousRange, conversionEvent),
          ]).then(
            ([platform, device, ageGender, hourly, campaign, adSet, ad, region]): MetaAdsBreakdowns => ({
              platform,
              device,
              ageGender,
              hourly,
              campaign,
              adSet,
              ad,
              region,
            })
          )
        : Promise.resolve(null),
      includeAdCount ? fetchMetaAdsActiveAdCount(config.ad_account_id, range) : Promise.resolve(null),
    ]);
    const payload: MetaAdsMetricsResponse = {
      connected: true,
      metrics,
      availableConversionEvents,
      selectedConversionEvent: conversionEvent,
      timeSeries,
      breakdowns,
      activeAdCount,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Meta Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Meta Ads." },
      { status: 502 }
    );
  }
}
