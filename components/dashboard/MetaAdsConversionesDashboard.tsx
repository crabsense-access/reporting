"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetaAdsConversionFunnel } from "@/components/dashboard/MetaAdsConversionFunnel";
import { MetaAdsRankedTable } from "@/components/dashboard/MetaAdsBreakdownCharts";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import { formatCurrency, formatDecimal, formatNumber } from "@/lib/format";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import { DEFAULT_CONVERSION_ACTION_TYPE } from "@/lib/meta-ads/reports";
import type { MetaAdsBreakdownRow, MetaAdsConversionEventOption, MetaAdsMetrics, MetaAdsTimeSeriesPoint } from "@/lib/meta-ads/reports";

interface MetaAdsConversionesResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  hasValueTracking: boolean;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  campaigns: MetaAdsBreakdownRow[];
}

interface MetaAdsConversionesDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

async function fetchMetaAdsConversiones(
  clientId: string,
  range: DateRangeValue,
  conversionEvent: string,
  options: { granularity?: Granularity } = {}
): Promise<MetaAdsConversionesResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to, conversion_event: conversionEvent });
  if (options.granularity) params.set("granularity", options.granularity);
  const response = await fetch(`/api/dashboard/${clientId}/meta-ads/conversiones?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el tablero de Conversiones de Meta Ads.");
  }
  return (await response.json()) as MetaAdsConversionesResponse;
}

// "lead" -> "Lead", "add_to_cart" -> "Add to cart" — mismo criterio que
// Meta Ads > Costos (formatActionTypeLabel en MetaAdsCostosDashboard.tsx),
// duplicado acá a propósito: esta hoja no comparte estado ni helpers con
// Costos (Prompt 93, punto 2 — selector independiente).
function formatActionTypeLabel(actionType: string): string {
  const spaced = actionType.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Mismo componente/patrón que ConversionEventSelector en
// MetaAdsCostosDashboard.tsx — instancia y estado propios, sin compartir
// nada con el selector de Costos al navegar entre hojas.
function ConversionEventSelector({
  value,
  options,
  onChange,
}: {
  value: string;
  options: MetaAdsConversionEventOption[];
  onChange: (actionType: string) => void;
}) {
  const hasCurrentValue = options.some((option) => option.actionType === value);
  const allOptions = hasCurrentValue ? options : [{ actionType: value, count: 0 }, ...options];

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="meta-ads-conversiones-conversion-event" className="text-xs text-muted-foreground">
        Evento de conversión
      </Label>
      <select
        id="meta-ads-conversiones-conversion-event"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={options.length === 0}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
      >
        {allOptions.map((option) => (
          <option key={option.actionType} value={option.actionType}>
            {formatActionTypeLabel(option.actionType)} ({formatNumber(option.count)})
          </option>
        ))}
      </select>
    </div>
  );
}

function formatBucketLabel(date: string, granularity: Granularity): string {
  const start = parseISO(date);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  return `Sem. del ${format(start, "d MMM", { locale: es })}`;
}

// Las 4 métricas posibles de scorecard — cuáles 4 de las 6 se muestran
// depende de hasValueTracking (Prompt 93, punto 3).
type ConversionMetricKey = "conversions" | "cpa" | "roas" | "conversionValue" | "conversionRate" | "spend";

const METRIC_DESCRIPTIONS: Record<ConversionMetricKey, string> = {
  conversions: "Cantidad de veces que se completó el evento de conversión seleccionado arriba.",
  cpa: "Cuánto costó en promedio cada conversión de este tipo.",
  roas: "Retorno sobre la inversión publicitaria — por cada $1 invertido, cuánto generó en ventas. Mayor a 1 significa que la inversión se pagó sola.",
  conversionValue: "Suma del valor de compra (revenue) generado por las conversiones de este tipo en el período.",
  conversionRate:
    "Porcentaje de clics que terminaron en una conversión. Mide qué tan bien convierte la landing page o el formulario, una vez que la persona ya hizo clic.",
  spend: "Inversión total en Meta Ads durante el período seleccionado.",
};

// Mismo criterio de "mapa de calor" por columna que ya usa
// KeywordChurnCard.tsx (opacidad proporcional al valor de la fila sobre el
// máximo de ESA columna) — duplicado acá a propósito, sin import cruzado
// entre hojas.
function heatmapCellStyle(value: number, max: number, rgb: string, maxOpacity: number): CSSProperties {
  if (max <= 0) return {};
  const intensity = Math.min(value / max, 1);
  return { backgroundColor: `rgba(${rgb}, ${(intensity * maxOpacity).toFixed(2)})` };
}

// Un color por columna (mismo criterio que KeywordChurnCard: colores
// distintos por columna, no por fila) — CPA en rojo porque más caro es peor,
// las otras dos en los colores categóricos ya usados en el resto del
// proyecto.
const COUNT_HEATMAP_RGB = "42, 120, 214";
const PERCENT_HEATMAP_RGB = "234, 158, 8";
const CPA_HEATMAP_RGB = "239, 68, 68";
const HEATMAP_MAX_OPACITY = 0.4;
const HEADER_BORDER_COLOR = "hsl(220 13% 70%)";

// Alto para mostrar 8 filas de datos (header fijo aparte): header (36px) + 8
// filas (~36px c/u, mismo alto que el header ya que ambos usan py-2 con
// texto text-sm).
const BREAKDOWN_TABLE_MAX_HEIGHT = 36 * 9;

function BreakdownTableHeaderCell({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`sticky top-0 z-10 h-9 py-2 pr-2 ${align === "left" ? "pl-2 text-left" : "text-right"}`}
      style={{ backgroundColor: "hsl(var(--card))", boxShadow: `inset 0 -2px 0 0 ${HEADER_BORDER_COLOR}` }}
    >
      {children}
    </th>
  );
}

// Tabla "Tipo de evento | Cantidad | % del total | CPA" (Prompts 93-94) —
// reusa availableConversionEvents (mismo actions[] del período que ya trajo
// fetchMetaAdsMetrics, sin pedir nada de nuevo) en vez de un desglose por
// campaña: CPA de cada tipo = mismo gasto total del período ÷ la cantidad
// de ESE tipo (el gasto no está atribuido por tipo de evento en la API de
// Meta, es una sola inversión total). Header fijo + scroll a partir de la
// 9na fila, con mapa de calor por columna para ubicar de un vistazo los
// tipos de evento más grandes/caros.
function ConversionEventBreakdownTable({
  events,
  spend,
  currencyCode,
}: {
  events: MetaAdsConversionEventOption[];
  spend: number;
  currencyCode: string;
}) {
  const total = events.reduce((sum, event) => sum + event.count, 0);
  const rows = events.map((event) => ({
    ...event,
    pct: total > 0 ? (event.count / total) * 100 : 0,
    cpa: event.count > 0 ? spend / event.count : 0,
  }));
  const maxCount = rows.reduce((max, row) => Math.max(max, row.count), 0);
  const maxPct = rows.reduce((max, row) => Math.max(max, row.pct), 0);
  const maxCpa = rows.reduce((max, row) => Math.max(max, row.cpa), 0);

  return (
    <div className="overflow-x-auto">
      <div className="overflow-y-auto" style={{ maxHeight: BREAKDOWN_TABLE_MAX_HEIGHT }}>
        <table className="w-full min-w-[480px] table-fixed text-sm">
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              <BreakdownTableHeaderCell align="left">Tipo de evento</BreakdownTableHeaderCell>
              <BreakdownTableHeaderCell>Cantidad</BreakdownTableHeaderCell>
              <BreakdownTableHeaderCell>% del total</BreakdownTableHeaderCell>
              <BreakdownTableHeaderCell>CPA</BreakdownTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.actionType} className="border-b border-border last:border-0">
                <td className="py-2 pl-2 pr-2 text-foreground">{formatActionTypeLabel(row.actionType)}</td>
                <td
                  className="py-2 pr-2 text-right text-foreground"
                  style={heatmapCellStyle(row.count, maxCount, COUNT_HEATMAP_RGB, HEATMAP_MAX_OPACITY)}
                >
                  {formatNumber(row.count)}
                </td>
                <td className="py-2 pr-2 text-right text-foreground" style={heatmapCellStyle(row.pct, maxPct, PERCENT_HEATMAP_RGB, HEATMAP_MAX_OPACITY)}>
                  {row.pct.toFixed(1)}%
                </td>
                <td className="py-2 pr-2 text-right text-foreground" style={heatmapCellStyle(row.cpa, maxCpa, CPA_HEATMAP_RGB, HEATMAP_MAX_OPACITY)}>
                  {formatCurrency(row.cpa, currencyCode)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Insight de reglas debajo de la tabla (Prompt 94) — sobre el NIVEL de
// concentración/costo actual entre tipos de evento, no una variación
// período a período (no hay "período anterior" para un desglose por tipo).
// Descubrimiento: qué tipo domina y qué tan caro es cada uno; recomendación
// según si conviene diversificar o reforzar el tipo más barato.
function buildConversionEventBreakdownInsight(
  events: MetaAdsConversionEventOption[],
  spend: number,
  currencyCode: string
): Insight | null {
  if (events.length < 2) return null;

  const total = events.reduce((sum, event) => sum + event.count, 0);
  const withCpa = events.map((event) => ({ ...event, cpa: event.count > 0 ? spend / event.count : 0 }));
  const dominant = withCpa[0]!; // ya viene ordenado desc por count
  const dominantPct = total > 0 ? (dominant.count / total) * 100 : 0;
  const cheapest = [...withCpa].filter((event) => event.count > 0).sort((a, b) => a.cpa - b.cpa)[0];

  let discovery = `**${formatActionTypeLabel(dominant.actionType)}** concentra el **${dominantPct.toFixed(0)}%** de tus conversiones (**${formatNumber(dominant.count)}** de **${formatNumber(total)}**), con un CPA de **${formatCurrency(dominant.cpa, currencyCode)}**.`;

  let recommendation: string;
  let sentiment: InsightSentiment;
  if (cheapest && cheapest.actionType !== dominant.actionType && dominant.cpa > 0 && cheapest.cpa < dominant.cpa * 0.7) {
    discovery += ` **${formatActionTypeLabel(cheapest.actionType)}** es notablemente más barato (**${formatCurrency(cheapest.cpa, currencyCode)}** por conversión).`;
    recommendation = `Evaluá si conviene reforzar campañas orientadas a **${formatActionTypeLabel(cheapest.actionType)}** — está costando bastante menos por resultado que tu tipo de evento dominante.`;
    sentiment = "neutral";
  } else if (dominantPct >= 70) {
    recommendation =
      "Tu tracking de conversiones está muy concentrado en un solo tipo de evento — si dependés de una sola fuente, considerá diversificar los objetivos de campaña para no quedar expuesto a un solo canal de resultados.";
    sentiment = "neutral";
  } else {
    recommendation = "Tus conversiones están razonablemente distribuidas entre los distintos tipos de evento.";
    sentiment = "positive";
  }

  return {
    label: "Desglose por Tipo de Conversión",
    current: dominant.count,
    previous: 0,
    variationPct: 0,
    sentiment,
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// "Meta Ads > Conversiones" (Prompt 93) — reemplaza el placeholder del
// Prompt 74: 4 scorecards con MetricScorecardGroup (Prompt 92), funnel
// Impresiones → Clicks → Conversiones, desglose por tipo de conversión
// (solo si hay más de 1 tipo trackeado) y ranking de las 5 campañas mejor
// rankeadas por ROAS o CPA según corresponda. No toca Visión General, Costos
// ni ningún otro bloque — selector de evento de conversión independiente,
// sin compartir estado con el de Costos.
export function MetaAdsConversionesDashboard({ clientId, breadcrumbSubtitle }: MetaAdsConversionesDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  // null = todavía no se eligió evento — al llegar el primer resultado se
  // fija automáticamente al de mayor volumen del período, sin esperar una
  // elección manual (mismo criterio que Costos).
  const [conversionEvent, setConversionEvent] = useState<string | null>(() => searchParams.get("conversion_event"));

  const [data, setData] = useState<MetaAdsConversionesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveConversionEvent = conversionEvent ?? DEFAULT_CONVERSION_ACTION_TYPE;

  // Cache por (rango, evento, granularidad) para los gráficos individuales
  // de cada scorecard — mismo criterio que Costos: varias tarjetas piden la
  // misma granularidad por defecto ("día") al montar, así que comparten una
  // sola consulta en vez de 4 redundantes.
  const chartDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`);
  const chartCacheRef = useRef<Map<string, Promise<MetaAdsConversionesResponse>>>(new Map());

  function getOrFetchChart(datasetKey: string, g: Granularity): Promise<MetaAdsConversionesResponse> {
    const cache = chartCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchMetaAdsConversiones(clientId, range, effectiveConversionEvent, { granularity: g });
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const makeFetchTrend = useCallback(
    (metricKey: ConversionMetricKey) => (g: Granularity): Promise<ScorecardTrendPoint[]> => {
      const datasetKey = `${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`;
      return getOrFetchChart(datasetKey, g).then((json) =>
        (json.timeSeries?.current ?? []).map((point) => ({ label: formatBucketLabel(point.date, g), value: point[metricKey] as number }))
      );
    },
    [clientId, range, effectiveConversionEvent]
  );

  function updateUrl(nextPreset: DateRangePreset, nextRange: DateRangeValue, nextConversionEvent: string | null) {
    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    if (nextConversionEvent) params.set("conversion_event", nextConversionEvent);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });
    updateUrl(nextPreset, nextRange, conversionEvent);
  }

  function handleConversionEventChange(nextConversionEvent: string) {
    setConversionEvent(nextConversionEvent);
    updateUrl(preset, range, nextConversionEvent);
  }

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`;
    if (chartDatasetKeyRef.current !== datasetKey) {
      chartCacheRef.current = new Map();
      chartDatasetKeyRef.current = datasetKey;
    }

    setLoading(true);
    setError(null);

    fetchMetaAdsConversiones(clientId, range, effectiveConversionEvent)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        // Si el usuario todavía no eligió evento a mano, se fija al de mayor
        // volumen del período recién conocido — dispara un refetch con el
        // valor correcto (mismo criterio que Costos).
        if (conversionEvent === null) {
          const topEvent = json.availableConversionEvents[0]?.actionType;
          if (topEvent && topEvent !== effectiveConversionEvent) setConversionEvent(topEvent);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range, effectiveConversionEvent]);

  const currencyCode = data?.metrics?.currencyCode ?? "USD";
  const hasValueTracking = data?.hasValueTracking ?? false;

  const scorecardMetrics: MetricScorecardConfig[] = useMemo(() => {
    if (!data?.metrics) return [];
    const m = data.metrics;

    const conversionsCard: MetricScorecardConfig = {
      key: "conversions",
      label: "Conversiones totales",
      currentValue: m.conversions,
      previousValue: m.previous.conversions,
      format: "number",
      higherIsBetter: true,
      infoText: METRIC_DESCRIPTIONS.conversions,
      fetchTrend: makeFetchTrend("conversions"),
    };
    const cpaCard: MetricScorecardConfig = {
      key: "cpa",
      label: "Costo por conversión (CPA)",
      currentValue: m.cpa,
      previousValue: m.previous.cpa,
      format: "currency",
      currencyCode,
      higherIsBetter: false,
      infoText: METRIC_DESCRIPTIONS.cpa,
      fetchTrend: makeFetchTrend("cpa"),
    };

    if (hasValueTracking) {
      return [
        conversionsCard,
        cpaCard,
        {
          key: "roas",
          label: "ROAS",
          currentValue: m.roas,
          previousValue: m.previous.roas,
          format: "multiplier",
          higherIsBetter: true,
          infoText: METRIC_DESCRIPTIONS.roas,
          fetchTrend: makeFetchTrend("roas"),
        },
        {
          key: "conversionValue",
          label: "Valor de conversión",
          currentValue: m.conversionValue,
          previousValue: m.previous.conversionValue,
          format: "currency",
          currencyCode,
          higherIsBetter: true,
          infoText: METRIC_DESCRIPTIONS.conversionValue,
          fetchTrend: makeFetchTrend("conversionValue"),
        },
      ];
    }

    return [
      conversionsCard,
      cpaCard,
      {
        key: "conversionRate",
        label: "Tasa de Conversión",
        currentValue: m.conversionRate,
        previousValue: m.previous.conversionRate,
        format: "percentage",
        higherIsBetter: true,
        infoText: METRIC_DESCRIPTIONS.conversionRate,
        fetchTrend: makeFetchTrend("conversionRate"),
      },
      {
        key: "spend",
        label: "Gasto total",
        currentValue: m.spend,
        previousValue: m.previous.spend,
        format: "currency",
        currencyCode,
        higherIsBetter: false,
        infoText: METRIC_DESCRIPTIONS.spend,
        fetchTrend: makeFetchTrend("spend"),
      },
    ];
  }, [data?.metrics, hasValueTracking, currencyCode, makeFetchTrend]);

  // Top 5 campañas por ROAS desc (si hay value tracking) o CPA asc si no —
  // se excluyen las que no tuvieron conversiones en el período (con 0
  // conversiones, cpa/roas quedan en 0 y "ganarían" el ranking sin merecerlo).
  const rankedCampaigns = useMemo(() => {
    const withConversions = (data?.campaigns ?? []).filter((row) => row.current.conversions > 0);
    const sorted = hasValueTracking
      ? [...withConversions].sort((a, b) => b.current.roas - a.current.roas)
      : [...withConversions].sort((a, b) => a.current.cpa - b.current.cpa);
    return sorted.slice(0, 5);
  }, [data?.campaigns, hasValueTracking]);

  const conversionEventBreakdownInsight = data?.metrics
    ? buildConversionEventBreakdownInsight(data.availableConversionEvents, data.metrics.spend, currencyCode)
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>

      {data?.metrics && (
        <div className="flex flex-wrap items-end justify-end gap-3">
          <ConversionEventSelector
            value={effectiveConversionEvent}
            options={data.availableConversionEvents}
            onChange={handleConversionEventChange}
          />
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
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !data.metrics ? (
        <p className="text-sm text-muted-foreground">Este cliente todavía no tiene Meta Ads conectado.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground">Métricas Principales</h2>
          {/* key fuerza a remontar el grupo (y resetear su selección interna)
              cuando cambia el set de métricas al cambiar hasValueTracking —
              si no, la tarjeta seleccionada podría apuntar a un key que ya
              no existe en el nuevo set (ej. "roas" al pasar a un evento sin
              value tracking). */}
          <MetricScorecardGroup key={hasValueTracking ? "value" : "rate"} metrics={scorecardMetrics} defaultSelectedKey="conversions" />

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-base font-bold text-foreground">Funnel: Impresiones → Clicks → Conversiones</p>
              <MetaAdsConversionFunnel
                impressions={data.metrics.impressions}
                linkClicks={data.metrics.linkClicks}
                conversions={data.metrics.conversions}
                ctr={data.metrics.linkClickCtr}
                conversionRate={data.metrics.conversionRate}
              />
            </CardContent>
          </Card>

          {data.availableConversionEvents.length > 1 && (
            <Card className="w-full min-w-0">
              <CardContent className="flex flex-col gap-4 pt-6">
                <p className="text-base font-bold text-foreground">Desglose por Tipo de Conversión</p>
                <ConversionEventBreakdownTable events={data.availableConversionEvents} spend={data.metrics.spend} currencyCode={currencyCode} />
                {conversionEventBreakdownInsight && (
                  <InsightsList insights={[conversionEventBreakdownInsight]} sectionKey="ads" keyPrefix="meta-conversiones-breakdown" />
                )}
              </CardContent>
            </Card>
          )}

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-base font-bold text-foreground">Top 5 Campañas por {hasValueTracking ? "ROAS" : "CPA"}</p>
              <MetaAdsRankedTable
                rows={rankedCampaigns}
                metricKey={hasValueTracking ? "roas" : "cpa"}
                formatValue={hasValueTracking ? (value) => `${formatDecimal(value, 1)}x` : (value) => formatCurrency(value, currencyCode)}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
