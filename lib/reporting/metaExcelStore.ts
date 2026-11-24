import { createAdminClient } from "@/lib/supabase/admin";
import type { RealInvestmentCalendarData } from "@/lib/reporting/metaInvestmentData";

// Exports de Meta Ads subidos por Excel (ver lib/reporting/metaExcelImport.ts), ya convertidos al
// shape del Calendario de inversión. Se guardan en Supabase Storage (bucket PRIVADO
// "meta-excel-imports") en vez de en una tabla — mismo criterio que el logo del cliente (ver
// clientLogo.ts): no hace falta una migración. Un JSON por cliente y mes: `<clientId>/<yyyy-MM>.json`.
// Subir otro export del mismo mes lo reemplaza. Sólo se lee/escribe desde el servidor, después de
// chequear permisos (el bucket no es público).

export const META_EXCEL_BUCKET = "meta-excel-imports";
/** Límite del archivo .xlsx subido (Vercel corta los requests de más de ~4,5 MB). */
export const META_EXCEL_MAX_BYTES = 4 * 1024 * 1024;

export interface StoredMetaExcelImport {
  month: string;
  fileName: string;
  uploadedAt: string;
  data: RealInvestmentCalendarData;
}

export interface MetaExcelImportSummary {
  month: string;
  fileName: string;
  uploadedAt: string;
  spend: number;
  currency: string;
}

async function ensureBucket() {
  const storage = createAdminClient().storage;
  const { data } = await storage.getBucket(META_EXCEL_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(META_EXCEL_BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

const pathFor = (clientId: string, month: string) => `${clientId}/${month}.json`;

export async function saveMetaExcelImport(clientId: string, entry: StoredMetaExcelImport): Promise<void> {
  await ensureBucket();
  const body = new Blob([JSON.stringify(entry)], { type: "application/json" });
  const { error } = await createAdminClient()
    .storage.from(META_EXCEL_BUCKET)
    .upload(pathFor(clientId, entry.month), body, { contentType: "application/json", upsert: true, cacheControl: "0" });
  if (error) throw error;
}

/** El export cargado para ese mes, o null si no hay (o el bucket todavía no existe). */
export async function getMetaExcelImport(clientId: string, month: string): Promise<StoredMetaExcelImport | null> {
  const { data, error } = await createAdminClient().storage.from(META_EXCEL_BUCKET).download(pathFor(clientId, month));
  if (error || !data) return null;
  return JSON.parse(await data.text()) as StoredMetaExcelImport;
}

async function listMonths(clientId: string): Promise<string[]> {
  const { data } = await createAdminClient().storage.from(META_EXCEL_BUCKET).list(clientId, { limit: 100 });
  return (data ?? [])
    .map((f) => f.name.match(/^(\d{4}-\d{2})\.json$/)?.[1])
    .filter((m): m is string => Boolean(m))
    .sort((a, b) => b.localeCompare(a));
}

/** Último mes (yyyy-MM) con un export cargado, o null. */
export async function latestMetaExcelMonth(clientId: string): Promise<string | null> {
  return (await listMonths(clientId).catch(() => []))[0] ?? null;
}

/** Meses con un export cargado, más reciente primero. */
export async function listMetaExcelImports(clientId: string): Promise<MetaExcelImportSummary[]> {
  const months = await listMonths(clientId);
  const entries = await Promise.all(months.map((m) => getMetaExcelImport(clientId, m)));
  return entries
    .filter((e): e is StoredMetaExcelImport => e !== null)
    .map((e) => ({
      month: e.month,
      fileName: e.fileName,
      uploadedAt: e.uploadedAt,
      spend: e.data.days.reduce((s, d) => s + d.spend, 0),
      currency: e.data.currency,
    }));
}

export async function deleteMetaExcelImport(clientId: string, month: string): Promise<void> {
  const { error } = await createAdminClient().storage.from(META_EXCEL_BUCKET).remove([pathFor(clientId, month)]);
  if (error) throw error;
}
