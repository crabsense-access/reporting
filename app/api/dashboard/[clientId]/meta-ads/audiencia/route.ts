import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
import type { Granularity } from "@/lib/date-range";
import {
  DEFAULT_CONVERSION_ACTION_TYPE,
  fetchMetaAdsMetrics,
  fetchMetaAdsTimeSeries,
  type MetaAdsMetrics,
  type MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";
import type { MetaAdsConfig } from "@/lib/types";

interface MetaAdsAudienciaResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
}

// Ruta dedicada a Meta Ads > Audiencia (Prompt 97) — mismo patrón que
// Costos/Conversiones/Anuncios (cache por (rango, granularidad) con
// withCache), pero SIN selector de evento de conversión: esta hoja es
// exclusivamente Alcance/Frecuencia, que no dependen de ningún action_type
// (se pasa el default solo porque fetchMetaAdsMetrics/fetchMetaAdsTimeSeries
// lo piden como parámetro, sin usarlo para nada visible acá). Reach y
// Frecuencia salen de las MISMAS fetchMetaAdsMetrics/fetchMetaAdsTimeSeries
// que ya usa Visión General, sin redefinir ese cálculo (Prompt 97, punto 2).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
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
    const payload: MetaAdsAudienciaResponse = { connected: false, metrics: null, timeSeries: null };
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
    const [{ metrics }, timeSeries] = await Promise.all([
      withCache(
        { clientId, source: "meta_ads", query: "fetchMetaAdsMetrics", params: { from: range.from, to: range.to } },
        () => fetchMetaAdsMetrics(config.ad_account_id, range, previousRange, DEFAULT_CONVERSION_ACTION_TYPE)
      ),
      withCache(
        { clientId, source: "meta_ads", query: "fetchMetaAdsTimeSeries", params: { granularity, from: range.from, to: range.to } },
        () => fetchMetaAdsTimeSeries(config.ad_account_id, range, previousRange, granularity, DEFAULT_CONVERSION_ACTION_TYPE)
      ),
    ]);

    const payload: MetaAdsAudienciaResponse = { connected: true, metrics, timeSeries };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Audiencia de Meta Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Audiencia de Meta Ads." },
      { status: 502 }
    );
  }
}
