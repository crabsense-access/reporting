import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { ReportPage } from "@/components/admin/reporting/ReportPage";

// Reporte de Google Ads para los usuarios del cliente (client_users). Mismo contenido que la
// vista admin (app/admin/(dashboard)/clients/[id]/reporting/...), sin los links de administración.
export default async function ClientGoogleAdsReportPage({
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
      platform="google_ads"
      hrefs={{
        summary: `/${clientSlug}/reporting`,
        meta_ads: `/${clientSlug}/reporting/meta-ads`,
        google_ads: `/${clientSlug}/reporting/google-ads`,
      }}
      month={month}
      showRecommendations={isAdminViewing}
      title="Google Ads"
      emptyState={
        <p className="text-sm text-muted-foreground">
          Todavía no hay datos disponibles para este reporte. Tu agencia te va a avisar cuando esté listo.
        </p>
      }
    />
  );
}
