import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InvestmentCalendar } from "@/components/admin/reporting/InvestmentCalendar";

export default async function ClientInvestmentCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  // Mismo chequeo que app/admin/(dashboard)/clients/[id]/reporting/page.tsx: el Calendario ya no
  // usa datos de prueba (ver components/admin/reporting/InvestmentCalendar.tsx), así que sin Meta
  // Ads configurado no hay nada real para mostrar.
  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("id")
    .eq("client_id", id)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/clients/${client.id}/reporting`} aria-label="Volver a reporting">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">Reporting</p>
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
        </div>
      </div>

      {metaAdsSource ? (
        <InvestmentCalendar clientId={client.id} />
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
