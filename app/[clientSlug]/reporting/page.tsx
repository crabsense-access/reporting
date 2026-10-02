import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { InvestmentCalendar } from "@/components/admin/reporting/InvestmentCalendar";

// URL del reporte para los usuarios del cliente (client_users): es a donde
// los manda /auth/callback después del login. Muestra el mismo Calendario de
// inversión que app/admin/(dashboard)/clients/[id]/reporting/calendario, sin
// los links de administración.
export default async function ClientReportPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client, isAdminViewing } = await resolveClientAccess(clientSlug);
  const supabase = await createClient();

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("id")
    .eq("client_id", client.id)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">Reporting</p>
        <h1 className="text-2xl font-semibold text-foreground">Calendario de inversión</h1>
      </div>

      {metaAdsSource ? (
        <InvestmentCalendar clientId={client.id} showRecommendations={isAdminViewing} restrictToClientWindow={!isAdminViewing} />
      ) : (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no hay datos disponibles para este reporte. Tu agencia te va a avisar cuando esté listo.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
