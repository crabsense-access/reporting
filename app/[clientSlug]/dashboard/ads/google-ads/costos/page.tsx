import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";
import { GoogleAdsDashboard } from "@/components/dashboard/GoogleAdsDashboard";
import { COST_METRIC_DEFS } from "@/lib/google-ads/metric-defs";

export default async function GoogleAdsCostosPage({
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
      dashboard="google_ads_costs"
      metricDefs={COST_METRIC_DEFS}
      showBreakdowns
      breadcrumbSubtitle="Costos de Google Ads"
    />
  );
}
