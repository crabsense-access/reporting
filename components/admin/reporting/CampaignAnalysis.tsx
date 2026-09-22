"use client";

// Reemplaza la grilla de calendario (días del mes) por un análisis de campañas individuales:
// ranking horizontal por Inversión (de mayor a menor), con el estado de cada una (Activa /
// Pausada) — y, junto a la barra, una tabla con Inversión / % Inv. / Resultados / Costo por
// Resultado, mismo patrón "barra + tabla al costado" que RegionAnalysis.tsx/PlacementAnalysis.tsx
// (a pedido de Martín: antes había un toggle de Leads/CPL/Inversión que elegía qué métrica
// ordenaba el ranking y aparecía sola a la derecha de la barra — ahora las 4 métricas se ven
// siempre juntas, sin toggle, y el orden es siempre por Inversión). Debajo, el hallazgo de la
// campaña con mejor y con peor CPL del mes, redactado por Claude (ver CampaignHighlightPanel.tsx).
// "Mejor"/"peor" se decide acá por código (nunca por Claude) para que el texto nunca contradiga lo
// que muestra el ranking.
//
// Usa datos de prueba (ver lib/reporting/mockInvestmentCalendar.ts — CAMPAIGNS,
// campaignMonthlyTotals) derivados de los mismos totales por tipo que el resto de la página —
// cuando se conecte a Meta Ads real, sólo cambia de dónde sale CampaignTotals[], el resto del
// componente no cambia.

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  campaignMonthlyTotals,
  type CampaignTotals,
  LEAD_TYPE_COLOR,
  LEAD_TYPE_LABEL,
  type LeadType,
  MOCK_CURRENCY,
} from "@/lib/reporting/mockInvestmentCalendar";
import { CampaignHighlightPanel } from "@/components/admin/reporting/CampaignHighlightPanel";

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

// Ancho fijo por columna (Inversión, % Inv., Resultados, Costo por Resultado) para que los valores
// queden alineados verticalmente entre todas las filas — mismo criterio que RegionAnalysis.tsx/
// PlacementAnalysis.tsx.
const METRIC_GRID_COLUMNS = "92px 56px 68px 96px";

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

  // Siempre por Inversión, de mayor a menor — a pedido de Martín, ya no hay toggle de métrica (ver
  // comentario de cabecera).
  const sorted = useMemo(() => [...campaigns].sort((a, b) => b.spend - a.spend), [campaigns]);

  const totalSpend = sorted.reduce((sum, c) => sum + c.spend, 0);
  const maxSpend = Math.max(...sorted.map((c) => c.spend), 1);

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
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <CardTitle className="text-lg font-bold text-foreground">Análisis de campañas</CardTitle>
        <span className="text-xs text-muted-foreground">Ranking del mes por campaña individual</span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-4">
            <span className="min-w-0 flex-1" />
            <div
              className="grid shrink-0 gap-x-4 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}
            >
              <span>Inversión</span>
              <span>% Inv.</span>
              <span>Resultados</span>
              <span>Costo por Resultado</span>
            </div>
          </div>

          {sorted.map((c) => {
            const widthPct = Math.max(4, Math.round((c.spend / maxSpend) * 100));
            const spendShare = totalSpend > 0 ? c.spend / totalSpend : 0;
            return (
              <div key={c.id} className="flex items-center gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: LEAD_TYPE_COLOR[c.type] }} />
                    <span className="truncate">{c.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        c.state === "activa"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {c.state === "activa" ? "Activa" : "Pausada"}
                    </span>
                  </span>
                  {/* La barra termina donde empieza la tabla: su ancho de referencia (w-full) es
                      el de esta columna de campaña, no el de la fila entera — mismo criterio que
                      RegionAnalysis.tsx/PlacementAnalysis.tsx. */}
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${widthPct}%`, backgroundColor: LEAD_TYPE_COLOR[c.type], opacity: c.state === "activa" ? 1 : 0.55 }}
                    />
                  </div>
                </div>
                <div className="grid shrink-0 gap-x-4 text-right text-xs tabular-nums" style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}>
                  <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(c.spend, MOCK_CURRENCY)}</span>
                  <span className="whitespace-nowrap font-semibold text-foreground">{formatPercent(spendShare)}</span>
                  <span className="whitespace-nowrap font-semibold text-foreground">{formatNumber(c.leads)}</span>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {c.cpl !== null ? formatCurrency(c.cpl, MOCK_CURRENCY, 2) : "s/d"}
                  </span>
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
