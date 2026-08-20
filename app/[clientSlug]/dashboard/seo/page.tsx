import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";

// "SEO" es un grupo puro en el nav — su contenido real vive en
// /seo/vision-general (ver ese page.tsx). Esta página solo redirige ahí.
export default async function SeoPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client } = await resolveClientAccess(clientSlug);

  const supabase = await createClient();
  const availableTypes = await getAvailableDashboardTypes(supabase, client.id);

  if (availableTypes.includes("seo")) {
    redirect(`/${clientSlug}/dashboard/seo/vision-general`);
  }

  const firstAvailable = getFirstAvailableDashboardType(availableTypes);
  if (firstAvailable) {
    redirect(`/${clientSlug}/dashboard/${firstAvailable}`);
  }
  return <DashboardEmptyState />;
}
