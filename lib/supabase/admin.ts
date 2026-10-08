import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase con la service role key: SALTEA RLS. Sólo para el servidor (server-only) y
// sólo después de haber chequeado los permisos del usuario por otro lado. Hoy lo usa únicamente
// el logo de cliente (lib/reporting/clientLogo.ts) para escribir en Supabase Storage.
export function createAdminClient() {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
