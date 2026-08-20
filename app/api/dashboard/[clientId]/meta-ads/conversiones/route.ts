import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
import type { Granularity } from "@/lib/date-range";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsCampaignBreakdown,
  fetchMetaAdsMetrics,
  fetchMetaAdsTimeSeries,
  type MetaAdsBreakdownRow,
  type MetaAdsConversionEventOption,
  type MetaAdsMetrics,
  type MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

interface MetaAdsConversionesResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  // El evento elegido "trackea valor de compra" si Meta devolvió una fila en
  // action_values para ese action_type en el período actual (Prompt 93,
  // punto 1) — determina qué 4 scorecards arma el front (ROAS/Valor de
  // conversión vs. Tasa de Conversión/Gasto).
  hasValueTracking: boolean;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  // Top 8 por spend (mismo tope que el resto de los desgloses por campaña
  // del proyecto) — el front re-ordena por ROAS o CPA según corresponda y
  // se queda con las primeras 5 para el ranking.
  campaigns: MetaAdsBreakdownRow[];
}

// Ruta dedicada a Meta Ads > Conversiones (Prompt 93) — mismo patrón que
// /meta-ads/costos (selector de evento de conversión independiente, cache
// por (rango, evento, granularidad) con withCache), separada de esa otra
// ruta para no afectarle el TTL/comportamiento. `actions[]`/`action_values[]`
// del período ya vienen en la misma fila que trae fetchMetaAdsMetrics — no
// hace falta pedirlos de nuevo para conversions/conversionValue/cpa/roas ni
// para el desglose por tipo de evento (availableConversionEvents), que ya
// sale de esa misma consulta.
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
    const payload: MetaAdsConversionesResponse = {
      connected: false,
      metrics: null,
      availableConversionEvents: [],
      selectedConversionEvent: conversionEvent,
      hasValueTracking: false,
      timeSeries: null,
      campaigns: [],
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
    const [{ metrics, availableConversionEvents }, timeSeries, campaigns] = await Promise.all([
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
        {
          clientId,
          source: "meta_ads",
          query: "fetchMetaAdsCampaignBreakdown",
          params: { conversionEvent, from: range.from, to: range.to },
        },
        () => fetchMetaAdsCampaignBreakdown(config.ad_account_id, range, previousRange, conversionEvent)
      ),
    ]);

    // "Trackea valor de compra" = hay al menos $1 de valor de conversión
    // atribuido al evento elegido en el período actual — proxy directo de
    // "Meta tiene una fila de action_values para este action_type acá", sin
    // necesidad de tocar fetchMetaAdsMetrics para exponer las filas crudas.
    const hasValueTracking = metrics.conversionValue > 0;

    const payload: MetaAdsConversionesResponse = {
      connected: true,
      metrics,
      availableConversionEvents,
      selectedConversionEvent: conversionEvent,
      hasValueTracking,
      timeSeries,
      campaigns,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Conversiones de Meta Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Conversiones de Meta Ads." },
      { status: 502 }
    );
  }
}
