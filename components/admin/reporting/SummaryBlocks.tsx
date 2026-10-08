"use client";

// Bloques consolidados del "Resumen general" (Meta Ads + Google Ads SUMADOS en un solo gráfico, a
// pedido de Martín): Ubicación de los anuncios, Quién responde a los anuncios, Ubicación geográfica,
// Resultados por Horario y Recomendaciones. Reutilizan los mismos componentes que los reportes de
// cada plataforma (PlacementAnalysis, RegionAnalysis, HourlyPerformanceChart, RecommendationsPanel y
// DemoColumns de GoogleAdsBlocks.tsx), sin combos de Campaña / Grupo / Anuncio (no tiene sentido
// filtrar por campaña mezclando dos plataformas).
//
// "Resultados" = en Meta, la suma de todos los tipos de Resultado (mismo criterio que su reporte);
// en Google, las compras. Se suman como un único "resultado" — los insights y las recomendaciones
// lo saben y lo aclaran cuando importa. Todo asume que las dos plataformas usan la misma moneda
// (SummaryReport.tsx no muestra estos bloques si no es así).

import { useMemo } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { PlacementAnalysis } from "@/components/admin/reporting/PlacementAnalysis";
import { RegionAnalysis } from "@/components/admin/reporting/RegionAnalysis";
import { HourlyPerformanceChart } from "@/components/admin/reporting/HourlyPerformanceChart";
import { RecommendationsPanel } from "@/components/admin/reporting/RecommendationsPanel";
import {
  AGE_COLOR,
  AGE_ORDER,
  DEMO_COLOR,
  DemoColumns,
  GENDER_ORDER,
  type DemoTotals,
} from "@/components/admin/reporting/GoogleAdsBlocks";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { GoogleAdsBreakdown } from "@/lib/google-ads/filter";

/** Lo que usan estos bloques de /api/clients/[id]/investment-calendar (Meta). */
export interface MetaSegmentsData {
  placementSegments?: { placement: string; objectiveLeads: number[]; objectiveSpend: number[] }[];
  audienceSegments?: { gender: "mujeres" | "hombres"; ageRange: string; objectiveLeads: number[]; objectiveSpend: number[]; impressions: number }[];
  regionSegments?: { region: string; objectiveLeads: number[]; objectiveSpend: number[]; impressions: number; clicks: number }[];
  hourlyTotals?: { hour: number; spend: number; objectiveLeads: number[]; impressions: number; clicks: number }[];
}

/** Totales por plataforma ya calculados en SummaryReport.tsx (para las recomendaciones). */
export interface PlatformSummaryForRecommendations {
  plataforma: string;
  inversion: number;
  resultados: number;
  tipoDeResultado: string;
  facturacion: number;
}

const sum = (arr: number[]) => arr.reduce((acc, v) => acc + v, 0);
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Clave para unir la misma provincia entre plataformas: Meta devuelve "Buenos Aires" / "Cordoba" y
 * Google "Buenos Aires Province" / "Córdoba Province" / "Autonomous City of Buenos Aires" (nombres
 * de geo_target_constant). Se normaliza a minúsculas sin tildes ni "province"/"provincia de", y la
 * Ciudad de Buenos Aires a un solo nombre.
 */
function regionKey(name: string): string {
  const k = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bprovince\b|\bprovincia de\b|\bprovincia\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/autonomous city of buenos aires|ciudad autonoma de buenos aires|capital federal|^caba$/.test(k)) return "caba";
  return k;
}
function regionDisplay(name: string): string {
  if (regionKey(name) === "caba") return "Ciudad de Buenos Aires";
  return name.replace(/\s+Province$/i, "").trim();
}

