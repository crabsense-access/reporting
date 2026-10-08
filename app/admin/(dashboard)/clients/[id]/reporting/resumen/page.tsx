import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ReportPage } from "@/components/admin/reporting/ReportPage";

// Resumen general del informe del cliente (vista admin): primera hoja del menú y destino de "Ver
// informes mensuales". Consolida Meta Ads y Google Ads (ver SummaryReport.tsx).
export default async function ClientSummaryReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { id } = await params;
  const { month } = await searchParams;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  return (
    <ReportPage
      clientId={client.id}
      clientName={client.name}
      platform="summary"
      hrefs={{
        summary: `/admin/clients/${client.id}/reporting/resumen`,
        meta_ads: `/admin/clients/${client.id}/reporting/calendario`,
        google_ads: `/admin/clients/${client.id}/reporting/google-ads`,
      }}
      month={month}
      showRecommendations
      title={client.name}
      backButton={
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/clients/${client.id}/informes-mensuales`} aria-label="Volver a informes mensuales">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
      }
      emptyState={
        <>
          <p className="text-sm text-muted-foreground">
            Este cliente todavía no tiene Meta Ads ni Google Ads configurado, así que no hay datos para mostrar acá.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/clients/${client.id}#fuentes-de-datos`}>Configurar fuentes de datos</Link>
          </Button>
        </>
      }
    />
  );
}
