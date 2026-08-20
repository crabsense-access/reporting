import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchDecliningPagesWindows, type SeoDecliningPagesMultiWindowResult } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { GSCConfig } from "@/lib/types";

interface SeoDecliningPagesResponse {
  connected: boolean;
  result: SeoDecliningPagesMultiWindowResult | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

// GET /api/dashboard/[clientId]/seo/pages/declining?to=...&segment=all|institucional|blog-portada|blog-notas
// "Páginas en Declive" (SEO > Páginas > Páginas en Declive) — ver
// fetchDecliningPagesWindows en lib/gsc/reports.ts. Devuelve las 5 ventanas
// (7/15/30/60/90 días) juntas en la misma respuesta, calculadas a partir de
// una sola consulta paginada de 180 días — cambiar de botón de ventana en el
// frontend no vuelve a pedir datos al servidor. La ventana ancla en `to` (el
// "hasta" del selector de rango global), no en "hoy" — mismo criterio que
// Páginas Nuevas/Perdidas.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const to = searchParams.get("to");
  const segmentParam = searchParams.get("segment");
  const segmentKey: SeoPageSegmentKey = VALID_SEGMENT_KEYS.includes(segmentParam as SeoPageSegmentKey)
    ? (segmentParam as SeoPageSegmentKey)
    : "all";

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
    const payload: SeoDecliningPagesResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchDecliningPagesWindows",
        params: { segmentLabel: segment.label, siteUrl: segment.siteUrl, dimensionFilterGroups: segment.dimensionFilterGroups, to },
      },
      () => fetchDecliningPagesWindows(segment, to)
    );
    const payload: SeoDecliningPagesResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando páginas en declive", error);
    return NextResponse.json({ error: "No se pudo calcular las páginas en declive." }, { status: 502 });
  }
}
