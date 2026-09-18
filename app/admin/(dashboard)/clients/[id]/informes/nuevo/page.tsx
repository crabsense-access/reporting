import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { NewReportForm } from "@/components/admin/reports/NewReportForm";
import { toReportPlatform } from "@/lib/reports/platforms";

export default async function NewReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  const { data: dataSources } = await supabase
    .from("data_sources")
    .select("source_type, config")
    .eq("client_id", id);

  const connectedSources = (dataSources ?? []).flatMap((dataSource) => {
    const platform = toReportPlatform(dataSource.source_type);
    return platform ? [{ platform, config: dataSource.config }] : [];
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Informe por prompt · {client.name}</p>
        <h1 className="text-2xl font-semibold text-foreground">Nuevo informe</h1>
      </div>
      <NewReportForm clientId={client.id} clientName={client.name} connectedSources={connectedSources} />
    </div>
  );
}
