"use client";

// "Resumen general" del informe: primera hoja del menú y pantalla de inicio. Consolida Meta Ads y
// Google Ads del mes elegido:
//   1. Inversión total (mismo bloque InvestmentBlock que los otros reportes), con la evolución diaria
//      de la suma de las dos plataformas. Sólo si ambas usan la misma moneda — si no, sumar no tiene
//      sentido y se muestra la inversión de cada una en la comparativa.
//   2. "Comparativa por plataforma": una tarjeta por plataforma lado a lado (inversión, % del total,
//      resultados, costo por resultado, facturación, ROAS) + insight de IA que compara las dos.
//
// Los datos salen de los mismos endpoints (y la misma caché) que los reportes de cada plataforma:
// /api/clients/[id]/investment-calendar (Meta) y /api/clients/[id]/google-ads-summary (Google).
// Resultados: en Meta, la suma de todos los tipos de Resultado del mes (mismo criterio que el bloque
// Resultados del Calendario); en Google, las compras (conversiones de categoría Compra).

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { SiMeta } from "react-icons/si";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { InvestmentBlock } from "@/components/admin/reporting/InvestmentBlock";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { GoogleAdsMonthlySummary } from "@/lib/google-ads/monthlySummary";

type PlatformKey = "meta_ads" | "google_ads";

interface MetaResponse {
  currency: string;
  objectiveLabels: string[];
  days: { date: string; spend: number; objectiveLeads: number[]; purchases?: number; purchaseValue?: number }[];
}
type GoogleResponse = GoogleAdsMonthlySummary & { isCurrentMonth: boolean };

interface PlatformTotals {
  key: PlatformKey;
  label: string;
  icon: ReactNode;
  currency: string;
  spend: number;
  results: number;
  resultsLabel: string;
  /** Desglose de Resultados (sólo Meta: por tipo de Resultado). */
  resultsDetail: { label: string; value: number }[];
  revenue: number;
  purchases: number;
  daily: { date: string; spend: number }[];
}

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; data: T };

const roasFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const pctFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function useJson<T>(url: string | null): Load<T> | null {
  const [state, setState] = useState<Load<T> | null>(url ? { status: "loading" } : null);
  useEffect(() => {
    if (!url) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los datos.");
        return body as T;
      })
      .then((data) => !cancelled && setState({ status: "ok", data }))
      .catch((err: Error) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

export function SummaryReport({
  clientId,
  month,
  platforms,
  hrefs,
}: {
  clientId: string;
  /** yyyy-MM */
  month: string;
  /** Plataformas configuradas para este cliente. */
  platforms: PlatformKey[];
  /** Página de cada plataforma, para el link "Ver reporte". */
  hrefs: Record<PlatformKey, string>;
}) {
  const meta = useJson<MetaResponse>(
    platforms.includes("meta_ads") ? `/api/clients/${clientId}/investment-calendar?month=${month}` : null
  );
  const google = useJson<GoogleResponse>(
    platforms.includes("google_ads") ? `/api/clients/${clientId}/google-ads-summary?month=${month}` : null
  );

  const metaTotals = useMemo<PlatformTotals | null>(() => {
    if (meta?.status !== "ok") return null;
    const d = meta.data;
    const byObjective = d.objectiveLabels.map((label, i) => ({
      label,
      value: d.days.reduce((sum, day) => sum + (day.objectiveLeads[i] ?? 0), 0),
    }));
    return {
      key: "meta_ads",
      label: "Meta Ads",
      icon: <SiMeta color="#0467DF" className="h-5 w-5" />,
      currency: d.currency,
      spend: d.days.reduce((sum, day) => sum + day.spend, 0),
      results: byObjective.reduce((sum, o) => sum + o.value, 0),
      resultsLabel: "Resultados",
      resultsDetail: byObjective.filter((o) => o.value > 0),
      revenue: d.days.reduce((sum, day) => sum + (day.purchaseValue ?? 0), 0),
      purchases: d.days.reduce((sum, day) => sum + (day.purchases ?? 0), 0),
      daily: d.days.map((day) => ({ date: day.date, spend: day.spend })),
    };
  }, [meta]);

  const googleTotals = useMemo<PlatformTotals | null>(() => {
    if (google?.status !== "ok") return null;
    const d = google.data;
    return {
      key: "google_ads",
      label: "Google Ads",
      // eslint-disable-next-line @next/next/no-img-element
      icon: <img src="/icons/google-ads.png" alt="" className="h-5 w-5 object-contain" />,
      currency: d.currency,
      spend: d.spend,
      results: d.purchases,
      resultsLabel: "Compras",
      resultsDetail: [],
      revenue: d.revenue,
      purchases: d.purchases,
      daily: d.daily.map((day) => ({ date: day.date, spend: day.spend })),
    };
  }, [google]);

  const loaded = [metaTotals, googleTotals].filter((t): t is PlatformTotals => t !== null);
  const stillLoading = meta?.status === "loading" || google?.status === "loading";
  const sameCurrency = loaded.length > 0 && loaded.every((t) => t.currency === loaded[0]!.currency);
  const currency = loaded[0]?.currency ?? "ARS";
  const totalSpend = sameCurrency ? loaded.reduce((sum, t) => sum + t.spend, 0) : null;

  // Inversión diaria sumando las plataformas cargadas (mismas fechas yyyy-MM-dd en las dos).
  const combinedDaily = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const t of loaded) for (const d of t.daily) byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.spend);
    return [...byDate.entries()].map(([date, spend]) => ({ date, spend }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaTotals, googleTotals]);

  const isCurrentMonth =
    google?.status === "ok" ? google.data.isCurrentMonth : month === new Date().toISOString().slice(0, 7);

  const insightMetrics = useMemo(() => {
    if (stillLoading || loaded.length === 0) return null;
    const money = (v: number, c: string) => formatCurrency(Math.round(v), c);
    return {
      mes: month,
      mesCompleto: !isCurrentMonth,
      inversionTotal: totalSpend !== null ? money(totalSpend, currency) : "Las plataformas usan monedas distintas",
      plataformas: loaded.map((t) => ({
        plataforma: t.label,
        moneda: t.currency,
        inversion: money(t.spend, t.currency),
        porcentajeDeLaInversion: totalSpend ? `${pctFormat.format((t.spend / totalSpend) * 100)}%` : null,
        resultados: Math.round(t.results * 100) / 100,
        tipoDeResultado: t.resultsLabel,
        desgloseResultados: t.resultsDetail.map((r) => ({ tipo: r.label, cantidad: r.value })),
        costoPorResultado: t.results > 0 ? money(t.spend / t.results, t.currency) : "s/d",
        compras: Math.round(t.purchases * 100) / 100,
        facturacion: money(t.revenue, t.currency),
        roas: t.spend > 0 && t.revenue > 0 ? `${roasFormat.format(t.revenue / t.spend)}x` : "s/d",
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaTotals, googleTotals, stillLoading, month, isCurrentMonth, totalSpend, currency]);

  const errors = [
    meta?.status === "error" ? `Meta Ads: ${meta.message}` : null,
    google?.status === "error" ? `Google Ads: ${google.message}` : null,
  ].filter(Boolean);

  return (
    <>
      {/* 1. Inversión total (suma de las plataformas), con su evolución diaria. */}
      {(stillLoading || sameCurrency) && (
        <InvestmentBlock
          month={month}
          days={combinedDaily}
          total={totalSpend ?? 0}
          currency={currency}
          isCurrentMonth={isCurrentMonth}
          loading={stillLoading}
        />
      )}

      {/* 2. Comparativa por plataforma + insight de IA. */}
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="resumenComparativa" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {errors.length > 0 && (
            <div className="flex flex-col gap-1 text-sm text-destructive">
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
          {!sameCurrency && loaded.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Las plataformas usan monedas distintas ({loaded.map((t) => `${t.label}: ${t.currency}`).join(" · ")}), así que la
              inversión no se suma: se muestra la de cada una por separado.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-2">
            {platforms.map((key) => {
              const t = key === "meta_ads" ? metaTotals : googleTotals;
              const state = key === "meta_ads" ? meta : google;
              if (state?.status === "error") return null;
              return <PlatformCard key={key} totals={t} href={hrefs[key]} totalSpend={totalSpend} />;
            })}
          </div>

          {insightMetrics && (
            <ChartInsightPanel
              chart="general-summary"
              metrics={insightMetrics}
              accentColor="hsl(var(--primary))"
              variant="card"
              bordered={false}
              monthIsComplete={!isCurrentMonth}
              clientId={clientId}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PlatformCard({
  totals,
  href,
  totalSpend,
}: {
  totals: PlatformTotals | null;
  href: string;
  totalSpend: number | null;
}) {
  if (!totals) {
    return <div className="h-64 animate-pulse rounded-lg border border-border bg-muted/40" />;
  }
  const t = totals;
  const money = (v: number) => formatCurrency(Math.round(v), t.currency);
  const costPerResult = t.results > 0 ? money(t.spend / t.results) : "s/d";
  const roas = t.spend > 0 && t.revenue > 0 ? `${roasFormat.format(t.revenue / t.spend)}x` : "s/d";
  const share = totalSpend ? `${pctFormat.format((t.spend / totalSpend) * 100)}% de la inversión total` : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-base font-bold text-foreground">
          {t.icon}
          {t.label}
        </span>
        <Link href={href} className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
          Ver reporte →
        </Link>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-bold text-muted-foreground">Inversión</span>
        <span className="text-2xl font-semibold text-foreground">{money(t.spend)}</span>
        {share && <span className="text-xs text-muted-foreground">{share}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
        <Metric label={t.resultsLabel} value={formatNumber(Math.round(t.results * 100) / 100)} />
        <Metric label={t.resultsLabel === "Compras" ? "Costo por compra" : "Costo por resultado"} value={costPerResult} />
        <Metric label="Facturación" value={t.revenue > 0 ? money(t.revenue) : "s/d"} />
        <Metric label="ROAS" value={roas} />
      </div>

      {t.resultsDetail.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {t.resultsDetail.map((r) => (
            <span key={r.label} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              {r.label}: <span className="font-semibold text-foreground">{formatNumber(r.value)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold text-foreground">{value}</span>
    </div>
  );
}
