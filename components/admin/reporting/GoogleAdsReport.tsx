"use client";

// Reporte de Google Ads (a pedido de Martín, mismo look que el mockup): bloque "Resumen global del
// período" con las scorecards del mes según Google Ads (ver /api/clients/[id]/google-ads-summary),
// la sección "Ventas por WhatsApp" (carga manual, del mismo Google Sheet que se configura en el
// Admin — ver SheetChart.tsx) y un "Resumen ejecutivo" con chips + insight de IA.
//
// Definiciones:
//   CPA = inversión / compras · ROAS = facturación / inversión · Ticket = facturación / compras ·
//   Conversion rate = compras / clicks · Ticket WhatsApp = facturación WA / ventas WA ·
//   ROAS WhatsApp = facturación WA / inversión de las campañas de WhatsApp en Google Ads
//   (campañas reconocidas por nombre, ver WHATSAPP_CAMPAIGN_PATTERN en lib/google-ads/monthlySummary.ts).

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { InvestmentBlock } from "@/components/admin/reporting/InvestmentBlock";
import { GoogleAdsBillingBlock, GoogleAdsResultsBlock, type GoogleAdsSummaryResponse } from "@/components/admin/reporting/GoogleAdsBlocks";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { compareMonths, type SheetChartData } from "@/lib/reporting/googleSheetChart";

const COLORS = {
  blue: "text-sky-600",
  orange: "text-orange-500",
  green: "text-emerald-600",
  indigo: "text-indigo-600",
  default: "text-foreground",
} as const;
type Tone = keyof typeof COLORS;

type SummaryResponse = GoogleAdsSummaryResponse;

const roasFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

function ratio(a: number | null, b: number | null): number | null {
  return a === null || b === null || b === 0 ? null : a / b;
}

