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
import { ADS_PLACEHOLDER_ITEMS, AD_CHANNELS } from "@/components/dashboard/sidebar/nav-items";
import { slugify } from "@/lib/utils";

export default async function AdsChannelSeccionPage({
  params,
}: {
  params: Promise<{ clientSlug: string; canal: string; seccion: string }>;
}) {
  const { clientSlug, canal, seccion } = await params;

  const channel = AD_CHANNELS.find((item) => item.slug === canal);
  const itemLabel = ADS_PLACEHOLDER_ITEMS.find((item) => slugify(item) === seccion);
  if (!channel || !itemLabel) notFound();

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
      <ComingSoon label={`${channel.label} · ${itemLabel}`} />
    </div>
  );
}
