import { notFound } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AutoRefreshWhilePending } from "@/components/admin/reports/AutoRefreshWhilePending";
import { ReportInfographic } from "@/components/admin/reports/ReportInfographic";
import { RegenerateReportModal } from "@/components/admin/reports/RegenerateReportModal";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { id, reportId } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase.from("reports").select("*").eq("id", reportId).maybeSingle();
  if (!report || report.client_id !== id) notFound();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  const regenerateModal = (
    <RegenerateReportModal
      clientId={client.id}
      clientName={client.name}
      initialPromptText={report.prompt_text}
      initialRange={{ from: report.date_range_start, to: report.date_range_end }}
    />
  );

  if (report.status === "completed" && report.structured_content) {
    return (
      <ReportInfographic
        content={report.structured_content}
        clientName={client.name}
        createdAt={report.created_at}
        dateRangeStart={report.date_range_start}
        dateRangeEnd={report.date_range_end}
        actions={regenerateModal}
      />
    );
  }

  if (report.status === "failed") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Informe por prompt · {client.name}</p>
            <h1 className="text-2xl font-semibold text-foreground">No se pudo generar el informe</h1>
          </div>
          {regenerateModal}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Error
            </CardTitle>
            <CardDescription>{report.error_message ?? "Error desconocido."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <AutoRefreshWhilePending status={report.status} />
      <div>
        <p className="text-sm text-muted-foreground">Informe por prompt · {client.name}</p>
        <h1 className="text-2xl font-semibold text-foreground">Generando informe…</h1>
      </div>
      <Card>
        <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Claude está consultando las fuentes de datos conectadas y armando el informe. Esta
          página se actualiza sola.
        </CardContent>
      </Card>
    </div>
  );
}
