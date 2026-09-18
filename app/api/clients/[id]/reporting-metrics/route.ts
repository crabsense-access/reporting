import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { computeRanges, type ReportingMode } from "@/lib/reporting/dateRanges";
import { fetchAccountInsightsForRanges } from "@/lib/meta-ads/insights";
import { MetaAdsAuthError, MetaAdsUnavailableError } from "@/lib/meta-ads/client";
import type { MetaAdsConfig } from "@/lib/types";

// GET /api/clients/[id]/reporting-metrics?mode=week|month&anchor=YYYY-MM-DD
//
// Devuelve el KPI de ejemplo (spend, impresiones, clics de Meta Ads) para el
// período seleccionado en el filtro del tablero de reporting, más su
// comparativa (semana anterior, o promedio de los 3 meses anteriores) — ver
// lib/reporting/dateRanges.ts para las reglas de cálculo de los rangos.
//
// No pasa por el middleware (que solo protege /admin/*, no /api/*, ver
// middleware.ts), así que re-chequea admin acá mismo — mismo patrón que
// app/api/clients/[id]/reports/[reportId]/route.ts.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isAdminEmail(supabase, user.email))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");
  const anchorParam = searchParams.get("anchor");

  if (mode !== "week" && mode !== "month") {
    return NextResponse.json({ error: 'mode debe ser "week" o "month".' }, { status: 400 });
  }

  const today = todayInBuenosAires();
  const anchor = anchorParam ? new Date(`${anchorParam}T00:00:00`) : today;
  if (Number.isNaN(anchor.getTime())) {
    return NextResponse.json({ error: "anchor inválido (esperado YYYY-MM-DD)." }, { status: 400 });
  }

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "meta_ads")
    .maybeSingle();

  if (!metaAdsSource) {
    return NextResponse.json({ error: "Meta Ads no está configurado para este cliente." }, { status: 404 });
  }

  const metaAdsConfig = metaAdsSource.config as MetaAdsConfig;
  const accountId = metaAdsConfig.ad_account_id;
  const clientToken = metaAdsConfig.system_user_token;
  const ranges = computeRanges(mode as ReportingMode, anchor, today);

  try {
    const { currency, results } = await fetchAccountInsightsForRanges(
      accountId,
      [ranges.current, ...ranges.comparisonRanges],
      clientToken
    );

    const [current, ...comparison] = results;
    if (!current) {
      return NextResponse.json({ error: "Meta no devolvió datos para el rango solicitado." }, { status: 502 });
    }
    const comparisonAvg = {
      spend: average(comparison.map((r) => r.spend)),
      impressions: average(comparison.map((r) => r.impressions)),
      clicks: average(comparison.map((r) => r.clicks)),
    };

    return NextResponse.json({
      mode: ranges.mode,
      periodLabel: ranges.periodLabel,
      isPartial: ranges.isPartial,
      comparisonLabel: ranges.comparisonLabel,
      canGoNext: ranges.canGoNext,
      currency,
      current,
      comparison: {
        ...comparisonAvg,
        ranges: ranges.comparisonRanges.map((r, i) => ({ ...r, ...comparison[i] })),
      },
      deltaPct: {
        spend: pctChange(current.spend, comparisonAvg.spend),
        impressions: pctChange(current.impressions, comparisonAvg.impressions),
        clicks: pctChange(current.clicks, comparisonAvg.clicks),
      },
    });
  } catch (error) {
    if (error instanceof MetaAdsAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof MetaAdsUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}

// "Hoy" se calcula en la zona horaria de la agencia (America/Argentina/Buenos_Aires)
// para que el corte de "período en curso" (ver lib/reporting/dateRanges.ts)
// coincida con el día real del admin mirando el tablero, en vez del día UTC
// del servidor (Vercel corre en UTC: de noche en Argentina, UTC ya piensa
// que es "mañana").
function todayInBuenosAires(): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${isoDate}T00:00:00`);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pctChange(current: number, comparison: number): number | null {
  if (comparison === 0) return current === 0 ? 0 : null;
  return (current - comparison) / comparison;
}
