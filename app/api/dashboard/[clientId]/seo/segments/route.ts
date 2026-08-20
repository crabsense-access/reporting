import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { buildPageSegmentOptions, type SeoPageSegmentOption } from "@/lib/gsc/segments";
import type { GSCConfig } from "@/lib/types";

interface SeoSegmentsResponse {
  connected: boolean;
  segments: SeoPageSegmentOption[];
}

// GET /api/dashboard/[clientId]/seo/segments
// Opciones del selector transversal de segmento de la hoja "Páginas" — ver
// buildPageSegmentOptions en lib/gsc/segments.ts. No depende del rango de
// fechas (solo de si el cliente tiene blog configurado), se pide una vez.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

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
    const payload: SeoSegmentsResponse = { connected: false, segments: [] };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const payload: SeoSegmentsResponse = { connected: true, segments: buildPageSegmentOptions(config) };
  return NextResponse.json(payload);
}
