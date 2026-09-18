import { createClient } from "@/lib/supabase/server";
import { toReportPlatform, type ReportPlatform } from "@/lib/reports/platforms";
import { ConfiguracionV2Form } from "@/components/admin/configuracion-v2/ConfiguracionV2Form";

export interface ClientSource {
  platform: ReportPlatform;
  config: Record<string, unknown>;
}

export default async function ConfiguracionV2Page() {
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, slug")
    .order("name", { ascending: true });

  const { data: dataSources } = await supabase
    .from("data_sources")
    .select("client_id, source_type, config");

  const sourcesByClient = new Map<string, ClientSource[]>();
  (dataSources ?? []).forEach((dataSource) => {
    const platform = toReportPlatform(dataSource.source_type);
    if (!platform) return;
    const list = sourcesByClient.get(dataSource.client_id) ?? [];
    list.push({ platform, config: dataSource.config as Record<string, unknown> });
    sourcesByClient.set(dataSource.client_id, list);
  });

  const clientsWithSources = (clients ?? []).map((client) => ({
    ...client,
    sources: sourcesByClient.get(client.id) ?? [],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Generación de informes</p>
        <h1 className="text-2xl font-semibold text-foreground">Configuración v2</h1>
      </div>
      <ConfiguracionV2Form clients={clientsWithSources} />
    </div>
  );
}
