"use client";

// "Dónde se muestran los anuncios": ranking de ubicaciones de publicación (Feed, Stories, Reels,
// video in-stream, Audience Network) por inversión, coloreado por eficiencia de Costo por
// Resultado vs. el promedio del período filtrado (mismo criterio "eficiente / promedio /
// ineficiente" que RegionAnalysis.tsx), con el mismo combo dinámico de Objetivo (con "Todos los
// tipos" — blended, suma de todos los índices — como opción por defecto, mismo criterio que
// RegionAnalysis.tsx/LeadsByTypeTrendChart.tsx) + combos de Campaña y Anuncio que el resto de la
// página (ver AudienceAnalysis.tsx/RegionAnalysis.tsx: cualquier cantidad de Objetivos, sólo se
// listan los que tienen al menos 1 lead este mes, con el nombre REAL del tipo de Resultado como lo
// llama Meta Ads Manager — ver objectiveOptions más abajo y resolveResultLabel en
// lib/reporting/metaResultLabels.ts —, no el label que se tipea a mano al cargar el Objetivo en el
// Admin; Anuncio en cascada con Campaña — ver visibleAdsForCampaign en lib/reporting/adFilter.ts).
// Cada fila muestra Inversión, % de inversión, Resultados y Costo por Resultado en columnas
// alineadas a la derecha (separadas entre sí) junto a la barra de eficiencia — la barra ocupa sólo
// el ancho de la columna de ubicación, no se mete debajo de las columnas numéricas — sin tabla de
// detalle aparte. El insight de Claude va ANTES del gráfico (a diferencia del resto de la página,
// donde va después) — convención propia de este gráfico, sin cambios.
//
// Datos REALES de Meta Ads (ver lib/reporting/metaInvestmentData.ts — fetchPlacementSegments — e
// InvestmentCalendar.tsx, que pide todo junto una sola vez): desglose por ubicación
// (publisher_platform + platform_position, traducido a español por placementLabel() en
// metaResultLabels.ts) a nivel anuncio, matcheado por Objetivo con el mismo criterio
// (exacto → "contiene", primero que matchea se queda con la fila) que el resto de la página. Antes
// de esta migración usaba datos de prueba derivados del total mensual (mockInvestmentCalendar.ts,
// función placementMonthlyTotals) — ahora sale directo de Meta, igual que el resto de los gráficos.

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { resolveAdFilteredTotals, visibleAdsForCampaign, type AdBreakdownEntry } from "@/lib/reporting/adFilter";
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

// Ancho fijo por columna (Inversión, % Inv., Resultados, Costo por Resultado) para que los valores
// queden alineados verticalmente entre todas las filas, sin importar cuántas ubicaciones haya ni
// el largo de cada número — mismo criterio que RegionAnalysis.tsx (el espacio ENTRE columnas lo
// pone gap-x-4 en el grid, no este ancho).
const METRIC_GRID_COLUMNS = "92px 56px 64px 96px";

interface PlacementSegmentTotals {
  placement: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de esta ubicación por anuncio (clave = ad_id) — ver metaInvestmentData.ts. */
  byAd: Record<string, AdBreakdownEntry>;
}

interface ObjectiveOption {
  index: number;
  label: string;
}

