import { format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

// Mes desde el cual se toman los datos de cada fuente (Meta Ads / Google Ads). Se elige por
// cliente y por fuente en el Admin (campo start_month de la config del data_source, formato
// yyyy-MM — ver StartMonthSelect). Si una fuente no lo tiene cargado, se usa este default
// (agosto 2026, el corte que había antes para todos). Los meses anteriores al de inicio se
// muestran grisados en los combos de mes y las APIs los rechazan.
export const FIRST_CLIENT_VISIBLE_MONTH = "2026-08";

/** Mes de inicio de una fuente (config.start_month), o el default si no está cargado o es inválido. */
export function resolveStartMonth(config?: { start_month?: string | null } | null): string {
  const value = config?.start_month;
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : FIRST_CLIENT_VISIBLE_MONTH;
}

/** true si `month` (yyyy-MM) es igual o posterior al mes de inicio. */
export function isMonthFromStart(month: string, startMonth: string): boolean {
  return month >= startMonth;
}

/** @deprecated Usar isMonthFromStart con el mes de inicio de la fuente. */
export function isMonthVisibleToClients(month: string): boolean {
  return month >= FIRST_CLIENT_VISIBLE_MONTH;
}

export interface MonthOption {
  value: string; // yyyy-MM
  label: string; // "Octubre 2026"
  date: Date;
}

/**
 * Meses para los combos de mes, más reciente primero: los últimos 12 como mínimo y, si el mes de
 * inicio es más viejo, hasta el mes de inicio (tope de 36 meses).
 */
export function recentMonthOptions(startMonth: string, today: Date = new Date()): MonthOption[] {
  const current = startOfMonth(today);
  const options: MonthOption[] = [];
  for (let i = 0; i < 36; i++) {
    const date = subMonths(current, i);
    const value = format(date, "yyyy-MM");
    if (i >= 12 && value < startMonth) break;
    const label = format(date, "MMMM yyyy", { locale: es });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1), date });
  }
  return options;
}
