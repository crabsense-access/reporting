"use client";

// "Análisis de campañas" del reporte de Meta Ads: ranking horizontal de las campañas REALES del mes
// por Inversión (de mayor a menor), con el estado actual de cada una en Meta (Activa / Pausada /
// Archivada) y, junto a la barra, una tabla con Inversión / % Inv. / Resultados / Costo por
// Resultado — mismo patrón "barra + tabla al costado" que RegionAnalysis.tsx/PlacementAnalysis.tsx.
// Debajo, el hallazgo de la campaña con mejor y con peor costo por resultado del mes, redactado por
// Claude (ver CampaignHighlightPanel.tsx). "Mejor"/"peor" se decide acá por código (nunca por
// Claude) para que el texto nunca contradiga lo que muestra el ranking.
//
// Datos (ver lib/reporting/metaInvestmentData.ts):
// - Lista de campañas, nombre tal cual está en Meta y estado: `campaignRanking` (todas las
//   campañas con gasto en el mes, incluidas las que no generaron ningún Resultado).
// - Inversión y Resultados por campaña: suma de days[].byAd — los mismos números que usa el resto
//   de la página, así que el total del ranking reconcilia con la inversión y los resultados del mes.
//   "Resultados" = suma de TODOS los tipos de Resultado del mes (mismo criterio que monthLeads).
// - Moneda: la de la cuenta publicitaria (`currency` de Meta), no una fija.
//
// Antes este bloque usaba campañas de prueba (lib/reporting/mockInvestmentCalendar.ts — CAMPAIGNS),
// con nombres inventados y el total por tipo repartido con porcentajes fijos.

import { useMemo } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { CampaignHighlightPanel } from "@/components/admin/reporting/CampaignHighlightPanel";

export type CampaignStatus = "activa" | "pausada" | "archivada";

export interface CampaignRankingInput {
  id: string;
  name: string;
  status: CampaignStatus | null;
}

/** Lo mínimo que necesita este bloque de cada día (ver DailyRealTotals en metaInvestmentData.ts). */
export interface CampaignAnalysisDay {
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[] }>;
}

interface CampaignRow extends CampaignRankingInput {
  spend: number;
  results: number;
  costPerResult: number | null;
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  activa: "Activa",
  pausada: "Pausada",
  archivada: "Archivada",
};

// Campañas que gastaron pero no generaron ningún Resultado en el mes — gris, mismo criterio que
// el bloque de Google Ads (GoogleAdsCampaignAnalysisBlock).
const NO_RESULTS_COLOR = "#94a3b8"; // slate-400

// Ancho fijo por columna (Inversión, % Inv., Resultados, Costo por Resultado) para que los valores
// queden alineados verticalmente entre todas las filas — mismo criterio que RegionAnalysis.tsx/
// PlacementAnalysis.tsx.
const METRIC_GRID_COLUMNS = "92px 56px 68px 96px";

