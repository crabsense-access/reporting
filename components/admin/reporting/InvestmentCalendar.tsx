"use client";

// Calendario de inversión del mes en curso: resumen del mes (inversión vs.
// presupuesto, leads y CPL totales y por tipo de campaña, resumen ejecutivo
// generado con datos ya calculados), los dos gráficos de tendencia diaria
// (InvestmentTrendChart, LeadsByTypeTrendChart), el análisis de campañas
// individuales (CampaignAnalysis: ranking + hallazgo de mejor y peor
// campaña del mes), el análisis de ubicaciones (PlacementAnalysis) y, por
// último, el desglose demográfico por género y edad, filtrable por tipo de
// campaña (AudienceAnalysis — ver esos componentes).
//
// Los leads se distinguen por tipo de campaña — Iniciaron chat, Formulario
// Landing y Formulario Meta —, con su propio desglose de cantidad, % y CPL
// en el resumen del mes (2 gráficos de columnas) y en el análisis de
// campañas (cada tipo se abre en 2 campañas individuales).
//
// DATOS REALES (resumen del mes + las 2 tendencias diarias): se piden acá,
// una sola vez, a /api/clients/[id]/investment-calendar (ver
// lib/reporting/metaInvestmentData.ts para el mapeo de "tipo" a partir de
// los Objetivos configurados en Meta Ads) y se pasan hacia abajo a
// InvestmentTrendChart/LeadsByTypeTrendChart — así no hacen 2 fetches más.
//
// El combo de mes (selectedMonth, junto al título) filtra qué mes se pide: por defecto el mes en
// curso, pero se puede elegir cualquiera de los últimos 12 (incluido el actual) para revisar
// meses anteriores — por ejemplo, para chequear si los Objetivos configurados generaron eventos
// en un mes donde en el actual no se ven. Cada cambio de mes dispara un fetch nuevo a la misma
// ruta con ?month=yyyy-MM (ver resolveMonthStart en esa ruta). El "today" que usan
// InvestmentTrendChart/LeadsByTypeTrendChart para resaltar "el día de hoy" en el eje X sigue
// siendo el día real — no el mes elegido —, así que ese resaltado simplemente no aparece cuando
// se está mirando un mes que no es el actual.
//
// CampaignAnalysis, PlacementAnalysis y AudienceAnalysis TODAVÍA usan datos
// de prueba (ver lib/reporting/mockInvestmentCalendar.ts): sólo reciben los
// totales del mes ya calculados acá (monthLeadsByType/monthSpendByType/
// monthLeads/monthTotal, ya reales), y siguen repartiéndolos con sus
// proporciones mock internas hasta que se conecten en una próxima pasada.

import { useEffect, useMemo, useState } from "react";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { LEAD_TYPE_COLOR, LEAD_TYPES, objectiveColor, type LeadType } from "@/lib/reporting/mockInvestmentCalendar";
import { resolveResultLabel } from "@/lib/reporting/metaResultLabels";
import { AudienceAnalysis } from "@/components/admin/reporting/AudienceAnalysis";
import { VideoRetentionChart } from "@/components/admin/reporting/VideoRetentionChart";
import { RegionAnalysis } from "@/components/admin/reporting/RegionAnalysis";
import { HourlyPerformanceChart } from "@/components/admin/reporting/HourlyPerformanceChart";
import { WeekdayPerformanceChart } from "@/components/admin/reporting/WeekdayPerformanceChart";
import { RecommendationsPanel } from "@/components/admin/reporting/RecommendationsPanel";
import { CampaignAnalysis } from "@/components/admin/reporting/CampaignAnalysis";
import { PlacementAnalysis } from "@/components/admin/reporting/PlacementAnalysis";
import { InvestmentTrendChart } from "@/components/admin/reporting/InvestmentTrendChart";
import { LeadsByTypeTrendChart } from "@/components/admin/reporting/LeadsByTypeTrendChart";

const ZERO_BY_TYPE: Record<LeadType, number> = LEAD_TYPES.reduce(
  (acc, type) => ({ ...acc, [type]: 0 }),
  {} as Record<LeadType, number>
);

