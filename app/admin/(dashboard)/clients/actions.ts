"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type { Client, GA4Config, GoogleAdsConfig, GSCConfig, MetaAdsConfig } from "@/lib/types";

interface ActionResult<T = null> {
  data: T;
  error: string | null;
}

interface CreateClientInput {
  name: string;
  ga4: GA4Config;
  searchConsole: GSCConfig | null;
  googleAds: GoogleAdsConfig | null;
  metaAds: MetaAdsConfig | null;
  userEmails: string[];
}

export async function createClientAction(
  input: CreateClientInput
): Promise<ActionResult<Client | null>> {
  const supabase = await createClient();

  const baseSlug = slugify(input.name) || "cliente";
  let slug = baseSlug;
  let attempt = 1;
  for (;;) {
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .insert({ name: input.name, slug })
    .select()
    .single();

  if (clientError || !client) {
    return { data: null, error: clientError?.message ?? "No se pudo crear el cliente" };
  }

  const { error: dataSourceError } = await supabase.from("data_sources").insert({
    client_id: client.id,
    source_type: "ga4",
    connection_type: "service_account",
    config: input.ga4,
  });

  if (dataSourceError) {
    return { data: null, error: dataSourceError.message };
  }

  if (input.searchConsole) {
    const { error: gscError } = await supabase.from("data_sources").insert({
      client_id: client.id,
      source_type: "search_console",
      connection_type: "service_account",
      config: input.searchConsole,
    });

    if (gscError) {
      return { data: null, error: gscError.message };
    }
  }

  if (input.googleAds) {
    const { error: googleAdsError } = await supabase.from("data_sources").insert({
      client_id: client.id,
      source_type: "google_ads",
      connection_type: "oauth_agency",
      config: input.googleAds,
    });

    if (googleAdsError) {
      return { data: null, error: googleAdsError.message };
    }
  }

  if (input.metaAds) {
    const { error: metaAdsError } = await supabase.from("data_sources").insert({
      client_id: client.id,
      source_type: "meta_ads",
      connection_type: "oauth_agency",
      config: input.metaAds,
    });

    if (metaAdsError) {
      return { data: null, error: metaAdsError.message };
    }
  }

  const emails = input.userEmails.filter(Boolean);
  if (emails.length > 0) {
    const { error: usersError } = await supabase
      .from("client_users")
      .insert(emails.map((email) => ({ client_id: client.id, email })));
    if (usersError) {
      return { data: null, error: usersError.message };
    }
  }

  revalidatePath("/admin/clients");
  return { data: client, error: null };
}

export async function updateClientNameAction(
  clientId: string,
  name: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ name }).eq("id", clientId);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  return { data: null, error: error?.message ?? null };
}

export async function updateGA4ConfigAction(
  dataSourceId: string,
  clientId: string,
  config: GA4Config
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("data_sources")
    .update({ config })
    .eq("id", dataSourceId);
  revalidatePath(`/admin/clients/${clientId}`);
  return { data: null, error: error?.message ?? null };
}

export async function addClientUserAction(
  clientId: string,
  email: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("client_users").insert({ client_id: clientId, email });
  revalidatePath(`/admin/clients/${clientId}`);
  return { data: null, error: error?.message ?? null };
}

export async function removeClientUserAction(
  id: string,
  clientId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("client_users").delete().eq("id", id);
  revalidatePath(`/admin/clients/${clientId}`);
  return { data: null, error: error?.message ?? null };
}

// Crea, actualiza o borra el data_source de Search Console de un cliente
// según corresponda: config === null borra el registro (toggle apagado);
// si no, hace upsert según haya o no un dataSourceId existente.
export async function saveSearchConsoleConfigAction(
  clientId: string,
  dataSourceId: string | null,
  config: GSCConfig | null
): Promise<ActionResult> {
  const supabase = await createClient();

  if (!config) {
    if (dataSourceId) {
      const { error } = await supabase.from("data_sources").delete().eq("id", dataSourceId);
      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath("/admin/clients");
      return { data: null, error: error?.message ?? null };
    }
    return { data: null, error: null };
  }

  const { error } = dataSourceId
    ? await supabase.from("data_sources").update({ config }).eq("id", dataSourceId)
    : await supabase.from("data_sources").insert({
        client_id: clientId,
        source_type: "search_console",
        connection_type: "service_account",
        config,
      });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  return { data: null, error: error?.message ?? null };
}

export async function saveGoogleAdsConfigAction(
  clientId: string,
  dataSourceId: string | null,
  config: GoogleAdsConfig | null
): Promise<ActionResult> {
  const supabase = await createClient();

  if (!config) {
    if (dataSourceId) {
      const { error } = await supabase.from("data_sources").delete().eq("id", dataSourceId);
      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath("/admin/clients");
      return { data: null, error: error?.message ?? null };
    }
    return { data: null, error: null };
  }

  const { error } = dataSourceId
    ? await supabase.from("data_sources").update({ config }).eq("id", dataSourceId)
    : await supabase.from("data_sources").insert({
        client_id: clientId,
        source_type: "google_ads",
        connection_type: "oauth_agency",
        config,
      });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  return { data: null, error: error?.message ?? null };
}

export async function saveMetaAdsConfigAction(
  clientId: string,
  dataSourceId: string | null,
  config: MetaAdsConfig | null
): Promise<ActionResult> {
  const supabase = await createClient();

  if (!config) {
    if (dataSourceId) {
      const { error } = await supabase.from("data_sources").delete().eq("id", dataSourceId);
      revalidatePath(`/admin/clients/${clientId}`);
      revalidatePath("/admin/clients");
      return { data: null, error: error?.message ?? null };
    }
    return { data: null, error: null };
  }

  const { error } = dataSourceId
    ? await supabase.from("data_sources").update({ config }).eq("id", dataSourceId)
    : await supabase.from("data_sources").insert({
        client_id: clientId,
        source_type: "meta_ads",
        connection_type: "oauth_agency",
        config,
      });

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/clients");
  return { data: null, error: error?.message ?? null };
}
