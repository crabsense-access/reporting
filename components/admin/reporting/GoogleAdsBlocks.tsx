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
import { formatCurrency, formatNumber } from "@/lib/format";
import {
  applyGoogleAdsFilter,
  describeGoogleAdsFilter,
  EMPTY_GOOGLE_ADS_FILTER,
  entityTotalsForFilter,
  isFilterActive,
  type GoogleAdsFilter,
} from "@/lib/google-ads/filter";
import type { GoogleAdsMonthlySummary } from "@/lib/google-ads/monthlySummary";

export type GoogleAdsSummaryResponse = GoogleAdsMonthlySummary & { isCurrentMonth: boolean; from: string; to: string };

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
  return {
    dimension,
    items: items.slice(0, 15).map((c) => ({
      nombre: c.name,
      inversion: formatCurrency(Math.round(c.spend), currency),
      impresiones: c.impressions,
      clicks: c.clicks,
      compras: round2(c.purchases),
      facturacion: formatCurrency(Math.round(c.revenue), currency),
      cpa: c.purchases > 0 ? formatCurrency(Math.round(c.spend / c.purchases), currency) : "s/d",
      roas: fmtRoas(ratio(c.revenue, c.spend)),
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
      facturacion: formatCurrency(Math.round(data.revenue), currency),
      inversion: formatCurrency(Math.round(data.spend), currency),
      cpa: data.purchases > 0 ? formatCurrency(Math.round(data.spend / data.purchases), currency) : "s/d",
      roas: fmtRoas(ratio(data.revenue, data.spend)),
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
