import { NextResponse } from "next/server";
import { endOfMonth, format, startOfMonth } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { canAccessClient } from "@/lib/auth/roles";
import { withCache, THREE_HOURS_SECONDS } from "@/lib/cache/withCache";
import { isMonthVisibleToClients } from "@/lib/reporting/reportWindow";
import {
  fetchGoogleAdsMonthlySummary,
  withGoogleAdsSummaryDefaults,
  type GoogleAdsMonthlySummary,
} from "@/lib/google-ads/monthlySummary";

/**
 * Se tira DENTRO de la función cacheada cuando el desglose falló: unstable_cache no guarda los
 * errores, así que ese resultado incompleto no queda cacheado (igual que en Meta Ads, donde un
 * error nunca se cachea) y la próxima carga vuelve a intentar. El route lo atrapa y devuelve igual
 * los totales que sí se obtuvieron.
 */
class IncompleteSummaryError extends Error {
  constructor(public summary: GoogleAdsMonthlySummary) {
    super("Desglose de Google Ads incompleto");
    this.name = "IncompleteSummaryError";
  }
}
import type { GoogleAdsConfig } from "@/lib/types";

// GET /api/clients/[id]/google-ads-summary?month=yyyy-MM
//
// Totales del mes en Google Ads para el bloque "Resumen global del período" (ver
// components/admin/reporting/GoogleAdsReport.tsx). Mismo patrón de auth y de "hoy en Buenos Aires"
// que investment-calendar/route.ts; mismo criterio de cache que el reporte de Meta Ads:
//   - Mes en curso: TTL fijo de 3 h.
//   - Mes cerrado: la heurística de withCache por antigüedad de `to` (30 min mientras el mes cerró
//     hace menos de 3 días, 24 h después) — importa en Google Ads porque las conversiones se siguen
//     atribuyendo días después del clic.
//   - Un resultado incompleto (desglose fallido) no se cachea, ver IncompleteSummaryError.
//   - withGoogleAdsSummaryDefaults cubre entradas cacheadas con una forma vieja.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !(await canAccessClient(supabase, user.email, clientId))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: source } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "google_ads")
    .maybeSingle();
  const customerId = (source?.config as GoogleAdsConfig | undefined)?.customer_id;
  if (!customerId) {
    return NextResponse.json({ error: "Google Ads no está configurado para este cliente." }, { status: 404 });
  }

  const today = todayInBuenosAires();
  const match = new URL(request.url).searchParams.get("month")?.match(/^(\d{4})-(\d{2})$/);
  const monthStart = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : startOfMonth(today);
  const monthKey = format(monthStart, "yyyy-MM");
  if (monthStart > today || !isMonthVisibleToClients(monthKey)) {
    return NextResponse.json({ error: "Este mes todavía no está disponible." }, { status: 403 });
  }
  const isCurrentMonth = monthKey === format(today, "yyyy-MM");
  const from = format(monthStart, "yyyy-MM-dd");
  const to = format(isCurrentMonth ? today : endOfMonth(monthStart), "yyyy-MM-dd");

  try {
    let summary: GoogleAdsMonthlySummary;
    try {
      summary = await withCache(
        {
          clientId,
          source: "google_ads",
          query: "monthlySummary:v6",
          params: { customerId, from, to },
          // Mes en curso: 3 h fijas. Mes cerrado: sin ttlSeconds → heurística de withCache por `to`.
          ...(isCurrentMonth ? { ttlSeconds: THREE_HOURS_SECONDS } : {}),
        },
        async () => {
          const fresh = await fetchGoogleAdsMonthlySummary(customerId, from, to);
          if (fresh.breakdownFailed) throw new IncompleteSummaryError(fresh);
          return fresh;
        }
      );
    } catch (error) {
      const incomplete = error as Partial<IncompleteSummaryError> | null;
      if (incomplete?.name !== "IncompleteSummaryError" || !incomplete.summary) throw error;
      summary = incomplete.summary;
    }
    return NextResponse.json({ ...withGoogleAdsSummaryDefaults(summary), from, to, isCurrentMonth });
  } catch (error) {
    console.error("[google-ads-summary] Error:", error);
    // Error típico: la cuenta del cliente no está vinculada a la MCC de la agencia
    // (GOOGLE_ADS_LOGIN_CUSTOMER_ID) — mensaje claro en vez del JSON crudo de Google.
    if (/authorization_error|doesn't have permission to access customer/i.test(JSON.stringify((error as { errors?: unknown })?.errors ?? String(error)))) {
      return NextResponse.json(
        {
          error:
            `No hay acceso a la cuenta de Google Ads ${formatId(customerId)}. Hay que vincularla a la cuenta de administrador (MCC) ` +
            `de la agencia ${formatId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "")} y que el cliente acepte la invitación.`,
        },
        { status: 403 }
      );
    }
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "errors" in error
          ? JSON.stringify((error as { errors: unknown }).errors).slice(0, 300)
          : "No se pudieron cargar los datos de Google Ads.";
    return NextResponse.json({ error: message }, { status: 502 });
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

function formatId(id: string): string {
  const d = id.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
}
