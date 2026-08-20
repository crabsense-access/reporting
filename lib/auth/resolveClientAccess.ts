import { cache } from "react";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import type { Client } from "@/lib/types";

interface ClientAccessResult {
  client: Client;
  isAdminViewing: boolean;
}

// Memoizado con `cache()` de React: si el layout y el page de una misma
// request llaman a esto con el mismo slug, solo pega contra Supabase una vez.
export const resolveClientAccess = cache(
  async (clientSlug: string): Promise<ClientAccessResult> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      redirect("/");
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, slug, created_at")
      .eq("slug", clientSlug)
      .maybeSingle();

    if (!client) {
      notFound();
    }

    if (await isAdminEmail(supabase, user.email)) {
      return { client, isAdminViewing: true };
    }

    if (await isClientUserOfClient(supabase, user.email, client.id)) {
      return { client, isAdminViewing: false };
    }

    // No revelamos si el cliente existe o no: misma pantalla genérica que
    // usa el resto de la app para "no tenés acceso".
    redirect("/unauthorized");
  }
);
