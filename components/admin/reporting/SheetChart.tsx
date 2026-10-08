"use client";

// Bloque opcional del Calendario de inversión: datos de un Google Sheet público configurado en el
// acordeón de Meta Ads (sheet_chart en lib/types.ts). Si el cliente no tiene Sheet configurado, no
// renderiza nada.
//
// A pedido de Martín NO muestra el Sheet entero: por cada columna numérica (serie) dibuja sólo 2
// barras — el mes seleccionado en el Calendario y el mes anterior (en un tono más claro) — más la
// variación % entre ambos (ej. "+12%"). Cada serie tiene su propia escala, porque en el mismo Sheet
// conviven magnitudes muy distintas (ventas ~30 vs. facturación ~45.000). La correspondencia fila ↔
// mes la resuelve compareMonths (lib/reporting/googleSheetChart.ts).

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import {
  compareMonths,
  previousMonthKey,
  type SheetChartData,
  type SheetMonthComparison,
} from "@/lib/reporting/googleSheetChart";

const MONTH_LABELS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const valueFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const pctFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0, signDisplay: "exceptZero" });

/** Opacidad del mes anterior: mismo color de la serie, más claro. */
const PREVIOUS_OPACITY = 0.35;

type SheetChartResponse = { enabled: false } | { enabled: true; chart?: SheetChartData; error?: string };

function monthLabel(key: string): string {
  const month = Number(key.split("-")[1]);
  return MONTH_LABELS[month - 1] ?? key;
}

export function SheetChart({
  clientId,
  month,
  currency,
}: {
  clientId: string;
  /** Mes seleccionado en el Calendario (yyyy-MM). */
  month: string;
  /** Moneda de la cuenta de Meta Ads — se usa para las series monetarias (Facturación, Ticket, etc.). */
  currency: string;
}) {
  const [response, setResponse] = useState<SheetChartResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clients/${clientId}/sheet-chart`)
      .then(async (res) => (await res.json()) as SheetChartResponse)
      .then((body) => {
        if (!cancelled) setResponse(body);
      })
      .catch(() => {
        if (!cancelled) setResponse({ enabled: true, error: "No se pudo cargar el gráfico del Google Sheet." });
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const comparisons = useMemo(
    () => (response?.enabled && response.chart ? compareMonths(response.chart, month) : []),
    [response, month]
  );

  if (!response || !response.enabled) return null;

  const title = response.chart?.title ?? undefined;
  const prevMonth = previousMonthKey(month);
  const hasCurrent = comparisons.some((c) => c.current !== null);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-1 pb-2">
        <BlockTitle block="googleSheet" title={title} subtitle={response.chart?.subtitle ?? undefined} />
        <p className="text-xs text-muted-foreground">
          {monthLabel(month)} vs. {monthLabel(prevMonth)}
        </p>
      </CardHeader>
      <CardContent className="pt-2">
        {!response.chart ? (
          <p className="text-sm text-destructive">{response.error ?? "No se pudo cargar el gráfico."}</p>
        ) : !hasCurrent ? (
          <p className="text-sm text-muted-foreground">El Google Sheet todavía no tiene datos de {monthLabel(month)}.</p>
        ) : (
          <div
            className="grid gap-6"
            style={{ gridTemplateColumns: `repeat(${Math.min(comparisons.length, 3)}, minmax(0, 1fr))` }}
          >
            {comparisons.map((c, i) => (
              <ComparisonCard
                key={c.name}
                comparison={c}
                color={objectiveColor(i)}
                currency={currency}
                currentLabel={monthLabel(month)}
                previousLabel={monthLabel(prevMonth)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Medidas del mini-gráfico de 2 barras (viewBox; escala con el ancho de la columna).
const VIEW_W = 300;
const VIEW_H = 200;
const PAD = { top: 22, bottom: 24, side: 24 };
const INNER_H = VIEW_H - PAD.top - PAD.bottom;
const BAR_W = 80;
const BAR_GAP = 36;

function ComparisonCard({
  comparison,
  color,
  currency,
  currentLabel,
  previousLabel,
}: {
  comparison: SheetMonthComparison;
  color: string;
  currency: string;
  currentLabel: string;
  previousLabel: string;
}) {
  const { name, current, previous, variationPct, isCurrency } = comparison;
  const format = (v: number) => (isCurrency ? formatCurrency(v, currency) : valueFormat.format(v));
  const max = Math.max(Math.abs(current ?? 0), Math.abs(previous ?? 0)) || 1;
  const barHeight = (v: number) => Math.max((Math.abs(v) / max) * INNER_H, 2);
  const firstX = (VIEW_W - (BAR_W * 2 + BAR_GAP)) / 2;
  const bars = [
    { label: previousLabel, value: previous, x: firstX, opacity: PREVIOUS_OPACITY },
    { label: currentLabel, value: current, x: firstX + BAR_W + BAR_GAP, opacity: 1 },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-bold text-muted-foreground">{name}</span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            variationPct === null
              ? "bg-muted text-muted-foreground"
              : variationPct >= 0
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-red-500/10 text-red-600"
          )}
          title={`Variación de ${currentLabel} vs. ${previousLabel}`}
        >
          {variationPct === null ? "s/d" : `${pctFormat.format(Math.round(variationPct))}%`}
        </span>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label={`${name}: ${previousLabel} vs. ${currentLabel}`}>
        <line
          x1={PAD.side}
          x2={VIEW_W - PAD.side}
          y1={PAD.top + INNER_H}
          y2={PAD.top + INNER_H}
          stroke="currentColor"
          className="text-border"
        />
        {bars.map((bar) => {
          const h = bar.value === null ? 0 : barHeight(bar.value);
          const top = PAD.top + INNER_H - h;
          return (
            <g key={bar.label}>
              {bar.value !== null && (
                <rect x={bar.x} y={top} width={BAR_W} height={h} rx={4} fill={color} opacity={bar.opacity} />
              )}
              <text
                x={bar.x + BAR_W / 2}
                y={bar.value === null ? PAD.top + INNER_H - 6 : top - 7}
                textAnchor="middle"
                className={cn("text-[14px] font-semibold", bar.value === null ? "fill-muted-foreground" : "fill-foreground")}
              >
                {bar.value === null ? "s/d" : format(bar.value)}
              </text>
              <text
                x={bar.x + BAR_W / 2}
                y={VIEW_H - 6}
                textAnchor="middle"
                className="fill-muted-foreground text-[12px]"
              >
                {bar.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
