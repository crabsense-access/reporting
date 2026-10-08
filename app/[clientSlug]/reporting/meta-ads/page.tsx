import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { ReportPage } from "@/components/admin/reporting/ReportPage";

// Reporte de Meta Ads (Calendario de inversión) para los usuarios del cliente (client_users). Antes vivía en
// /[clientSlug]/reporting, que ahora es el Resumen general (la portada a la que manda el login). Mismo contenido que la
// vista admin (app/admin/(dashboard)/clients/[id]/reporting/...), sin los links de administración.
export default async function ClientReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientSlug: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { clientSlug } = await params;
  const { month } = await searchParams;
  const { client, isAdminViewing } = await resolveClientAccess(clientSlug);

  return (
    <ReportPage
      clientId={client.id}
      clientName={client.name}
      platform="meta_ads"
      hrefs={{
        summary: `/${clientSlug}/reporting`,
        meta_ads: `/${clientSlug}/reporting/meta-ads`,
        google_ads: `/${clientSlug}/reporting/google-ads`,
      }}
      month={month}
      showRecommendations={isAdminViewing}
      title="Calendario de inversión"
      emptyState={
        <p className="text-sm text-muted-foreground">
          Todavía no hay datos disponibles para este reporte. Tu agencia te va a avisar cuando esté listo.
        </p>
      }
    />
  );
}
