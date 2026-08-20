import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, DataSourceType } from "@/lib/types";

export type DashboardType = "analitica" | "seo" | "ads" | "ia";

// Orden de preferencia para elegir "el primer tipo disponible" (login,
// botón "Ver tablero", redirects de tabs no disponibles).
export const DASHBOARD_TYPE_PREFERENCE: DashboardType[] = ["analitica", "seo", "ads"];

// Lógica pura: a partir de los source_type que tiene un cliente, qué tipos
// de tablero están disponibles. Separada de la consulta a Supabase para que
// el listado de admin (que ya trae todos los data_sources de una sola vez)
// la pueda reusar sin hacer una query por cliente.
export function mapSourceTypesToDashboardTypes(
  sourceTypes: Iterable<DataSourceType>
): DashboardType[] {
  const set = new Set(sourceTypes);
  const available: DashboardType[] = [];

  if (set.has("ga4")) available.push("analitica");
  if (set.has("search_console")) available.push("seo");
  if (set.has("google_ads") || set.has("meta_ads")) available.push("ads");
  // TODO: sumar "ia" cuando definamos cómo se configura esa fuente de datos
  // (todavía no existe un source_type ni una pantalla de alta para IA).

  return available;
}

export function getFirstAvailableDashboardType(available: DashboardType[]): DashboardType | null {
  for (const type of DASHBOARD_TYPE_PREFERENCE) {
    if (available.includes(type)) return type;
  }
  return null;
}

export async function getAvailableDashboardTypes(
  supabase: SupabaseClient<Database>,
  clientId: string
): Promise<DashboardType[]> {
  const { data } = await supabase
    .from("data_sources")
    .select("source_type")
    .eq("client_id", clientId);

  return mapSourceTypesToDashboardTypes((data ?? []).map((row) => row.source_type));
}
