import { NextResponse } from "next/server";
import { endOfMonth, startOfMonth } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/roles";
import { fetchEntityPerformance, type PerformanceDimension } from "@/lib/reporting/metaInvestmentData";
import { isMonthFromStart, resolveStartMonth } from "@/lib/reporting/reportWindow";
import { MetaAdsAuthError, MetaAdsUnavailableError } from "@/lib/meta-ads/client";
import type { MetaAdsConfig } from "@/lib/types";

// Performance por Campaña / Grupo de anuncios / Anuncio del mes (?month=yyyy-MM&dimension=...) —
// tabla "Performance por ..." del bloque Facturación (ver EcommercePerformanceTable.tsx).
const DIMENSIONS: PerformanceDimension[] = ["campaign", "adset", "ad"];

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await canAccessClient(supabase, user.email, clientId))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dimensionParam = url.searchParams.get("dimension") as PerformanceDimension | null;
  const dimension: PerformanceDimension = dimensionParam && DIMENSIONS.includes(dimensionParam) ? dimensionParam : "campaign";

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "meta_ads")
    .maybeSingle();
  const metaAdsConfig = metaAdsSource?.config as MetaAdsConfig | undefined;
  if (!metaAdsConfig?.ad_account_id) {
    return NextResponse.json({ error: "Meta Ads no está configurado para este cliente." }, { status: 404 });
  }

  const today = todayInBuenosAires();
  const currentMonthStart = startOfMonth(today);
  const match = url.searchParams.get("month")?.match(/^(\d{4})-(\d{2})$/);
  let monthStart = currentMonthStart;
  if (match) {
    const candidate = new Date(Number(match[1]), Number(match[2]) - 1, 1);
    if (!Number.isNaN(candidate.getTime()) && candidate <= currentMonthStart) monthStart = candidate;
  }
  const monthKey = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`;
  if (!isMonthFromStart(monthKey, resolveStartMonth(metaAdsConfig))) {
    return NextResponse.json({ error: "Este mes todavía no está disponible." }, { status: 403 });
  }
  const lastDataDate = today < endOfMonth(monthStart) ? today : endOfMonth(monthStart);

  try {
    const entities = await fetchEntityPerformance(metaAdsConfig, clientId, dimension, monthStart, lastDataDate);
    return NextResponse.json({ dimension, entities });
  } catch (error) {
    if (error instanceof MetaAdsAuthError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof MetaAdsUnavailableError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error("[entity-performance] Error inesperado:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado al cargar la performance." },
      { status: 500 }
    );
  }
}

function todayInBuenosAires(): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${isoDate}T00:00:00`);
}
