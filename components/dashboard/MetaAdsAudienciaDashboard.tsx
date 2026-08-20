"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import { formatCompactNumber, formatDecimal, formatNumber } from "@/lib/format";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import type { MetaAdsMetrics, MetaAdsTimeSeriesPoint } from "@/lib/meta-ads/reports";

interface MetaAdsAudienciaResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
}

interface MetaAdsAudienciaDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

async function fetchMetaAdsAudiencia(
  clientId: string,
  range: DateRangeValue,
  options: { granularity?: Granularity } = {}
): Promise<MetaAdsAudienciaResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (options.granularity) params.set("granularity", options.granularity);
  const response = await fetch(`/api/dashboard/${clientId}/meta-ads/audiencia?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el tablero de Audiencia de Meta Ads.");
  }
  return (await response.json()) as MetaAdsAudienciaResponse;
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const GRANULARITY_ADJECTIVE: Record<Granularity, string> = { day: "diaria", week: "semanal", month: "mensual" };

function formatBucketLabel(date: string, granularity: Granularity): string {
  const start = parseISO(date);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  return `Sem. del ${format(start, "d MMM", { locale: es })}`;
}

function formatBucketFullLabel(date: string, granularity: Granularity): string {
  const start = parseISO(date);
  if (granularity === "day") return format(start, "d 'de' MMMM", { locale: es });
  if (granularity === "month") return format(start, "MMMM yyyy", { locale: es });
  return `Semana del ${format(start, "d 'de' MMMM", { locale: es })}`;
}

const REACH_INFO_TEXT =
  "Cantidad de personas únicas alcanzadas por tus anuncios en el período. A diferencia de Impresiones, no cuenta vistas repetidas de la misma persona.";

// Color de la línea de Frecuencia — mismo naranja ya usado como 2do color de
// serie en otros gráficos combinados de Meta Ads (METRIC_SLOT_COLORS[1]).
const FREQUENCY_LINE_COLOR = "#eb6834";

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

// Umbral de "sin cambio real" — mismo criterio (5%) que NEUTRAL_THRESHOLD en
// generateInsight.ts, para clasificar Alcance/Frecuencia estable vs. subió/
// bajó de forma consistente con el resto del proyecto.
const STABLE_THRESHOLD_PCT = 5;
// "Frecuencia sana" vs. "alta" — umbral absoluto dado en el pedido, no de
// variación.
const FREQUENCY_HEALTHY_MAX = 4;

// Insight de reglas de la sección "Saturación de Audiencia" (Prompt 97,
// punto 4) — cruza Alcance y Frecuencia del período actual vs. el anterior.
// Sin señal clara (Alcance estable/bajó Y Frecuencia no subió) no se muestra
// nada, mismo criterio que otros insights de nivel/cruce de este proyecto
// (ej. SeoDashboard buildOverviewInsights) que se omiten sin un hallazgo.
function buildAudienceSaturationInsight(metrics: MetaAdsMetrics): Insight | null {
  const reachPctChange = pctChange(metrics.reach, metrics.previous.reach);
  const frequencyPctChange = pctChange(metrics.frequency, metrics.previous.frequency);
  const reachGrew = reachPctChange > STABLE_THRESHOLD_PCT;
  const frequencyRose = frequencyPctChange > STABLE_THRESHOLD_PCT;

  let text: string;
  let sentiment: InsightSentiment;

  if (!reachGrew && frequencyRose) {
    const direction = reachPctChange >= -STABLE_THRESHOLD_PCT ? "se mantuvo estable" : "bajó";
    text = `El Alcance ${direction} este período mientras la Frecuencia subió a **${formatDecimal(metrics.frequency)}** — le estás mostrando el anuncio a la misma audiencia cada vez más veces, sin sumar gente nueva. Considerá ampliar la audiencia objetivo o probar nuevos públicos antes de que la fatiga afecte el rendimiento.`;
    sentiment = "negative";
  } else if (reachGrew && metrics.frequency < FREQUENCY_HEALTHY_MAX) {
    text = `El Alcance creció un **${reachPctChange.toFixed(0)}%** este período, con una Frecuencia saludable de **${formatDecimal(metrics.frequency)}**. Buen momento para seguir escalando — estás sumando audiencia nueva sin saturarla.`;
    sentiment = "positive";
  } else if (reachGrew) {
    text = `El Alcance creció un **${reachPctChange.toFixed(0)}%**, pero la Frecuencia ya está en **${formatDecimal(metrics.frequency)}** — señal de que dentro de esa audiencia más grande, ciertos segmentos ya están viendo el anuncio muchas veces. Revisá si conviene excluir a quienes ya convirtieron o vieron el anuncio muchas veces, para liberar presupuesto hacia audiencia realmente nueva.`;
    sentiment = "neutral";
  } else {
    return null;
  }

  return {
    label: "Saturación de audiencia",
    current: metrics.frequency,
    previous: metrics.previous.frequency,
    variationPct: frequencyPctChange,
    sentiment,
    isSpike: false,
    text,
  };
}

interface SaturationPoint {
  label: string;
  fullLabel: string;
  reach: number;
  frequency: number;
}

// "Meta Ads > Audiencia" (Prompt 97) — reemplaza el placeholder del Prompt
// 74: sección "Alcance y Crecimiento" (1 scorecard con MetricScorecardGroup,
// mismo criterio que "Cantidad de Keywords") y "Saturación de Audiencia"
// (Alcance en barras + Frecuencia en línea de eje secundario autoescalado,
// con insight de reglas debajo). Sin selector de evento de conversión — esta
// hoja no depende de ningún action_type. No toca Visión General, Costos,
// Conversiones ni Anuncios.
export function MetaAdsAudienciaDashboard({ clientId, breadcrumbSubtitle }: MetaAdsAudienciaDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));

  const [data, setData] = useState<MetaAdsAudienciaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [saturationGranularity, setSaturationGranularity] = useState<Granularity>(() => getDefaultGranularity(range));
  const [saturationSeries, setSaturationSeries] = useState<MetaAdsTimeSeriesPoint[]>([]);
  const [saturationLoading, setSaturationLoading] = useState(true);

  // Cache por (rango, granularidad), compartida entre el mini-gráfico del
  // scorecard "Alcance total" y el gráfico de "Saturación de Audiencia" —
  // si ambos piden la misma granularidad (ej. "día" al montar), comparten
  // una sola consulta en vez de 2 redundantes. Mismo criterio que Costos/
  // Conversiones/Anuncios.
  const chartDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}`);
  const chartCacheRef = useRef<Map<string, Promise<MetaAdsAudienciaResponse>>>(new Map());

  function getOrFetchChart(datasetKey: string, g: Granularity): Promise<MetaAdsAudienciaResponse> {
    const cache = chartCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchMetaAdsAudiencia(clientId, range, { granularity: g });
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchReachTrend = useCallback(
    (g: Granularity): Promise<ScorecardTrendPoint[]> => {
      const datasetKey = `${clientId}|${range.from}|${range.to}`;
      return getOrFetchChart(datasetKey, g).then((json) =>
        (json.timeSeries?.current ?? []).map((point) => ({ label: formatBucketLabel(point.date, g), value: point.reach }))
      );
    },
    [clientId, range]
  );

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

  useEffect(() => {
    setSaturationGranularity(getDefaultGranularity(range));
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}`;
    if (chartDatasetKeyRef.current !== datasetKey) {
      chartCacheRef.current = new Map();
      chartDatasetKeyRef.current = datasetKey;
    }

    setLoading(true);
    setError(null);

    fetchMetaAdsAudiencia(clientId, range)
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

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}`;
    setSaturationLoading(true);

    getOrFetchChart(datasetKey, saturationGranularity)
      .then((json) => {
        if (!cancelled) setSaturationSeries(json.timeSeries?.current ?? []);
      })
      .catch(() => {
        if (!cancelled) setSaturationSeries([]);
      })
      .finally(() => {
        if (!cancelled) setSaturationLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range, saturationGranularity]);

  const scorecardMetrics: MetricScorecardConfig[] = data?.metrics
    ? [
        {
          key: "reach",
          label: "Alcance total",
          currentValue: data.metrics.reach,
          previousValue: data.metrics.previous.reach,
          format: "number",
          higherIsBetter: true,
          infoText: REACH_INFO_TEXT,
          fetchTrend: fetchReachTrend,
        },
      ]
    : [];

  const saturationInsight = data?.metrics ? buildAudienceSaturationInsight(data.metrics) : null;

  const saturationData: SaturationPoint[] = saturationSeries.map((point) => ({
    label: formatBucketLabel(point.date, saturationGranularity),
    fullLabel: formatBucketFullLabel(point.date, saturationGranularity),
    reach: point.reach,
    frequency: point.frequency,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRangeState({ preset, range: { ...range } })}>
            Reintentar
          </Button>
        </div>
      ) : loading || !data ? (
        <div className="flex flex-col gap-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !data.metrics ? (
        <p className="text-sm text-muted-foreground">Este cliente todavía no tiene Meta Ads conectado.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground">Alcance y Crecimiento</h2>
          <MetricScorecardGroup metrics={scorecardMetrics} gridClassName="grid grid-cols-1" />

          <h2 className="text-lg font-semibold text-foreground">Saturación de Audiencia</h2>
          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-base font-bold text-foreground">
                  Alcance y Frecuencia {GRANULARITY_ADJECTIVE[saturationGranularity]}
                  {saturationLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                <div className="flex gap-1">
                  {AGGREGATION_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      className="uppercase"
                      variant={saturationGranularity === option.value ? "default" : "ghost"}
                      onClick={() => setSaturationGranularity(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                  Alcance
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: FREQUENCY_LINE_COLOR }} />
                  Frecuencia
                </div>
              </div>

              {saturationData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={saturationData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                      <YAxis
                        yAxisId="reach"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        width={48}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => formatCompactNumber(value)}
                      />
                      {/* Eje de Frecuencia a la derecha, SIN dominio fijo —
                          autoescala según los datos (la frecuencia varía
                          demasiado entre cuentas como para fijarle un techo,
                          mismo criterio que el eje de CPA en Meta Ads >
                          Anuncios). */}
                      <YAxis
                        yAxisId="frequency"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                        width={40}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => formatDecimal(value)}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const point = payload[0]?.payload as SaturationPoint | undefined;
                          if (!point) return null;
                          return (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium text-foreground">{point.fullLabel}</p>
                              <p className="text-muted-foreground">Alcance: {formatNumber(point.reach)}</p>
                              <p className="text-muted-foreground">Frecuencia: {formatDecimal(point.frequency)}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar yAxisId="reach" dataKey="reach" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                        {saturationGranularity !== "day" && (
                          <LabelList
                            dataKey="reach"
                            position="top"
                            formatter={(value: string | number | boolean | null | undefined) => formatNumber(Number(value ?? 0))}
                            fontSize={10}
                          />
                        )}
                      </Bar>
                      <Line
                        yAxisId="frequency"
                        type="monotone"
                        dataKey="frequency"
                        stroke={FREQUENCY_LINE_COLOR}
                        strokeWidth={2}
                        dot={{ r: 3, fill: FREQUENCY_LINE_COLOR, strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {saturationInsight && <InsightsList insights={[saturationInsight]} sectionKey="ads" keyPrefix="meta-audiencia-saturation" />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
