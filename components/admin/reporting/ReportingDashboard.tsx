"use client";

// Tablero de reporting con el filtro Semana/Mes propuesto para el admin de
// clientes: alterna entre ver una semana (comparada contra la semana
// anterior) y ver un mes (comparado contra el promedio de los 3 meses
// anteriores). Por ahora muestra un único KPI de ejemplo — inversión de Meta
// Ads — más impresiones/clics como contexto; el resto de las fuentes
// (GA4, Search Console, Google Ads) se puede sumar más adelante siguiendo el
// mismo patrón de endpoint + rango de fechas (ver lib/reporting/dateRanges.ts).

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";

type ReportingMode = "week" | "month";

interface RangeMetrics {
  from: string;
  to: string;
  spend: number;
  impressions: number;
  clicks: number;
}

interface ReportingMetricsResponse {
  mode: ReportingMode;
  periodLabel: string;
  isPartial: boolean;
  comparisonLabel: string;
  canGoNext: boolean;
  currency: string;
  current: RangeMetrics;
  comparison: {
    spend: number;
    impressions: number;
    clicks: number;
    ranges: (RangeMetrics & { label: string })[];
  };
  deltaPct: { spend: number | null; impressions: number | null; clicks: number | null };
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function ReportingDashboard({ clientId }: { clientId: string }) {
  const [mode, setMode] = useState<ReportingMode>("week");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<ReportingMetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const anchorISO = useMemo(() => toISODate(anchor), [anchor]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/clients/${clientId}/reporting-metrics?mode=${mode}&anchor=${anchorISO}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudo cargar la métrica.");
        return body as ReportingMetricsResponse;
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
  }, [clientId, mode, anchorISO]);

  function shift(direction: 1 | -1) {
    setAnchor((prev) => {
      const next = new Date(prev);
      if (mode === "week") {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction);
      }
      return next;
    });
  }

  function changeMode(next: ReportingMode) {
    setMode(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border bg-secondary/40 p-1">
          {(["week", "month"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => changeMode(m)}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                mode === m
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "week" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Período anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[12rem] text-center text-sm font-medium capitalize text-foreground">
            {data?.periodLabel ?? "…"}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={!data?.canGoNext}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            aria-label="Período siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!error && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inversión (Meta Ads)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <span className="text-3xl font-semibold text-foreground">
                {loading || !data ? "—" : formatCurrency(data.current.spend, data.currency)}
              </span>
              {!loading && data && <DeltaPill value={data.deltaPct.spend} />}
            </div>

            <p className="text-sm text-muted-foreground">
              {loading || !data
                ? "Cargando…"
                : `vs. ${data.comparisonLabel}: ${formatCurrency(data.comparison.spend, data.currency)}`}
            </p>

            {!loading && data?.isPartial && (
              <p className="text-xs text-muted-foreground">
                Período en curso — se compara contra la misma cantidad de días transcurridos en el período anterior, para
                que la comparación sea justa.
              </p>
            )}

            {!loading && data && (
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <MiniMetric
                  label="Impresiones"
                  value={formatNumber(data.current.impressions)}
                  delta={data.deltaPct.impressions}
                />
                <MiniMetric label="Clics" value={formatNumber(data.current.clicks)} delta={data.deltaPct.clicks} />
              </div>
            )}

            {!loading && data && data.mode === "month" && (
              <MonthTrend currency={data.currency} current={data.current.spend} comparisonRanges={data.comparison.ranges} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeltaPill({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> s/d
      </span>
    );
  }

  const isUp = value > 0.0005;
  const isDown = value < -0.0005;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        isUp && "bg-emerald-50 text-emerald-700",
        isDown && "bg-rose-50 text-rose-700",
        !isUp && !isDown && "bg-muted text-muted-foreground"
      )}
    >
      {isUp && <TrendingUp className="h-3 w-3" />}
      {isDown && <TrendingDown className="h-3 w-3" />}
      {!isUp && !isDown && <Minus className="h-3 w-3" />}
      {isUp || isDown ? `${isDown ? "-" : "+"}${formatPercent(Math.abs(value))}` : "0%"}
    </span>
  );
}

function MiniMetric({ label, value, delta }: { label: string; value: string; delta: number | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-foreground">{value}</span>
        <DeltaPill value={delta} />
      </div>
    </div>
  );
}

function MonthTrend({
  currency,
  current,
  comparisonRanges,
}: {
  currency: string;
  current: number;
  comparisonRanges: { label: string; spend: number }[];
}) {
  // comparisonRanges viene en orden [mes-1, mes-2, mes-3] (ver computeRanges
  // en lib/reporting/dateRanges.ts) — se invierte para graficar en orden
  // cronológico, con el mes actual al final.
  const points = [...comparisonRanges].reverse().map((r) => ({ label: r.label.split(" ")[0], value: r.spend }));
  points.push({ label: "Actual", value: current });

  const max = Math.max(...points.map((p) => p.value), 1);

  return (
    <div className="border-t border-border pt-4">
      <p className="mb-2 text-xs text-muted-foreground">Tendencia — últimos 3 meses + actual</p>
      <div className="flex items-end gap-3">
        {points.map((point, i) => {
          const isLast = i === points.length - 1;
          const heightPct = Math.max(6, Math.round((point.value / max) * 100));
          return (
            <div key={`${point.label}-${i}`} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">{formatCurrency(point.value, currency, 0)}</span>
              <div className="flex h-20 w-full items-end">
                <div
                  className={cn("w-full rounded-t-sm", isLast ? "bg-primary" : "bg-muted-foreground/30")}
                  style={{ height: `${heightPct}%` }}
                />
              </div>
              <span className={cn("text-xs capitalize", isLast ? "font-medium text-foreground" : "text-muted-foreground")}>
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
