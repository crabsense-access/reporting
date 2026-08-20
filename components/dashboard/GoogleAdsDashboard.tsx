"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { useKeyedInsights } from "@/components/dashboard/InsightsList";
import { GoogleAdsBreakdownSection } from "@/components/dashboard/GoogleAdsBreakdownCharts";
import { buildMiniSeries, GoogleAdsMetricCard, type LlmInsightDisplay } from "@/components/dashboard/GoogleAdsMetricCard";
import {
  METRIC_SLOT_COLORS,
  GoogleAdsTrendChart,
  type GoogleAdsChartMetric,
  type GoogleAdsMetricKey,
} from "@/components/dashboard/GoogleAdsTrendChart";
import { parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import { buildGoogleAdsInsights } from "@/lib/insights/dashboard-insights";
import type { CachedInsight } from "@/lib/insights/insight-cache";
import { formatMetricValue, type GoogleAdsMetricDef } from "@/lib/google-ads/metric-defs";
import type { GoogleAdsBreakdownRow, GoogleAdsMetrics, GoogleAdsTimeSeriesPoint } from "@/lib/google-ads/reports";

interface GoogleAdsMetricsResponse {
  connected: boolean;
  metrics: GoogleAdsMetrics | null;
  timeSeries: { current: GoogleAdsTimeSeriesPoint[]; previous: GoogleAdsTimeSeriesPoint[] } | null;
  breakdowns: {
    device: GoogleAdsBreakdownRow[];
    network: GoogleAdsBreakdownRow[];
    hourly: GoogleAdsBreakdownRow[];
    dayOfWeek: GoogleAdsBreakdownRow[];
    campaign: GoogleAdsBreakdownRow[];
    adGroup: GoogleAdsBreakdownRow[];
    ad: GoogleAdsBreakdownRow[];
    keyword: GoogleAdsBreakdownRow[];
  } | null;
}

// Máximo 2 métricas a la vez en el gráfico — mismo criterio que Meta Ads
// (ver MetaAdsDashboard): con 2 seleccionadas se indexan a % de cambio.
const MAX_SELECTED_METRICS = 2;

function GoogleAdsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

interface GoogleAdsDashboardProps {
  clientId: string;
  /** Identifica el tablero para el caché de insights LLM — ej. "google_ads_overview" / "google_ads_costs". */
  dashboard: string;
  metricDefs: GoogleAdsMetricDef[];
  /** Renderiza los 8 gráficos de desglose debajo del gráfico de tendencia. */
  showBreakdowns: boolean;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle) — varía por página aunque compartan este mismo componente. */
  breadcrumbSubtitle?: string;
}

