// Cálculo de rangos de fecha para el filtro Semana/Mes del tablero de
// reporting (ver components/admin/reporting/ReportingDashboard.tsx y
// app/api/clients/[id]/reporting-metrics/route.ts). Reglas de negocio:
//
// - Semana seleccionada -> se compara contra la semana inmediatamente
//   anterior.
// - Mes seleccionado -> se compara contra el promedio de los 3 meses
//   anteriores (ver MonthTrend en ReportingDashboard.tsx para el desglose
//   mes a mes).
// - Si el período seleccionado es el que contiene HOY (está en curso), NO se
//   compara período completo contra período completo (eso siempre da una
//   caída artificial en un mes/semana a medias) — se compara "días
//   transcurridos" contra la misma cantidad de días transcurridos en el/los
//   período(s) de comparación.
// - Semanas ISO (lunes a domingo), para alinear con el resto del tablero y
//   con GA4/Search Console.

import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { es } from "date-fns/locale";

export type ReportingMode = "week" | "month";

export interface DateRange {
  from: string;
  to: string;
}

export interface ComparisonRange extends DateRange {
  label: string;
}

export interface PeriodRanges {
  mode: ReportingMode;
  periodLabel: string;
  current: DateRange;
  isPartial: boolean;
  comparisonLabel: string;
  comparisonRanges: ComparisonRange[];
  canGoNext: boolean;
}

const ISO_WEEK = { weekStartsOn: 1 as const };

function toISO(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function minDate(a: Date, b: Date): Date {
  return isAfter(a, b) ? b : a;
}

export function computeRanges(mode: ReportingMode, anchor: Date, today: Date): PeriodRanges {
  return mode === "week" ? computeWeekRanges(anchor, today) : computeMonthRanges(anchor, today);
}

// Mueve el "ancla" del período un paso hacia adelante o atrás (usado por los
// botones ‹ › del navegador de período). El ancla puede ser cualquier fecha
// dentro del período — computeRanges siempre recalcula el inicio/fin real.
export function shiftAnchor(mode: ReportingMode, anchor: Date, direction: 1 | -1): Date {
  return mode === "week" ? addWeeks(anchor, direction) : addMonths(anchor, direction);
}

function computeWeekRanges(anchor: Date, today: Date): PeriodRanges {
  const weekStart = startOfWeek(anchor, ISO_WEEK);
  const weekEndFull = endOfWeek(anchor, ISO_WEEK);
  const isCurrent = !isAfter(weekStart, today) && !isAfter(today, weekEndFull);
  const weekEnd = minDate(weekEndFull, today);
  const daysElapsed = differenceInCalendarDays(weekEnd, weekStart) + 1;

  const prevWeekStart = subWeeks(weekStart, 1);
  const prevWeekEndFull = endOfWeek(prevWeekStart, ISO_WEEK);
  const prevWeekEnd = isCurrent ? addDays(prevWeekStart, daysElapsed - 1) : prevWeekEndFull;

  return {
    mode: "week",
    periodLabel: `${format(weekStart, "d MMM", { locale: es })} – ${format(weekEndFull, "d MMM yyyy", { locale: es })}`,
    current: { from: toISO(weekStart), to: toISO(weekEnd) },
    isPartial: isCurrent && daysElapsed < 7,
    comparisonLabel: "semana anterior",
    comparisonRanges: [
      {
        label: `${format(prevWeekStart, "d MMM", { locale: es })} – ${format(prevWeekEndFull, "d MMM yyyy", { locale: es })}`,
        from: toISO(prevWeekStart),
        to: toISO(prevWeekEnd),
      },
    ],
    canGoNext: !isCurrent,
  };
}

function computeMonthRanges(anchor: Date, today: Date): PeriodRanges {
  const monthStart = startOfMonth(anchor);
  const monthEndFull = endOfMonth(anchor);
  const isCurrent = !isAfter(monthStart, today) && !isAfter(today, monthEndFull);
  const monthEnd = minDate(monthEndFull, today);
  const daysElapsed = differenceInCalendarDays(monthEnd, monthStart) + 1;

  const comparisonRanges: ComparisonRange[] = [1, 2, 3].map((n) => {
    const prevMonthStart = startOfMonth(subMonths(anchor, n));
    const prevMonthEndFull = endOfMonth(prevMonthStart);
    const prevMonthEnd = isCurrent ? addDays(prevMonthStart, daysElapsed - 1) : prevMonthEndFull;
    return {
      label: format(prevMonthStart, "MMMM yyyy", { locale: es }),
      from: toISO(prevMonthStart),
      to: toISO(prevMonthEnd),
    };
  });

  return {
    mode: "month",
    periodLabel: format(monthStart, "MMMM yyyy", { locale: es }),
    current: { from: toISO(monthStart), to: toISO(monthEnd) },
    isPartial: isCurrent && daysElapsed < differenceInCalendarDays(monthEndFull, monthStart) + 1,
    comparisonLabel: "promedio últimos 3 meses",
    comparisonRanges,
    canGoNext: !isCurrent,
  };
}
