import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
import type { Granularity } from "@/lib/date-range";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsActiveAdCount,
  fetchMetaAdsAdRanking,
  fetchMetaAdsMetrics,
  fetchMetaAdsTimeSeries,
  type MetaAdsAdRankingRow,
  type MetaAdsConversionEventOption,
  type MetaAdsMetrics,
  type MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

interface MetaAdsAnunciosResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  activeAdsCurrent: number;
  activeAdsPrevious: number;
  ranking: MetaAdsAdRankingRow[];
}

// Ruta dedicada a Meta Ads > Anuncios (Prompt 95) — mismo patrón que
// /meta-ads/costos y /meta-ads/conversiones (selector de evento de
// conversión independiente, cache por (rango, evento, granularidad) con
// withCache). `metrics`/`availableConversionEvents` son la MISMA consulta
// de cuenta completa que ya usan esas otras 2 hojas (CTR/Frecuencia/CPA
// promedio de este tablero salen de ahí — agregado ponderado nativo de
// Meta, no un promedio de promedios por anuncio); `ranking` trae, además
// del total del período por anuncio, la serie diaria embebida por fila
// (spend/conversions/impressions) para el gráfico de evolución del anuncio
// seleccionado, bucketizada Día/Semana/Mes del lado del cliente.
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
    const payload: MetaAdsAnunciosResponse = {
      connected: false,
      metrics: null,
      availableConversionEvents: [],
      selectedConversionEvent: conversionEvent,
      timeSeries: null,
      activeAdsCurrent: 0,
      activeAdsPrevious: 0,
      ranking: [],
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
    const [{ metrics, availableConversionEvents }, timeSeries, activeAdsCurrent, activeAdsPrevious, ranking] = await Promise.all([
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
      withCache(
        { clientId, source: "meta_ads", query: "fetchMetaAdsActiveAdCount", params: { from: range.from, to: range.to } },
        () => fetchMetaAdsActiveAdCount(config.ad_account_id, range)
      ),
      withCache(
        { clientId, source: "meta_ads", query: "fetchMetaAdsActiveAdCount", params: { from: previousRange.from, to: previousRange.to } },
        () => fetchMetaAdsActiveAdCount(config.ad_account_id, previousRange)
      ),
      withCache(
        {
          clientId,
          source: "meta_ads",
          query: "fetchMetaAdsAdRanking",
          params: { conversionEvent, from: range.from, to: range.to },
        },
        () => fetchMetaAdsAdRanking(config.ad_account_id, range, conversionEvent)
      ),
    ]);

    const payload: MetaAdsAnunciosResponse = {
      connected: true,
      metrics,
      availableConversionEvents,
      selectedConversionEvent: conversionEvent,
      timeSeries,
      activeAdsCurrent,
      activeAdsPrevious,
      ranking,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Anuncios de Meta Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Anuncios de Meta Ads." },
      { status: 502 }
    );
  }
}
