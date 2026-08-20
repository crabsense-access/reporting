import Link from "next/link";
import { notFound } from "next/navigation";
import { LayoutDashboard } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getFirstAvailableDashboardType,
  mapSourceTypesToDashboardTypes,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientNameForm } from "@/components/admin/ClientNameForm";
import { GA4ConfigForm } from "@/components/admin/GA4ConfigForm";
import { GoogleAdsConfigForm } from "@/components/admin/GoogleAdsConfigForm";
import { MetaAdsConfigForm } from "@/components/admin/MetaAdsConfigForm";
import { SearchConsoleConfigForm } from "@/components/admin/SearchConsoleConfigForm";
import { ClientUsersManager } from "@/components/admin/ClientUsersManager";
import type { DataSourceType, GA4Config, GoogleAdsConfig, GSCConfig, MetaAdsConfig } from "@/lib/types";

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

  const sourceTypes = new Set<DataSourceType>();
  if (dataSource) sourceTypes.add("ga4");
  if (gscDataSource) sourceTypes.add("search_console");
  if (googleAdsDataSource) sourceTypes.add("google_ads");
  if (metaAdsDataSource) sourceTypes.add("meta_ads");
  const availableTypes = mapSourceTypesToDashboardTypes(sourceTypes);
  const dashboardHref = `/${client.slug}/dashboard/${getFirstAvailableDashboardType(availableTypes) ?? "analitica"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Cliente</p>
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
        </div>
        <Button asChild variant="outline">
          <Link href={dashboardHref}>
            <LayoutDashboard className="h-4 w-4" />
            Ver tablero
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientNameForm clientId={client.id} initialName={client.name} />
        </CardContent>
      </Card>

      <div id="fuentes-de-datos" className="flex scroll-mt-6 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Conexión GA4</CardTitle>
            <CardDescription>Property ID y objetivos que se muestran en su tablero.</CardDescription>
          </CardHeader>
          <CardContent>
            {dataSource ? (
              <GA4ConfigForm
                clientId={client.id}
                dataSourceId={dataSource.id}
                initialConfig={dataSource.config as GA4Config}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Este cliente todavía no tiene una fuente GA4 configurada.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conexión Google Ads</CardTitle>
            <CardDescription>
              Customer ID de la cuenta de Ads vinculada a la MCC de la agencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GoogleAdsConfigForm
              clientId={client.id}
              dataSourceId={googleAdsDataSource?.id ?? null}
              initialConfig={googleAdsDataSource ? (googleAdsDataSource.config as GoogleAdsConfig) : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conexión Meta Ads</CardTitle>
            <CardDescription>
              Ad Account ID de la cuenta de Meta compartida con el Business Manager de la agencia.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MetaAdsConfigForm
              clientId={client.id}
              dataSourceId={metaAdsDataSource?.id ?? null}
              initialConfig={metaAdsDataSource ? (metaAdsDataSource.config as MetaAdsConfig) : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conexión Search Console</CardTitle>
            <CardDescription>
              Site URL y, si tiene, la configuración del blog para separar su tráfico.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SearchConsoleConfigForm
              clientId={client.id}
              dataSourceId={gscDataSource?.id ?? null}
              initialConfig={gscDataSource ? (gscDataSource.config as GSCConfig) : null}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios autorizados</CardTitle>
          <CardDescription>{(users ?? []).length} usuario(s) con acceso a este tablero.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientUsersManager clientId={client.id} users={users ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}
