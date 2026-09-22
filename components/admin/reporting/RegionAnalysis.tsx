"use client";

// "De dónde son los leads": ranking de provincias/regiones del mes por inversión (barra
// proporcional a la participación de cada provincia en la inversión total, coloreada por
// eficiencia de CPL vs. el promedio del mes — mismo criterio "eficiente / promedio / ineficiente"
// que PlacementAnalysis.tsx). Cada fila muestra Alcance, Impresiones, Clicks, Inversión, % de
// inversión, Resultados y Costo por Resultado en columnas alineadas junto a la barra (que termina
// donde empieza la tabla, mismo criterio que PlacementAnalysis.tsx) — sin tabla de detalle aparte.
//
// Datos REALES de Meta Ads (ver lib/reporting/metaInvestmentData.ts — fetchRegionSegments — e
// InvestmentCalendar.tsx, que pide todo junto una sola vez): desglose por región a nivel anuncio,
// matcheado por Objetivo con el mismo criterio (exacto → "contiene", primero que matchea se queda
// con la fila) que el resto de la página. A diferencia de una tabla armada a partir de formularios
// completados nada más, acá los eventos de mensajería/WhatsApp SÍ quedan representados cuando
// están configurados como Objetivo, porque el desglose "region" sale directo de Meta a nivel
// anuncio — no depende de que la conversación tenga un formulario asociado. Alcance/Impresiones/
// Clicks NO se matchean por Objetivo (una impresión no "es" de un tipo de Resultado puntual): son
// totales de la región que sólo varían con el filtro de Campaña/Anuncio, no con el de Tipo de
// Resultado — ver RegionSegmentTotals.reach/impressions/clicks.
//
// TRES combos filtran el ranking y los hallazgos, en ese orden: TIPO DE RESULTADO, CAMPAÑA y
// ANUNCIO (mismo patrón en cascada que InvestmentTrendChart — ver visibleAdsForCampaign y
// resolveAdFilteredTotals en lib/reporting/adFilter.ts), con "Todos los Resultados" como opción del
// primero (antes forzaba un tipo puntual siempre elegido — a pedido de Martín, ahora es igual al
// resto de los gráficos con este combo) y sus valores con el nombre REAL del tipo de Resultado
// como lo llama Meta Ads Manager (ver objectiveOptions más abajo y resolveResultLabel en
// lib/reporting/metaResultLabels.ts), no el label que se tipea a mano al cargar el Objetivo en el
// Admin. La fila "Sin provincia asignada" (ver withUnassignedRegionBucket en
// metaInvestmentData.ts) no tiene desglose por anuncio — con un filtro de Campaña o Anuncio
// elegido, esa fila directamente no aparece (aceptado con Martín, mismo criterio que el resto de
// la página para ese bucket).

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { resolveAdFilteredTotals, visibleAdsForCampaign, type AdBreakdownEntry } from "@/lib/reporting/adFilter";

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

// Ancho fijo por columna (Alcance, Impresiones, Clicks, Inversión, % Inv., Resultados, Costo por
// Resultado) para que los valores queden alineados verticalmente entre todas las filas, sin
// importar cuántas provincias haya ni el largo de cada número.
const METRIC_GRID_COLUMNS = "64px 76px 56px 92px 56px 68px 96px";

interface RegionAdBreakdownEntry extends AdBreakdownEntry {
  /** Ver comentario de RegionSegmentTotals más abajo. */
  reach: number;
  impressions: number;
  clicks: number;
}

interface RegionSegmentTotals {
  region: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Alcance/impresiones/clics totales de esta región — no varían por Tipo de Resultado, sólo por
   * Campaña/Anuncio (ver byAd) — ver lib/reporting/metaInvestmentData.ts. */
  reach: number;
  impressions: number;
  clicks: number;
  /** Desglose de esta región por anuncio (clave = ad_id) — vacío en el bucket "Sin provincia
   * asignada" (ver metaInvestmentData.ts). */
  byAd: Record<string, RegionAdBreakdownEntry>;
}

interface ObjectiveOption {
  index: number;
  label: string;
}

/** Igual que resolveAdFilteredTotals (lib/reporting/adFilter.ts) pero para reach/impressions/
 * clicks, que ese helper compartido no conoce (ver comentario de cabecera). */
function resolveRegionEngagementTotals(
  byAd: Record<string, RegionAdBreakdownEntry>,
  campaignId: string | null,
  adId: string | null
): { reach: number; impressions: number; clicks: number } | null {
  if (adId !== null) {
    const entry = byAd[adId];
    return entry ? { reach: entry.reach, impressions: entry.impressions, clicks: entry.clicks } : null;
  }
  if (campaignId === null) return null;
  const matching = Object.values(byAd).filter((entry) => entry.campaignId === campaignId);
  if (matching.length === 0) return null;
  return matching.reduce(
    (acc, entry) => ({
      reach: acc.reach + entry.reach,
      impressions: acc.impressions + entry.impressions,
      clicks: acc.clicks + entry.clicks,
    }),
    { reach: 0, impressions: 0, clicks: 0 }
  );
}

