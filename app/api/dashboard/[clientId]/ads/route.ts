import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { getDefaultGranularity, getPreviousPeriod } from "@/lib/date-range";
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
  fetchGoogleAdsTimeSeries,
  type GoogleAdsBreakdownRow,
  type GoogleAdsMetrics,
  type GoogleAdsTimeSeriesPoint,
} from "@/lib/google-ads/reports";
import type { GoogleAdsConfig } from "@/lib/types";

interface GoogleAdsBreakdowns {
  device: GoogleAdsBreakdownRow[];
  network: GoogleAdsBreakdownRow[];
  hourly: GoogleAdsBreakdownRow[];
  dayOfWeek: GoogleAdsBreakdownRow[];
  campaign: GoogleAdsBreakdownRow[];
  adGroup: GoogleAdsBreakdownRow[];
  ad: GoogleAdsBreakdownRow[];
  keyword: GoogleAdsBreakdownRow[];
}

interface AdsMetricsResponse {
  connected: boolean;
  metrics: GoogleAdsMetrics | null;
  timeSeries: { current: GoogleAdsTimeSeriesPoint[]; previous: GoogleAdsTimeSeriesPoint[] } | null;
  breakdowns: GoogleAdsBreakdowns | null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  // Los 8 desgloses solo los pide la página de Costos (ver
  // GoogleAdsBreakdownCharts) — evita 8 llamadas extra a Google Ads en cada
  // carga de Visión General, que no los muestra.
  const includeBreakdowns = searchParams.get("include_breakdowns") === "1";

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
    .eq("source_type", "google_ads")
    .maybeSingle();

  if (!dataSource) {
    const payload: AdsMetricsResponse = { connected: false, metrics: null, timeSeries: null, breakdowns: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GoogleAdsConfig;
  const range = { from, to };
  const previousRange = getPreviousPeriod(range);
  const granularity = getDefaultGranularity(range);

  try {
    const [metrics, timeSeries, breakdowns] = await Promise.all([
      fetchGoogleAdsMetrics(config.customer_id, range, previousRange),
      fetchGoogleAdsTimeSeries(config.customer_id, range, previousRange, granularity),
      includeBreakdowns
        ? Promise.all([
            fetchGoogleAdsDeviceBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsNetworkBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsHourlyBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsDayOfWeekBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsCampaignBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsAdGroupBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsAdBreakdown(config.customer_id, range, previousRange),
            fetchGoogleAdsKeywordBreakdown(config.customer_id, range, previousRange),
          ]).then(
            ([device, network, hourly, dayOfWeek, campaign, adGroup, ad, keyword]): GoogleAdsBreakdowns => ({
              device,
              network,
              hourly,
              dayOfWeek,
              campaign,
              adGroup,
              ad,
              keyword,
            })
          )
        : Promise.resolve(null),
    ]);
    const payload: AdsMetricsResponse = { connected: true, metrics, timeSeries, breakdowns };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Google Ads", error);
    return NextResponse.json(
      { error: "No se pudo obtener la información de Google Ads." },
      { status: 502 }
    );
  }
}
