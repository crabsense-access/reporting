"use client";

// Bloques "Resultados" y "Facturación" del reporte de Google Ads. Cada uno tiene sus propios combos
// de Campaña / Grupo de anuncios / Anuncio (como los gráficos del reporte de Meta Ads, donde cada
// bloque se filtra por separado): los valores, la evolución diaria y el insight de IA se recalculan
// para el filtro elegido (ver lib/google-ads/filter.ts).

import { useCallback, useMemo, useState } from "react";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { DailyMiniBarChart } from "@/components/admin/reporting/DailyMiniBarChart";
import { GoogleAdsFilterSelects } from "@/components/admin/reporting/GoogleAdsFilterSelects";
import { InvestmentTrendChart } from "@/components/admin/reporting/InvestmentTrendChart";
import { LeadsByTypeTrendChart } from "@/components/admin/reporting/LeadsByTypeTrendChart";
import { CampaignHighlightPanel } from "@/components/admin/reporting/CampaignHighlightPanel";
import { PlacementAnalysis } from "@/components/admin/reporting/PlacementAnalysis";
import { RegionAnalysis } from "@/components/admin/reporting/RegionAnalysis";
import { HourlyPerformanceChart } from "@/components/admin/reporting/HourlyPerformanceChart";
import { RecommendationsPanel } from "@/components/admin/reporting/RecommendationsPanel";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import {
  applyGoogleAdsFilter,
  describeGoogleAdsFilter,
  EMPTY_GOOGLE_ADS_FILTER,
  entityTotalsForFilter,
  isFilterActive,
  type GoogleAdsFilter,
} from "@/lib/google-ads/filter";
import type { GoogleAdsMonthlySummary } from "@/lib/google-ads/monthlySummary";

export type GoogleAdsSummaryResponse = GoogleAdsMonthlySummary & {
  isCurrentMonth: boolean;
  from: string;
  to: string;
  /** Switch "Es un ecommerce" del Admin (ver isGoogleAdsEcommerce). Ausente = ecommerce. */
  isEcommerce?: boolean;
};

/** El cliente es ecommerce en Google Ads: se muestran Facturación, Ticket promedio y ROAS. */
export function summaryIsEcommerce(summary: GoogleAdsSummaryResponse | null): boolean {
  return summary?.isEcommerce !== false;
}

const PURCHASES_COLOR = "#0284c7"; // sky-600, mismo tono que el valor de Compras
// Mismos colores que el bloque "Facturación" de Meta Ads (ECOMMERCE_COLORS en InvestmentCalendar.tsx).
const BILLING_COLORS = { revenue: "#16a34a", ticket: "#0ea5e9", roas: "#f59e0b" };

const pct = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const roasFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const round2 = (v: number) => Math.round(v * 100) / 100;
const fmtRoas = (v: number | null) => (v === null ? "s/d" : `${roasFormat.format(v)}x`);
const fmtPct = (v: number | null) => (v === null ? "s/d" : `${pct.format(v * 100)}%`);
const ratio = (a: number, b: number) => (b === 0 ? null : a / b);
const dayLabel = (date: string) => format(parseISO(date), "d MMM", { locale: es });

/** Datos del bloque para el filtro elegido: totales + serie diaria de TODO el período (días sin datos en 0). */
function useFilteredData(summary: GoogleAdsSummaryResponse | null, filter: GoogleAdsFilter) {
  return useMemo(() => {
    if (!summary) return null;
    const data = applyGoogleAdsFilter(summary, summary.breakdown, filter);
    const series = eachDayOfInterval({ start: parseISO(summary.from), end: parseISO(summary.to) }).map((d) => {
      const date = format(d, "yyyy-MM-dd");
      const day = data.daily.get(date);
      return { date, spend: day?.spend ?? 0, purchases: day?.purchases ?? 0, revenue: day?.revenue ?? 0 };
    });
    return { ...data, series };
  }, [summary, filter]);
}

/** Encabezado del bloque: título a la izquierda, combos a la derecha (mismo layout que Meta Ads). */
function BlockHeader({
  block,
  summary,
  filter,
  onFilterChange,
}: {
  block: "googleAdsResultados" | "facturacion";
  summary: GoogleAdsSummaryResponse | null;
  filter: GoogleAdsFilter;
  onFilterChange: (filter: GoogleAdsFilter) => void;
}) {
  return (
    <CardHeader className="pb-2">
      <div className="flex flex-row flex-wrap items-start justify-between gap-3">
        <BlockTitle block={block} />
        <GoogleAdsFilterSelects breakdown={summary?.breakdown ?? null} value={filter} onChange={onFilterChange} />
      </div>
    </CardHeader>
  );
}

function campaignInsightRows(summary: GoogleAdsSummaryResponse, filter: GoogleAdsFilter, currency: string) {
  const { dimension, items } = entityTotalsForFilter(summary.breakdown, filter);
  const ecommerce = summaryIsEcommerce(summary);
  return {
    dimension,
    items: items.slice(0, 15).map((c) => ({
      nombre: c.name,
      inversion: formatCurrency(Math.round(c.spend), currency),
      impresiones: c.impressions,
      clicks: c.clicks,
      compras: round2(c.purchases),
      cpa: c.purchases > 0 ? formatCurrency(Math.round(c.spend / c.purchases), currency) : "s/d",
      ...(ecommerce
        ? { facturacion: formatCurrency(Math.round(c.revenue), currency), roas: fmtRoas(ratio(c.revenue, c.spend)) }
        : {}),
      tasaConversion: fmtPct(ratio(c.purchases, c.clicks)),
    })),
  };
}

// ─────────────────────────────── Resultados ───────────────────────────────

