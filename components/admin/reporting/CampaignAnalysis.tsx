"use client";

// Reemplaza la grilla de calendario (días del mes) por un análisis de campañas individuales:
// ranking horizontal ordenable por Leads / CPL / Inversión, con el estado de cada una (Activa /
// Pausada) — y, debajo, el hallazgo de la campaña con mejor y con peor CPL del mes, redactado por
// Claude (ver CampaignHighlightPanel.tsx). "Mejor"/"peor" se decide acá por código (nunca por
// Claude) para que el texto nunca contradiga lo que muestra el ranking.
//
// Usa datos de prueba (ver lib/reporting/mockInvestmentCalendar.ts — CAMPAIGNS,
// campaignMonthlyTotals) derivados de los mismos totales por tipo que el resto de la página —
// cuando se conecte a Meta Ads real, sólo cambia de dónde sale CampaignTotals[], el resto del
// componente no cambia.

import { useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  campaignMonthlyTotals,
  type CampaignTotals,
  LEAD_TYPE_COLOR,
  LEAD_TYPE_LABEL,
  type LeadType,
  MOCK_CURRENCY,
} from "@/lib/reporting/mockInvestmentCalendar";
import { CampaignHighlightPanel } from "@/components/admin/reporting/CampaignHighlightPanel";

type Metric = "leads" | "cpl" | "spend";

const METRIC_LABEL: Record<Metric, string> = { leads: "Leads", cpl: "CPL", spend: "Inversión" };

/** Devuelve el elemento de `items` con mayor (o menor) `value(item)`, o null si la lista está vacía. */
function pickExtreme<T>(items: readonly T[], value: (item: T) => number, mode: "max" | "min"): T | null {
  let best: T | null = null;
  let bestValue = mode === "max" ? -Infinity : Infinity;
  for (const item of items) {
    const v = value(item);
    if ((mode === "max" && v > bestValue) || (mode === "min" && v < bestValue)) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

export function CampaignAnalysis({
  monthLeadsByType,
  monthSpendByType,
  monthIsComplete,
  clientId,
}: {
  monthLeadsByType: Record<LeadType, number>;
  monthSpendByType: Record<LeadType, number>;
  /** true cuando el mes seleccionado ya terminó — se le pasa a CampaignHighlightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const [metric, setMetric] = useState<Metric>("leads");

  const campaigns = useMemo(
    () => campaignMonthlyTotals(monthLeadsByType, monthSpendByType),
    [monthLeadsByType, monthSpendByType]
  );

  const { best, worst } = useMemo(() => {
    const withCpl = campaigns.filter((c): c is CampaignTotals & { cpl: number } => c.cpl !== null);
    return {
      best: pickExtreme(withCpl, (c) => c.cpl, "min"),
      worst: pickExtreme(withCpl, (c) => c.cpl, "max"),
    };
  }, [campaigns]);

  const sorted = useMemo(() => {
    const withValue = campaigns.map((c) => ({
      ...c,
      value: metric === "leads" ? c.leads : metric === "spend" ? c.spend : (c.cpl ?? 0),
    }));
    return withValue.sort((a, b) => (metric === "cpl" ? a.value - b.value : b.value - a.value));
  }, [campaigns, metric]);

  const maxValue = Math.max(...sorted.map((c) => c.value), 1);

  const formatMetricValue = (value: number) =>
    metric === "leads" ? formatNumber(value) : formatCurrency(value, MOCK_CURRENCY, metric === "cpl" ? 2 : 0);

  const highlightMetrics = useMemo(() => {
    if (!best || !worst) return null;
    const toInput = (c: CampaignTotals & { cpl: number }) => ({
      nombre: c.name,
      tipo: LEAD_TYPE_LABEL[c.type],
      estado: c.state === "activa" ? "Activa" : "Pausada",
      leads: formatNumber(c.leads),
      inversion: formatCurrency(c.spend, MOCK_CURRENCY),
      cpl: formatCurrency(c.cpl, MOCK_CURRENCY, 2),
    });
    return { mejor: toInput(best), peor: toInput(worst) };
  }, [best, worst]);

  const dotColorForCampaign = (nombre: string): string | undefined => {
    const campaign = campaigns.find((c) => c.name === nombre);
    return campaign ? LEAD_TYPE_COLOR[campaign.type] : undefined;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div className="flex flex-col gap-0.5">
          <CardTitle className="text-lg font-bold text-foreground">Análisis de campañas</CardTitle>
          <span className="text-xs text-muted-foreground">Ranking del mes por campaña individual</span>
        </div>
        <div className="flex items-center gap-1 rounded-md bg-muted p-1">
          {(["leads", "cpl", "spend"] as Metric[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMetric(option)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium transition-colors",
                metric === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {METRIC_LABEL[option]}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {metric === "cpl" && (
          <p className="-mt-1 text-[11px] text-muted-foreground">Ordenado de menor a mayor costo por lead.</p>
        )}

        <div className="flex flex-col gap-3.5">
          {sorted.map((c) => {
            const widthPct = Math.max(4, Math.round((c.value / maxValue) * 100));
            return (
              <div key={c.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: LEAD_TYPE_COLOR[c.type] }} />
                    {c.name}
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        c.state === "activa"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.state === "activa" ? "Activa" : "Pausada"}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-semibold tabular-nums text-foreground">{formatMetricValue(c.value)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${widthPct}%`, backgroundColor: LEAD_TYPE_COLOR[c.type], opacity: c.state === "activa" ? 1 : 0.55 }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {highlightMetrics && (
          <CampaignHighlightPanel
            metrics={highlightMetrics}
            dotColorForCampaign={dotColorForCampaign}
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}
