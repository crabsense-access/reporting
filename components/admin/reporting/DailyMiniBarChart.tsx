"use client";

// Mini gráfico de barras diario (una barra por día, tooltip con fecha y valor) para las tarjetas de
// métricas — mismo look que DailyTypeBarChart de las tarjetas de Resultados del reporte de Meta Ads
// (InvestmentCalendar.tsx), pero genérico: recibe { date, value }.

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function DailyMiniBarChart({
  days,
  color,
  formatValue = formatNumber,
  title,
}: {
  /** date en yyyy-MM-dd */
  days: { date: string; value: number }[];
  color: string;
  formatValue?: (value: number) => string;
  title: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (days.length === 0) return null;

  const max = Math.max(...days.map((d) => d.value), 1);
  const hovered = hoverIndex !== null ? days[hoverIndex] : null;
  const tooltipFromRightEdge = hoverIndex !== null && hoverIndex > days.length * 0.7;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border pt-3">
      <span className="text-xs text-muted-foreground">{title}</span>
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
            <span className="font-medium text-foreground">{formatValue(hovered.value)}</span>
          </div>
        )}
        <div className="flex h-12 items-end gap-px">
          {days.map((day, i) => {
            const heightPct = day.value > 0 ? Math.max(6, (day.value / max) * 100) : 2;
            return (
              <div
                key={day.date}
                className="flex h-full flex-1 items-end"
                onMouseEnter={() => setHoverIndex(i)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <div
                  className={cn("w-full rounded-t-[2px]", day.value <= 0 && "bg-muted")}
                  style={day.value > 0 ? { height: `${heightPct}%`, backgroundColor: color } : { height: `${heightPct}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
