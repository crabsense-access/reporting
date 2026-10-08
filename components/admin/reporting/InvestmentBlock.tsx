"use client";

// Bloque "Inversión" compartido por el reporte de Meta Ads (InvestmentCalendar) y el de Google
// Ads (GoogleAdsReport), para que se vean igual: título + subtítulo según mes en curso/cerrado,
// el total del mes y la evolución diaria de la inversión (una barra por día del mes, con el
// promedio diario como línea punteada). Los días que todavía no pasaron (mes en curso) quedan
// vacíos; los días sin gasto se ven como una barra mínima gris. El promedio se marca igual que en
// "Inversión y rendimiento por día" (InvestmentTrendChart): línea sólida color primario
// semitransparente + pill "Promedio: …" colgando del borde derecho, por encima de las barras.

import { useEffect, useMemo, useRef, useState } from "react";
import { endOfMonth, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAR_COLOR = "hsl(var(--primary))";
/** Primario oscurecido para la línea y la pill de promedio (a pedido de Martín, más oscuras que las barras). */
const AVG_COLOR = "color-mix(in oklab, hsl(var(--primary)) 70%, black)";

// La pill de promedio replica la AvgPill de InvestmentTrendChart, que está dibujada en un SVG de
// 760 de ancho (VIEW_W) con texto de 9px y 20 de alto, y escala con el ancho de la tarjeta. Acá se
// escala igual (ancho real del gráfico / 760) para que la letra tenga el mismo tamaño en pantalla.
const TREND_CHART_VIEW_W = 760;

export interface InvestmentDay {
  /** yyyy-MM-dd */
  date: string;
  spend: number;
}

export function InvestmentBlock({
  month,
  days,
  total,
  currency,
  isCurrentMonth,
  loading = false,
}: {
  /** Mes del reporte, yyyy-MM. */
  month: string;
  days: InvestmentDay[];
  total: number;
  currency: string;
  isCurrentMonth: boolean;
  loading?: boolean;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRowRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = chartRowRef.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / TREND_CHART_VIEW_W || 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading]);

  const series = useMemo(() => {
    const spendByDate = new Map<string, number>();
    for (const d of days) spendByDate.set(d.date, (spendByDate.get(d.date) ?? 0) + d.spend);

    const monthStart = parseISO(`${month}-01`);
    const lastDay = endOfMonth(monthStart).getDate();
    const today = format(new Date(), "yyyy-MM-dd");
    let cumulative = 0;
    return Array.from({ length: lastDay }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, "0")}`;
      const isFuture = isCurrentMonth && date > today;
      const spend = isFuture ? 0 : (spendByDate.get(date) ?? 0);
      cumulative += spend;
      return { date, day: i + 1, spend, cumulative, isFuture };
    });
  }, [days, month, isCurrentMonth]);

  const elapsed = series.filter((d) => !d.isFuture);
  const max = Math.max(...elapsed.map((d) => d.spend), 0);
  // Promedio diario sólo de los días con inversión (los días en $0 no lo bajan).
  const daysWithSpend = elapsed.filter((d) => d.spend > 0);
  const average =
    daysWithSpend.length > 0 ? daysWithSpend.reduce((sum, d) => sum + d.spend, 0) / daysWithSpend.length : 0;
  const hovered = hoverIndex !== null ? series[hoverIndex] : null;
  const tickDays = new Set([1, 5, 10, 15, 20, 25, series.length]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <BlockTitle block={isCurrentMonth ? "inversionMesEnCurso" : "inversionMesCerrado"} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <span className="block h-8 w-32 animate-pulse rounded bg-muted" />
        ) : (
          <span className="text-2xl font-semibold text-foreground">{formatCurrency(total, currency)}</span>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <span className="text-sm font-bold text-muted-foreground">Evolución diaria de la inversión</span>

          {loading ? (
            <div className="h-40 animate-pulse rounded bg-muted" />
          ) : max === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No hubo inversión este mes.</p>
          ) : (
            <div ref={chartRowRef} className="flex gap-2">
              {/* Eje Y: sólo máximo y cero, para no recargar. */}
              <div className="flex h-40 w-14 shrink-0 flex-col justify-between text-right text-[10px] text-muted-foreground">
                <span>{formatCompactCurrency(max, currency)}</span>
                <span>{formatCompactCurrency(0, currency)}</span>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="relative h-40 border-b border-border">
                  {/* Promedio diario: misma línea + pill que InvestmentTrendChart. La pill se dibuja
                      por encima de las barras (z-[2]) para que el texto siempre se lea completo. */}
                  {average > 0 && (
                    <>
                      <div
                        className="pointer-events-none absolute inset-x-0 z-[1]"
                        style={{ bottom: `${(average / max) * 100}%`, borderTop: `1.5px solid ${AVG_COLOR}` }}
                      />
                      <div
                        className="pointer-events-none absolute right-0 z-[2] flex translate-y-1/2 items-center whitespace-nowrap rounded-full font-medium text-white"
                        style={{
                          bottom: `${(average / max) * 100}%`,
                          backgroundColor: AVG_COLOR,
                          fontSize: `${9 * scale}px`,
                          height: `${20 * scale}px`,
                          paddingInline: `${9 * scale}px`,
                        }}
                      >
                        Promedio: {formatCurrency(average, currency)}
                      </div>
                    </>
                  )}

                  {hovered && !hovered.isFuture && (
                    <div
                      className={cn(
                        "pointer-events-none absolute top-0 z-10 flex flex-col gap-0.5 whitespace-nowrap rounded-md border border-border bg-background px-2 py-1.5 text-[11px] shadow-md",
                        hoverIndex! > series.length * 0.6 ? "-translate-x-full" : ""
                      )}
                      style={{ left: `${((hoverIndex! + 0.5) / series.length) * 100}%` }}
                    >
                      <span className="font-semibold text-foreground">
                        {format(parseISO(hovered.date), "EEEE d MMM", { locale: es })}
                      </span>
                      <span className="text-foreground">Inversión: {formatCurrency(hovered.spend, currency)}</span>
                      <span className="text-muted-foreground">Acumulado: {formatCurrency(hovered.cumulative, currency)}</span>
                    </div>
                  )}

                  <div className="flex h-full items-end gap-px">
                    {series.map((d, i) => {
                      const heightPct = d.spend > 0 ? Math.max(3, (d.spend / max) * 100) : d.isFuture ? 0 : 1.5;
                      return (
                        <div
                          key={d.date}
                          className="flex h-full flex-1 items-end"
                          onMouseEnter={() => setHoverIndex(i)}
                          onMouseLeave={() => setHoverIndex(null)}
                        >
                          <div
                            className={cn(
                              "w-full rounded-t-[2px] transition-opacity",
                              d.spend <= 0 && "bg-muted",
                              hoverIndex !== null && hoverIndex !== i && "opacity-60"
                            )}
                            style={{ height: `${heightPct}%`, ...(d.spend > 0 ? { backgroundColor: BAR_COLOR } : {}) }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Eje X: algunos días de referencia */}
                <div className="flex gap-px text-[10px] text-muted-foreground">
                  {series.map((d) => (
                    <span key={d.date} className="flex-1 text-center">
                      {tickDays.has(d.day) ? d.day : ""}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