export function SummaryConsolidatedBlocks({
  meta,
  google,
  currency,
  isCurrentMonth,
  clientId,
  showRecommendations,
  platformSummaries,
}: {
  meta: MetaSegmentsData | null;
  google: GoogleAdsBreakdown | null;
  currency: string;
  isCurrentMonth: boolean;
  clientId: string;
  showRecommendations: boolean;
  platformSummaries: PlatformSummaryForRecommendations[];
}) {
  // ── Ubicación de los anuncios: ubicaciones de Meta + redes de Google, con la plataforma en el nombre.
  const placements = useMemo(() => {
    const rows: { placement: string; objectiveLeads: number[]; objectiveSpend: number[]; byAd: Record<string, never> }[] = [];
    for (const p of meta?.placementSegments ?? []) {
      rows.push({ placement: `Meta · ${p.placement}`, objectiveLeads: [sum(p.objectiveLeads)], objectiveSpend: [sum(p.objectiveSpend)], byAd: {} });
    }
    const byNetwork = new Map<string, { spend: number; purchases: number }>();
    for (const n of google?.networks ?? []) {
      if (n.level !== "campaign") continue;
      const t = byNetwork.get(n.network) ?? { spend: 0, purchases: 0 };
      t.spend += n.spend;
      t.purchases += n.purchases;
      byNetwork.set(n.network, t);
    }
    for (const [network, t] of byNetwork) {
      rows.push({ placement: `Google · ${network}`, objectiveLeads: [t.purchases], objectiveSpend: [t.spend], byAd: {} });
    }
    return rows;
  }, [meta, google]);

  // ── Quién responde: edad y género por separado (Google no los cruza), sumando las dos plataformas.
  const audience = useMemo(() => {
    const add = (map: Map<string, DemoTotals>, segment: string, spend: number, purchases: number, impressions: number) => {
      const t = map.get(segment) ?? { segment, spend: 0, impressions: 0, purchases: 0 };
      t.spend += spend;
      t.purchases += purchases;
      t.impressions += impressions;
      map.set(segment, t);
    };
    const ages = new Map<string, DemoTotals>();
    const genders = new Map<string, DemoTotals>();
    for (const s of meta?.audienceSegments ?? []) {
      const leads = sum(s.objectiveLeads);
      const spend = sum(s.objectiveSpend);
      add(ages, s.ageRange, spend, leads, s.impressions);
      add(genders, s.gender === "mujeres" ? "Mujeres" : "Hombres", spend, leads, s.impressions);
    }
    for (const d of google?.demographics ?? []) {
      add(d.dimension === "edad" ? ages : genders, d.segment, d.spend, d.purchases, d.impressions);
    }
    const order = (list: string[]) => (a: DemoTotals, b: DemoTotals) => {
      const ia = list.indexOf(a.segment);
      const ib = list.indexOf(b.segment);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    };
    return {
      ages: [...ages.values()].filter((t) => t.spend > 0 || t.purchases > 0).sort(order(AGE_ORDER)),
      genders: [...genders.values()].filter((t) => t.spend > 0 || t.purchases > 0).sort(order(GENDER_ORDER)),
    };
  }, [meta, google]);

  // ── Ubicación geográfica: provincias unidas entre plataformas (ver regionKey).
  const regions = useMemo(() => {
    const by = new Map<string, { region: string; leads: number; spend: number; impressions: number; clicks: number }>();
    const add = (name: string, leads: number, spend: number, impressions: number, clicks: number, preferName: boolean) => {
      const key = regionKey(name);
      const t = by.get(key) ?? { region: regionDisplay(name), leads: 0, spend: 0, impressions: 0, clicks: 0 };
      if (preferName) t.region = regionDisplay(name); // el nombre de Meta (en español) manda
      t.leads += leads;
      t.spend += spend;
      t.impressions += impressions;
      t.clicks += clicks;
      by.set(key, t);
    };
    for (const r of google?.regions ?? []) {
      if (r.level === "campaign") add(r.region, r.purchases, r.spend, r.impressions, r.clicks, false);
    }
    for (const r of meta?.regionSegments ?? []) add(r.region, sum(r.objectiveLeads), sum(r.objectiveSpend), r.impressions, r.clicks, true);
    return [...by.values()].map((t) => ({
      region: t.region,
      objectiveLeads: [t.leads],
      objectiveSpend: [t.spend],
      reach: 0,
      impressions: t.impressions,
      clicks: t.clicks,
      byAd: {},
    }));
  }, [meta, google]);

  // ── Resultados por Horario: suma por hora del día.
  const hourly = useMemo(() => {
    const by = new Map<number, { spend: number; leads: number; impressions: number; clicks: number }>();
    const add = (hour: number, spend: number, leads: number, impressions: number, clicks: number) => {
      const t = by.get(hour) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0 };
      t.spend += spend;
      t.leads += leads;
      t.impressions += impressions;
      t.clicks += clicks;
      by.set(hour, t);
    };
    for (const h of meta?.hourlyTotals ?? []) add(h.hour, h.spend, sum(h.objectiveLeads), h.impressions, h.clicks);
    for (const h of google?.hours ?? []) if (h.level === "campaign") add(h.hour, h.spend, h.purchases, h.impressions, h.clicks);
    return [...by.entries()].map(([hour, t]) => ({
      hour,
      spend: t.spend,
      objectiveLeads: [t.leads],
      objectiveSpend: [t.spend],
      reach: 0,
      impressions: t.impressions,
      clicks: t.clicks,
      byAd: {},
    }));
  }, [meta, google]);

  const audienceInsight = useMemo(() => {
    if (audience.ages.length === 0 && audience.genders.length === 0) return null;
    const describe = (items: DemoTotals[]) => {
      const total = sum(items.map((t) => t.purchases));
      return items.map((t) => ({
        segmento: t.segment,
        resultados: round2(t.purchases),
        participacionResultados: total > 0 ? formatPercent(t.purchases / total) : "s/d",
        inversion: formatCurrency(Math.round(t.spend), currency),
        costoPorResultado: t.purchases > 0 ? formatCurrency(t.spend / t.purchases, currency, 2) : "s/d",
      }));
    };
    return { moneda: currency, mesCompleto: !isCurrentMonth, porEdad: describe(audience.ages), porGenero: describe(audience.genders) };
  }, [audience, currency, isCurrentMonth]);

  // ── Recomendaciones: totales por plataforma + extremos de cada bloque consolidado.
  const recommendationsMetrics = useMemo(() => {
    if (platformSummaries.length === 0) return null;
    const money = (v: number) => formatCurrency(Math.round(v), currency);
    type T = { name: string; spend: number; leads: number };
    const extremes = (items: T[]) => {
      const active = items.filter((t) => t.spend > 0 || t.leads > 0);
      if (active.length === 0) return null;
      const withCost = active.filter((t) => t.leads > 0).map((t) => ({ ...t, cost: t.spend / t.leads }));
      const top = [...active].sort((a, b) => b.spend - a.spend)[0]!;
      const best = withCost.length > 0 ? [...withCost].sort((a, b) => a.cost - b.cost)[0]! : null;
      const worst = withCost.length > 1 ? [...withCost].sort((a, b) => b.cost - a.cost)[0]! : null;
      return {
        mayorInversion: { nombre: top.name, inversion: money(top.spend) },
        masEficiente: best ? { nombre: best.name, costoPorResultado: formatCurrency(best.cost, currency, 2) } : null,
        menosEficiente: worst && worst.name !== best?.name ? { nombre: worst.name, costoPorResultado: formatCurrency(worst.cost, currency, 2) } : null,
        conInversionYSinResultados: active
          .filter((t) => t.leads === 0 && t.spend > 0)
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 3)
          .map((t) => ({ nombre: t.name, inversion: money(t.spend) })),
      };
    };
    const fromSeg = (rows: { objectiveLeads: number[]; objectiveSpend: number[] }[], name: (i: number) => string): T[] =>
      rows.map((r, i) => ({ name: name(i), spend: sum(r.objectiveSpend), leads: sum(r.objectiveLeads) }));
    const BANDS = [
      { label: "09:00 a 20:00", start: 9, end: 20 },
      { label: "21:00 a 23:00", start: 21, end: 23 },
      { label: "00:00 a 08:00", start: 0, end: 8 },
    ];
    return {
      porPlataforma: platformSummaries.map((p) => ({
        plataforma: p.plataforma,
        inversion: money(p.inversion),
        resultados: round2(p.resultados),
        tipoDeResultado: p.tipoDeResultado,
        costoPorResultado: p.resultados > 0 ? formatCurrency(p.inversion / p.resultados, currency, 2) : "s/d",
        facturacion: money(p.facturacion),
      })),
      ubicaciones: extremes(fromSeg(placements, (i) => placements[i]!.placement)),
      provincias: extremes(fromSeg(regions, (i) => regions[i]!.region)),
      edad: extremes(audience.ages.map((t) => ({ name: t.segment, spend: t.spend, leads: t.purchases }))),
      genero: extremes(audience.genders.map((t) => ({ name: t.segment, spend: t.spend, leads: t.purchases }))),
      horario: extremes(
        BANDS.map((b) => {
          const rows = hourly.filter((h) => h.hour >= b.start && h.hour <= b.end);
          return { name: b.label, spend: sum(rows.map((h) => h.spend)), leads: sum(rows.map((h) => sum(h.objectiveLeads))) };
        })
      ),
    };
  }, [platformSummaries, placements, regions, audience, hourly, currency]);

  const resultProps = {
    hideObjectiveSelect: true,
    hideAdFilters: true,
    objectiveOptions: [{ index: 0, label: "Resultados" }],
    currency,
    monthIsComplete: !isCurrentMonth,
    clientId,
    campaigns: [],
    ads: [],
  };

  return (
    <>
      <PlacementAnalysis
        {...resultProps}
        segments={placements.map((p) => ({ ...p, byAd: {} }))}
        resultsLabel="Resultados"
        costLabel="Costo por resultado"
        avgCostLabel="Costo por resultado promedio"
        rankingLabel="ubicación (Meta + Google)"
        emptyText="No hay inversión ni resultados por ubicación este período."
        insightChart="general-placements"
      />

      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="audiencia" subtitle="Resultados por rango etario y por género · Meta + Google" />
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {GENDER_ORDER.slice(0, 2).map((g) => (
              <span key={g} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DEMO_COLOR[g] }} /> {g}
              </span>
            ))}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {audience.ages.length === 0 && audience.genders.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay datos demográficos este período.</p>
          ) : (
            <>
              <DemoColumns
                title="Por rango etario"
                items={audience.ages}
                colorFor={() => AGE_COLOR}
                currency={currency}
                resultLabel="Resultados"
                costLabel="Costo por resultado"
              />
              <DemoColumns
                title="Por género"
                items={audience.genders}
                colorFor={(s) => DEMO_COLOR[s] ?? AGE_COLOR}
                currency={currency}
                resultLabel="Resultados"
                costLabel="Costo por resultado"
              />
              <p className="text-[11px] text-muted-foreground">
                Edad y género se muestran por separado porque Google Ads no los cruza. Google no incluye Performance Max, que no
                informa datos demográficos.
              </p>
            </>
          )}
          {audienceInsight && (
            <ChartInsightPanel
              chart="general-audience"
              metrics={audienceInsight}
              accentColor="hsl(var(--primary))"
              variant="card"
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}
        </CardContent>
      </Card>

      <RegionAnalysis
        {...resultProps}
        segments={regions}
        showReach={false}
        resultsLabel="Resultados"
        costLabel="Costo por resultado"
        avgCostLabel="Costo por resultado promedio"
        emptyText="No hay inversión ni resultados por provincia este mes."
        insightChart="general-regions"
      />

      <HourlyPerformanceChart
        {...resultProps}
        hourlyTotals={hourly}
        showReach={false}
        contactNoun="resultado"
        contactsLabel="Resultados"
        resultsLabel="Resultados"
        costLabel="Costo por resultado"
        insightChart="general-hourly"
      />

      {showRecommendations && recommendationsMetrics && (
        <RecommendationsPanel
          chart="general-recommendations"
          metrics={recommendationsMetrics}
          monthIsComplete={!isCurrentMonth}
          clientId={clientId}
        />
      )}
    </>
  );
}
