import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";
import { DashboardEmptyState } from "@/components/dashboard/DashboardEmptyState";

// "Analítica" es un grupo puro en el nav (Audiencia/Retención/Conversiones
// son los destinos reales) — esta página solo redirige a su primer sub-item.
export default async function AnaliticaPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client } = await resolveClientAccess(clientSlug);

  const supabase = await createClient();
  const availableTypes = await getAvailableDashboardTypes(supabase, client.id);

  if (availableTypes.includes("analitica")) {
    redirect(`/${clientSlug}/dashboard/analitica/audiencia`);
  }

  const firstAvailable = getFirstAvailableDashboardType(availableTypes);
  if (firstAvailable) {
    redirect(`/${clientSlug}/dashboard/${firstAvailable}`);
  }
  return <DashboardEmptyState />;
}
