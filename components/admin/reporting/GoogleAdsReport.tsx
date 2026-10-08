"use client";

// Reporte de Google Ads: bloques Inversión (compartido con Meta Ads, ver InvestmentBlock.tsx),
// Resultados y Facturación (con filtros por Campaña / Grupo de anuncios / Anuncio, ver
// GoogleAdsBlocks.tsx) y un Resumen ejecutivo con insight de IA. Datos del mes desde
// /api/clients/[id]/google-ads-summary.
//
// "Ventas por WhatsApp" se sacó de este reporte a pedido de Martín: usaba el Google Sheet de carga
// manual que se configura en la config de Meta Ads del Admin. Vuelve cuando haya un Sheet propio en
// la config de Google Ads (WHATSAPP_CAMPAIGN_PATTERN / whatsappSpend siguen calculándose en
// lib/google-ads/monthlySummary.ts para el ROAS WhatsApp de ese momento).
//
// Definiciones: CPA = inversión / compras · ROAS = facturación / inversión ·
// Ticket = facturación / compras · Conversion rate = compras / clicks.

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { InvestmentBlock } from "@/components/admin/reporting/InvestmentBlock";
import { GoogleAdsBillingBlock, GoogleAdsResultsBlock, type GoogleAdsSummaryResponse } from "@/components/admin/reporting/GoogleAdsBlocks";

function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

export function GoogleAdsReport({ clientId, month }: { clientId: string; month: string }) {
  const [summary, setSummary] = useState<GoogleAdsSummaryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSummary(null);
    setError(null);
    fetch(`/api/clients/${clientId}/google-ads-summary?month=${month}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los datos de Google Ads.");
        return body as GoogleAdsSummaryResponse;
      })
      .then((body) => !cancelled && setSummary(body))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [clientId, month]);

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

  const s = summary;
  const currency = s?.currency ?? "ARS";
  // Mes en curso vs. cerrado (mismo criterio que el bloque de Inversión de Meta Ads): mientras
  // carga, se deduce comparando el mes elegido con el mes actual.
  const isCurrentMonth = s ? s.isCurrentMonth : month === new Date().toISOString().slice(0, 7);

  const insightMetrics = s
    ? {
        mes: month,
        inversion: s.spend,
        impresiones: s.impressions,
        clicks: s.clicks,
        compras: s.purchases,
        cpa: ratio(s.spend, s.purchases),
        facturacion: s.revenue,
        roas: ratio(s.revenue, s.spend),
        ticketPromedio: ratio(s.revenue, s.purchases),
        conversionRate: ratio(s.purchases, s.clicks),
        moneda: currency,
      }
    : null;

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
          <BlockTitle block="googleAdsResumen" />
        </CardHeader>
        <CardContent>
          {s && s.spend === 0 && s.impressions === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hubo inversión ni impresiones en Google Ads este mes, así que no hay resumen ejecutivo.
            </p>
          ) : insightMetrics ? (
            <ChartInsightPanel
              chart="google-ads-summary"
              metrics={insightMetrics}
              accentColor="hsl(var(--primary))"
              variant="card"
              bordered={false}
              monthIsComplete={!s!.isCurrentMonth}
              clientId={clientId}
            />
          ) : (
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          )}
        </CardContent>
      </Card>
    </>
  );
}