export function PlacementAnalysis({
  segments,
  objectiveOptions,
  currency,
  monthIsComplete,
  clientId,
  campaigns,
  ads,
}: {
  /** Un elemento por ubicación de publicación con datos este mes — ver lib/reporting/metaInvestmentData.ts. */
  segments: PlacementSegmentTotals[];
  /**
   * Tipos de Resultado con al menos 1 lead este mes (índice alineado con objectiveLeads/objectiveSpend
   * de cada segmento), ya resueltos al nombre real que muestra Meta Ads Manager — ver
   * resolveResultLabel en lib/reporting/metaResultLabels.ts y visibleObjectiveTotals en
   * InvestmentCalendar.tsx. No es el label que se tipea a mano al cargar el Objetivo en el Admin.
   */
  objectiveOptions: ObjectiveOption[];
  currency: string;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
  /** Campañas con gasto este mes, para el combo — ver data.campaigns en InvestmentCalendar.tsx. */
  campaigns: { id: string; name: string }[];
  /** Anuncios con gasto este mes, cada uno con el id de su campaña — combo de Anuncio, en cascada con el de Campaña (ver visibleAdsForCampaign). */
  ads: { id: string; name: string; campaignId: string }[];
}) {
  const [objectiveIndex, setObjectiveIndex] = useState<number | null>(null); // null = "Todos los Resultados"
  const [campaignId, setCampaignId] = useState<string | null>(null); // null = "Todas las campañas"
  const [adId, setAdId] = useState<string | null>(null); // null = "Todos los anuncios"

  useEffect(() => {
    if (campaignId !== null && !campaigns.some((c) => c.id === campaignId)) {
      setCampaignId(null);
    }
  }, [campaigns, campaignId]);

  const visibleAds = useMemo(() => visibleAdsForCampaign(ads, campaignId), [ads, campaignId]);
  useEffect(() => {
    if (adId !== null && !visibleAds.some((a) => a.id === adId)) {
      setAdId(null);
    }
  }, [visibleAds, adId]);

  // objectiveOptions ya viene calculado en InvestmentCalendar.tsx sobre TODOS los segmentos (sin
  // filtrar por Campaña/Anuncio) y sólo con los Objetivos que tienen al menos 1 lead este mes,
  // mismo criterio que en AudienceAnalysis.tsx/RegionAnalysis.tsx.

  // Si el Objetivo seleccionado deja de estar visible (cambió el mes, o dejó de tener leads), cae
  // a "Todos los Resultados" en vez de quedarse mostrando un ranking vacío.
  useEffect(() => {
    if (objectiveIndex !== null && !objectiveOptions.some((o) => o.index === objectiveIndex)) {
      setObjectiveIndex(null);
    }
  }, [objectiveOptions, objectiveIndex]);

  // Con "Todos los Resultados" no hay un Objetivo puntual para colorear — se usa el mismo azul de
  // "Eficiente" (TIER_COLOR) como acento neutro, igual de espíritu que en RegionAnalysis.tsx.
  const selectedColor = objectiveIndex !== null ? objectiveColor(objectiveIndex) : TIER_COLOR.eficiente;
  const hasFilter = campaignId !== null || adId !== null;

  const rows = useMemo(() => {
    const objectivesCount = segments[0]?.objectiveLeads.length ?? 0;
    return segments
      .map((s) => {
        const scoped = hasFilter ? resolveAdFilteredTotals(s.byAd, campaignId, adId, objectivesCount) : null;
        const leadsSource = hasFilter ? scoped?.objectiveLeads : s.objectiveLeads;
        const spendSource = hasFilter ? scoped?.objectiveSpend : s.objectiveSpend;
        // Con "Todos los Resultados" (objectiveIndex null) se suman TODOS los índices — mismo criterio
        // "blended" que el resto de los gráficos con este combo (ver RegionAnalysis.tsx).
        const leads =
          objectiveIndex !== null ? (leadsSource?.[objectiveIndex] ?? 0) : (leadsSource ?? []).reduce((sum, v) => sum + v, 0);
        const spend =
          objectiveIndex !== null ? (spendSource?.[objectiveIndex] ?? 0) : (spendSource ?? []).reduce((sum, v) => sum + v, 0);
        return { placement: s.placement, leads, spend };
      })
      .filter((r) => r.spend > 0 || r.leads > 0)
      .sort((a, b) => b.spend - a.spend);
  }, [segments, objectiveIndex, hasFilter, campaignId, adId]);

  const totalLeads = rows.reduce((sum, r) => sum + r.leads, 0);
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  const selectedCampaignName = campaignId !== null ? (campaigns.find((c) => c.id === campaignId)?.name ?? null) : null;

  const insightMetrics = useMemo(() => {
    if (rows.length === 0) return null;
    const withCpl = rows.filter((r) => r.leads > 0).map((r) => ({ ...r, cpl: r.spend / r.leads }));
    const masEficiente = withCpl.length > 0 ? [...withCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const menosEficiente = withCpl.length > 0 ? [...withCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;

    return {
      tipoCampania: objectiveIndex !== null ? (objectiveOptions.find((o) => o.index === objectiveIndex)?.label ?? "") : "Todos los Resultados",
      campania: selectedCampaignName ?? "Todas las campañas",
      cplPromedio: formatCurrency(avgCpl, currency, 2),
      inversionTotal: formatCurrency(totalSpend, currency),
      ubicaciones: rows.map((r) => ({
        ubicacion: r.placement,
        inversion: formatCurrency(r.spend, currency),
        leads: formatNumber(r.leads),
        participacionInversion: formatPercent(totalSpend > 0 ? r.spend / totalSpend : 0),
        cpl: r.leads > 0 ? formatCurrency(r.spend / r.leads, currency, 2) : "s/d",
      })),
      masEficiente: masEficiente ? { ubicacion: masEficiente.placement, cpl: formatCurrency(masEficiente.cpl, currency, 2) } : null,
      menosEficiente: menosEficiente
        ? { ubicacion: menosEficiente.placement, cpl: formatCurrency(menosEficiente.cpl, currency, 2) }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, objectiveOptions, objectiveIndex, avgCpl, totalSpend, currency, selectedCampaignName]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">Dónde se muestran los anuncios</CardTitle>
          <span className="text-xs text-muted-foreground">
            Ranking del período por ubicación · Inversión total: {formatCurrency(totalSpend, currency)}
            {totalLeads > 0 && <> · CPL promedio: {formatCurrency(avgCpl, currency, 2)}</>}
          </span>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <select
            aria-label="Tipo de Resultado"
            value={objectiveIndex === null ? "all" : String(objectiveIndex)}
            onChange={(event) => setObjectiveIndex(event.target.value === "all" ? null : Number(event.target.value))}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos los Resultados</option>
            {objectiveOptions.map((o) => (
              <option key={o.index} value={o.index}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Campaña"
            value={campaignId ?? "all"}
            onChange={(event) => {
              const value = event.target.value === "all" ? null : event.target.value;
              setCampaignId(value);
              setAdId(null); // cambiar de Campaña invalida el Anuncio elegido (ver visibleAds).
            }}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Anuncio"
            value={adId ?? "all"}
            onChange={(event) => setAdId(event.target.value === "all" ? null : event.target.value)}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos los anuncios</option>
            {visibleAds.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {insightMetrics && (
          <ChartInsightPanel
            chart="placements"
            metrics={insightMetrics}
            accentColor={selectedColor}
            bordered={false}
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}

        <div className={cn("flex flex-col gap-3", insightMetrics && "border-t border-border pt-4")}>
          {rows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no hay leads este período.</p>
          ) : (
            <>
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

              {rows.map((r) => {
                const cpl = r.leads > 0 ? r.spend / r.leads : null;
                const tier = cpl !== null ? tierFor(cpl, avgCpl) : "promedio";
                const color = TIER_COLOR[tier];
                const spendShare = totalSpend > 0 ? r.spend / totalSpend : 0;
                const widthPct = Math.max(4, Math.round((r.spend / maxSpend) * 100));
                return (
                  <div key={r.placement} className="flex items-center gap-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                        <span className="truncate">{r.placement}</span>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ color, backgroundColor: `${color}1a` }}
                        >
                          {TIER_LABEL[tier]}
                        </span>
                      </span>
                      {/* La barra termina donde empieza la tabla: su ancho de referencia (w-full)
                          es el de esta columna de ubicación, no el de la fila entera. */}
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                    <div className="grid shrink-0 gap-x-4 text-right text-xs tabular-nums" style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}>
                      <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(r.spend, currency)}</span>
                      <span className="whitespace-nowrap font-semibold text-foreground">{formatPercent(spendShare)}</span>
                      <span className="whitespace-nowrap text-muted-foreground">{formatNumber(r.leads)}</span>
                      <span className="whitespace-nowrap text-muted-foreground">
                        {cpl !== null ? formatCurrency(cpl, currency, 2) : "s/d"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
