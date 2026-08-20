import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchPageChurn, type SeoPageChurnResult } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { Granularity } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoPageChurnResponse {
  connected: boolean;
  result: SeoPageChurnResult | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];
const VALID_WINDOW_DAYS = new Set([7, 14, 30, 60, 90]);

// GET /api/dashboard/[clientId]/seo/pages/churn?to=...&windowDays=7|14|30|60|90&granularity=day|week|month&segment=all|institucional|blog-portada|blog-notas
// "Páginas Nuevas" / "Páginas Perdidas" (SEO > Páginas > Resumen) — ver
// fetchPageChurn en lib/gsc/reports.ts. La ventana (propia de esta tarjeta,
// a diferencia de Keywords) ancla en `to` — el "hasta" del selector de
// fecha global de la hoja, no en "hoy". Respeta el segmento elegido.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const to = searchParams.get("to");
  const granularityParam = searchParams.get("granularity");
  const granularity: Granularity =
    granularityParam === "week" || granularityParam === "month" ? granularityParam : "day";
  const segmentParam = searchParams.get("segment");
  const segmentKey: SeoPageSegmentKey = VALID_SEGMENT_KEYS.includes(segmentParam as SeoPageSegmentKey)
    ? (segmentParam as SeoPageSegmentKey)
    : "all";
  const windowDaysParam = Number(searchParams.get("windowDays"));
  const windowDays = VALID_WINDOW_DAYS.has(windowDaysParam) ? windowDaysParam : 30;

  if (!to) {
    return NextResponse.json({ error: "El parámetro to es obligatorio." }, { status: 400 });
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
    const payload: SeoPageChurnResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchPageChurn",
        params: { segmentLabel: segment.label, siteUrl: segment.siteUrl, dimensionFilterGroups: segment.dimensionFilterGroups, to, windowDays, granularity },
      },
      () => fetchPageChurn(segment, to, windowDays, granularity)
    );
    const payload: SeoPageChurnResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando la rotación de páginas", error);
    return NextResponse.json({ error: "No se pudo calcular la rotación de páginas." }, { status: 502 });
  }
}
