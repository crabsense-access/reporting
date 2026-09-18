"use client";

// "Dónde se muestran los anuncios": ranking de ubicaciones de publicación (Feed, Stories, Reels,
// video in-stream, Audience Network) por CPL, coloreado por eficiencia vs. el promedio del mes
// (eficiente / promedio / ineficiente — no por tipo de campaña, a diferencia de los otros
// gráficos), con su insight generado por Claude ANTES del gráfico (a diferencia del resto de la
// página, donde el insight va después). Cada fila muestra CPL, Inversión, Clicks y Leads en
// columnas alineadas (mismo ancho en las 9 filas) junto a la barra de eficiencia — sin tabla de
// detalle aparte, para no duplicar la misma información dos veces.
//
// Usa datos de prueba (ver lib/reporting/mockInvestmentCalendar.ts — PLACEMENTS,
// placementMonthlyTotals) derivados del mismo total mensual que el resto de la página — cuando se
// conecte a Meta Ads real, sólo cambia de dónde sale PlacementTotals[], el resto no cambia.

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/format";
import { MOCK_CURRENCY, placementMonthlyTotals, type PlacementTotals } from "@/lib/reporting/mockInvestmentCalendar";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";

type Tier = "eficiente" | "promedio" | "ineficiente";

const TIER_COLOR: Record<Tier, string> = {
  eficiente: "#2563eb", // blue-600
  promedio: "#6b7280", // gray-500
  ineficiente: "#dc2626", // red-600
};

const TIER_LABEL: Record<Tier, string> = {
  eficiente: "Eficiente",
  promedio: "Promedio",
  ineficiente: "Por encima del promedio",
};

function tierFor(cpl: number, avgCpl: number): Tier {
  if (avgCpl <= 0) return "promedio";
  const ratio = cpl / avgCpl;
  if (ratio < 1.1) return "eficiente";
  if (ratio < 2) return "promedio";
  return "ineficiente";
}

// Ancho fijo por columna (CPL, Inversión, Clicks, Leads) para que los valores queden alineados
// verticalmente entre las 9 filas, sin importar el largo de cada número.
const METRIC_GRID_COLUMNS = "72px 92px 60px 56px";

export function PlacementAnalysis({
  monthLeads,
  monthTotal,
  monthIsComplete,
  clientId,
}: {
  monthLeads: number;
  monthTotal: number;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const avgCpl = monthLeads > 0 ? monthTotal / monthLeads : 0;

  const sorted = useMemo(() => {
    const placements = placementMonthlyTotals(monthLeads, monthTotal);
    return [...placements].sort((a, b) => {
      if (a.cpl === null) return 1;
      if (b.cpl === null) return -1;
      return a.cpl - b.cpl;
    });
  }, [monthLeads, monthTotal]);

  const withCpl = sorted.filter((p): p is PlacementTotals & { cpl: number } => p.cpl !== null);
  const best = withCpl[0] ?? null;
  const worst = withCpl.length > 0 ? withCpl[withCpl.length - 1]! : null;
  const maxCpl = Math.max(...withCpl.map((p) => p.cpl), 1);

  const insightMetrics = useMemo(() => {
    if (withCpl.length === 0) return null;
    return {
      cplPromedio: formatCurrency(avgCpl, MOCK_CURRENCY, 2),
      ubicaciones: sorted.map((p) => ({
        ubicacion: p.name,
        inversion: formatCurrency(p.spend, MOCK_CURRENCY),
        clicks: formatNumber(p.clicks),
        leads: formatNumber(p.leads),
        cpl: p.cpl !== null ? formatCurrency(p.cpl, MOCK_CURRENCY, 2) : "s/d",
        nivel: p.cpl !== null ? TIER_LABEL[tierFor(p.cpl, avgCpl)] : "s/d",
      })),
      masEficiente: best ? { ubicacion: best.name, cpl: formatCurrency(best.cpl, MOCK_CURRENCY, 2) } : null,
      menosEficiente: worst ? { ubicacion: worst.name, cpl: formatCurrency(worst.cpl, MOCK_CURRENCY, 2) } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, avgCpl, best, worst]);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <CardTitle className="text-lg font-bold text-foreground">Dónde se muestran los anuncios</CardTitle>
        <span className="text-xs text-muted-foreground">Ranking del mes por ubicación · CPL promedio: {formatCurrency(avgCpl, MOCK_CURRENCY, 2)}</span>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {insightMetrics && (
          <ChartInsightPanel chart="placements" metrics={insightMetrics} accentColor="hsl(var(--primary))" bordered={false} monthIsComplete={monthIsComplete} clientId={clientId} />
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
            <span />
            <div
              className="grid text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}
            >
              <span>CPL</span>
              <span>Inversión</span>
              <span>Clicks</span>
              <span>Leads</span>
            </div>
          </div>

          {sorted.map((p) => {
            const tier = p.cpl !== null ? tierFor(p.cpl, avgCpl) : "promedio";
            const color = TIER_COLOR[tier];
            const widthPct = p.cpl !== null ? Math.max(4, Math.round((p.cpl / maxCpl) * 100)) : 0;
            return (
              <div key={p.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                    {p.name}
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ color, backgroundColor: `${color}1a` }}>
                      {TIER_LABEL[tier]}
                    </span>
                  </span>
                  <div className="grid text-right tabular-nums" style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}>
                    <span className="whitespace-nowrap font-semibold text-foreground">
                      {p.cpl !== null ? formatCurrency(p.cpl, MOCK_CURRENCY, 2) : "s/d"}
                    </span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(p.spend, MOCK_CURRENCY)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(p.clicks)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(p.leads)}</span>
                  </div>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
