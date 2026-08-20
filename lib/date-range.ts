import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns";

export type DateRangePreset = "7d" | "30d" | "90d" | "custom";
export type Granularity = "day" | "week" | "month";

export interface DateRangeValue {
  from: string;
  to: string;
}

const DATE_FORMAT = "yyyy-MM-dd";

export function formatDate(date: Date): string {
  return format(date, DATE_FORMAT);
}

export function getPresetRange(preset: Exclude<DateRangePreset, "custom">): DateRangeValue {
  const today = new Date();
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  return {
    from: formatDate(subDays(today, days - 1)),
    to: formatDate(today),
  };
}

export function getDefaultRange(): DateRangeValue {
  return getPresetRange("30d");
}

// Mismo largo de días, corrido inmediatamente hacia atrás.
export function getPreviousPeriod(range: DateRangeValue): DateRangeValue {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const lengthInDays = differenceInCalendarDays(to, from) + 1;

  return {
    from: formatDate(subDays(from, lengthInDays)),
    to: formatDate(subDays(from, 1)),
  };
}

export function getDefaultGranularity(range: DateRangeValue): Granularity {
  const from = parseISO(range.from);
  const to = parseISO(range.to);
  const lengthInDays = differenceInCalendarDays(to, from) + 1;
  return lengthInDays > 30 ? "week" : "day";
}

export interface RangeState {
  preset: DateRangePreset;
  range: DateRangeValue;
}

// Lee el rango vigente desde los query params de la URL (?range=30d o
// ?range=custom&from=&to=), para que persista al navegar entre tabs del
// tablero. Usado por ClientDashboard (Analítica) y SeoDashboard (SEO).
export function parseRangeFromSearchParams(searchParams: URLSearchParams): RangeState {
  const rangeParam = searchParams.get("range");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  if (rangeParam === "custom" && fromParam && toParam) {
    return { preset: "custom", range: { from: fromParam, to: toParam } };
  }

  if (rangeParam === "7d" || rangeParam === "30d" || rangeParam === "90d") {
    return { preset: rangeParam, range: getPresetRange(rangeParam) };
  }

  return { preset: "30d", range: getDefaultRange() };
}