export function GoogleAdsResultsBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const [filter, setFilter] = useState<GoogleAdsFilter>(EMPTY_GOOGLE_ADS_FILTER);
  const data = useFilteredData(summary, filter);
  const currency = summary?.currency ?? "ARS";
  const convRate = data ? ratio(data.purchases, data.clicks) : null;

  const insightMetrics = useMemo(() => {
    if (!summary || !data || (data.spend === 0 && data.impressions === 0)) return null;
    const withPurchases = data.series.filter((d) => d.purchases > 0);
    const bestDay = withPurchases.reduce<(typeof withPurchases)[number] | null>(
      (best, d) => (!best || d.purchases > best.purchases ? d : best),
      null
    );
    const entities = campaignInsightRows(summary, filter, currency);
    return {
      moneda: currency,
      mesCompleto: !summary.isCurrentMonth,
      filtro: describeGoogleAdsFilter(summary.breakdown, filter) ?? "Toda la cuenta",
      compras: round2(data.purchases),
      tasaConversion: fmtPct(convRate),
      impresiones: data.impressions,
      clicks: data.clicks,
      ctr: fmtPct(ratio(data.clicks, data.impressions)),
      alcance: "No informado por Google Ads",
      inversion: formatCurrency(Math.round(data.spend), currency),
      cpa: data.purchases > 0 ? formatCurrency(Math.round(data.spend / data.purchases), currency) : "s/d",
      ...(summaryIsEcommerce(summary)
        ? { facturacion: formatCurrency(Math.round(data.revenue), currency), roas: fmtRoas(ratio(data.revenue, data.spend)) }
        : {}),
      diasConCompras: withPurchases.length,
      mejorDiaCompras: bestDay ? { fecha: dayLabel(bestDay.date), compras: round2(bestDay.purchases) } : null,
      comprasPorDia: data.series.map((d) => ({ fecha: d.date, compras: round2(d.purchases) })),
      desglosePor: entities.dimension,
      desglose: entities.items,
    };
  }, [summary, data, filter, currency, convRate]);

  return (
    <Card>
      <BlockHeader block="googleAdsResultados" summary={summary} filter={filter} onFilterChange={setFilter} />
      <CardContent className="flex flex-col gap-2">
        {data && isFilterActive(filter) && data.spend === 0 && data.purchases === 0 && data.impressions === 0 ? (
          <p className="text-xs text-muted-foreground">No hay datos para el filtro elegido este mes.</p>
        ) : (
          <>
            <ResultCard
              label="Compras"
              value={data && formatNumber(round2(data.purchases))}
              chart={
                <DailyMiniBarChart
                  title="Compras por día"
                  days={(data?.series ?? []).map((d) => ({ date: d.date, value: d.purchases }))}
                  color={PURCHASES_COLOR}
                  formatValue={(v) => formatNumber(round2(v))}
                />
              }
            />

            <div className="flex flex-col gap-3 pt-6">
              <span className="text-lg font-bold text-foreground">Performance de Resultados</span>
              <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                <PerformanceCard label="% Conversión" value={data && fmtPct(convRate)} note="Compras / clicks" />
                <PerformanceCard label="Impresiones" value={data && formatNumber(data.impressions)} />
                <PerformanceCard label="Clicks" value={data && formatNumber(data.clicks)} />
                <PerformanceCard label="Alcance" value={data && "N/D"} note="Google Ads no informa alcance para todas las campañas" />
              </div>
            </div>

            {insightMetrics && (
              <div className="pt-6">
                <ChartInsightPanel
                  chart="google-ads-results"
                  metrics={insightMetrics}
                  accentColor="hsl(var(--primary))"
                  variant="card"
                  bordered={false}
                  monthIsComplete={!summary!.isCurrentMonth}
                  clientId={clientId}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── Facturación ───────────────────────────────

export function GoogleAdsBillingBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const [filter, setFilter] = useState<GoogleAdsFilter>(EMPTY_GOOGLE_ADS_FILTER);
  const data = useFilteredData(summary, filter);
  const currency = summary?.currency ?? "ARS";
  const ticket = data ? ratio(data.revenue, data.purchases) : null;
  const roas = data ? ratio(data.revenue, data.spend) : null;
  const money = (v: number | null) => (v === null ? "s/d" : formatCurrency(Math.round(v), currency));

  const cards = [
    {
      key: "revenue",
      label: "Facturación",
      value: data && money(data.revenue),
      detail: data ? `${formatNumber(round2(data.purchases))} compras` : "",
      color: BILLING_COLORS.revenue,
      days: (data?.series ?? []).map((d) => ({ date: d.date, value: d.revenue })),
      formatValue: (v: number) => formatCurrency(Math.round(v), currency),
      title: "Facturación por día",
    },
    {
      key: "ticket",
      label: "Ticket promedio",
      value: data && money(ticket),
      detail: "Facturación / compras",
      color: BILLING_COLORS.ticket,
      days: (data?.series ?? []).map((d) => ({ date: d.date, value: d.purchases > 0 ? d.revenue / d.purchases : 0 })),
      formatValue: (v: number) => formatCurrency(Math.round(v), currency),
      title: "Ticket promedio por día",
    },
    {
      key: "roas",
      label: "ROAS",
      value: data && fmtRoas(roas),
      detail: "Facturación / inversión",
      color: BILLING_COLORS.roas,
      days: (data?.series ?? []).map((d) => ({ date: d.date, value: d.spend > 0 ? d.revenue / d.spend : 0 })),
      formatValue: (v: number) => fmtRoas(v),
      title: "ROAS por día",
    },
  ];

  const insightMetrics = useMemo(() => {
    if (!summary || !data || (data.purchases === 0 && data.revenue === 0)) return null;
    const withRevenue = data.series.filter((d) => d.revenue > 0);
    const withRoas = withRevenue.filter((d) => d.spend > 0);
    const roasOf = (d: (typeof withRoas)[number]) => d.revenue / d.spend;
    const bestRevenueDay = withRevenue.reduce<(typeof withRevenue)[number] | null>((b, d) => (!b || d.revenue > b.revenue ? d : b), null);
    const bestRoasDay = withRoas.reduce<(typeof withRoas)[number] | null>((b, d) => (!b || roasOf(d) > roasOf(b) ? d : b), null);
    const worstRoasDay = withRoas.reduce<(typeof withRoas)[number] | null>((b, d) => (!b || roasOf(d) < roasOf(b) ? d : b), null);
    const entities = campaignInsightRows(summary, filter, currency);
    return {
      moneda: currency,
      mesCompleto: !summary.isCurrentMonth,
      filtro: describeGoogleAdsFilter(summary.breakdown, filter) ?? "Toda la cuenta",
      facturacion: formatCurrency(Math.round(data.revenue), currency),
      compras: round2(data.purchases),
      ticketPromedio: ticket !== null ? formatCurrency(Math.round(ticket), currency) : "s/d",
      inversion: formatCurrency(Math.round(data.spend), currency),
      roas: fmtRoas(roas),
      diasConVentas: withRevenue.length,
      mejorDiaFacturacion: bestRevenueDay
        ? { fecha: dayLabel(bestRevenueDay.date), facturacion: formatCurrency(Math.round(bestRevenueDay.revenue), currency) }
        : null,
      mejorDiaRoas: bestRoasDay ? { fecha: dayLabel(bestRoasDay.date), roas: fmtRoas(roasOf(bestRoasDay)) } : null,
      peorDiaRoas: worstRoasDay ? { fecha: dayLabel(worstRoasDay.date), roas: fmtRoas(roasOf(worstRoasDay)) } : null,
      porDia: data.series.map((d) => ({
        fecha: d.date,
        inversion: Math.round(d.spend),
        compras: round2(d.purchases),
        facturacion: Math.round(d.revenue),
      })),
      desglosePor: entities.dimension,
      desglose: entities.items,
    };
  }, [summary, data, filter, currency, ticket, roas]);

  return (
    <Card>
      <BlockHeader block="facturacion" summary={summary} filter={filter} onFilterChange={setFilter} />
      <CardContent className="flex flex-col gap-3">
        {data && data.purchases === 0 && data.revenue === 0 ? (
          <p className="text-xs text-muted-foreground">
            {isFilterActive(filter) ? "No hay compras para el filtro elegido este mes." : "Google Ads no reportó compras este mes."}
          </p>
        ) : (
          <>
            <div className="grid gap-6 md:grid-cols-3">
              {cards.map((card) => (
                <div key={card.key} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-muted-foreground">{card.label}</span>
                    {card.value == null ? (
                      <span className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
                    ) : (
                      <span className="mt-1 text-2xl font-semibold leading-tight" style={{ color: card.color }}>
                        {card.value}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{card.detail}</span>
                  </div>
                  {card.value == null ? (
                    <div className="h-12 animate-pulse rounded bg-muted" />
                  ) : (
                    <DailyMiniBarChart days={card.days} color={card.color} formatValue={card.formatValue} title={card.title} />
                  )}
                </div>
              ))}
            </div>
            {insightMetrics && (
              <div className="pt-3">
                <ChartInsightPanel
                  chart="google-ads-billing"
                  metrics={insightMetrics}
                  accentColor="hsl(var(--primary))"
                  variant="card"
                  bordered={false}
                  monthIsComplete={!summary!.isCurrentMonth}
                  clientId={clientId}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────── Inversión y rendimiento por día ───────────────────────

/**
 * Mismo bloque "Inversión y rendimiento por día" que el reporte de Meta Ads (InvestmentTrendChart):
 * barras de Compras por día + línea de Costo por compra, con promedios, día más caro/barato,
 * combos de Campaña / Grupo de anuncios / Anuncio e insight de IA. Google tiene un único tipo de
 * resultado (Compras), así que no lleva el combo de tipo.
 */
export function GoogleAdsTrendBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  // Filas del desglose indexadas por nivel|id|fecha, para resolver cada día del filtro elegido.
  const rowsByKey = useMemo(() => {
    const map = new Map<string, { spend: number; purchases: number }>();
    for (const r of summary?.breakdown.rows ?? []) map.set(`${r.level}|${r.id}|${r.date}`, { spend: r.spend, purchases: r.purchases });
    return map;
  }, [summary]);

  const resolveFilteredDay = useCallback(
    (date: string, sel: { campaignId: string | null; adsetId: string | null; adId: string | null }) => {
      // Manda el nivel más específico elegido (mismo criterio que applyGoogleAdsFilter).
      const key =
        sel.adId !== null ? `ad|${sel.adId}` : sel.adsetId !== null ? `adGroup|${sel.adsetId}` : `campaign|${sel.campaignId}`;
      const row = rowsByKey.get(`${key}|${date}`);
      return row ? { spend: row.spend, objectiveLeads: [row.purchases], objectiveSpend: [row.spend] } : null;
    },
    [rowsByKey]
  );

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="inversionPorDia" />
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <InvestmentTrendChart
      days={summary.daily.map((d) => ({
        date: d.date,
        spend: d.spend,
        objectiveLeads: [d.purchases],
        objectiveSpend: [d.spend],
        byAd: {},
      }))}
      currency={summary.currency}
      month={parseISO(summary.from)}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
      objectiveOptions={[{ index: 0, label: "Compras" }]}
      campaigns={summary.breakdown.campaigns}
      adsets={summary.breakdown.adGroups}
      ads={summary.breakdown.ads.map((a) => ({ id: a.id, name: a.name, campaignId: a.campaignId, adsetId: a.adGroupId }))}
      resolveFilteredDay={resolveFilteredDay}
      insightChart="google-ads-investment-trend"
      resultNoun="compra"
      hideObjectiveSelect
    />
  );
}

// ─────────────────────────── Resultados por campaña ───────────────────────────

/** Máximo de campañas con color propio (la paleta de objectiveColor tiene 8); el resto va a "Otras campañas". */
const MAX_CAMPAIGN_SERIES = 7;

/**
 * Mismo bloque "Resultados por campaña" que el reporte de Meta Ads (LeadsByTypeTrendChart), pero
 * cada "tipo" es una campaña: barras apiladas de compras por campaña y por día + línea de costo
 * por compra de la campaña elegida (o de todas), con insight de IA por campaña. Como en Meta, sólo
 * entran las campañas con al menos 1 compra en el mes.
 */
export function GoogleAdsResultsByCampaignBlock({
  summary,
  clientId,
}: {
  summary: GoogleAdsSummaryResponse | null;
  clientId: string;
}) {
  const chartData = useMemo(() => {
    if (!summary) return null;
    const { breakdown } = summary;

    // Compras del mes por campaña, para elegir y ordenar las series.
    const purchasesByCampaign = new Map<string, number>();
    for (const r of breakdown.rows) {
      if (r.level === "campaign") purchasesByCampaign.set(r.id, (purchasesByCampaign.get(r.id) ?? 0) + r.purchases);
    }
    const withPurchases = breakdown.campaigns
      .filter((c) => (purchasesByCampaign.get(c.id) ?? 0) > 0)
      .sort((a, b) => (purchasesByCampaign.get(b.id) ?? 0) - (purchasesByCampaign.get(a.id) ?? 0));
    const needsOther = withPurchases.length > MAX_CAMPAIGN_SERIES + 1;
    const own = needsOther ? withPurchases.slice(0, MAX_CAMPAIGN_SERIES) : withPurchases;
    const indexByCampaign = new Map<string, number>(own.map((c, i) => [c.id, i]));
    const otherIndex = needsOther ? own.length : null;
    if (needsOther) for (const c of withPurchases.slice(MAX_CAMPAIGN_SERIES)) indexByCampaign.set(c.id, otherIndex!);
    const seriesCount = own.length + (needsOther ? 1 : 0);

    // Compras y gasto por día y por serie (desde las filas de nivel campaña).
    const byDate = new Map<string, { leads: number[]; spend: number[] }>();
    for (const r of breakdown.rows) {
      if (r.level !== "campaign") continue;
      const idx = indexByCampaign.get(r.id);
      if (idx === undefined) continue;
      const day = byDate.get(r.date) ?? {
        leads: Array.from({ length: seriesCount }, () => 0),
        spend: Array.from({ length: seriesCount }, () => 0),
      };
      day.leads[idx] = (day.leads[idx] ?? 0) + r.purchases;
      day.spend[idx] = (day.spend[idx] ?? 0) + r.spend;
      byDate.set(r.date, day);
    }

    return {
      options: [
        ...own.map((c, i) => ({ index: i, label: c.name })),
        ...(needsOther ? [{ index: otherIndex!, label: "Otras campañas" }] : []),
      ],
      days: summary.daily.map((d) => {
        const day = byDate.get(d.date);
        return {
          date: d.date,
          spend: d.spend,
          objectiveLeads: day?.leads ?? Array.from({ length: seriesCount }, () => 0),
          objectiveSpend: day?.spend ?? Array.from({ length: seriesCount }, () => 0),
          byAd: {},
        };
      }),
    };
  }, [summary]);

  if (!summary || !chartData) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="resultadosPorTipo" />
        </CardHeader>
        <CardContent>
          <div className="h-64 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (chartData.options.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="resultadosPorTipo" subtitle="Compras y costo por compra por campaña" />
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Ninguna campaña registró compras este mes.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <LeadsByTypeTrendChart
      days={chartData.days}
      currency={summary.currency}
      objectiveOptions={chartData.options}
      month={parseISO(summary.from)}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
      campaigns={[]}
      ads={[]}
      hideAdFilters
      typeSelectLabel="Campaña"
      allTypesLabel="Todas las campañas"
      totalLabel="Total compras"
      costLabel="Costo/compra"
      insightChart="google-ads-results-by-campaign"
      subtitle="Compras y costo por compra por campaña"
    />
  );
}

// ─────────────────────────────── Análisis de campañas ───────────────────────────────

/** Ancho fijo por columna (Inversión, % Inv., Compras, Costo por compra, ROAS) — mismo criterio que CampaignAnalysis.tsx. */
const CAMPAIGN_GRID_COLUMNS = "92px 56px 60px 96px 56px";
const NO_PURCHASES_COLOR = "#94a3b8"; // slate-400

/**
 * Mismo bloque "Análisis de campañas" que el reporte de Meta Ads (CampaignAnalysis.tsx), con datos
 * reales de Google Ads: ranking de campañas por inversión (barra + tabla con Inversión, % Inv.,
 * Compras, Costo por compra y ROAS), estado Activa/Pausada, y debajo el hallazgo de la campaña con
 * menor y mayor costo por compra (elegidas acá por código, Claude sólo redacta). Cada campaña usa el
 * mismo color que en "Resultados por campaña"; las que no tuvieron compras, gris.
 */
export function GoogleAdsCampaignAnalysisBlock({
  summary,
  clientId,
}: {
  summary: GoogleAdsSummaryResponse | null;
  clientId: string;
}) {
  const data = useMemo(() => {
    if (!summary) return null;
    const totals = new Map<string, { spend: number; purchases: number; revenue: number }>();
    for (const r of summary.breakdown.rows) {
      if (r.level !== "campaign") continue;
      const t = totals.get(r.id) ?? { spend: 0, purchases: 0, revenue: 0 };
      t.spend += r.spend;
      t.purchases += r.purchases;
      t.revenue += r.revenue;
      totals.set(r.id, t);
    }
    const campaigns = summary.breakdown.campaigns.map((c) => {
      const t = totals.get(c.id) ?? { spend: 0, purchases: 0, revenue: 0 };
      return {
        ...c,
        ...t,
        cpa: t.purchases > 0 ? t.spend / t.purchases : null,
        roas: t.spend > 0 && t.revenue > 0 ? t.revenue / t.spend : null,
      };
    });

    // Colores: mismo índice que en "Resultados por campaña" (orden por compras, 7 + "Otras").
    const byPurchases = campaigns.filter((c) => c.purchases > 0).sort((a, b) => b.purchases - a.purchases);
    const needsOther = byPurchases.length > MAX_CAMPAIGN_SERIES + 1;
    const colorById = new Map<string, string>(
      byPurchases.map((c, i) => [c.id, objectiveColor(needsOther && i >= MAX_CAMPAIGN_SERIES ? MAX_CAMPAIGN_SERIES : i)])
    );

    const sorted = [...campaigns].sort((a, b) => b.spend - a.spend);
    const withCpa = campaigns.filter((c): c is (typeof campaigns)[number] & { cpa: number } => c.cpa !== null);
    const best = withCpa.length > 1 ? withCpa.reduce((b, c) => (c.cpa < b.cpa ? c : b)) : null;
    const worst = withCpa.length > 1 ? withCpa.reduce((b, c) => (c.cpa > b.cpa ? c : b)) : null;
    return { sorted, colorById, best: best && worst && best.id !== worst.id ? best : null, worst: best && worst && best.id !== worst.id ? worst : null };
  }, [summary]);

  if (!summary || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="analisisCampanas" />
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  const currency = summary.currency;
  const totalSpend = data.sorted.reduce((sum, c) => sum + c.spend, 0);
  const maxSpend = Math.max(...data.sorted.map((c) => c.spend), 1);
  const colorOf = (id: string) => data.colorById.get(id) ?? NO_PURCHASES_COLOR;
  // Sin "Es un ecommerce" en el Admin, la columna ROAS no se muestra.
  const ecommerce = summaryIsEcommerce(summary);
  const gridColumns = ecommerce ? CAMPAIGN_GRID_COLUMNS : CAMPAIGN_GRID_COLUMNS.split(" ").slice(0, 4).join(" ");

  const toInput = (c: NonNullable<typeof data.best>) => ({
    nombre: c.name,
    estado: c.status === "pausada" ? "Pausada" : c.status === "eliminada" ? "Eliminada" : "Activa",
    compras: formatNumber(round2(c.purchases)),
    inversion: formatCurrency(c.spend, currency),
    costoPorCompra: formatCurrency(c.cpa!, currency, 2),
    ...(ecommerce ? { facturacion: formatCurrency(Math.round(c.revenue), currency), roas: fmtRoas(c.roas) } : {}),
  });
  const highlightMetrics = data.best && data.worst ? { mejor: toInput(data.best), peor: toInput(data.worst) } : null;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <BlockTitle block="analisisCampanas" />
        <span className="text-xs text-muted-foreground">Ranking del mes por campaña individual</span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-4">
        {data.sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hubo campañas con inversión este mes.</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center gap-4">
              <span className="min-w-0 flex-1" />
              <div
                className="grid shrink-0 gap-x-4 text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ gridTemplateColumns: gridColumns }}
              >
                <span>Inversión</span>
                <span>% Inv.</span>
                <span>Compras</span>
                <span>Costo por compra</span>
                {ecommerce && <span>ROAS</span>}
              </div>
            </div>

            {data.sorted.map((c) => {
              const widthPct = Math.max(4, Math.round((c.spend / maxSpend) * 100));
              const share = totalSpend > 0 ? c.spend / totalSpend : 0;
              const active = c.status !== "pausada" && c.status !== "eliminada";
              return (
                <div key={c.id} className="flex items-center gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(c.id) }} />
                      <span className="truncate">{c.name}</span>
                      {c.status && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            active ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {c.status === "activa" ? "Activa" : c.status === "pausada" ? "Pausada" : "Eliminada"}
                        </span>
                      )}
                    </span>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${widthPct}%`, backgroundColor: colorOf(c.id), opacity: active ? 1 : 0.55 }}
                      />
                    </div>
                  </div>
                  <div className="grid shrink-0 gap-x-4 text-right text-xs tabular-nums" style={{ gridTemplateColumns: gridColumns }}>
                    <span className="whitespace-nowrap text-muted-foreground">{formatCurrency(c.spend, currency)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatPercent(share)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatNumber(round2(c.purchases))}</span>
                    <span className="whitespace-nowrap text-muted-foreground">
                      {c.cpa !== null ? formatCurrency(c.cpa, currency, 2) : "s/d"}
                    </span>
                    {ecommerce && <span className="whitespace-nowrap text-muted-foreground">{fmtRoas(c.roas)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {highlightMetrics && (
          <CampaignHighlightPanel
            chart="google-ads-campaign-highlights"
            metrics={highlightMetrics}
            dotColorForCampaign={(nombre) => {
              const c = data.sorted.find((x) => x.name === nombre);
              return c ? colorOf(c.id) : undefined;
            }}
            badges={{ mejor: "Menor costo por compra", peor: "Oportunidad de mejora" }}
            monthIsComplete={!summary.isCurrentMonth}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────── Ubicación de los anuncios ───────────────────────────

/**
 * Mismo bloque "Ubicación de los anuncios" que el reporte de Meta Ads (PlacementAnalysis), donde
 * cada ubicación es una RED de Google Ads (Búsqueda de Google, Socios de búsqueda, Display,
 * YouTube, Performance Max…): ranking por inversión coloreado por eficiencia del costo por compra
 * vs. el promedio, con filtros de Campaña / Grupo / Anuncio e insight de IA.
 */
export function GoogleAdsPlacementBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const networks = useMemo(() => summary?.breakdown.networks ?? [], [summary]);

  // Sin filtro: totales por red a nivel campaña (incluye Performance Max, que no tiene grupos ni anuncios).
  const segments = useMemo(() => {
    const byNetwork = new Map<string, { spend: number; purchases: number }>();
    for (const n of networks) {
      if (n.level !== "campaign") continue;
      const t = byNetwork.get(n.network) ?? { spend: 0, purchases: 0 };
      t.spend += n.spend;
      t.purchases += n.purchases;
      byNetwork.set(n.network, t);
    }
    return [...byNetwork.entries()].map(([placement, t]) => ({
      placement,
      objectiveLeads: [t.purchases],
      objectiveSpend: [t.spend],
      byAd: {},
    }));
  }, [networks]);

  const resolveFilteredSegment = useCallback(
    (placement: string, sel: { campaignId: string | null; adsetId: string | null; adId: string | null }) => {
      // Manda el nivel más específico elegido (mismo criterio que applyGoogleAdsFilter).
      const level = sel.adId !== null ? "ad" : sel.adsetId !== null ? "adGroup" : "campaign";
      const id = sel.adId ?? sel.adsetId ?? sel.campaignId;
      const match = networks.filter((n) => n.level === level && n.id === id && n.network === placement);
      if (match.length === 0) return null;
      const spend = match.reduce((sum, n) => sum + n.spend, 0);
      const purchases = match.reduce((sum, n) => sum + n.purchases, 0);
      return { objectiveLeads: [purchases], objectiveSpend: [spend] };
    },
    [networks]
  );

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="ubicaciones" />
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <PlacementAnalysis
      segments={segments}
      objectiveOptions={[{ index: 0, label: "Compras" }]}
      currency={summary.currency}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
      campaigns={summary.breakdown.campaigns}
      adsets={summary.breakdown.adGroups}
      ads={summary.breakdown.ads.map((a) => ({ id: a.id, name: a.name, campaignId: a.campaignId, adsetId: a.adGroupId }))}
      resolveFilteredSegment={resolveFilteredSegment}
      hideObjectiveSelect
      resultsLabel="Compras"
      costLabel="Costo por compra"
      avgCostLabel="Costo por compra promedio"
      rankingLabel="red"
      emptyText="No hay inversión ni compras por red este período."
      insightChart="google-ads-placements"
    />
  );
}

// ─────────────────────────── Ubicación geográfica ───────────────────────────

/**
 * Mismo bloque "Ubicación geográfica" que el reporte de Meta Ads (RegionAnalysis): ranking de
 * provincias/regiones por inversión, coloreado por eficiencia del costo por compra, con
 * Impresiones, Clicks, Inversión, % Inv., Compras y Costo por compra, filtros e insight de IA. Sin
 * Alcance (Google no lo informa). Google da la geografía por campaña y por grupo de anuncios, no por
 * anuncio: con un anuncio elegido se usan los datos de su grupo.
 */
export function GoogleAdsRegionBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const regions = useMemo(() => summary?.breakdown.regions ?? [], [summary]);
  const ads = useMemo(() => summary?.breakdown.ads ?? [], [summary]);

  // Sin filtro: totales por región a nivel campaña (incluye Performance Max).
  const segments = useMemo(() => {
    const byRegion = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number }>();
    for (const r of regions) {
      if (r.level !== "campaign") continue;
      const t = byRegion.get(r.region) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.purchases += r.purchases;
      byRegion.set(r.region, t);
    }
    return [...byRegion.entries()].map(([region, t]) => ({
      region,
      objectiveLeads: [t.purchases],
      objectiveSpend: [t.spend],
      reach: 0,
      impressions: t.impressions,
      clicks: t.clicks,
      byAd: {},
    }));
  }, [regions]);

  const resolveFilteredSegment = useCallback(
    (region: string, sel: { campaignId: string | null; adsetId: string | null; adId: string | null }) => {
      // Un anuncio elegido → su grupo de anuncios (la geografía no se informa por anuncio).
      const adGroupId = sel.adId !== null ? (ads.find((a) => a.id === sel.adId)?.adGroupId ?? null) : sel.adsetId;
      const level = adGroupId !== null ? "adGroup" : "campaign";
      const id = adGroupId ?? sel.campaignId;
      const match = regions.filter((r) => r.level === level && r.id === id && r.region === region);
      if (match.length === 0) return null;
      const sum = (k: "spend" | "impressions" | "clicks" | "purchases") => match.reduce((acc, r) => acc + r[k], 0);
      return {
        objectiveLeads: [sum("purchases")],
        objectiveSpend: [sum("spend")],
        reach: 0,
        impressions: sum("impressions"),
        clicks: sum("clicks"),
      };
    },
    [regions, ads]
  );

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="regiones" />
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <RegionAnalysis
      segments={segments}
      objectiveOptions={[{ index: 0, label: "Compras" }]}
      currency={summary.currency}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
      campaigns={summary.breakdown.campaigns}
      adsets={summary.breakdown.adGroups}
      ads={summary.breakdown.ads.map((a) => ({ id: a.id, name: a.name, campaignId: a.campaignId, adsetId: a.adGroupId }))}
      resolveFilteredSegment={resolveFilteredSegment}
      hideObjectiveSelect
      showReach={false}
      resultsLabel="Compras"
      costLabel="Costo por compra"
      avgCostLabel="Costo por compra promedio"
      emptyText="No hay inversión ni compras por región este mes."
      insightChart="google-ads-regions"
    />
  );
}

// ─────────────────────────── Resultados por Horario ───────────────────────────

/**
 * Mismo bloque "Resultados por Horario" que el reporte de Meta Ads (HourlyPerformanceChart):
 * inversión por hora del día (barras, en rojo las horas con costo por compra muy por encima del
 * promedio) + costo por compra por hora (línea), tabla por franja horaria, filtros e insight de IA.
 * Horas en el huso horario de la cuenta de Google Ads. Sin Alcance (Google no lo informa).
 */
export function GoogleAdsHourlyBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const hourRows = useMemo(() => summary?.breakdown.hours ?? [], [summary]);

  // Sin filtro: totales por hora a nivel campaña (incluye Performance Max).
  const hourlyTotals = useMemo(() => {
    const byHour = new Map<number, { spend: number; impressions: number; clicks: number; purchases: number }>();
    for (const h of hourRows) {
      if (h.level !== "campaign") continue;
      const t = byHour.get(h.hour) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0 };
      t.spend += h.spend;
      t.impressions += h.impressions;
      t.clicks += h.clicks;
      t.purchases += h.purchases;
      byHour.set(h.hour, t);
    }
    return [...byHour.entries()].map(([hour, t]) => ({
      hour,
      spend: t.spend,
      objectiveLeads: [t.purchases],
      objectiveSpend: [t.spend],
      reach: 0,
      impressions: t.impressions,
      clicks: t.clicks,
      byAd: {},
    }));
  }, [hourRows]);

  const resolveFilteredHour = useCallback(
    (hour: number, sel: { campaignId: string | null; adsetId: string | null; adId: string | null }) => {
      // Manda el nivel más específico elegido (mismo criterio que applyGoogleAdsFilter).
      const level = sel.adId !== null ? "ad" : sel.adsetId !== null ? "adGroup" : "campaign";
      const id = sel.adId ?? sel.adsetId ?? sel.campaignId;
      const match = hourRows.filter((h) => h.level === level && h.id === id && h.hour === hour);
      if (match.length === 0) return null;
      const sum = (k: "spend" | "impressions" | "clicks" | "purchases") => match.reduce((acc, h) => acc + h[k], 0);
      return {
        spend: sum("spend"),
        objectiveLeads: [sum("purchases")],
        objectiveSpend: [sum("spend")],
        reach: 0,
        impressions: sum("impressions"),
        clicks: sum("clicks"),
      };
    },
    [hourRows]
  );

  if (!summary) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="horario" />
        </CardHeader>
        <CardContent>
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <HourlyPerformanceChart
      hourlyTotals={hourlyTotals}
      currency={summary.currency}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
      objectiveOptions={[{ index: 0, label: "Compras" }]}
      campaigns={summary.breakdown.campaigns}
      adsets={summary.breakdown.adGroups}
      ads={summary.breakdown.ads.map((a) => ({ id: a.id, name: a.name, campaignId: a.campaignId, adsetId: a.adGroupId }))}
      resolveFilteredHour={resolveFilteredHour}
      hideObjectiveSelect
      showReach={false}
      contactNoun="compra"
      contactsLabel="Compras"
      resultsLabel="Compras"
      costLabel="Costo por compra"
      insightChart="google-ads-hourly"
    />
  );
}

// ─────────────────────────── Quién responde a los anuncios ───────────────────────────

const AGE_ORDER = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Sin determinar"];
const GENDER_ORDER = ["Mujeres", "Hombres", "Sin determinar"];
// Mismos colores de género que AudienceAnalysis.tsx (Meta Ads); edad con el acento ámbar de los otros gráficos.
const DEMO_COLOR: Record<string, string> = { Mujeres: "#db2777", Hombres: "#2563eb", "Sin determinar": "#94a3b8" };
const AGE_COLOR = "#d97706";
const DEMO_BAR_HEIGHT = 112; // px, mismo alto que el área de barras de AudienceAnalysis.tsx

interface DemoTotals {
  segment: string;
  spend: number;
  impressions: number;
  purchases: number;
}

/**
 * Mismo bloque "Quién responde a los anuncios" que el reporte de Meta Ads (AudienceAnalysis.tsx),
 * con una diferencia obligada: la API de Google Ads no cruza edad × género, así que se muestran por
 * separado (compras por rango etario y compras por género), cada columna con su recuadro de
 * Compras / Costo por compra / Inversión / Impresiones, más el insight de IA. Google informa la
 * demografía por grupo de anuncios (no por anuncio) y Performance Max no la informa: con un anuncio
 * elegido se muestran los datos de su grupo de anuncios.
 */
export function GoogleAdsAudienceBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const [filter, setFilter] = useState<GoogleAdsFilter>(EMPTY_GOOGLE_ADS_FILTER);
  const currency = summary?.currency ?? "ARS";

  const data = useMemo(() => {
    if (!summary) return null;
    const rows = summary.breakdown.demographics ?? [];
    // Un anuncio elegido → su grupo de anuncios (la demografía no se informa por anuncio).
    const adGroupForAd = filter.adId !== null ? summary.breakdown.ads.find((a) => a.id === filter.adId)?.adGroupId ?? null : null;
    const adGroupId = adGroupForAd ?? filter.adGroupId;
    const scoped = rows.filter(
      (r) => (adGroupId === null || r.adGroupId === adGroupId) && (filter.campaignId === null || r.campaignId === filter.campaignId)
    );
    const aggregate = (dimension: "edad" | "genero", order: string[]) => {
      const by = new Map<string, DemoTotals>();
      for (const r of scoped) {
        if (r.dimension !== dimension) continue;
        const t = by.get(r.segment) ?? { segment: r.segment, spend: 0, impressions: 0, purchases: 0 };
        t.spend += r.spend;
        t.impressions += r.impressions;
        t.purchases += r.purchases;
        by.set(r.segment, t);
      }
      return [...by.values()].sort((a, b) => order.indexOf(a.segment) - order.indexOf(b.segment));
    };
    return { ages: aggregate("edad", AGE_ORDER), genders: aggregate("genero", GENDER_ORDER), usesAdGroupOfAd: adGroupForAd !== null };
  }, [summary, filter]);

  const insightMetrics = useMemo(() => {
    if (!summary || !data || (data.ages.length === 0 && data.genders.length === 0)) return null;
    const describe = (items: DemoTotals[]) => {
      const total = items.reduce((sum, t) => sum + t.purchases, 0);
      return items.map((t) => ({
        segmento: t.segment,
        compras: round2(t.purchases),
        participacionCompras: total > 0 ? formatPercent(t.purchases / total) : "s/d",
        inversion: formatCurrency(Math.round(t.spend), currency),
        costoPorCompra: t.purchases > 0 ? formatCurrency(t.spend / t.purchases, currency, 2) : "s/d",
        impresiones: t.impressions,
      }));
    };
    return {
      moneda: currency,
      mesCompleto: !summary.isCurrentMonth,
      filtro: describeGoogleAdsFilter(summary.breakdown, filter) ?? "Toda la cuenta",
      porEdad: describe(data.ages),
      porGenero: describe(data.genders),
    };
  }, [summary, data, filter, currency]);

  const allSpend = data ? data.ages.reduce((sum, t) => sum + t.spend, 0) : 0;
  const allPurchases = data ? data.ages.reduce((sum, t) => sum + t.purchases, 0) : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <BlockTitle block="audiencia" subtitle="Compras por rango etario y por género" />
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {GENDER_ORDER.slice(0, 2).map((g) => (
                <span key={g} className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: DEMO_COLOR[g] }} /> {g}
                </span>
              ))}
              {allPurchases > 0 && <span>Costo por compra promedio: {formatCurrency(allSpend / allPurchases, currency, 2)}</span>}
            </div>
          </div>
          <GoogleAdsFilterSelects breakdown={summary?.breakdown ?? null} value={filter} onChange={setFilter} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        {!data ? (
          <div className="h-48 animate-pulse rounded-lg bg-muted" />
        ) : data.ages.length === 0 && data.genders.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hay datos demográficos para este período{isFilterActive(filter) ? " y este filtro" : ""}. Google Ads no informa
            edad ni género de las campañas Performance Max.
          </p>
        ) : (
          <>
            {data.usesAdGroupOfAd && (
              <p className="text-xs text-muted-foreground">
                Google Ads informa la edad y el género por grupo de anuncios, no por anuncio: se muestran los datos del grupo de
                este anuncio.
              </p>
            )}
            <DemoColumns title="Por rango etario" items={data.ages} colorFor={() => AGE_COLOR} currency={currency} />
            <DemoColumns title="Por género" items={data.genders} colorFor={(s) => DEMO_COLOR[s] ?? AGE_COLOR} currency={currency} />
            <p className="text-[11px] text-muted-foreground">
              Google Ads no cruza edad con género, por eso se muestran por separado. No incluye Performance Max, que no informa
              datos demográficos.
            </p>
          </>
        )}

        {insightMetrics && (
          <ChartInsightPanel
            chart="google-ads-audience"
            metrics={insightMetrics}
            accentColor="hsl(var(--primary))"
            variant="card"
            monthIsComplete={!summary!.isCurrentMonth}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Columnas de barras + recuadro de métricas debajo (mismo diseño que AudienceAnalysis.tsx). */
function DemoColumns({
  title,
  items,
  colorFor,
  currency,
}: {
  title: string;
  items: DemoTotals[];
  colorFor: (segment: string) => string;
  currency: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((t) => t.purchases), 1);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-bold text-muted-foreground">{title}</span>
      <div className="flex items-end justify-between gap-2 sm:gap-4">
        {items.map((t) => {
          const heightPct = t.purchases > 0 ? Math.max(6, Math.round((t.purchases / max) * 100)) : 0;
          const cpa = t.purchases > 0 ? t.spend / t.purchases : null;
          return (
            <div key={t.segment} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex w-full items-end justify-center" style={{ height: DEMO_BAR_HEIGHT }}>
                <div className="flex h-full w-full max-w-[44px] flex-col items-center justify-end gap-1">
                  <span className="text-[10px] font-medium tabular-nums text-foreground">{formatNumber(round2(t.purchases))}</span>
                  <div className="w-full rounded-t-sm" style={{ height: `${heightPct}%`, backgroundColor: colorFor(t.segment) }} />
                </div>
              </div>
              <span className="text-xs font-semibold text-foreground">{t.segment}</span>
              <div className="flex w-full flex-col divide-y divide-border rounded-md border border-border bg-muted/40 px-2 py-1 text-center">
                <DemoStat value={formatNumber(round2(t.purchases))} label="Compras" />
                <DemoStat value={cpa !== null ? formatCurrency(cpa, currency, 2) : "0"} label="Costo por compra" />
                <DemoStat value={formatCurrency(Math.round(t.spend), currency)} label="Inversión" />
                <DemoStat value={formatNumber(t.impressions)} label="Impresiones" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DemoStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-2">
      <span className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

// ─────────────────────────────── Recomendaciones ───────────────────────────────

/**
 * Mismo bloque "Recomendaciones" que el reporte de Meta Ads (RecommendationsPanel): entre 5 y 8
 * acciones de alto impacto, generadas por la IA a partir de un resumen YA CALCULADO de todas las
 * secciones del reporte de Google Ads (cuenta, campañas, redes, provincias, edad, género, horario y
 * día de la semana), sin filtros (toda la cuenta).
 */
export function GoogleAdsRecommendationsBlock({ summary, clientId }: { summary: GoogleAdsSummaryResponse | null; clientId: string }) {
  const metrics = useMemo(() => {
    if (!summary || (summary.spend === 0 && summary.purchases === 0)) return null;
    const c = summary.currency;
    const money = (v: number) => formatCurrency(Math.round(v), c);
    const cpaOf = (spend: number, purchases: number) => (purchases > 0 ? formatCurrency(spend / purchases, c, 2) : "s/d");
    const { breakdown } = summary;

    // Agrupa filas por una clave y devuelve totales ordenables.
    type T = { name: string; spend: number; purchases: number };
    const group = <R,>(rows: R[], key: (r: R) => string | null, spend: (r: R) => number, purchases: (r: R) => number): T[] => {
      const by = new Map<string, T>();
      for (const r of rows) {
        const k = key(r);
        if (k === null) continue;
        const t = by.get(k) ?? { name: k, spend: 0, purchases: 0 };
        t.spend += spend(r);
        t.purchases += purchases(r);
        by.set(k, t);
      }
      return [...by.values()].filter((t) => t.spend > 0 || t.purchases > 0);
    };
    // Mayor inversión + más / menos eficiente (por costo por compra) de una lista.
    const extremes = (items: T[]) => {
      if (items.length === 0) return null;
      const withCpa = items.filter((t) => t.purchases > 0).map((t) => ({ ...t, cpa: t.spend / t.purchases }));
      const top = [...items].sort((a, b) => b.spend - a.spend)[0]!;
      const best = withCpa.length > 0 ? [...withCpa].sort((a, b) => a.cpa - b.cpa)[0]! : null;
      const worst = withCpa.length > 1 ? [...withCpa].sort((a, b) => b.cpa - a.cpa)[0]! : null;
      const sinCompras = items.filter((t) => t.purchases === 0 && t.spend > 0).sort((a, b) => b.spend - a.spend);
      return {
        mayorInversion: { nombre: top.name, inversion: money(top.spend) },
        masEficiente: best ? { nombre: best.name, costoPorCompra: formatCurrency(best.cpa, c, 2) } : null,
        menosEficiente: worst && worst.name !== best?.name ? { nombre: worst.name, costoPorCompra: formatCurrency(worst.cpa, c, 2) } : null,
        conInversionYSinCompras: sinCompras.slice(0, 3).map((t) => ({ nombre: t.name, inversion: money(t.spend) })),
      };
    };

    const campaignName = new Map(breakdown.campaigns.map((x) => [x.id, x.name]));
    const campaigns = group(
      breakdown.rows.filter((r) => r.level === "campaign"),
      (r) => campaignName.get(r.id) ?? null,
      (r) => r.spend,
      (r) => r.purchases
    );
    const revenueByCampaign = new Map<string, number>();
    for (const r of breakdown.rows) {
      if (r.level === "campaign") {
        const name = campaignName.get(r.id);
        if (name) revenueByCampaign.set(name, (revenueByCampaign.get(name) ?? 0) + r.revenue);
      }
    }
    const networks = group(
      (breakdown.networks ?? []).filter((n) => n.level === "campaign"),
      (n) => n.network,
      (n) => n.spend,
      (n) => n.purchases
    );
    const regions = group(
      (breakdown.regions ?? []).filter((r) => r.level === "campaign"),
      (r) => r.region,
      (r) => r.spend,
      (r) => r.purchases
    );
    const demo = breakdown.demographics ?? [];
    const ages = group(demo.filter((d) => d.dimension === "edad"), (d) => d.segment, (d) => d.spend, (d) => d.purchases);
    const genders = group(demo.filter((d) => d.dimension === "genero"), (d) => d.segment, (d) => d.spend, (d) => d.purchases);

    // Horario: mismas 3 franjas que HourlyPerformanceChart.tsx.
    const BANDS = [
      { label: "09:00 a 20:00", start: 9, end: 20 },
      { label: "21:00 a 23:00", start: 21, end: 23 },
      { label: "00:00 a 08:00", start: 0, end: 8 },
    ];
    const hours = (breakdown.hours ?? []).filter((h) => h.level === "campaign");
    const bands = BANDS.map((b) => {
      const rows = hours.filter((h) => h.hour >= b.start && h.hour <= b.end);
      return { name: b.label, spend: rows.reduce((s, h) => s + h.spend, 0), purchases: rows.reduce((s, h) => s + h.purchases, 0) };
    }).filter((t) => t.spend > 0 || t.purchases > 0);

    // Día de la semana: hábiles vs. fin de semana (misma forma de parsear que el reporte de Meta).
    const week = { habil: { spend: 0, purchases: 0 }, finde: { spend: 0, purchases: 0 } };
    for (const d of summary.daily) {
      const [y, m, day] = d.date.split("-").map(Number);
      if (!y || !m || !day) continue;
      const wd = new Date(y, m - 1, day).getDay();
      const bucket = wd === 0 || wd === 6 ? week.finde : week.habil;
      bucket.spend += d.spend;
      bucket.purchases += d.purchases;
    }

    return {
      resumenGeneral: {
        inversionTotal: money(summary.spend),
        compras: round2(summary.purchases),
        costoPorCompra: cpaOf(summary.spend, summary.purchases),
        ...(summaryIsEcommerce(summary)
          ? { facturacion: money(summary.revenue), roas: fmtRoas(ratio(summary.revenue, summary.spend)) }
          : {}),
        tasaConversion: fmtPct(ratio(summary.purchases, summary.clicks)),
        impresiones: summary.impressions,
        clicks: summary.clicks,
      },
      campanias: {
        ...extremes(campaigns),
        detalle: [...campaigns]
          .sort((a, b) => b.spend - a.spend)
          .slice(0, 10)
          .map((t) => ({
            nombre: t.name,
            inversion: money(t.spend),
            compras: round2(t.purchases),
            costoPorCompra: cpaOf(t.spend, t.purchases),
            ...(summaryIsEcommerce(summary) ? { roas: fmtRoas(ratio(revenueByCampaign.get(t.name) ?? 0, t.spend)) } : {}),
          })),
      },
      redes: extremes(networks),
      provincias: extremes(regions),
      edad: extremes(ages),
      genero: extremes(genders),
      horario: extremes(bands),
      diaDeLaSemana: {
        habiles: { inversion: money(week.habil.spend), costoPorCompra: cpaOf(week.habil.spend, week.habil.purchases) },
        finDeSemana: { inversion: money(week.finde.spend), costoPorCompra: cpaOf(week.finde.spend, week.finde.purchases) },
      },
    };
  }, [summary]);

  if (!summary || !metrics) return null;
  return (
    <RecommendationsPanel
      chart="google-ads-recommendations"
      metrics={metrics}
      monthIsComplete={!summary.isCurrentMonth}
      clientId={clientId}
    />
  );
}

// ─────────────────────────────── Tarjetas ───────────────────────────────

/** Valor destacado + evolución diaria. Sin recuadro (a pedido de Martín): va directo sobre la card del bloque. */
function ResultCard({ label, value, chart }: { label: string; value: string | null | undefined; chart: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-muted-foreground">{label}</span>
        {value == null ? (
          <span className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
        ) : (
          <span className="mt-1 text-2xl font-semibold leading-tight text-sky-600">{value}</span>
        )}
      </div>
      {value == null ? <div className="h-12 animate-pulse rounded bg-muted" /> : chart}
    </div>
  );
}

/** Tarjeta de "Performance de Resultados" — mismo look que esa sección del reporte de Meta Ads. */
function PerformanceCard({ label, value, note }: { label: string; value: string | null | undefined; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <span className="text-sm font-bold text-muted-foreground">{label}</span>
      {value == null ? (
        <span className="h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-2xl font-semibold text-foreground">{value}</span>
      )}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
