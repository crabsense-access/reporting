import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { getClientLogoUrl } from "@/lib/reporting/clientLogo";
import { ReportBody } from "@/components/admin/reporting/ReportBody";
import { ReportWithSidebar, type ReportPlatform } from "@/components/admin/reporting/ReportSidebar";

// Armado común de las páginas de reporte (Server Component): una página por hoja (Resumen general /
// Meta Ads / Google Ads), con el mismo encabezado (logo + título) y el menú lateral, que linkea
// entre ellas. Rutas: admin (/admin/clients/[id]/reporting/{resumen,calendario,google-ads}) y vista
// del cliente (/[clientSlug]/reporting = Resumen general, /meta-ads, /google-ads).

export async function ReportPage({
  clientId,
  clientName,
  platform,
  hrefs,
  month,
  showRecommendations,
  title,
  backButton,
  emptyState,
}: {
  clientId: string;
  clientName: string;
  platform: ReportPlatform;
  hrefs: Record<ReportPlatform, string>;
  month?: string;
  showRecommendations: boolean;
  /** Título grande del encabezado (nombre del cliente en el admin, "Calendario de inversión" en la vista del cliente). */
  title: string;
  backButton?: ReactNode;
  /** Qué mostrar si el cliente no tiene NINGUNA plataforma configurada. */
  emptyState: ReactNode;
}) {
  const supabase = await createClient();
  const { data: sources } = await supabase
    .from("data_sources")
    .select("source_type")
    .eq("client_id", clientId)
    .in("source_type", ["meta_ads", "google_ads"]);
  const platforms = (["meta_ads", "google_ads"] as const).filter((p) => sources?.some((s) => s.source_type === p));

  // Si la plataforma pedida no está configurada (pero hay alguna), se va al Resumen general.
  if (platform !== "summary" && !platforms.includes(platform) && platforms.length > 0) {
    redirect(month ? `${hrefs.summary}?month=${month}` : hrefs.summary);
  }

  const logoUrl = await getClientLogoUrl(clientId);
  const header = (
    <div className="flex items-center gap-4">
      {backButton}
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={`Logo de ${clientName}`} className="h-14 max-w-[180px] object-contain" />
      )}
      <div>
        <p className="text-sm text-muted-foreground">Reporting</p>
        <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
      </div>
    </div>
  );

  if (platforms.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">{emptyState}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ReportWithSidebar platforms={platforms} current={platform} hrefs={hrefs} header={header}>
      <ReportBody
        clientId={clientId}
        platform={platform}
        initialMonth={month}
        showRecommendations={showRecommendations}
        platforms={platforms}
        hrefs={hrefs}
      />
    </ReportWithSidebar>
  );
}
