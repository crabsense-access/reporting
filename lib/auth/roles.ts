import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

// Helpers de rol compartidos por middleware.ts, auth/callback/route.ts y
// lib/auth/resolveClientAccess.ts, para no repetir las mismas queries en
// cada lugar que necesita resolver "quién es este email".

export async function isAdminEmail(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<boolean> {
  const { data } = await supabase.from("admins").select("id").eq("email", email).maybeSingle();
  return Boolean(data);
}

export async function isClientUserOfClient(
  supabase: SupabaseClient<Database>,
  email: string,
  clientId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("client_users")
    .select("id")
    .eq("email", email)
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
  const { data } = await supabase.from("client_users").select("id").eq("email", email).limit(1);
  return Boolean(data && data.length > 0);
}

// URL del reporte que ve un client_user (ver app/[clientSlug]/reporting).
export function clientReportPath(slug: string): string {
  return `/${slug}/reporting`;
}

// Devuelve el cliente (id + slug) al que pertenece este email como
// client_user, o null si no está asociado a ninguno.
export async function getClientForEmail(
  supabase: SupabaseClient<Database>,
  email: string
): Promise<{ id: string; slug: string } | null> {
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id")
    .eq("email", email)
    .maybeSingle();

  if (!clientUser) return null;

  const { data: client } = await supabase
    .from("clients")
    .select("id, slug")
    .eq("id", clientUser.client_id)
    .maybeSingle();

  if (!client) return null;

  return { id: client.id, slug: client.slug };
}
