import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";

// "Meta Ads" es un grupo puro en el nav — su contenido real vive en
// meta-ads/vision-general (ver ese page.tsx). Esta página solo redirige ahí.
export default async function MetaAdsPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client } = await resolveClientAccess(clientSlug);

  const supabase = await createClient();
  const availableTypes = await getAvailableDashboardTypes(supabase, client.id);

  if (availableTypes.includes("ads")) {
    redirect(`/${clientSlug}/dashboard/ads/meta-ads/vision-general`);
  }

  const firstAvailable = getFirstAvailableDashboardType(availableTypes);
  if (firstAvailable) {
    redirect(`/${clientSlug}/dashboard/${firstAvailable}`);
  }
  return <DashboardEmptyState />;
}
