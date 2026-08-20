import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchTopPages, type SeoTopPagesResult } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoTopPagesResponse {
  connected: boolean;
  result: SeoTopPagesResult | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

// GET /api/dashboard/[clientId]/seo/pages/top?from=...&to=...&segment=all|institucional|blog-portada|blog-notas
// "Top Páginas" (SEO > Páginas > Resumen) — ver fetchTopPages en
// lib/gsc/reports.ts. Respeta el segmento elegido en el selector
// transversal de la hoja.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
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
    const payload: SeoTopPagesResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);
  const range: DateRangeValue = { from, to };

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchTopPages",
        params: {
          segmentLabel: segment.label,
          siteUrl: segment.siteUrl,
          dimensionFilterGroups: segment.dimensionFilterGroups,
          from: range.from,
          to: range.to,
        },
      },
      () => fetchTopPages(segment, range, config.brand_regex ?? null)
    );
    const payload: SeoTopPagesResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando Top Páginas", error);
    return NextResponse.json({ error: "No se pudo calcular el top de páginas." }, { status: 502 });
  }
}
