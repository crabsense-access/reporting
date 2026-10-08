import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/roles";
import { fetchSheetChartData, SheetChartError } from "@/lib/reporting/googleSheetChart";
import type { MetaAdsConfig } from "@/lib/types";

// GET /api/clients/[id]/sheet-chart
//
// Datos del gráfico opcional "desde Google Sheet" de la config de Meta Ads (sheet_chart en
// MetaAdsConfig). Mismo patrón de auth que investment-calendar/route.ts. Si el cliente no tiene
// un Sheet configurado devuelve { enabled: false } y el informe no muestra el bloque.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await canAccessClient(supabase, user.email, clientId))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  const sheetChart = (metaAdsSource?.config as MetaAdsConfig | undefined)?.sheet_chart;
  if (!sheetChart?.url) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const chart = await fetchSheetChartData(sheetChart.url, sheetChart.title?.trim() || null);
    return NextResponse.json({ enabled: true, chart: { ...chart, subtitle: sheetChart.subtitle?.trim() || null } });
  } catch (error) {
    if (error instanceof SheetChartError) {
      return NextResponse.json({ enabled: true, error: error.message }, { status: 502 });
    }
    console.error("[sheet-chart] Error inesperado:", error);
    return NextResponse.json({ enabled: true, error: "Error inesperado al leer el Google Sheet." }, { status: 500 });
  }
}