export function GoogleAdsDashboard({ clientId, dashboard, metricDefs, showBreakdowns, breadcrumbSubtitle }: GoogleAdsDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [selectedMetrics, setSelectedMetrics] = useState<GoogleAdsMetricKey[]>([metricDefs[0]!.key]);
  const [data, setData] = useState<GoogleAdsMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmInsights, setLlmInsights] = useState<Record<string, CachedInsight> | null>(null);
  const [llmInsightsLoading, setLlmInsightsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (showBreakdowns) params.set("include_breakdowns", "1");

    fetch(`/api/dashboard/${clientId}/ads?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar el tablero de Google Ads.");
        }
        return (await response.json()) as GoogleAdsMetricsResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, range, showBreakdowns]);

  // Insights LLM: pedido aparte del fetch principal (ver mismo patrón en
  // MetaAdsDashboard) — tarda más porque llama a Claude por cada métrica.
  function loadInsights(force: boolean): () => void {
    if (!data?.metrics) return () => {};
    let cancelled = false;
    setLlmInsightsLoading(true);

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      dashboard,
      metrics: metricDefs.map((def) => def.key).join(","),
    });
    if (force) params.set("force", "1");

    fetch(`/api/dashboard/${clientId}/ads/insights?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as Record<string, CachedInsight>;
      })
      .then((json) => {
        if (!cancelled && json) setLlmInsights(json);
      })
      .catch(() => {
        // Best effort: si falla, el tablero sigue funcionando sin insights de texto.
      })
      .finally(() => {
        if (!cancelled) setLlmInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    if (!data?.metrics) {
      setLlmInsights(null);
      return;
    }
    return loadInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, dashboard, metricDefs, range, data?.metrics]);

  function updateUrl(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });
    updateUrl(nextPreset, nextRange);
  }

  // Botón toggle: mismo criterio que MetaAdsDashboard (cola FIFO al llegar al máximo).
  function handleSelectMetric(key: GoogleAdsMetricKey) {
    setSelectedMetrics((prev) => {
      if (prev.includes(key)) return prev.filter((selected) => selected !== key);
      if (prev.length < MAX_SELECTED_METRICS) return [...prev, key];
      return [...prev.slice(1), key];
    });
  }

  const insights = data?.metrics ? buildGoogleAdsInsights(data.metrics, data.metrics.previous, data.metrics.currencyCode) : [];
  const keyedInsights = useKeyedInsights(insights, "ads", "google-ads-metric");

  const scorecards = data?.metrics
    ? metricDefs.map((def) => ({
        ...def,
        value: formatMetricValue(data.metrics![def.key], def.format, data.metrics!.currencyCode),
        formatValue: (v: number) => formatMetricValue(v, def.format, data.metrics!.currencyCode),
        chartData: buildMiniSeries(data.timeSeries?.current ?? [], def.key),
      }))
    : [];

  const chartMetrics: GoogleAdsChartMetric[] = data?.metrics
    ? selectedMetrics.flatMap((key, index) => {
        const def = metricDefs.find((item) => item.key === key);
        if (!def) return [];
        return [
          {
            key: def.key,
            label: def.label,
            formatValue: (value: number) => formatMetricValue(value, def.format, data.metrics!.currencyCode),
            color: METRIC_SLOT_COLORS[index]!,
          },
        ];
      })
    : [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>
      {data?.metrics && (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" disabled={llmInsightsLoading} onClick={() => loadInsights(true)}>
            <Sparkles className="h-3.5 w-3.5" />
            {llmInsightsLoading ? "Generando…" : "Generar insights"}
          </Button>
        </div>
      )}

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRangeState({ preset, range: { ...range } })}>
            Reintentar
          </Button>
        </div>
      ) : loading || !data ? (
        <GoogleAdsSkeleton count={metricDefs.length} />
      ) : !data.metrics ? (
        <p className="text-sm text-muted-foreground">Este cliente todavía no tiene Google Ads conectado.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {scorecards.map((card, index) => {
              const colorIndex = selectedMetrics.indexOf(card.key);
              const cached = llmInsights?.[card.key];
              const llmInsight: LlmInsightDisplay | null = cached
                ? { text: cached.text, sentiment: cached.sentiment }
                : null;
              return (
                <GoogleAdsMetricCard
                  key={card.key}
                  metricKey={card.key}
                  label={card.label}
                  value={card.value}
                  formatValue={card.formatValue}
                  chartData={card.chartData}
                  color={colorIndex === -1 ? null : METRIC_SLOT_COLORS[colorIndex]!}
                  onSelect={handleSelectMetric}
                  keyedInsight={keyedInsights[index]}
                  llmInsight={llmInsight}
                  llmInsightLoading={llmInsightsLoading && !cached}
                />
              );
            })}
          </div>

          <Card>
            <CardContent className="pt-6">
              <GoogleAdsTrendChart current={data.timeSeries?.current ?? []} previous={data.timeSeries?.previous ?? []} metrics={chartMetrics} />
            </CardContent>
          </Card>

          {showBreakdowns &&
            (() => {
              const primaryKey = selectedMetrics[0];
              const def = primaryKey ? metricDefs.find((item) => item.key === primaryKey) : undefined;
              if (!def || !data.breakdowns) {
                return (
                  <p className="text-sm text-muted-foreground">
                    Seleccioná una métrica para ver su desglose por dispositivo, red, campaña y más.
                  </p>
                );
              }
              return (
                <GoogleAdsBreakdownSection
                  breakdowns={data.breakdowns}
                  metricKey={def.key}
                  metricLabel={def.label}
                  formatValue={(value) => formatMetricValue(value, def.format, data.metrics!.currencyCode)}
                  color={METRIC_SLOT_COLORS[0]!}
                />
              );
            })()}
        </div>
      )}
    </div>
  );
}
