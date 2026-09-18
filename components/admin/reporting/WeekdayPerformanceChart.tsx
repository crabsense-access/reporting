"use client";

// "Qué día de la semana rinde mejor": inversión por día de la semana (barras, eje izquierdo) +
// costo por contacto por día de la semana (línea, eje derecho) — mismo patrón que
// HourlyPerformanceChart.tsx, pero agrupando por día de la semana (Lunes a Domingo) en vez de por
// hora del día, y sin desglose por Objetivo (acá "contactos" combina TODOS los Objetivos
// configurados: el punto es identificar qué días rinden mejor, no qué tipo de conversión).
//
// A diferencia de HourlyPerformanceChart, esto NO pide un breakdown nuevo a Meta — Meta no tiene
// un breakdown de "día de la semana", así que se deriva del mismo `days` (desglose día a día del
// mes, ya cacheado y reconciliado) que usan InvestmentTrendChart/LeadsByTypeTrendChart: cada día
// del mes se cae en uno de los 7 días de la semana según su fecha, y se suman spend/leads.
//
// Las barras se pintan en rojo cuando el costo por contacto de ese día de la semana supera en más
// de un 35% al costo por contacto promedio de la cuenta — mismo umbral y mismo criterio dinámico
// que en HourlyPerformanceChart (nunca hardcodeado).
//
// Debajo del gráfico, un resumen en 2 franjas fijas (Lunes a viernes / Sábado y domingo) con
// inversión, participación, contactos y costo por contacto — y el insight de Claude a partir de
// esos mismos números.

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { cn } from "@/lib/utils";

interface DailyRealTotals {
  date: string; // yyyy-MM-dd
  spend: number;
  objectiveLeads: number[];
}

// Orden de visualización: Lunes primero (convención habitual en Argentina), Domingo al final.
// weekday sigue el índice de Date.getDay() (0=Domingo..6=Sábado).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Lun",
  2: "Mar",
  3: "Mié",
  4: "Jue",
  5: "Vie",
  6: "Sáb",
};
const WEEKDAY_FULL_LABEL: Record<number, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

interface DayBand {
  label: string;
  weekdays: number[];
}

const DAY_BANDS: DayBand[] = [
  { label: "Lunes a viernes", weekdays: [1, 2, 3, 4, 5] },
  { label: "Sábado y domingo", weekdays: [6, 0] },
];

// Cuánto por encima del promedio de la cuenta tiene que estar el costo por contacto de un día de
// la semana para pintarse en rojo — mismo criterio que HourlyPerformanceChart.
const RED_THRESHOLD_RATIO = 1.35;

const BAR_COLOR_NORMAL = "#dbeafe"; // blue-100
const BAR_COLOR_ABOVE_THRESHOLD = "#dc2626"; // red-600
const LINE_COLOR = "#15803d"; // green-700

const VIEW_W = 760;
const VIEW_H = 260;
const PAD = { top: 16, right: 46, bottom: 26, left: 50 };
const INNER_W = VIEW_W - PAD.left - PAD.right;
const INNER_H = VIEW_H - PAD.top - PAD.bottom;
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function roundedTopBarPath(x: number, yTop: number, width: number, yBottom: number, radius: number) {
  const r = Math.min(radius, (yBottom - yTop) / 2, width / 2);
  if (r <= 0.5) return `M ${x},${yBottom} L ${x},${yTop} L ${x + width},${yTop} L ${x + width},${yBottom} Z`;
  return `M ${x},${yBottom} L ${x},${yTop + r} Q ${x},${yTop} ${x + r},${yTop} L ${x + width - r},${yTop} Q ${x + width},${yTop} ${x + width},${yTop + r} L ${x + width},${yBottom} Z`;
}

function sumObjectiveLeads(objectiveLeads: number[]): number {
  return objectiveLeads.reduce((sum, v) => sum + v, 0);
}

