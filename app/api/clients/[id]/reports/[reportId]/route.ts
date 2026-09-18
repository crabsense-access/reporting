import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Trae un reporte puntual como JSON — el endpoint de generación (POST .../reports/generate)
// solo manda el reportId por el stream NDJSON, no el contenido. Usado por Configuración v2 para
// mostrar el resultado inline sin redirigir a la vista de informe existente.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; reportId: string }> }
) {
  const { id: clientId, reportId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: admin } = user?.email
    ? await supabase.from("admins").select("id").eq("email", user.email).maybeSingle()
    : { data: null };

  if (!admin) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: report } = await supabase
    .from("reports")
    .select("id, client_id, status, structured_content, error_message, date_range_start, date_range_end, created_at")
    .eq("id", reportId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Informe no encontrado." }, { status: 404 });
  }

  return NextResponse.json({ report });
}