export function RegionAnalysis({
  segments,
  objectiveOptions,
  currency,
  monthIsComplete,
  clientId,
  campaigns,
  ads,
}: {
  /** Un elemento por provincia/región con datos este mes — ver lib/reporting/metaInvestmentData.ts. */
  segments: RegionSegmentTotals[];
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
  // mismo criterio que en AudienceAnalysis.tsx.

  // Si el Objetivo seleccionado deja de estar visible (cambió el mes, o dejó de tener leads), cae
  // a "Todos los Resultados" en vez de quedarse mostrando un ranking vacío.
  useEffect(() => {
    if (objectiveIndex !== null && !objectiveOptions.some((o) => o.index === objectiveIndex)) {
      setObjectiveIndex(null);
    }
  }, [objectiveOptions, objectiveIndex]);

  // Con "Todos los Resultados" no hay un Objetivo puntual para colorear — se usa el mismo azul de
  // "Eficiente" (TIER_COLOR) como acento neutro, igual de espíritu que LINE_COLOR/COSTO_DEFAULT_COLOR
  // en el resto de los gráficos con este combo.
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
        // "blended" que el resto de los gráficos con este combo (ver InvestmentTrendChart.tsx).
        const leads =
          objectiveIndex !== null ? (leadsSource?.[objectiveIndex] ?? 0) : (leadsSource ?? []).reduce((sum, v) => sum + v, 0);
        const spend =
          objectiveIndex !== null ? (spendSource?.[objectiveIndex] ?? 0) : (spendSource ?? []).reduce((sum, v) => sum + v, 0);
        // Alcance/Impresiones/Clicks: no dependen del Tipo de Resultado, sólo de Campaña/Anuncio.
        const engagement = hasFilter ? resolveRegionEngagementTotals(s.byAd, campaignId, adId) : null;
        const reach = hasFilter ? (engagement?.reach ?? 0) : s.reach;
        const impressions = hasFilter ? (engagement?.impressions ?? 0) : s.impressions;
        const clicks = hasFilter ? (engagement?.clicks ?? 0) : s.clicks;
        return { region: s.region, leads, spend, reach, impressions, clicks };
      })
      .filter((r) => r.spend > 0 || r.leads > 0)
      .sort((a, b) => b.spend - a.spend);
  }, [segments, objectiveIndex, hasFilter, campaignId, adId]);

  const totalLeads = rows.reduce((sum, r) => sum + r.leads, 0);
  const totalSpend = rows.reduce((sum, r) => sum + r.spend, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : 0;
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);

  const top = rows[0] ?? null;

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
      provincias: rows.map((r) => ({
        provincia: r.region,
        inversion: formatCurrency(r.spend, currency),
        resultados: formatNumber(r.leads),
        participacionInversion: formatPercent(totalSpend > 0 ? r.spend / totalSpend : 0),
        cpl: r.leads > 0 ? formatCurrency(r.spend / r.leads, currency, 2) : "s/d",
        alcance: formatNumber(r.reach),
        impresiones: formatNumber(r.impressions),
        clicks: formatNumber(r.clicks),
      })),
      mayorInversion: top
        ? { provincia: top.region, participacion: formatPercent(totalSpend > 0 ? top.spend / totalSpend : 0) }
        : null,
      masEficiente: masEficiente ? { provincia: masEficiente.region, cpl: formatCurrency(masEficiente.cpl, currency, 2) } : null,
      menosEficiente: menosEficiente
        ? { provincia: menosEficiente.region, cpl: formatCurrency(menosEficiente.cpl, currency, 2) }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, objectiveOptions, objectiveIndex, avgCpl, totalSpend, top, currency, selectedCampaignName]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">De dónde son los leads</CardTitle>
          <span className="text-xs text-muted-foreground">
            Ranking del mes por provincia · Inversión total: {formatCurrency(totalSpend, currency)}
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

      <CardContent className="flex flex-col gap-5 pt-4">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no hay resultados este mes.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4">
              <span className="min-w-0 flex-1" />
              <div
                className="grid shrink-0 gap-x-4 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}
              >
                <span>Alcance</span>
                <span>Impres.</span>
                <span>Clicks</span>
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
                <div key={r.region} className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: color }} />
                      <span className="truncate">{r.region}</span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ color, backgroundColor: `${color}1a` }}
                      >
                        {TIER_LABEL[tier]}
                      </span>
                    </span>
                    {/* La barra termina donde empieza la tabla: su ancho de referencia (w-full)
                        es el de esta columna de provincia, no el de la fila entera. */}
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                  <div className="grid shrink-0 gap-x-4 text-right text-xs tabular-nums" style={{ gridTemplateColumns: METRIC_GRID_COLUMNS }}>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(r.reach)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(r.impressions)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(r.clicks)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(r.spend, currency)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatPercent(spendShare)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatNumber(r.leads)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {cpl !== null ? formatCurrency(cpl, currency, 2) : "s/d"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {insightMetrics && (
          <ChartInsightPanel
            chart="regions"
            metrics={insightMetrics}
            accentColor={selectedColor}
            variant="card"
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}