export function GoogleAdsReport({ clientId, month }: { clientId: string; month: string }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetChartData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    fetch(`/api/clients/${clientId}/google-ads-summary?month=${month}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los datos de Google Ads.");
        return body as SummaryResponse;
      })
      .then((body) => !cancelled && setSummary(body))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, month]);

  // Ventas por WhatsApp: mismo Google Sheet de carga manual que usa el reporte de Meta Ads.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clients/${clientId}/sheet-chart`)
      .then((res) => res.json())
      .then((body) => !cancelled && setSheet(body?.enabled && body.chart ? (body.chart as SheetChartData) : null))
      .catch(() => !cancelled && setSheet(null));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const whatsapp = useMemo(() => {
    if (!sheet) return null;
    const rows = compareMonths(sheet, month);
    // Ventas = primera serie NO monetaria; Facturación = primera serie monetaria cuyo nombre diga
    // "factur" (o, si no hay, la primera monetaria que no sea un ticket/promedio).
    const sales = rows.find((r) => !r.isCurrency)?.current ?? null;
    const revenueRow =
      rows.find((r) => r.isCurrency && /factur/i.test(r.name)) ??
      rows.find((r) => r.isCurrency && !/ticket|promedio/i.test(r.name));
    return { sales, revenue: revenueRow?.current ?? null };
  }, [sheet, month]);

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <BlockTitle block="googleAdsResumen" title="Google Ads" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const currency = summary?.currency ?? "ARS";
  const money = (v: number | null) => (v === null ? "s/d" : formatCurrency(v, currency));
  const count = (v: number | null) => (v === null ? "s/d" : formatNumber(v));
  const roas = (v: number | null) => (v === null ? "s/d" : `${roasFormat.format(v)}x`);

  const s = summary;
  const cpa = s ? ratio(s.spend, s.purchases) : null;
  const roasTotal = s ? ratio(s.revenue, s.spend) : null;
  const ticket = s ? ratio(s.revenue, s.purchases) : null;
  const convRate = s ? ratio(s.purchases, s.clicks) : null;

  const waTicket = whatsapp ? ratio(whatsapp.revenue, whatsapp.sales) : null;
  const waRoas = whatsapp && s ? ratio(whatsapp.revenue, s.whatsappSpend) : null;

  const insightMetrics = s
    ? {
        mes: month,
        inversion: s.spend,
        impresiones: s.impressions,
        clicks: s.clicks,
        compras: s.purchases,
        cpa,
        facturacion: s.revenue,
        roas: roasTotal,
        ticketPromedio: ticket,
        conversionRate: convRate,
        ventasWhatsApp: whatsapp?.sales ?? null,
        facturacionWhatsApp: whatsapp?.revenue ?? null,
        ticketWhatsApp: waTicket,
        inversionCampaniasWhatsApp: s.whatsappSpend,
        roasWhatsApp: waRoas,
        moneda: currency,
      }
    : null;

  // Mes en curso vs. cerrado (mismo criterio que el bloque de Inversión de Meta Ads): mientras
  // carga, se deduce comparando el mes elegido con el mes actual.
  const isCurrentMonth = s ? s.isCurrentMonth : month === new Date().toISOString().slice(0, 7);

  return (
    <>
    {/* Inversión: mismo bloque que el reporte de Meta Ads (ver InvestmentBlock.tsx). */}
    <InvestmentBlock
      month={month}
      days={s?.daily ?? []}
      total={s?.spend ?? 0}
      currency={currency}
      isCurrentMonth={isCurrentMonth}
      loading={!s}
    />

    {/* Resultados y Facturación, cada uno con su filtro de Campaña / Grupo de anuncios / Anuncio
        (ver GoogleAdsBlocks.tsx). */}
    <GoogleAdsResultsBlock summary={s} clientId={clientId} />
    <GoogleAdsBillingBlock summary={s} clientId={clientId} />

    <Card>
      <CardHeader className="pb-2">
        {sheet ? (
          <div className="flex items-center gap-2">
            <BlockTitle block="googleAdsResumen" />
            <span className="rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Carga manual
            </span>
          </div>
        ) : (
          // Sin Google Sheet configurado no hay Ventas por WhatsApp: el bloque es sólo el Resumen ejecutivo.
          <BlockTitle block="googleAdsResumen" title="Resumen ejecutivo" />
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {sheet && (
          <>
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Scorecard label="Ventas por WhatsApp" value={count(whatsapp?.sales ?? null)} tone="blue" note="Dato cargado manualmente" />
                <Scorecard label="Facturación WhatsApp" value={money(whatsapp?.revenue ?? null)} tone="green" note="Dato cargado manualmente" />
                <Scorecard label="Ticket promedio WhatsApp" value={money(waTicket)} tone="blue" note="Facturación WhatsApp / ventas WhatsApp" />
                <Scorecard
                  label="ROAS WhatsApp"
                  value={s && roas(waRoas)}
                  tone="indigo"
                  note="Facturación WhatsApp / gasto de campañas de Conversaciones/WhatsApp"
                />
              </div>
              <div className="rounded-md border-l-4 border-indigo-500 bg-muted/50 px-4 py-3 text-sm text-foreground">
                El <strong>ROAS WhatsApp</strong> usa la facturación manual de WhatsApp y la inversión de las campañas/acciones de
                Google Ads destinadas a generar conversaciones por WhatsApp
                {s && (
                  <>
                    {" "}
                    ({s.whatsappCampaigns.length > 0
                      ? `este mes: ${s.whatsappCampaigns.join(", ")} — ${money(s.whatsappSpend)}`
                      : "este mes no se encontraron campañas de WhatsApp en la cuenta"}
                    )
                  </>
                )}
                .
              </div>
            </div>
          </>
        )}

        {s && s.spend === 0 && s.impressions === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hubo inversión ni impresiones en Google Ads este mes, así que no hay resumen ejecutivo.
          </p>
        ) : insightMetrics && (
          <div className="flex flex-col gap-2">
            {sheet && <span className="text-lg font-bold text-foreground">Resumen ejecutivo</span>}
            <ChartInsightPanel
              chart="google-ads-summary"
              metrics={insightMetrics}
              accentColor="hsl(var(--primary))"
              variant="card"
              bordered={false}
              monthIsComplete={!s!.isCurrentMonth}
              clientId={clientId}
            />
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

function Scorecard({
  label,
  value,
  tone = "default",
  note,
}: {
  label: string;
  /** null/undefined = cargando. */
  value: string | null | undefined;
  tone?: Tone;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-4">
      <span className="text-sm font-semibold text-muted-foreground">{label}</span>
      {value == null ? (
        <span className="h-8 w-24 animate-pulse rounded bg-muted" />
      ) : (
        <span className={cn("text-2xl font-bold", COLORS[tone])}>{value}</span>
      )}
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
