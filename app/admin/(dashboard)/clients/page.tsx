import Link from "next/link";
import { Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getFirstAvailableDashboardType,
  mapSourceTypesToDashboardTypes,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/admin/ClientsTable";
import type { DataSourceType, GA4Config, GSCConfig } from "@/lib/types";

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  const { data: dataSources } = await supabase
    .from("data_sources")
    .select("client_id, source_type, config");

  const { data: clientUsers } = await supabase.from("client_users").select("client_id");

  const propertyByClient = new Map<string, string | null>();
  const sourceTypesByClient = new Map<string, Set<DataSourceType>>();
  const hasBlogByClient = new Map<string, boolean>();
  const hasGoogleAdsByClient = new Map<string, boolean>();
  const hasMetaAdsByClient = new Map<string, boolean>();

  (dataSources ?? []).forEach((dataSource) => {
    const types = sourceTypesByClient.get(dataSource.client_id) ?? new Set<DataSourceType>();
    types.add(dataSource.source_type);
    sourceTypesByClient.set(dataSource.client_id, types);

    if (dataSource.source_type === "ga4") {
      const config = dataSource.config as GA4Config;
      propertyByClient.set(dataSource.client_id, config?.property_id ?? null);
    }

    if (dataSource.source_type === "search_console") {
      const config = dataSource.config as GSCConfig;
      hasBlogByClient.set(dataSource.client_id, Boolean(config?.blog));
    }

    if (dataSource.source_type === "google_ads") {
      hasGoogleAdsByClient.set(dataSource.client_id, true);
    }

    if (dataSource.source_type === "meta_ads") {
      hasMetaAdsByClient.set(dataSource.client_id, true);
    }
  });

  const userCounts = new Map<string, number>();
  (clientUsers ?? []).forEach((clientUser) => {
    userCounts.set(clientUser.client_id, (userCounts.get(clientUser.client_id) ?? 0) + 1);
  });

  const rows = (clients ?? []).map((client) => {
    const sourceTypes = sourceTypesByClient.get(client.id) ?? new Set<DataSourceType>();
    const availableTypes = mapSourceTypesToDashboardTypes(sourceTypes);
    const firstAvailable = getFirstAvailableDashboardType(availableTypes) ?? "analitica";

    return {
      ...client,
      propertyId: propertyByClient.get(client.id) ?? null,
      userCount: userCounts.get(client.id) ?? 0,
      hasGA4: sourceTypes.has("ga4"),
      hasSearchConsole: sourceTypes.has("search_console"),
      hasGoogleAds: hasGoogleAdsByClient.get(client.id) ?? false,
      hasMetaAds: hasMetaAdsByClient.get(client.id) ?? false,
      hasBlog: hasBlogByClient.get(client.id) ?? false,
      dashboardHref: `/${client.slug}/dashboard/${firstAvailable}`,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">Clientes dados de alta en la agencia.</p>
        </div>
        <Button asChild>
          <Link href="/admin/clients/new">
            <Plus className="h-4 w-4" /> Nuevo cliente
          </Link>
        </Button>
      </div>

      <ClientsTable clients={rows} />
    </div>
  );
}
