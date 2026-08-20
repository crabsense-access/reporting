import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { GoogleAdsDashboard } from "@/components/dashboard/GoogleAdsDashboard";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { OVERVIEW_METRIC_DEFS } from "@/lib/google-ads/metric-defs";

export default async function GoogleAdsVisionGeneralPage({
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

  return (
    <GoogleAdsDashboard
      clientId={client.id}
      dashboard="google_ads_overview"
      metricDefs={OVERVIEW_METRIC_DEFS}
      showBreakdowns={false}
      breadcrumbSubtitle="Métricas de Google Ads"
    />
  );
}
