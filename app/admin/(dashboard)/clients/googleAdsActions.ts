"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { listAccessibleGoogleAdsAccounts, type GoogleAdsAccountOption } from "@/lib/google-ads/accounts";

/** Lista para el combo de Google Ads del Admin las cuentas a las que tiene acceso access@crabsense.com. */
export async function listGoogleAdsAccountsAction(
  force = false
): Promise<{ data: GoogleAdsAccountOption[]; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await isAdminEmail(supabase, user.email))) {
    return { data: [], error: "No autorizado." };
  }

  try {
    return { data: await listAccessibleGoogleAdsAccounts({ force }), error: null };
  } catch (error) {
    console.error("[google-ads-accounts] Error:", error);
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "errors" in error
          ? JSON.stringify((error as { errors: unknown }).errors).slice(0, 300)
          : "Error desconocido";
    return { data: [], error: `No se pudieron cargar las cuentas de Google Ads: ${message}` };
  }
}
