import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { MetaAdsConversionesDashboard } from "@/components/dashboard/MetaAdsConversionesDashboard";

export default async function MetaAdsConversionesPage({
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

  return <MetaAdsConversionesDashboard clientId={client.id} breadcrumbSubtitle="Conversiones de Meta Ads" />;
}
