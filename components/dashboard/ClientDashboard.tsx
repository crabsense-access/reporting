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
import { GA4BreakdownSection } from "@/components/dashboard/GA4BreakdownCharts";
import { buildMiniSeries, GA4MetricCard, type LlmInsightDisplay } from "@/components/dashboard/GA4MetricCard";
import { METRIC_SLOT_COLORS, GA4TrendChart, type GA4ChartMetric } from "@/components/dashboard/GA4TrendChart";
import { GoalsSection } from "@/components/dashboard/GoalsSection";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import { buildBasicInsights } from "@/lib/insights/dashboard-insights";
import type { CachedInsight } from "@/lib/insights/insight-cache";
import { BASIC_METRIC_DEFS, formatBasicMetricValue, type GA4BasicMetricKey } from "@/lib/ga4/metric-defs";
import type { DashboardMetricsResponse } from "@/lib/ga4/types";

interface ClientDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle) — varía por página aunque compartan este mismo componente. */
  breadcrumbSubtitle?: string;
}

// Único tablero de Analítica — sin split de Costos (GA4 no tiene un
// concepto de costo propio) — mismo dashboard key para las 4 métricas
// básicas y para cada objetivo, todos en la caché dashboard_insights.
const DASHBOARD_KEY = "analitica_audiencia";
const MAX_SELECTED_METRICS = 2;

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

export function ClientDashboard({ clientId, breadcrumbSubtitle }: ClientDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [selectedMetrics, setSelectedMetrics] = useState<GA4BasicMetricKey[]>([BASIC_METRIC_DEFS[0]!.key]);
  const [data, setData] = useState<DashboardMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmInsights, setLlmInsights] = useState<Record<string, CachedInsight> | null>(null);
  const [llmInsightsLoading, setLlmInsightsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const granularity = getDefaultGranularity(range);
    const params = new URLSearchParams({ from: range.from, to: range.to, granularity, include_breakdowns: "1" });

    fetch(`/api/dashboard/${clientId}/metrics?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar el tablero.");
        }
        return (await response.json()) as DashboardMetricsResponse;
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
  }, [clientId, range]);

  // Insights LLM: se piden las 4 métricas básicas + cada objetivo
  // configurado, en una sola llamada (ver mismo patrón en
  // MetaAdsDashboard/GoogleAdsDashboard) — tarda más que el fetch principal
  // porque llama a Claude por cada métrica, así que va aparte.
  function loadInsights(force: boolean): () => void {
    if (!data?.basicMetrics) return () => {};
    let cancelled = false;
    setLlmInsightsLoading(true);

    const goalNames = data.goals.map((goal) => goal.name);
    const metrics = [...BASIC_METRIC_DEFS.map((def) => def.key), ...goalNames];
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      dashboard: DASHBOARD_KEY,
      metrics: metrics.join(","),
    });
    if (force) params.set("force", "1");

    fetch(`/api/dashboard/${clientId}/metrics/insights?${params.toString()}`)
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
    if (!data?.basicMetrics) {
      setLlmInsights(null);
      return;
    }
    return loadInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range, data?.basicMetrics, data?.goals]);

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });

    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleSelectMetric(key: GA4BasicMetricKey) {
    setSelectedMetrics((prev) => {
      if (prev.includes(key)) return prev.filter((selected) => selected !== key);
      if (prev.length < MAX_SELECTED_METRICS) return [...prev, key];
      return [...prev.slice(1), key];
    });
  }

  const insights = data?.basicMetrics && data.basicMetricsPrevious ? buildBasicInsights(data.basicMetrics, data.basicMetricsPrevious) : [];
  const keyedInsights = useKeyedInsights(insights, "analitica", "metric");

  const scorecards = data?.basicMetrics
    ? BASIC_METRIC_DEFS.map((def) => ({
        ...def,
        value: formatBasicMetricValue(data.basicMetrics![def.key], def.format),
        formatValue: (v: number) => formatBasicMetricValue(v, def.format),
        chartData: buildMiniSeries(data.timeSeries?.current ?? [], def.key),
      }))
    : [];

  const chartMetrics: GA4ChartMetric[] = data?.basicMetrics
    ? selectedMetrics.flatMap((key, index) => {
        const def = BASIC_METRIC_DEFS.find((item) => item.key === key);
        if (!def) return [];
        return [
          {
            key: def.key,
            label: def.label,
            formatValue: (value: number) => formatBasicMetricValue(value, def.format),
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
      {data?.basicMetrics && (
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
        <DashboardSkeleton />
      ) : (
        <>
          {data.basicMetrics && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {scorecards.map((card, index) => {
                  const colorIndex = selectedMetrics.indexOf(card.key);
                  const cached = llmInsights?.[card.key];
                  const llmInsight: LlmInsightDisplay | null = cached
                    ? { text: cached.text, sentiment: cached.sentiment }
                    : null;
                  return (
                    <GA4MetricCard
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
                  <GA4TrendChart current={data.timeSeries?.current ?? []} previous={data.timeSeries?.previous ?? []} metrics={chartMetrics} />
                </CardContent>
              </Card>

              {(() => {
                const primaryKey = selectedMetrics[0];
                const def = primaryKey ? BASIC_METRIC_DEFS.find((item) => item.key === primaryKey) : undefined;
                if (!def || !data.breakdowns) {
                  return (
                    <p className="text-sm text-muted-foreground">
                      Seleccioná una métrica para ver su desglose por dispositivo, canal, país y más.
                    </p>
                  );
                }
                return (
                  <GA4BreakdownSection
                    breakdowns={data.breakdowns}
                    metricKey={def.key}
                    metricLabel={def.label}
                    formatValue={(value) => formatBasicMetricValue(value, def.format)}
                    color={METRIC_SLOT_COLORS[0]!}
                  />
                );
              })()}
            </div>
          )}
          <GoalsSection
            clientId={clientId}
            range={range}
            defaultGranularity={getDefaultGranularity(range)}
            goals={data.goals}
            llmInsights={llmInsights}
            llmInsightsLoading={llmInsightsLoading}
          />
        </>
      )}
    </div>
  );
}
