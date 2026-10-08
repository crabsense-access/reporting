"use client";

// Reporte de Google Ads: bloques Inversión (compartido con Meta Ads, ver InvestmentBlock.tsx),
// Resultados y Facturación (con filtros por Campaña / Grupo de anuncios / Anuncio, ver
// GoogleAdsBlocks.tsx), cada uno con su insight de IA. Datos del mes desde
// /api/clients/[id]/google-ads-summary.
//
// "Ventas por WhatsApp" se sacó de este reporte a pedido de Martín: usaba el Google Sheet de carga
// manual que se configura en la config de Meta Ads del Admin. Vuelve cuando haya un Sheet propio en
// la config de Google Ads (WHATSAPP_CAMPAIGN_PATTERN / whatsappSpend siguen calculándose en
// lib/google-ads/monthlySummary.ts para el ROAS WhatsApp de ese momento).

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { InvestmentBlock } from "@/components/admin/reporting/InvestmentBlock";
import {
  GoogleAdsBillingBlock,
  GoogleAdsCampaignAnalysisBlock,
  GoogleAdsPlacementBlock,
  GoogleAdsResultsBlock,
  GoogleAdsResultsByCampaignBlock,
  GoogleAdsTrendBlock,
  type GoogleAdsSummaryResponse,
} from "@/components/admin/reporting/GoogleAdsBlocks";

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
      {/* Mismo bloque "Inversión y rendimiento por día" que Meta Ads (ver GoogleAdsTrendBlock). */}
      <GoogleAdsTrendBlock summary={s} clientId={clientId} />
      {/* Mismo bloque "Resultados por campaña" que Meta Ads, con una serie por campaña. */}
      <GoogleAdsResultsByCampaignBlock summary={s} clientId={clientId} />
      {/* Mismo bloque "Análisis de campañas" que Meta Ads, con datos reales por campaña. */}
      <GoogleAdsCampaignAnalysisBlock summary={s} clientId={clientId} />
      {/* Mismo bloque "Ubicación de los anuncios" que Meta Ads: cada ubicación es una red de Google. */}
      <GoogleAdsPlacementBlock summary={s} clientId={clientId} />
    </>
  );
}
