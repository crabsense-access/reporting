import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchPositionRangeDistribution, type SeoPositionRangeResult } from "@/lib/gsc/reports";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoPositionDistributionResponse {
  connected: boolean;
  brandRegex: string | null;
  result: SeoPositionRangeResult | null;
}

// GET /api/dashboard/[clientId]/seo/position-distribution?from=...&to=...
// "Distribución por Rango de Posición" (SEO > Visión General v2) — ver
// fetchPositionRangeDistribution en lib/gsc/reports.ts. Sobre todo el sitio,
// foto del período seleccionado (sin comparación ni serie temporal).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");

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
    const payload: SeoPositionDistributionResponse = { connected: false, brandRegex: null, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const range: DateRangeValue = { from, to };

  try {
    const result = await withCache(
      { clientId, source: "search_console", query: "fetchPositionRangeDistribution", params: { siteUrl: config.site_url, from: range.from, to: range.to } },
      () => fetchPositionRangeDistribution(config.site_url, range)
    );
    const payload: SeoPositionDistributionResponse = { connected: true, brandRegex: config.brand_regex ?? null, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando la distribución por rango de posición", error);
    return NextResponse.json({ error: "No se pudo calcular la distribución por rango de posición." }, { status: 502 });
  }
}
