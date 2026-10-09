import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

// Helpers de rol compartidos por middleware.ts, auth/callback/route.ts y
// lib/auth/resolveClientAccess.ts, para no repetir las mismas queries en
// cada lugar que necesita resolver "quién es este email".

// Único email con acceso al panel de administración (/admin) y a todos los
// reportes. La base aplica la misma regla en is_admin() (ver
// supabase/migrations/0005_access_control.sql), así que cambiar este valor
// requiere también una migración.
export const ADMIN_EMAIL = "access@crabsense.com";

// Los emails se guardan y se comparan siempre en minúsculas y sin espacios,
// para que "Juan@Cliente.com" y "juan@cliente.com" sean el mismo usuario.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function isAdminEmail(
  _supabase: SupabaseClient<Database>,
  email: string
): Promise<boolean> {
  return normalizeEmail(email) === ADMIN_EMAIL;
}

export async function isClientUserOfClient(
  supabase: SupabaseClient<Database>,
  email: string,
  clientId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("client_users")
    .select("id")
    .eq("email", normalizeEmail(email))
    .eq("client_id", clientId)
    .maybeSingle();
  return Boolean(data);
}

// Admin (cualquier cliente) o client_user de ESE cliente. Lo usan las rutas
// /api/* del reporte, que las llaman tanto el admin como la vista propia del
// cliente (app/[clientSlug]/reporting).
export async function canAccessClient(
  supabase: SupabaseClient<Database>,
  email: string,
  clientId: string
): Promise<boolean> {
  if (await isAdminEmail(supabase, email)) return true;
  return isClientUserOfClient(supabase, email, clientId);
}

// Admin o client_user de algún cliente (para rutas que no reciben clientId
// de forma obligatoria, ej. /api/reporting/chart-insights).
export async function isAdminOrClientUser(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<boolean> {
  if (await isAdminEmail(supabase, email)) return true;
  const { data } = await supabase
    .from("client_users")
    .select("id")
    .eq("email", normalizeEmail(email))
    .limit(1);
  return Boolean(data && data.length > 0);
}

// URL del reporte que ve un client_user (ver app/[clientSlug]/reporting).
export function clientReportPath(slug: string): string {
  return `/${slug}/reporting`;
}

// Clientes (id, nombre y slug) a los que este email tiene acceso como
// client_user. Un mismo email puede estar habilitado en varios clientes.
export async function getClientsForEmail(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<{ id: string; name: string; slug: string }[]> {
  const { data: rows } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("email", normalizeEmail(email));

  const clientIds = [...new Set((rows ?? []).map((row) => row.client_id))];
  if (clientIds.length === 0) return [];

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, slug")
    .in("id", clientIds)
    .order("name", { ascending: true });

  return (clients ?? []).map((client) => ({ id: client.id, name: client.name, slug: client.slug }));
}

// A dónde mandar a un client_user después de loguearse: directo a su reporte
// si tiene un solo cliente, al selector /reportes si tiene varios, o null si
// no tiene ninguno.
export async function clientLandingPath(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<string | null> {
  const clients = await getClientsForEmail(supabase, email);
  if (clients.length === 0) return null;
  if (clients.length === 1) return clientReportPath(clients[0]!.slug);
  return CLIENT_PICKER_PATH;
}

export const CLIENT_PICKER_PATH = "/reportes";
