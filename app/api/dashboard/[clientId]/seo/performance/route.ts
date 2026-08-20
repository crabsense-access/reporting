import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchSeoPerformance, type SeoPerformanceResult } from "@/lib/gsc/reports";
import { resolveHomePageRegex, resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import { getPreviousPeriod, type DateRangeValue, type Granularity } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoPerformanceResponse {
  connected: boolean;
  result: SeoPerformanceResult | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

// GET /api/dashboard/[clientId]/seo/performance?from=...&to=...&granularity=day|week|month&segment=all|institucional|blog-portada|blog-notas
// "Rendimiento en Búsqueda" (SEO > Visión General, Prompt 67) — ver
// fetchSeoPerformance en lib/gsc/reports.ts. Dimensions ["date","page"],
// distinto del cruce página×keyword de "overview" — por eso el `query` del
// cache descriptor es "fetchSeoPerformance", una key propia.
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
    const payload: SeoPerformanceResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);
  const homePageRegex = resolveHomePageRegex(config);
  const range: DateRangeValue = { from, to };
  const previousRange = getPreviousPeriod(range);

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchSeoPerformance",
        params: {
          segmentLabel: segment.label,
          siteUrl: segment.siteUrl,
          dimensionFilterGroups: segment.dimensionFilterGroups,
          dimensions: ["date", "page"],
          from: range.from,
          to: range.to,
          granularity,
          // El desglose por tipo de contenido (Prompt 68-69) depende de
          // estas regex — si cambian, no debe reusarse una respuesta
          // cacheada vieja.
          blog: config.blog,
          homePageRegex,
        },
      },
      () => fetchSeoPerformance(segment, range, previousRange, granularity, config.blog, homePageRegex)
    );
    const payload: SeoPerformanceResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando el rendimiento en búsqueda de SEO", error);
    return NextResponse.json({ error: "No se pudo calcular el rendimiento en búsqueda." }, { status: 502 });
  }
}
