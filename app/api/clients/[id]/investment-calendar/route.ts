import { NextResponse } from "next/server";
import { endOfMonth, startOfMonth } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { fetchRealInvestmentCalendarDataCached } from "@/lib/reporting/metaInvestmentData";
import { MetaAdsAuthError, MetaAdsUnavailableError } from "@/lib/meta-ads/client";
import type { MetaAdsConfig } from "@/lib/types";

// GET /api/clients/[id]/investment-calendar
//
// Devuelve los datos REALES de Meta Ads del mes en curso para el Calendario de inversión (ver
// components/admin/reporting/InvestmentCalendar.tsx) — gasto y leads por tipo, día a día, más el
// presupuesto mensual cargado a mano. Mismo patrón de auth que
// app/api/clients/[id]/reporting-metrics/route.ts (no pasa por el middleware, así que re-chequea
// admin acá mismo) y mismo cálculo de "hoy" en la zona horaria de la agencia, para que el corte de
// "días con datos" coincida con el día real del admin mirando el tablero.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email || !(await isAdminEmail(supabase, user.email))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
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
  if (!metaAdsConfig.ad_account_id) {
    return NextResponse.json({ error: "Meta Ads no está configurado para este cliente." }, { status: 404 });
  }

  const today = todayInBuenosAires();
  const monthParam = new URL(request.url).searchParams.get("month");
  const monthStart = resolveMonthStart(monthParam, today);
  // Nunca pedimos más allá de hoy: los días futuros todavía no tienen datos en Meta. Para un mes
  // pasado esto no recorta nada (su último día siempre es anterior a hoy); para el mes en curso
  // corta en el día de hoy.
  const lastDataDate = today < endOfMonth(monthStart) ? today : endOfMonth(monthStart);

  try {
    const data = await fetchRealInvestmentCalendarDataCached(metaAdsConfig, clientId, monthStart, lastDataDate);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof MetaAdsAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof MetaAdsUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    // Cualquier otro error (ej. un bug de programación) también se devuelve como JSON en vez de
    // dejar que Next.js lo maneje solo — en dev, un throw sin capturar acá puede llegarle al
    // cliente como una respuesta vacía ("Unexpected end of JSON input" al hacer res.json()), lo
    // cual esconde el mensaje real. Así el front siempre puede mostrar qué pasó.
    console.error("[investment-calendar] Error inesperado:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error inesperado al cargar el Calendario de inversión." },
      { status: 500 }
    );
  }
}

// "Hoy" en America/Argentina/Buenos_Aires — mismo motivo y misma implementación que
// app/api/clients/[id]/reporting-metrics/route.ts (Vercel corre en UTC, así que de noche en
// Argentina el servidor ya piensa que es "mañana").
function todayInBuenosAires(): Date {
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${isoDate}T00:00:00`);
}

// Convierte el parámetro ?month=yyyy-MM (ver el combo de mes en InvestmentCalendar.tsx) en el
// primer día de ese mes. Si falta, tiene un formato inválido, o pide un mes futuro (todavía no
// puede tener datos en Meta), devuelve el mes en curso — así una URL armada a mano con un mes
// raro nunca rompe, sólo cae al comportamiento por defecto.
function resolveMonthStart(raw: string | null, today: Date): Date {
  const match = raw?.match(/^(\d{4})-(\d{2})$/);
  const currentMonthStart = startOfMonth(today);
  if (!match) return currentMonthStart;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return currentMonthStart;

  const candidate = new Date(year, monthIndex, 1);
  if (Number.isNaN(candidate.getTime()) || candidate > currentMonthStart) return currentMonthStart;
  return candidate;
}
