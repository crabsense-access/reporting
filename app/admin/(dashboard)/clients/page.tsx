import Link from "next/link";
import { Plus, Settings } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ClientsTable } from "@/components/admin/ClientsTable";
import type { DataSourceType, GSCConfig, ReportSummary } from "@/lib/types";

export default async function AdminClientsPage() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, slug, created_at")
    .order("created_at", { ascending: false });

  const { data: dataSources } = await supabase
    .from("data_sources")
    .select("client_id, source_type, config");

  const { data: reports } = await supabase
    .from("reports")
    .select("id, client_id, created_at, prompt_text, date_range_start, date_range_end, status")
    .order("created_at", { ascending: false });

  const reportsByClient = new Map<string, ReportSummary[]>();
  (reports ?? []).forEach((report) => {
    const list = reportsByClient.get(report.client_id) ?? [];
    list.push(report);
    reportsByClient.set(report.client_id, list);
  });

  const sourceTypesByClient = new Map<string, Set<DataSourceType>>();
  const hasBlogByClient = new Map<string, boolean>();
  const hasGoogleAdsByClient = new Map<string, boolean>();
  const hasMetaAdsByClient = new Map<string, boolean>();

  (dataSources ?? []).forEach((dataSource) => {
    const types = sourceTypesByClient.get(dataSource.client_id) ?? new Set<DataSourceType>();
    types.add(dataSource.source_type);
    sourceTypesByClient.set(dataSource.client_id, types);

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

  const rows = (clients ?? []).map((client) => {
    const sourceTypes = sourceTypesByClient.get(client.id) ?? new Set<DataSourceType>();

    return {
      ...client,
      hasGA4: sourceTypes.has("ga4"),
      hasSearchConsole: sourceTypes.has("search_console"),
      hasGoogleAds: hasGoogleAdsByClient.get(client.id) ?? false,
      hasMetaAds: hasMetaAdsByClient.get(client.id) ?? false,
      hasBlog: hasBlogByClient.get(client.id) ?? false,
      reports: reportsByClient.get(client.id) ?? [],
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">Clientes dados de alta en la agencia.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/admin/configuracion-v2">
              <Settings className="h-4 w-4" /> Configuración v2
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/configuracion-v3">
              <Settings className="h-4 w-4" /> Configuración v3
            </Link>
          </Button>
          <Button asChild>
            <Link href="/admin/clients/new">
              <Plus className="h-4 w-4" /> Nuevo cliente
            </Link>
          </Button>
        </div>
      </div>

      <ClientsTable clients={rows} />
    </div>
  );
}