export function CampaignAnalysis({
  campaigns,
  days,
  currency,
  loading,
  monthIsComplete,
  clientId,
}: {
  campaigns: CampaignRankingInput[];
  days: CampaignAnalysisDay[];
  currency: string;
  /** true mientras todavía no llegaron los datos del mes. */
  loading: boolean;
  /** true cuando el mes seleccionado ya terminó — se le pasa a CampaignHighlightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const rows = useMemo<CampaignRow[]>(() => {
    const totals = new Map<string, { spend: number; results: number }>();
    for (const day of days) {
      for (const entry of Object.values(day.byAd ?? {})) {
        const t = totals.get(entry.campaignId) ?? { spend: 0, results: 0 };
        t.spend += entry.spend;
        t.results += entry.objectiveLeads.reduce((sum, v) => sum + v, 0);
        totals.set(entry.campaignId, t);
      }
    }
    return campaigns
      .map((c) => {
        const t = totals.get(c.id) ?? { spend: 0, results: 0 };
        return { ...c, ...t, costPerResult: t.results > 0 ? t.spend / t.results : null };
      })
      .filter((c) => c.spend > 0 || c.results > 0)
      // Siempre por Inversión, de mayor a menor.
      .sort((a, b) => b.spend - a.spend);
  }, [campaigns, days]);

  // Color por campaña: las que tuvieron Resultados, un color de la paleta en orden de inversión;
  // las que no, gris.
  const colorById = useMemo(() => {
    const map = new Map<string, string>();
    rows.filter((c) => c.results > 0).forEach((c, i) => map.set(c.id, objectiveColor(i)));
    return map;
  }, [rows]);
  const colorOf = (id: string) => colorById.get(id) ?? NO_RESULTS_COLOR;

  // Mejor/peor costo por resultado: hacen falta al menos 2 campañas con Resultados (si no, "mejor"
  // y "peor" serían la misma campaña).
  const { best, worst } = useMemo(() => {
    const withCost = rows.filter((c): c is CampaignRow & { costPerResult: number } => c.costPerResult !== null);
    if (withCost.length < 2) return { best: null, worst: null };
    const b = withCost.reduce((acc, c) => (c.costPerResult < acc.costPerResult ? c : acc));
    const w = withCost.reduce((acc, c) => (c.costPerResult > acc.costPerResult ? c : acc));
    return b.id === w.id ? { best: null, worst: null } : { best: b, worst: w };
  }, [rows]);

  const highlightMetrics = useMemo(() => {
    if (!best || !worst) return null;
    const toInput = (c: CampaignRow & { costPerResult: number }) => ({
      nombre: c.name,
      ...(c.status ? { estado: STATUS_LABEL[c.status] } : {}),
      resultados: formatNumber(c.results),
      inversion: formatCurrency(c.spend, currency),
      costoPorResultado: formatCurrency(c.costPerResult, currency, 2),
    });
    return { mejor: toInput(best), peor: toInput(worst) };
  }, [best, worst, currency]);

  const dotColorForCampaign = (nombre: string): string | undefined => {
    const campaign = rows.find((c) => c.name === nombre);
    return campaign ? colorOf(campaign.id) : undefined;
  };

  const totalSpend = rows.reduce((sum, c) => sum + c.spend, 0);
  const maxSpend = Math.max(...rows.map((c) => c.spend), 1);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <BlockTitle block="analisisCampanas" />
        <span className="text-xs text-muted-foreground">Ranking del mes por campaña individual</span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {loading ? (
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hubo campañas con inversión este mes.</p>
        ) : (
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

            {rows.map((c) => {
              const widthPct = Math.max(4, Math.round((c.spend / maxSpend) * 100));
              const spendShare = totalSpend > 0 ? c.spend / totalSpend : 0;
              const color = colorOf(c.id);
              return (
                <div key={c.id} className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="truncate" title={c.name}>
                        {c.name}
                      </span>
                      {c.status && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            c.status === "activa"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {STATUS_LABEL[c.status]}
                        </span>
                      )}
                    </span>
                    {/* La barra termina donde empieza la tabla: su ancho de referencia (w-full) es
                        el de esta columna de campaña, no el de la fila entera — mismo criterio que
                        RegionAnalysis.tsx/PlacementAnalysis.tsx. */}
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, backgroundColor: color, opacity: c.status === "activa" || c.status === null ? 1 : 0.55 }}
                      />
                    </div>
                  </div>
                  <div className="grid shrink-0 gap-x-4 text-right text-xs tabular-nums" style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}>
                    <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(c.spend, currency)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatPercent(spendShare)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatNumber(c.results)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {c.costPerResult !== null ? formatCurrency(c.costPerResult, currency, 2) : "s/d"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && highlightMetrics && (
          <CampaignHighlightPanel
            metrics={highlightMetrics}
            badges={{ mejor: "Mejor costo por resultado", peor: "Oportunidad de mejora" }}
            dotColorForCampaign={dotColorForCampaign}
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}
