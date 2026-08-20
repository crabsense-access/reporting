import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { META_ADS_PLACEHOLDER_SECTIONS } from "@/components/dashboard/sidebar/nav-items";
import { slugify } from "@/lib/utils";

// Convive con las rutas estáticas vision-general/ y costos/ del mismo nivel
// (Next.js resuelve esas primero) — este catch-all solo atiende "Conversiones"
// y "Anuncios" (Prompt 74), todavía sin contenido real.
export default async function MetaAdsSeccionPage({
  params,
}: {
  params: Promise<{ clientSlug: string; seccion: string }>;
}) {
  const { clientSlug, seccion } = await params;

  const label = META_ADS_PLACEHOLDER_SECTIONS.find((item) => slugify(item) === seccion);
  if (!label) notFound();

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

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbTitle />
      <ComingSoon label={`Meta Ads · ${label}`} />
    </div>
  );
}
