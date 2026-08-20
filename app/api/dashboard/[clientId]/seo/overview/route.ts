import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchSeoOverview, type SeoOverviewResult } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import { getPreviousPeriod, type DateRangeValue, type Granularity } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoOverviewResponse {
  connected: boolean;
  result: SeoOverviewResult | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

// GET /api/dashboard/[clientId]/seo/overview?from=...&to=...&granularity=day|week|month&segment=all|institucional|blog-portada|blog-notas
// "Visión General" (SEO > Visión General, Prompt 64) — ver fetchSeoOverview
// en lib/gsc/reports.ts. Cruce página×keyword (dimensions ["date","page",
// "query"]), distinto de cualquier otra consulta de la hoja SEO — por eso el
// `query` del cache descriptor es "fetchSeoOverview", una key propia.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const granularityParam = searchParams.get("granularity");
  const granularity: Granularity =
    granularityParam === "week" || granularityParam === "month" ? granularityParam : "day";
  const segmentParam = searchParams.get("segment");
  const segmentKey: SeoPageSegmentKey = VALID_SEGMENT_KEYS.includes(segmentParam as SeoPageSegmentKey)
    ? (segmentParam as SeoPageSegmentKey)
    : "all";

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
    .eq("source_type", "search_console")
    .maybeSingle();

  if (!dataSource) {
    const payload: SeoOverviewResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);
  const range: DateRangeValue = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchSeoOverview",
        params: {
          segmentLabel: segment.label,
          siteUrl: segment.siteUrl,
          dimensionFilterGroups: segment.dimensionFilterGroups,
          dimensions: ["date", "page", "query"],
          from: range.from,
          to: range.to,
          granularity,
        },
      },
      () => fetchSeoOverview(segment, range, previousRange, granularity)
    );
    const payload: SeoOverviewResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando la visión general de SEO", error);
    return NextResponse.json({ error: "No se pudo calcular la visión general de SEO." }, { status: 502 });
  }
}
