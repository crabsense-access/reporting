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
