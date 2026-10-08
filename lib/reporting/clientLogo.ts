
import { createAdminClient } from "@/lib/supabase/admin";

// Logo de cada cliente, guardado en Supabase Storage (bucket público "client-logos") en vez de en
// una columna de la tabla clients — así no hace falta una migración. Cada cliente tiene su carpeta
// `<clientId>/`; al subir uno nuevo se borran los anteriores. El nombre del archivo lleva un
// timestamp para que el navegador no muestre una versión vieja cacheada.

export const CLIENT_LOGO_BUCKET = "client-logos";
export const CLIENT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const CLIENT_LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

async function ensureBucket() {
  const storage = createAdminClient().storage;
  const { data } = await storage.getBucket(CLIENT_LOGO_BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(CLIENT_LOGO_BUCKET, {
      public: true,
      fileSizeLimit: CLIENT_LOGO_MAX_BYTES,
      allowedMimeTypes: Object.keys(CLIENT_LOGO_TYPES),
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

async function listLogoFiles(clientId: string): Promise<string[]> {
  const { data } = await createAdminClient().storage.from(CLIENT_LOGO_BUCKET).list(clientId);
  return (data ?? []).filter((f) => f.name.startsWith("logo-")).map((f) => `${clientId}/${f.name}`);
}

/** URL pública del logo actual del cliente, o null si no tiene. */
export async function getClientLogoUrl(clientId: string): Promise<string | null> {
  try {
    const files = await listLogoFiles(clientId);
    if (files.length === 0) return null;
    const latest = files.sort().at(-1)!;
    return createAdminClient().storage.from(CLIENT_LOGO_BUCKET).getPublicUrl(latest).data.publicUrl;
  } catch {
    // Bucket todavía no creado (ningún logo subido aún) u otro error de Storage: sin logo.
    return null;
  }
}

/** Sube (o reemplaza) el logo del cliente. Devuelve la URL pública nueva. */
export async function uploadClientLogo(clientId: string, file: File): Promise<string> {
  const ext = CLIENT_LOGO_TYPES[file.type];
  if (!ext) throw new Error("Formato no soportado. Usá PNG, JPG, WEBP o SVG.");
  if (file.size > CLIENT_LOGO_MAX_BYTES) throw new Error("El logo no puede pesar más de 2 MB.");

  await ensureBucket();
  const storage = createAdminClient().storage.from(CLIENT_LOGO_BUCKET);
  const previous = await listLogoFiles(clientId);
  const path = `${clientId}/logo-${Date.now()}.${ext}`;
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  if (previous.length > 0) await storage.remove(previous);
  return storage.getPublicUrl(path).data.publicUrl;
}

/** Borra el logo del cliente (si tenía). */
export async function removeClientLogo(clientId: string): Promise<void> {
  const files = await listLogoFiles(clientId).catch(() => []);
  if (files.length > 0) await createAdminClient().storage.from(CLIENT_LOGO_BUCKET).remove(files);
}