export function WeekdayPerformanceChart({
  days,
  currency,
  monthIsComplete,
  clientId,
}: {
  /** Desglose día a día del mes seleccionado — mismo array que InvestmentTrendChart/LeadsByTypeTrendChart (ver InvestmentCalendar.tsx). */
  days: DailyRealTotals[];
  currency: string;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const weekdays = useMemo(() => {
    const totals = new Map<number, { spend: number; leads: number }>();
    for (let w = 0; w < 7; w += 1) totals.set(w, { spend: 0, leads: 0 });

    for (const day of days) {
      // new Date("yyyy-MM-dd") se interpreta en UTC medianoche — para no correr de día según el
      // huso horario del navegador, se arma la fecha con sus componentes locales.
      const [year, month, dayOfMonth] = day.date.split("-").map(Number);
      if (!year || !month || !dayOfMonth) continue;
      const weekday = new Date(year, month - 1, dayOfMonth).getDay();
      const entry = totals.get(weekday)!;
      entry.spend += day.spend;
      entry.leads += sumObjectiveLeads(day.objectiveLeads);
    }

    return WEEKDAY_ORDER.map((weekday) => {
      const entry = totals.get(weekday)!;
      return { weekday, spend: entry.spend, leads: entry.leads, cpl: entry.leads > 0 ? entry.spend / entry.leads : null };
    });
  }, [days]);

  const totalSpend = weekdays.reduce((sum, w) => sum + w.spend, 0);
  const totalLeads = weekdays.reduce((sum, w) => sum + w.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null;
  const threshold = avgCpl !== null ? avgCpl * RED_THRESHOLD_RATIO : null;

  const slot = INNER_W / 7;
  const barWidth = Math.min(56, slot * 0.5);

  const maxSpend = Math.max(...weekdays.map((w) => w.spend), 1) * 1.15;
  const cplValues = weekdays.map((w) => w.cpl).filter((v): v is number => v !== null);
  const maxCpl = Math.max(...cplValues, 1) * 1.15;

  const xAt = (index: number) => PAD.left + slot * index + slot / 2;
  const yLeftAt = (value: number) => PAD.top + INNER_H - (value / maxSpend) * INNER_H;
  const yRightAt = (value: number) => PAD.top + INNER_H - (value / maxCpl) * INNER_H;

  const linePoints = weekdays
    .map((w, i) => (w.cpl !== null ? { x: xAt(i), y: yRightAt(w.cpl), index: i, value: w.cpl } : null))
    .filter((p): p is { x: number; y: number; index: number; value: number } => p !== null);

  const linePath = linePoints.reduce((acc, p, i) => {
    const prev = linePoints[i - 1];
    const isGap = prev && p.index - prev.index > 1;
    return acc + `${i === 0 || isGap ? "M" : "L"} ${p.x},${p.y} `;
  }, "");

  const bands = useMemo(() => {
    return DAY_BANDS.map((band) => {
      const inBand = weekdays.filter((w) => band.weekdays.includes(w.weekday));
      const spend = inBand.reduce((sum, w) => sum + w.spend, 0);
      const leads = inBand.reduce((sum, w) => sum + w.leads, 0);
      return {
        ...band,
        spend,
        leads,
        cpl: leads > 0 ? spend / leads : null,
        share: totalSpend > 0 ? spend / totalSpend : 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdays, totalSpend]);

  const hasData = totalSpend > 0 || totalLeads > 0;

  const insightMetrics = useMemo(() => {
    if (!hasData) return null;
    const withLeads = weekdays.filter((w) => w.leads > 0);
    const peakDay = withLeads.length > 0 ? [...withLeads].sort((a, b) => b.leads - a.leads)[0]! : null;
    const withCpl = weekdays.filter((w): w is typeof w & { cpl: number } => w.cpl !== null);
    const cheapestDay = withCpl.length > 0 ? [...withCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const priciestDay = withCpl.length > 0 ? [...withCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;
    const bandsWithLeads = bands.filter((b) => b.leads > 0);
    const bestBand = bandsWithLeads.length > 0 ? [...bandsWithLeads].sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0]! : null;
    const worstBand = bandsWithLeads.length > 0 ? [...bandsWithLeads].sort((a, b) => (b.cpl ?? -Infinity) - (a.cpl ?? -Infinity))[0]! : null;

    return {
      costoPromedio: avgCpl !== null ? formatCurrency(avgCpl, currency, 2) : null,
      inversionTotal: formatCurrency(totalSpend, currency),
      contactosTotales: formatNumber(totalLeads),
      franjas: bands.map((b) => ({
        franja: b.label,
        inversion: formatCurrency(b.spend, currency),
        participacionInversion: formatPercent(b.share),
        contactos: formatNumber(b.leads),
        costoPorContacto: b.cpl !== null ? formatCurrency(b.cpl, currency, 2) : "s/d",
      })),
      mejorFranja: bestBand ? { franja: bestBand.label, costoPorContacto: formatCurrency(bestBand.cpl ?? 0, currency, 2) } : null,
      peorFranja: worstBand ? { franja: worstBand.label, costoPorContacto: formatCurrency(worstBand.cpl ?? 0, currency, 2) } : null,
      diaPico: peakDay ? { dia: WEEKDAY_FULL_LABEL[peakDay.weekday], contactos: formatNumber(peakDay.leads) } : null,
      diaMasEficiente: cheapestDay
        ? { dia: WEEKDAY_FULL_LABEL[cheapestDay.weekday], costoPorContacto: formatCurrency(cheapestDay.cpl, currency, 2) }
        : null,
      diaMenosEficiente: priciestDay
        ? { dia: WEEKDAY_FULL_LABEL[priciestDay.weekday], costoPorContacto: formatCurrency(priciestDay.cpl, currency, 2) }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekdays, bands, hasData, avgCpl, totalSpend, totalLeads, currency]);

  const handleMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((relX - PAD.left - slot / 2) / slot);
    setHoverIndex(Math.min(6, Math.max(0, index)));
  };

  const hovered = hoverIndex !== null ? weekdays[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;
  const tooltipLeft = hoverX !== null ? `${(hoverX / VIEW_W) * 100}%` : "0%";
  const tooltipFromRightEdge = hoverX !== null && hoverX > VIEW_W * 0.72;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <CardTitle className="text-lg font-bold text-foreground">Qué día de la semana rinde mejor</CardTitle>
        <span className="text-xs text-muted-foreground">
          {threshold !== null
            ? `Las barras en rojo señalan los días cuyo costo por contacto supera los ${formatCurrency(threshold, currency, 2)}, es decir, más de un ${Math.round((RED_THRESHOLD_RATIO - 1) * 100)}% por encima del promedio de la cuenta.`
            : "Todavía no hay contactos este mes para calcular el promedio."}
        </span>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasData ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Todavía no hay datos este mes.</p>
        ) : (
          <>
            <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="h-full w-full"
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {TICK_FRACTIONS.map((frac) => {
                  const y = PAD.top + INNER_H - frac * INNER_H;
                  return (
                    <g key={frac}>
                      <line
                        x1={PAD.left}
                        x2={VIEW_W - PAD.right}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        className="text-border"
                        strokeWidth={1}
                        strokeDasharray={frac === 0 ? undefined : "3 3"}
                      />
                      <text x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                        {formatCurrency(maxSpend * frac, currency, 0)}
                      </text>
                      <text x={VIEW_W - PAD.right + 8} y={y} textAnchor="start" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                        {formatCurrency(maxCpl * frac, currency, 0)}
                      </text>
                    </g>
                  );
                })}

                {/* Barras de inversión por día de la semana, coloreadas por umbral de costo por contacto */}
                {weekdays.map((w, i) => {
                  if (w.spend <= 0 && w.leads <= 0) return null;
                  const isAboveThreshold = threshold !== null && w.cpl !== null && w.cpl > threshold;
                  return (
                    <path
                      key={w.weekday}
                      d={roundedTopBarPath(xAt(i) - barWidth / 2, yLeftAt(w.spend), barWidth, PAD.top + INNER_H, 3)}
                      fill={isAboveThreshold ? BAR_COLOR_ABOVE_THRESHOLD : BAR_COLOR_NORMAL}
                    />
                  );
                })}

                {/* Línea de costo por contacto */}
                {linePath && <path d={linePath} fill="none" stroke={LINE_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {linePoints.map((p) => (
                  <circle key={p.index} cx={p.x} cy={p.y} r={3} fill="#ffffff" stroke={LINE_COLOR} strokeWidth={2} />
                ))}

                {/* Eje X: días de la semana */}
                {weekdays.map((w, i) => (
                  <text key={`x-${w.weekday}`} x={xAt(i)} y={VIEW_H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                    {WEEKDAY_LABEL[w.weekday]}
                  </text>
                ))}

                {hoverX !== null && (
                  <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + INNER_H} stroke="currentColor" className="text-border" strokeWidth={1} />
                )}
                {hovered && hoverX !== null && hovered.cpl !== null && (
                  <circle cx={hoverX} cy={yRightAt(hovered.cpl)} r={4} fill="#ffffff" stroke={LINE_COLOR} strokeWidth={2} />
                )}
              </svg>

              {hovered && (
                <div
                  className={cn(
                    "pointer-events-none absolute top-2 flex min-w-[150px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md",
                    tooltipFromRightEdge ? "-translate-x-full" : ""
                  )}
                  style={{ left: tooltipLeft }}
                >
                  <span className="font-medium text-foreground">{WEEKDAY_FULL_LABEL[hovered.weekday]}</span>
                  {hovered.spend > 0 || hovered.leads > 0 ? (
                    <>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: BAR_COLOR_ABOVE_THRESHOLD }} /> Inversión
                        </span>
                        <span className="font-medium text-foreground">{formatCurrency(hovered.spend, currency)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: LINE_COLOR }} /> Costo/contacto
                        </span>
                        <span className="font-medium text-foreground">{hovered.cpl !== null ? formatCurrency(hovered.cpl, currency, 2) : "0"}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Contactos</span>
                        <span className="font-medium text-foreground">{formatNumber(hovered.leads)}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sin actividad este día</span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Franja</th>
                    <th className="py-1.5 pr-4 font-medium">Inversión</th>
                    <th className="py-1.5 pr-4 font-medium">% del total</th>
                    <th className="py-1.5 pr-4 font-medium">Contactos</th>
                    <th className="py-1.5 font-medium">Costo/contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band) => (
                    <tr key={band.label} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">{band.label}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatCurrency(band.spend, currency)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatPercent(band.share)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatNumber(band.leads)}</td>
                      <td className="py-2 font-semibold text-foreground">{band.cpl !== null ? formatCurrency(band.cpl, currency, 2) : "s/d"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {insightMetrics && (
          <ChartInsightPanel chart="weekday-performance" metrics={insightMetrics} accentColor={LINE_COLOR} monthIsComplete={monthIsComplete} clientId={clientId} />
        )}
      </CardContent>
    </Card>
  );
}
