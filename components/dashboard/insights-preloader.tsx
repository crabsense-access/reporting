"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { getDefaultGranularity, getDefaultRange } from "@/lib/date-range";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import {
  buildBasicInsights,
  buildGoalInsights,
  buildGoogleAdsInsights,
  buildMetaAdsInsights,
  buildSegmentInsights,
} from "@/lib/insights/dashboard-insights";
import { useRegisterSectionInsights } from "@/components/dashboard/insights-context";
import type { InsightSectionKey } from "@/components/dashboard/sidebar/nav-items";
import type { DashboardMetricsResponse } from "@/lib/ga4/types";
import type { SeoSegmentMetrics } from "@/lib/gsc/reports";
import type { GoogleAdsMetrics } from "@/lib/google-ads/reports";
import type { MetaAdsMetrics } from "@/lib/meta-ads/reports";
import type { DashboardType } from "@/lib/dashboard/getAvailableDashboardTypes";

function toSentiments(insights: Insight[]): { sentiment: InsightSentiment }[] {
  return insights.map((insight) => ({ sentiment: insight.sentiment }));
}

function useSectionPreloadFetch<T>(
  url: string,
  parse: (json: T) => Insight[]
): Insight[] {
  const [insights, setInsights] = React.useState<Insight[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    fetch(url)
      .then((response) => (response.ok ? (response.json() as Promise<T>) : null))
      .then((json) => {
        if (!cancelled && json) setInsights(parse(json));
      })
      .catch(() => {
        // Precálculo best-effort para el pill del sidebar: si falla, el
        // tablero real (cuando el usuario entre a esa sección) sigue
        // funcionando normalmente por su cuenta.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return insights;
}

function AnaliticaPreload({ clientId }: { clientId: string }) {
  const range = getDefaultRange();
  const params = new URLSearchParams({
    from: range.from,
    to: range.to,
    granularity: getDefaultGranularity(range),
  });
  const insights = useSectionPreloadFetch<DashboardMetricsResponse>(
    `/api/dashboard/${clientId}/metrics?${params.toString()}`,
    (json) => [
      ...(json.basicMetrics && json.basicMetricsPrevious
        ? buildBasicInsights(json.basicMetrics, json.basicMetricsPrevious)
        : []),
      ...buildGoalInsights(json.goals),
    ]
  );

  useRegisterSectionInsights("analitica", toSentiments(insights));
  return null;
}

function SeoPreload({ clientId }: { clientId: string }) {
  const range = getDefaultRange();
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const insights = useSectionPreloadFetch<{ segments: SeoSegmentMetrics[] }>(
    `/api/dashboard/${clientId}/seo?${params.toString()}`,
    (json) => (json.segments ?? []).flatMap(buildSegmentInsights)
  );

  useRegisterSectionInsights("seo", toSentiments(insights));
  return null;
}

// "ads" agrupa dos plataformas (Google Ads y Meta Ads) bajo el mismo pill —
// cada una pega a su propia API route (que devuelve metrics: null si ese
// cliente no la tiene conectada) y se suman los insights de las que sí.
function AdsPreload({ clientId }: { clientId: string }) {
  const range = getDefaultRange();
  const params = new URLSearchParams({ from: range.from, to: range.to });
  const googleAdsInsights = useSectionPreloadFetch<{ metrics: GoogleAdsMetrics | null }>(
    `/api/dashboard/${clientId}/ads?${params.toString()}`,
    (json) => (json.metrics ? buildGoogleAdsInsights(json.metrics, json.metrics.previous, json.metrics.currencyCode) : [])
  );
  const metaAdsInsights = useSectionPreloadFetch<{
    metrics: MetaAdsMetrics | null;
    selectedConversionEvent: string;
  }>(`/api/dashboard/${clientId}/meta-ads?${params.toString()}`, (json) =>
    json.metrics
      ? buildMetaAdsInsights(json.metrics, json.metrics.previous, json.metrics.currencyCode, json.selectedConversionEvent)
      : []
  );

  useRegisterSectionInsights("ads", toSentiments([...googleAdsInsights, ...metaAdsInsights]));
  return null;
}

// Google Ads y Meta Ads comparten la sección "ads" del sidebar pero viven en
// rutas separadas — cualquiera de las dos cuenta como "ya está en vivo" para
// no precalcular (y pedir) de nuevo lo que ese tablero real ya está
// reportando por su cuenta.
const SECTION_TO_ROUTE_SUFFIXES: Record<InsightSectionKey, string[]> = {
  analitica: ["/dashboard/analitica/audiencia"],
  seo: ["/dashboard/seo/vision-general"],
  ads: [
    "/dashboard/ads/google-ads/vision-general",
    "/dashboard/ads/google-ads/costos",
    "/dashboard/ads/meta-ads/vision-general",
    "/dashboard/ads/meta-ads/costos",
  ],
};

/**
 * Calcula (y registra en el contexto de insights) los pills del sidebar para
 * las secciones que el usuario todavía no visitó en esta sesión — sin este
 * precálculo, el pill de una sección solo aparece después de entrar a su
 * tablero real, porque es ese mismo <InsightsList> el que reporta sus
 * insights "en vivo". La sección que sí está montada ahora mismo se salta
 * acá para no pedir la misma data dos veces ni duplicar el conteo.
 */
export function InsightsPreloader({
  clientId,
  availableTypes,
}: {
  clientId: string;
  availableTypes: DashboardType[];
}) {
  const pathname = usePathname();
  const isLive = (section: InsightSectionKey) =>
    SECTION_TO_ROUTE_SUFFIXES[section].some((suffix) => pathname.endsWith(suffix));

  return (
    <>
      {availableTypes.includes("analitica") && !isLive("analitica") && (
        <AnaliticaPreload clientId={clientId} />
      )}
      {availableTypes.includes("seo") && !isLive("seo") && <SeoPreload clientId={clientId} />}
      {availableTypes.includes("ads") && !isLive("ads") && <AdsPreload clientId={clientId} />}
    </>
  );
}
