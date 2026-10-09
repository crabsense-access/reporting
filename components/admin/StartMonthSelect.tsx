"use client";

import { useMemo } from "react";
import { format, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { Label } from "@/components/ui/label";

/**
 * Combo "Tomar datos desde" de las fuentes de Meta Ads y Google Ads en el Admin: mes (yyyy-MM)
 * desde el cual el informe toma los datos de esa fuente (ver lib/reporting/reportWindow.ts).
 * Lista los últimos 36 meses, más reciente primero.
 */
export function StartMonthSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (month: string) => void;
}) {
  const options = useMemo(() => {
    const current = startOfMonth(new Date());
    return Array.from({ length: 36 }, (_, i) => {
      const date = subMonths(current, i);
      const label = format(date, "MMMM yyyy", { locale: es });
      return { value: format(date, "yyyy-MM"), label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  }, []);
  const hasValue = options.some((o) => o.value === value);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Tomar datos desde</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-fit rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {!hasValue && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Mes desde el cual el informe muestra los datos de esta fuente. Los meses anteriores no se pueden elegir en el reporte.
      </p>
    </div>
  );
}
