import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import type { DataSourceType } from "@/lib/types";

// "ADS" es un grupo puro en el nav. Si el cliente tiene UNA sola plataforma
// conectada, su contenido real ya vive en ads/google-ads/vision-general o
// ads/meta-ads/vision-general (ver esos page.tsx) y redirigimos ahí. Si
// tiene las dos, todavía no hay un tablero combinado — eso se define en un
// prompt aparte — así que mostramos acá un placeholder que refleja qué se
// conectó, sin asumir que "Ads" es sinónimo de una sola plataforma.
export default async function AdsPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client } = await resolveClientAccess(clientSlug);

  const supabase = await createClient();
  const availableTypes = await getAvailableDashboardTypes(supabase, client.id);

  if (!availableTypes.includes("ads")) {
    const firstAvailable = getFirstAvailableDashboardType(availableTypes);
    if (firstAvailable) {
      redirect(`/${clientSlug}/dashboard/${firstAvailable}`);
    }
    return <DashboardEmptyState />;
  }

  const { data: adDataSources } = await supabase
    .from("data_sources")
    .select("source_type")
    .eq("client_id", client.id)
    .in("source_type", ["google_ads", "meta_ads"] satisfies DataSourceType[]);

  const connectedTypes = new Set((adDataSources ?? []).map((row) => row.source_type));
  const hasGoogleAds = connectedTypes.has("google_ads");
  const hasMetaAds = connectedTypes.has("meta_ads");

  if (hasGoogleAds && !hasMetaAds) {
    redirect(`/${clientSlug}/dashboard/ads/google-ads/vision-general`);
  }

  if (hasMetaAds && !hasGoogleAds) {
    redirect(`/${clientSlug}/dashboard/ads/meta-ads/vision-general`);
  }

  const connectedLabel =
    hasGoogleAds && hasMetaAds
      ? "Google Ads y Meta Ads conectados"
      : hasMetaAds
        ? "Meta Ads conectado"
        : "Google Ads conectado";

  return (
    <ComingSoon
      label="Ads"
      description={`${connectedLabel} — el tablero se va a habilitar próximamente.`}
    />
  );
}