export interface DailyRealTotals {
  date: string; // yyyy-MM-dd
  spend: number;
  leadsByType: Record<LeadType, number>;
  spendByType: Record<LeadType, number>;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

interface DetectedActionType {
  actionType: string;
  count: number;
}

interface AudienceSegmentTotals {
  gender: "mujeres" | "hombres";
  ageRange: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

interface RegionSegmentTotals {
  region: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

interface HourlyTotals {
  hour: number;
  spend: number;
  leads: number;
}

interface VideoRetentionByAge {
  ageRange: string;
  videoPlays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

interface InvestmentCalendarResponse {
  currency: string;
  monthlyBudget: number | null;
  typeLabels: Record<LeadType, string>;
  configuredTypeCount: number;
  objectiveLabels: string[];
  /** action_type real de Meta que matcheó cada Objetivo este mes (mismo índice que objectiveLabels),
   *  o null si no matcheó nada — ver lib/reporting/metaResultLabels.ts. */
  objectiveActionTypes: (string | null)[];
  detectedActionTypes: DetectedActionType[];
  days: DailyRealTotals[];
  audienceSegments: AudienceSegmentTotals[];
  regionSegments: RegionSegmentTotals[];
  hourlyTotals: HourlyTotals[];
  videoRetentionByAge: VideoRetentionByAge[];
}

function sumByType(a: Record<LeadType, number>, b: Record<LeadType, number>): Record<LeadType, number> {
  return LEAD_TYPES.reduce((acc, type) => ({ ...acc, [type]: a[type] + b[type] }), {} as Record<LeadType, number>);
}

/** Devuelve el elemento de `items` con mayor `value(item)`, o null si la lista está vacía. */
function pickMax<T>(items: readonly T[], value: (item: T) => number): T | null {
  let best: T | null = null;
  let bestValue = -Infinity;
  for (const item of items) {
    const v = value(item);
    if (v > bestValue) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

/** Devuelve el elemento de `items` con menor `value(item)`, o null si la lista está vacía. */
function pickMin<T>(items: readonly T[], value: (item: T) => number): T | null {
  return pickMax(items, (item) => -value(item));
}

export function InvestmentCalendar({ clientId }: { clientId: string }) {
  const today = useMemo(() => new Date(), []);

  // Últimos 12 meses (incluido el actual), más reciente primero — el combo de mes no deja elegir
  // nada más nuevo que el mes en curso, así que no hace falta validar meses futuros del lado del
  // cliente (la ruta igual se protege sola, ver resolveMonthStart).
  const monthOptions = useMemo(() => {
    const currentMonthStart = startOfMonth(today);
    return Array.from({ length: 12 }, (_, i) => {
      const date = subMonths(currentMonthStart, i);
      const label = format(date, "MMMM yyyy", { locale: es });
      return { value: format(date, "yyyy-MM"), label: label.charAt(0).toUpperCase() + label.slice(1), date };
    });
  }, [today]);

  const [selectedMonth, setSelectedMonth] = useState(() => monthOptions[0]!.value);
  const [data, setData] = useState<InvestmentCalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectedMonthDate = useMemo(
    () => monthOptions.find((opt) => opt.value === selectedMonth)?.date ?? monthOptions[0]!.date,
    [monthOptions, selectedMonth]
  );
  const isCurrentMonth = selectedMonth === monthOptions[0]!.value;
  // Mes anterior (ej. agosto mientras estamos en septiembre) — el único, además del actual, que
  // por ahora se puede elegir (ver el `disabled` del <option> más abajo).
  const previousMonthValue = monthOptions[1]!.value;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/clients/${clientId}/investment-calendar?month=${selectedMonth}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los datos de Meta Ads.");
        return body as InvestmentCalendarResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, selectedMonth]);

  // Totales del mes por Objetivo, TODOS los que estén cargados (no sólo los primeros 3) — ver
  // comentario en lib/reporting/metaInvestmentData.ts. Alimenta el resumen (Leads/CPL totales,
  // que ahora reflejan cualquier Objetivo nuevo que se sume en el Admin) y los gráficos "Leads por
  // tipo"/"CPL por tipo" más abajo. Sólo se muestran los que tuvieron al menos 1 lead este mes.
  const objectiveMonthTotals = useMemo(() => {
    const days = data?.days ?? [];
    const labels = data?.objectiveLabels ?? [];
    const actionTypes = data?.objectiveActionTypes ?? [];
    return labels.map((label, index) => {
      const leads = days.reduce((sum, d) => sum + (d.objectiveLeads[index] ?? 0), 0);
      const spend = days.reduce((sum, d) => sum + (d.objectiveSpend[index] ?? 0), 0);
      // Nombre real del tipo de Resultado como lo muestra Meta Ads Manager, con el label cargado
      // a mano en el Admin como fallback (ver lib/reporting/metaResultLabels.ts).
      const resolvedLabel = resolveResultLabel(actionTypes[index] ?? null, label);
      return { index, label: resolvedLabel, leads, spend, cpl: leads > 0 ? spend / leads : 0 };
    });
  }, [data]);

  const visibleObjectiveTotals = useMemo(
    () => objectiveMonthTotals.filter((o) => o.leads > 0),
    [objectiveMonthTotals]
  );

  const totals = useMemo(() => {
    const days = data?.days ?? [];
    const monthTotal = days.reduce((sum, d) => sum + d.spend, 0);
    const monthLeadsByType = days.reduce((acc, d) => sumByType(acc, d.leadsByType), ZERO_BY_TYPE);
    const monthSpendByType = days.reduce((acc, d) => sumByType(acc, d.spendByType), ZERO_BY_TYPE);
    // Total real de leads del mes: suma TODOS los Objetivos (objectiveMonthTotals), no sólo los
    // primeros 3 (monthLeadsByType es legado, sólo para CampaignAnalysis/AudienceAnalysis más abajo).
    const monthLeads = objectiveMonthTotals.reduce((sum, o) => sum + o.leads, 0);
    return { monthTotal, monthLeads, monthLeadsByType, monthSpendByType };
  }, [data, objectiveMonthTotals]);

  const { monthTotal, monthLeads, monthLeadsByType, monthSpendByType } = totals;
  const currency = data?.currency ?? "USD";
  const monthlyBudget = data?.monthlyBudget ?? null;
  const typeLabels = data?.typeLabels;

  // Resumen ya calculado de TODAS las secciones reales del mes, para el cierre de la página
  // ("Recomendaciones" — ver RecommendationsPanel.tsx). A diferencia del resto de los gráficos,
  // que le pasan a Claude sólo SUS propias métricas, acá se arma un resumen liviano de cada
  // sección (mejor/peor franja, provincia, segmento, etc. — no el detalle completo) para que las
  // recomendaciones puedan cruzar información entre secciones sin que Claude tenga que
  // recalcular nada. CampaignAnalysis/PlacementAnalysis quedan afuera a propósito: todavía usan
  // datos de prueba (ver comentario arriba del archivo), así que mezclarlos acá haría que las
  // recomendaciones citaran campañas o ubicaciones que no son reales.
  const recommendationsMetrics = useMemo(() => {
    if (!data || monthLeads <= 0) return null;

    const porObjetivo = visibleObjectiveTotals.map((o) => ({
      objetivo: o.label,
      contactos: formatNumber(o.leads),
      inversion: formatCurrency(o.spend, currency),
      cpl: o.leads > 0 ? formatCurrency(o.cpl, currency, 2) : "s/d",
    }));

    // Provincias: se suma spend/leads de TODOS los Objetivos por región — acá no interesa el
    // desglose por tipo de conversión, sólo qué provincia rinde mejor/peor en general (mismos
    // datos que RegionAnalysis.tsx, agregados).
    const regionTotals = (data.regionSegments ?? [])
      .map((s) => {
        const leads = s.objectiveLeads.reduce((sum, v) => sum + v, 0);
        const spend = s.objectiveSpend.reduce((sum, v) => sum + v, 0);
        return { region: s.region, leads, spend, cpl: leads > 0 ? spend / leads : null };
      })
      .filter((r) => r.spend > 0 || r.leads > 0);
    const regionsWithCpl = regionTotals.filter((r): r is typeof r & { cpl: number } => r.cpl !== null);
    const mejorProvincia = regionsWithCpl.length > 0 ? [...regionsWithCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const peorProvincia = regionsWithCpl.length > 0 ? [...regionsWithCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;
    const mayorInversionProvincia = regionTotals.length > 0 ? [...regionTotals].sort((a, b) => b.spend - a.spend)[0]! : null;

    // Audiencia: se suma spend/leads de TODOS los Objetivos por segmento género+edad (mismos
    // datos que AudienceAnalysis.tsx, agregados).
    const audienceTotals = (data.audienceSegments ?? [])
      .map((s) => {
        const leads = s.objectiveLeads.reduce((sum, v) => sum + v, 0);
        const spend = s.objectiveSpend.reduce((sum, v) => sum + v, 0);
        return { segmento: `${s.gender === "mujeres" ? "Mujeres" : "Hombres"} ${s.ageRange}`, leads, spend, cpl: leads > 0 ? spend / leads : null };
      })
      .filter((s) => s.spend > 0 || s.leads > 0);
    const audienceWithCpl = audienceTotals.filter((s): s is typeof s & { cpl: number } => s.cpl !== null);
    const mejorSegmento = audienceWithCpl.length > 0 ? [...audienceWithCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const peorSegmento = audienceWithCpl.length > 0 ? [...audienceWithCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;

    // Horario: mismas 3 franjas fijas que HourlyPerformanceChart.tsx.
    const HOUR_BANDS = [
      { label: "09:00 a 20:00", start: 9, end: 20 },
      { label: "21:00 a 23:00", start: 21, end: 23 },
      { label: "00:00 a 08:00", start: 0, end: 8 },
    ];
    const hourBandTotals = HOUR_BANDS.map((band) => {
      const rows = (data.hourlyTotals ?? []).filter((h) => h.hour >= band.start && h.hour <= band.end);
      const spend = rows.reduce((sum, h) => sum + h.spend, 0);
      const leads = rows.reduce((sum, h) => sum + h.leads, 0);
      return { franja: band.label, spend, leads, cpl: leads > 0 ? spend / leads : null };
    });
    const hourBandsWithCpl = hourBandTotals.filter((b): b is typeof b & { cpl: number } => b.cpl !== null);
    const mejorHorario = hourBandsWithCpl.length > 0 ? [...hourBandsWithCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const peorHorario = hourBandsWithCpl.length > 0 ? [...hourBandsWithCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;

    // Día de la semana: mismas 2 franjas fijas que WeekdayPerformanceChart.tsx (misma forma de
    // parsear la fecha, para no correr de día según el huso horario del navegador).
    const weekdayTotals = { habil: { spend: 0, leads: 0 }, finde: { spend: 0, leads: 0 } };
    for (const day of data.days ?? []) {
      const [year, month, dayOfMonth] = day.date.split("-").map(Number);
      if (!year || !month || !dayOfMonth) continue;
      const weekday = new Date(year, month - 1, dayOfMonth).getDay();
      const leads = day.objectiveLeads.reduce((sum, v) => sum + v, 0);
      const bucket = weekday === 0 || weekday === 6 ? weekdayTotals.finde : weekdayTotals.habil;
      bucket.spend += day.spend;
      bucket.leads += leads;
    }
    const habilCpl = weekdayTotals.habil.leads > 0 ? weekdayTotals.habil.spend / weekdayTotals.habil.leads : null;
    const findeCpl = weekdayTotals.finde.leads > 0 ? weekdayTotals.finde.spend / weekdayTotals.finde.leads : null;

    // Retención de video: % que llega al 25% de la duración, por rango etario.
    const videoTotals = (data.videoRetentionByAge ?? [])
      .filter((v) => v.videoPlays > 0)
      .map((v) => ({ edad: v.ageRange, retencion25: v.p25 / v.videoPlays }));
    const mejorRetencion = videoTotals.length > 0 ? [...videoTotals].sort((a, b) => b.retencion25 - a.retencion25)[0]! : null;
    const peorRetencion = videoTotals.length > 0 ? [...videoTotals].sort((a, b) => a.retencion25 - b.retencion25)[0]! : null;

    return {
      resumenGeneral: {
        inversionTotal: formatCurrency(monthTotal, currency),
        contactosTotales: formatNumber(monthLeads),
        cplPromedio: monthLeads > 0 ? formatCurrency(monthTotal / monthLeads, currency, 2) : "s/d",
      },
      porObjetivo,
      provincias:
        mayorInversionProvincia || mejorProvincia || peorProvincia
          ? {
              mayorInversion: mayorInversionProvincia
                ? { provincia: mayorInversionProvincia.region, inversion: formatCurrency(mayorInversionProvincia.spend, currency) }
                : null,
              masEficiente: mejorProvincia ? { provincia: mejorProvincia.region, cpl: formatCurrency(mejorProvincia.cpl, currency, 2) } : null,
              menosEficiente: peorProvincia ? { provincia: peorProvincia.region, cpl: formatCurrency(peorProvincia.cpl, currency, 2) } : null,
            }
          : null,
      audiencia:
        mejorSegmento || peorSegmento
          ? {
              masEficiente: mejorSegmento ? { segmento: mejorSegmento.segmento, cpl: formatCurrency(mejorSegmento.cpl, currency, 2) } : null,
              menosEficiente: peorSegmento ? { segmento: peorSegmento.segmento, cpl: formatCurrency(peorSegmento.cpl, currency, 2) } : null,
            }
          : null,
      horario:
        mejorHorario || peorHorario
          ? {
              mejorFranja: mejorHorario ? { franja: mejorHorario.franja, cpl: formatCurrency(mejorHorario.cpl, currency, 2) } : null,
              peorFranja: peorHorario ? { franja: peorHorario.franja, cpl: formatCurrency(peorHorario.cpl, currency, 2) } : null,
            }
          : null,
      diaDeLaSemana:
        habilCpl !== null || findeCpl !== null
          ? {
              costoLunAVier: habilCpl !== null ? formatCurrency(habilCpl, currency, 2) : "s/d",
              costoSabDom: findeCpl !== null ? formatCurrency(findeCpl, currency, 2) : "s/d",
            }
          : null,
      retencionVideo:
        mejorRetencion || peorRetencion
          ? {
              mejorRetencion: mejorRetencion ? { edad: mejorRetencion.edad, retencionAl25: formatPercent(mejorRetencion.retencion25) } : null,
              peorRetencion: peorRetencion ? { edad: peorRetencion.edad, retencionAl25: formatPercent(peorRetencion.retencion25) } : null,
            }
          : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, monthTotal, monthLeads, currency, visibleObjectiveTotals]);

  const monthCplByType = useMemo(
    () =>
      LEAD_TYPES.reduce((acc, type) => {
        const leads = monthLeadsByType[type];
        acc[type] = leads > 0 ? monthSpendByType[type] / leads : 0;
        return acc;
      }, {} as Record<LeadType, number>),
    [monthLeadsByType, monthSpendByType]
  );

  const executiveSummary = useMemo(() => {
    if (!data) return "";
    const avgCpl = monthLeads > 0 ? monthTotal / monthLeads : 0;
    const typesWithLeads = LEAD_TYPES.filter((type) => monthLeadsByType[type] > 0);
    const topType = pickMax(typesWithLeads, (type) => monthLeadsByType[type]);
    const cheapestType = pickMin(typesWithLeads, (type) => monthCplByType[type]);
    const priciestType = pickMax(typesWithLeads, (type) => monthCplByType[type]);
    const bestSpendDay = pickMax(data.days, (d) => d.spend);
    const bestLeadsDay = pickMax(
      data.days,
      (d) => LEAD_TYPES.reduce((sum, type) => sum + d.leadsByType[type], 0)
    );

    const sentences: string[] = [];

    if (monthlyBudget) {
      const budgetPct = monthlyBudget > 0 ? monthTotal / monthlyBudget : 0;
      const totalDaysInMonth = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + 1, 0).getDate();
      // En un mes anterior ya pasaron todos sus días — el "ritmo" ahí es simplemente gasto total
      // vs. presupuesto total, no gasto vs. lo transcurrido (que sólo tiene sentido en el mes en curso).
      const timePct = isCurrentMonth
        ? totalDaysInMonth > 0
          ? Math.min(today.getDate(), totalDaysInMonth) / totalDaysInMonth
          : 0
        : 1;
      const paceDiff = budgetPct - timePct;
      const paceText =
        Math.abs(paceDiff) < 0.05
          ? "al ritmo esperado para lo transcurrido del mes"
          : paceDiff > 0
            ? "por encima del ritmo esperado para lo transcurrido del mes"
            : "por debajo del ritmo esperado para lo transcurrido del mes";
      sentences.push(
        `La inversión del mes lleva ${formatCurrency(monthTotal, currency)} de ${formatCurrency(monthlyBudget, currency)} presupuestados (${Math.round(budgetPct * 100)}%), ${paceText}.`
      );
    } else {
      sentences.push(`La inversión del mes lleva ${formatCurrency(monthTotal, currency)}.`);
    }

    sentences.push(
      `Se generaron ${formatNumber(monthLeads)} leads a un CPL promedio de ${avgCpl > 0 ? formatCurrency(avgCpl, currency, 2) : "s/d"}.`
    );

    if (topType && typeLabels) {
      const topPct = monthLeads > 0 ? Math.round((monthLeadsByType[topType] / monthLeads) * 100) : 0;
      const efficiencyClause =
        cheapestType && priciestType && cheapestType !== priciestType
          ? ` ${typeLabels[cheapestType]} es el canal más eficiente (CPL ${formatCurrency(monthCplByType[cheapestType], currency, 2)}) y ${typeLabels[priciestType]} el más caro (CPL ${formatCurrency(monthCplByType[priciestType], currency, 2)}).`
          : "";
      sentences.push(
        `${typeLabels[topType]} lidera en volumen con ${formatNumber(monthLeadsByType[topType])} leads (${topPct}%).${efficiencyClause}`
      );
    }

    if (bestSpendDay) {
      const bestSpendDate = new Date(`${bestSpendDay.date}T00:00:00`);
      const bestLeadsTotal = bestLeadsDay ? LEAD_TYPES.reduce((sum, type) => sum + bestLeadsDay.leadsByType[type], 0) : 0;
      const leadsDayClause =
        bestLeadsDay && bestLeadsDay.date !== bestSpendDay.date
          ? ` El ${format(new Date(`${bestLeadsDay.date}T00:00:00`), "d MMM", { locale: es })} fue el día con más leads (${formatNumber(bestLeadsTotal)}).`
          : "";
      sentences.push(
        `El pico de inversión del mes fue el ${format(bestSpendDate, "d MMM", { locale: es })} (${formatCurrency(bestSpendDay.spend, currency)}).${leadsDayClause}`
      );
    }

    return sentences.join(" ");
  }, [
    data,
    today,
    selectedMonthDate,
    isCurrentMonth,
    monthTotal,
    monthLeads,
    monthLeadsByType,
    monthCplByType,
    monthlyBudget,
    currency,
    typeLabels,
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">Calendario de inversión</p>
          <select
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            title="Por el momento sólo se pueden ver el mes en curso y el mes anterior — el resto está grisado"
            className="h-9 w-fit rounded-md border border-input bg-background px-2.5 text-lg font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {monthOptions.map((opt) => (
              // Por ahora, a pedido de Martín, sólo se pueden ELEGIR el mes en curso y el
              // anterior (agosto, mientras estamos en septiembre) — el resto se listan igual
              // (para que se vea qué meses existen) pero grisados y sin poder seleccionarlos
              // (sacar este `disabled` cuando se habilite de nuevo la selección de mes completa).
              <option
                key={opt.value}
                value={opt.value}
                disabled={opt.value !== monthOptions[0]!.value && opt.value !== previousMonthValue}
              >
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {data && data.configuredTypeCount === 0 && (
          <p className="text-xs text-amber-600">
            Este cliente todavía no tiene Objetivos configurados en Meta Ads — el desglose por tipo va a estar en cero hasta que se carguen (ficha del cliente → Meta Ads → Objetivos).
          </p>
        )}
      </div>

      {error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Cargando datos de Meta Ads…</CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold text-muted-foreground">
                {monthlyBudget ? "Inversión del mes vs. presupuesto" : "Inversión del mes"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-2xl font-semibold text-foreground">{formatCurrency(monthTotal, currency)}</span>
                {monthlyBudget && (
                  <span className="text-sm text-muted-foreground">de {formatCurrency(monthlyBudget, currency)} presupuestados</span>
                )}
              </div>
              {monthlyBudget && <BudgetBar spent={monthTotal} budget={monthlyBudget} currency={currency} showBudgetLabel />}

              {/* Una scorecard POR TIPO de Resultado (Objetivo) en vez de las 3 fijas de antes
                  (Leads/CPL/Resultados) — a pedido de Martín. Cada una lleva su valor, el Costo
                  por Resultado de ESE tipo, y su propia tendencia diaria. Sólo entran acá los
                  Objetivos con al menos 1 Resultado este mes (visibleObjectiveTotals), igual que
                  el resto del tablero. En filas de a 4 (ROW_SIZE más abajo); si la última fila
                  queda incompleta (1, 2 o 3 tarjetas), esas tarjetas se reparten el ancho
                  completo por igual en vez de quedar angostas — por eso el grid de cada fila usa
                  su propio gridTemplateColumns según cuántas tarjetas tiene, no uno fijo de 4. */}
              {visibleObjectiveTotals.length === 0 ? (
                <p className="border-t border-border pt-3 text-xs text-muted-foreground">Todavía no hay resultados este mes.</p>
              ) : (
                <div className="flex flex-col gap-6 border-t border-border pt-3">
                  {chunk(visibleObjectiveTotals, RESULT_SCORECARD_ROW_SIZE).map((row, rowIndex) => (
                    <div
                      key={rowIndex}
                      className="grid gap-6"
                      style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                    >
                      {row.map((o) => (
                        <div key={o.index} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm font-bold text-muted-foreground">{o.label}</span>
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="text-2xl font-semibold text-foreground">{formatNumber(o.leads)}</span>
                              <span className="text-xs text-muted-foreground">
                                {o.leads > 0 ? `${formatCurrency(o.cpl, currency, 2)} por resultado` : "s/d por resultado"}
                              </span>
                            </div>
                          </div>
                          <DailyTypeBarChart days={data?.days ?? []} objectiveIndex={o.index} color={objectiveColor(o.index)} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-border pt-3">
                <span className="text-lg font-bold text-foreground">Resumen ejecutivo</span>
                <p className="text-sm leading-relaxed text-foreground">{executiveSummary}</p>
              </div>
            </CardContent>
          </Card>

          {data && typeLabels && (
            <>
              <InvestmentTrendChart
                days={data.days}
                currency={currency}
                month={selectedMonthDate}
                monthIsComplete={!isCurrentMonth}
                clientId={clientId}
              />
              <LeadsByTypeTrendChart
                days={data.days}
                currency={currency}
                objectiveLabels={data.objectiveLabels}
                month={selectedMonthDate}
                monthIsComplete={!isCurrentMonth}
                clientId={clientId}
              />
            </>
          )}

          <CampaignAnalysis
            monthLeadsByType={monthLeadsByType}
            monthSpendByType={monthSpendByType}
            monthIsComplete={!isCurrentMonth}
            clientId={clientId}
          />

          <PlacementAnalysis
            monthLeads={monthLeads}
            monthTotal={monthTotal}
            monthIsComplete={!isCurrentMonth}
            clientId={clientId}
          />

          {data && (
            <AudienceAnalysis
              segments={data.audienceSegments}
              objectiveLabels={data.objectiveLabels}
              currency={currency}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}

          {data && (
            <VideoRetentionChart
              segments={data.videoRetentionByAge}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}

          {data && (
            <RegionAnalysis
              segments={data.regionSegments}
              objectiveLabels={data.objectiveLabels}
              currency={currency}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}

          {data && (
            <HourlyPerformanceChart
              hourlyTotals={data.hourlyTotals}
              currency={currency}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}

          {data && (
            <WeekdayPerformanceChart
              days={data.days}
              currency={currency}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}

          {recommendationsMetrics && (
            <RecommendationsPanel metrics={recommendationsMetrics} monthIsComplete={!isCurrentMonth} clientId={clientId} />
          )}
        </>
      )}
    </div>
  );
}

/** Cuántas scorecards de Resultado entran por fila (ver el grid más arriba). */
const RESULT_SCORECARD_ROW_SIZE = 4;

/** Parte `items` en grupos de a lo sumo `size`, en orden. El último grupo puede quedar incompleto. */
function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

/**
 * Mini gráfico de barras diario de UN solo Objetivo (un color, sin apilar) — la tendencia diaria
 * dentro de la scorecard de ese tipo de Resultado (ver el grid más arriba). Sin ejes ni leyenda
 * propia: el color y el nombre del tipo ya están en el encabezado de la misma tarjeta: acá
 * alcanza con el tooltip al pasar el mouse para leer el valor de un día puntual.
 */
function DailyTypeBarChart({
  days,
  objectiveIndex,
  color,
}: {
  days: DailyRealTotals[];
  objectiveIndex: number;
  color: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) return null;

  const values = days.map((d) => d.objectiveLeads[objectiveIndex] ?? 0);
  const max = Math.max(...values, 1);
  const hovered = hoverIndex !== null ? days[hoverIndex] : null;
  const hoveredValue = hoverIndex !== null ? (values[hoverIndex] ?? 0) : 0;
  // Evita que el tooltip se corte contra el borde derecho de la tarjeta cuando se pasa el mouse
  // por los últimos días del mes.
  const tooltipFromRightEdge = hoverIndex !== null && hoverIndex > days.length * 0.7;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">Resultados por día</span>
      <div className="relative">
        {hovered && (
          <div
            className={cn(
              "pointer-events-none absolute bottom-full z-10 mb-1.5 flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1.5 text-[11px] shadow-md",
              tooltipFromRightEdge ? "-translate-x-full" : ""
            )}
            style={{ left: `${(hoverIndex! / Math.max(days.length - 1, 1)) * 100}%` }}
          >
            <span className="font-semibold text-foreground">{format(parseISO(hovered.date), "d MMM", { locale: es })}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium text-foreground">{formatNumber(hoveredValue)}</span>
          </div>
        )}
        <div className="flex h-12 items-end gap-px">
          {days.map((day, i) => {
            const value = values[i] ?? 0;
            const heightPct = value > 0 ? Math.max(6, (value / max) * 100) : 2;
            return (
              <div
                key={day.date}
                className="flex h-full flex-1 items-end"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <div
                  className={cn("w-full rounded-t-[2px]", value <= 0 && "bg-muted")}
                  style={value > 0 ? { height: `${heightPct}%`, backgroundColor: color } : { height: `${heightPct}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BudgetBar({
  spent,
  budget,
  currency,
  compact = false,
  showBudgetLabel = false,
}: {
  spent: number;
  budget: number;
  currency: string;
  compact?: boolean;
  showBudgetLabel?: boolean;
}) {
  const pct = budget > 0 ? spent / budget : 0;
  const widthPct = Math.min(100, Math.round(pct * 100));
  const over = pct > 1;

  return (
    <div className="flex flex-col gap-1">
      <div className={cn("relative w-full", showBudgetLabel && "mt-4")}>
        {showBudgetLabel && (
          <span className="absolute -top-4 right-0 whitespace-nowrap text-[11px] font-medium text-muted-foreground">
            Presupuesto: {formatCurrency(budget, currency)}
          </span>
        )}
        <div className={cn("w-full overflow-hidden rounded-full bg-muted", compact ? "h-1.5" : "h-2")}>
          <div className={cn("h-full rounded-full", over ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${widthPct}%` }} />
        </div>
        {showBudgetLabel && <div className="absolute right-0 top-0 h-full w-px bg-foreground/25" />}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {formatCurrency(spent, currency)} / {formatCurrency(budget, currency)} · {Math.round(pct * 100)}%
        {over && " (excedido)"}
      </span>
    </div>
  );
}
