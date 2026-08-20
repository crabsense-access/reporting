import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchKeywordChurn, type SeoKeywordChurnResult } from "@/lib/gsc/reports";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoKeywordChurnResponse {
  connected: boolean;
  brandRegex: string | null;
  result: SeoKeywordChurnResult | null;
}

// GET /api/dashboard/[clientId]/seo/keyword-churn?from=...&to=...&granularity=day|week|month
// "Keywords Nuevas" / "Keywords Perdidas" (SEO > Visión General v2) — ver
// fetchKeywordChurn en lib/gsc/reports.ts. Sobre todo el sitio. La ventana de
// clasificación es directamente [from, to] (el rango global del tablero),
// no una ventana propia.
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
    const payload: SeoKeywordChurnResponse = { connected: false, brandRegex: null, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const range: DateRangeValue = { from, to };

  try {
    const result = await withCache(
      { clientId, source: "search_console", query: "fetchKeywordChurn", params: { siteUrl: config.site_url, from: range.from, to: range.to, granularity } },
      () => fetchKeywordChurn(config.site_url, range, granularity)
    );
    const payload: SeoKeywordChurnResponse = { connected: true, brandRegex: config.brand_regex ?? null, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando keywords nuevas/perdidas", error);
    return NextResponse.json({ error: "No se pudo calcular la rotación de keywords." }, { status: 502 });
  }
}
