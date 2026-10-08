import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion } from "@/components/ui/accordion";
import { ClientNameForm } from "@/components/admin/ClientNameForm";
import { ClientLogoForm } from "@/components/admin/ClientLogoForm";
import { getClientLogoUrl } from "@/lib/reporting/clientLogo";
import { GA4ConfigForm } from "@/components/admin/GA4ConfigForm";
import { GoogleAdsConfigForm } from "@/components/admin/GoogleAdsConfigForm";
import { MetaAdsConfigForm } from "@/components/admin/MetaAdsConfigForm";
import { SearchConsoleConfigForm } from "@/components/admin/SearchConsoleConfigForm";
import { ClientUsersManager } from "@/components/admin/ClientUsersManager";
import type { GA4Config, GoogleAdsConfig, GSCConfig, MetaAdsConfig } from "@/lib/types";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, slug, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!client) notFound();

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("id, client_id, source_type, connection_type, config, created_at")
    .eq("client_id", id)
    .eq("source_type", "ga4")
    .maybeSingle();

  const { data: gscDataSource } = await supabase
    .from("data_sources")
    .select("id, client_id, source_type, connection_type, config, created_at")
    .eq("client_id", id)
    .eq("source_type", "search_console")
    .maybeSingle();

  const { data: googleAdsDataSource } = await supabase
    .from("data_sources")
    .select("id, client_id, source_type, connection_type, config, created_at")
    .eq("client_id", id)
    .eq("source_type", "google_ads")
    .maybeSingle();

  const { data: metaAdsDataSource } = await supabase
    .from("data_sources")
    .select("id, client_id, source_type, connection_type, config, created_at")
    .eq("client_id", id)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  const { data: users } = await supabase
    .from("client_users")
    .select("id, client_id, email, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: true });

  const logoUrl = await getClientLogoUrl(id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cliente</p>
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/admin/clients/${client.id}/informes-mensuales`}>
              <CalendarDays className="h-4 w-4" />
              Ver informes mensuales
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6">
            <ClientNameForm clientId={client.id} initialName={client.name} />
            <ClientLogoForm clientId={client.id} initialLogoUrl={logoUrl} />
          </div>
        </CardContent>
      </Card>

      <div id="fuentes-de-datos" className="scroll-mt-6">
        <Accordion defaultOpenId="search-console">
          <SearchConsoleConfigForm
            clientId={client.id}
            dataSourceId={gscDataSource?.id ?? null}
            initialConfig={gscDataSource ? (gscDataSource.config as GSCConfig) : null}
            configured={Boolean(gscDataSource)}
          />

          <GA4ConfigForm
            clientId={client.id}
            dataSourceId={dataSource?.id ?? null}
            initialConfig={dataSource ? (dataSource.config as GA4Config) : null}
            configured={Boolean(dataSource)}
          />

          <MetaAdsConfigForm
            clientId={client.id}
            dataSourceId={metaAdsDataSource?.id ?? null}
            initialConfig={
              metaAdsDataSource
                ? // El token nunca sale del server hacia el cliente: se redacta acá
                  // y el form solo recibe si hay uno guardado (hasStoredToken).
                  (({ system_user_token: _omit, ...rest }: MetaAdsConfig) => rest)(
                    metaAdsDataSource.config as MetaAdsConfig
                  )
                : null
            }
            hasStoredToken={Boolean((metaAdsDataSource?.config as MetaAdsConfig | undefined)?.system_user_token)}
            configured={Boolean(metaAdsDataSource)}
          />

          <GoogleAdsConfigForm
            clientId={client.id}
            dataSourceId={googleAdsDataSource?.id ?? null}
            initialConfig={googleAdsDataSource ? (googleAdsDataSource.config as GoogleAdsConfig) : null}
            configured={Boolean(googleAdsDataSource)}
          />
        </Accordion>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios autorizados</CardTitle>
          <CardDescription>{(users ?? []).length} usuario(s) con acceso a este tablero.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientUsersManager clientId={client.id} clientSlug={client.slug} users={users ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
