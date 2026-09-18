import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ReportingDashboard } from "@/components/admin/reporting/ReportingDashboard";

export default async function ClientReportingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("id")
    .eq("client_id", id)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href={`/admin/clients/${client.id}`} aria-label="Volver al cliente">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <p className="text-sm text-muted-foreground">Reporting</p>
            <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/admin/clients/${client.id}/reporting/calendario`}>
            <CalendarDays className="h-4 w-4" />
            Calendario de inversión
          </Link>
        </Button>
      </div>

      {metaAdsSource ? (
        <ReportingDashboard clientId={client.id} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Este cliente todavía no tiene Meta Ads configurado, así que no hay datos para mostrar acá.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/clients/${client.id}#fuentes-de-datos`}>Configurar Meta Ads</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
