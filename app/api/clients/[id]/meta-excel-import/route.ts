import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { MetaExcelImportError, parseMetaExcel } from "@/lib/reporting/metaExcelImport";
import {
  META_EXCEL_MAX_BYTES,
  deleteMetaExcelImport,
  listMetaExcelImports,
  saveMetaExcelImport,
} from "@/lib/reporting/metaExcelStore";
import type { MetaAdsConfig } from "@/lib/types";

// /api/clients/[id]/meta-excel-import — Meta Ads desde Excel (ver lib/reporting/metaExcelImport.ts).
//   GET            → meses cargados.
//   POST (archivo) → lee el export, lo guarda como el mes que corresponda (reemplaza si ya había uno)
//                    y deja configurada la fuente Meta Ads del cliente en modo Excel.
//   DELETE ?month= → borra el export de ese mes.
// Sólo admin. Es una ruta y no una Server Action porque el export pesa más de 1 MB.

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isAdminEmail(supabase, user.email))) return null;
  return supabase;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  if (!(await requireAdmin())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  return NextResponse.json({ imports: await listMetaExcelImports(clientId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await requireAdmin();
  if (!supabase) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: "Cliente inexistente." }, { status: 404 });

  const { data: source } = await supabase
    .from("data_sources")
    .select("id, config")
    .eq("client_id", clientId)
    .eq("source_type", "meta_ads")
    .maybeSingle();
  const currentConfig = source?.config as MetaAdsConfig | undefined;
  if (currentConfig?.ad_account_id) {
    return NextResponse.json(
      {
        error:
          "Este cliente ya toma Meta Ads desde la API (tiene un Ad Account ID cargado). Para usar Excel, primero desactivá Meta Ads en la configuración.",
      },
      { status: 409 }
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Elegí un archivo .xlsx." }, { status: 400 });
  if (file.size > META_EXCEL_MAX_BYTES) {
    return NextResponse.json({ error: "El archivo pesa más de 4 MB. Exportá sólo las columnas y desgloses necesarios." }, { status: 400 });
  }

  let parsed;
  try {
    parsed = await parseMetaExcel(await file.arrayBuffer());
  } catch (error) {
    const message = error instanceof MetaExcelImportError ? error.message : "No se pudo procesar el archivo.";
    if (!(error instanceof MetaExcelImportError)) console.error("[meta-excel-import] Error inesperado:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await saveMetaExcelImport(clientId, {
    month: parsed.month,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    data: parsed.data,
  });

  // Fuente Meta Ads en modo Excel = data source sin Ad Account ID. El mes de inicio es el mes más
  // viejo cargado, así el combo de mes del reporte arranca ahí.
  const startMonth =
    currentConfig?.start_month && currentConfig.start_month < parsed.month ? currentConfig.start_month : parsed.month;
  const config: MetaAdsConfig = { ...(currentConfig ?? {}), ad_account_id: "", start_month: startMonth };
  const { error } = source
    ? await supabase.from("data_sources").update({ config }).eq("id", source.id)
    : await supabase
        .from("data_sources")
        .insert({ client_id: clientId, source_type: "meta_ads", connection_type: "oauth_agency", config });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidatePath(`/admin/clients/${clientId}`, "layout");
  revalidatePath("/admin/clients");
  return NextResponse.json({ month: parsed.month, summary: parsed.summary });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  if (!(await requireAdmin())) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const month = new URL(request.url).searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: "Mes inválido." }, { status: 400 });
  await deleteMetaExcelImport(clientId, month);
  revalidatePath(`/admin/clients/${clientId}`, "layout");
  return NextResponse.json({ ok: true });
}
