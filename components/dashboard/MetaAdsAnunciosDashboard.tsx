"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, ArrowUpDown } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { formatCompactCurrency, formatCompactNumber, formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import { DEFAULT_CONVERSION_ACTION_TYPE } from "@/lib/meta-ads/reports";
import type { MetaAdsAdRankingRow, MetaAdsConversionEventOption, MetaAdsMetrics, MetaAdsTimeSeriesPoint } from "@/lib/meta-ads/reports";

interface MetaAdsAnunciosResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  activeAdsCurrent: number;
  activeAdsPrevious: number;
  ranking: MetaAdsAdRankingRow[];
}

interface MetaAdsAnunciosDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

async function fetchMetaAdsAnuncios(
  clientId: string,
  range: DateRangeValue,
  conversionEvent: string,
  options: { granularity?: Granularity } = {}
): Promise<MetaAdsAnunciosResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to, conversion_event: conversionEvent });
  if (options.granularity) params.set("granularity", options.granularity);
  const response = await fetch(`/api/dashboard/${clientId}/meta-ads/anuncios?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el tablero de Anuncios de Meta Ads.");
  }
  return (await response.json()) as MetaAdsAnunciosResponse;
}

// Mismo componente/patrón que ConversionEventSelector en
// MetaAdsCostosDashboard.tsx/MetaAdsConversionesDashboard.tsx — instancia y
// estado propios, sin compartir nada con esas otras hojas.
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
      <Label htmlFor="meta-ads-anuncios-conversion-event" className="text-xs text-muted-foreground">
        Evento de conversión
      </Label>
      <select
        id="meta-ads-anuncios-conversion-event"
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

// "lead" -> "Lead" — duplicado a propósito, mismo criterio que Costos/
// Conversiones (Prompt 93, punto 2: instancia independiente).
function formatActionTypeLabel(actionType: string): string {
  const spaced = actionType.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

// Label corto/largo para un punto {date} de la serie de cuenta completa
// (mismo criterio que Costos/Conversiones/Visión General).
function formatPointBucketLabel(date: string, granularity: Granularity): string {
  const start = parseISO(date);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  return `Sem. del ${format(start, "d MMM", { locale: es })}`;
}

// Misma clave de agrupamiento que pageBucketKey (SeoPageCountBlock.tsx) —
// día = fecha literal, semana = semana ISO, mes = "YYYY-MM".
function adBucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const parsed = parseISO(date);
  return `${getISOWeekYear(parsed)}-W${String(getISOWeek(parsed)).padStart(2, "0")}`;
}

// Enumera TODOS los buckets de calendario que cubren `range` completo — usado
// para bucketizar del lado del cliente la serie diaria por anuncio del
// ranking (mismo criterio que SeoPageCountBlock.tsx, Prompt 60), sin pegarle
// de nuevo a la API al cambiar de fila o de agregación.
function enumerateWindowBuckets(range: DateRangeValue, granularity: Granularity): { key: string; startDate: string; endDate: string }[] {
  const buckets = new Map<string, { key: string; startDate: string; endDate: string }>();
  let cursor = parseISO(range.from);
  const end = parseISO(range.to);
  while (cursor <= end) {
    const date = format(cursor, "yyyy-MM-dd");
    const key = adBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { key, startDate: date, endDate: date };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    buckets.set(key, bucket);
    cursor = addDays(cursor, 1);
  }
  return [...buckets.values()].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

function formatAdBucketLabel(bucket: { startDate: string; endDate: string }, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `${format(start, "d")}-${format(end, "d")} ${format(start, "MMM", { locale: es })}`
    : `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
}

function formatAdBucketFullLabel(bucket: { startDate: string; endDate: string }, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d 'de' MMMM", { locale: es });
  if (granularity === "month") return format(start, "MMMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `Semana del ${format(start, "d")} al ${format(end, "d 'de' MMMM", { locale: es })}`
    : `Semana del ${format(start, "d 'de' MMMM", { locale: es })} al ${format(end, "d 'de' MMMM", { locale: es })}`;
}

type ScorecardMetricKey = "activeAds" | "linkClickCtr" | "frequency" | "cpa";

const METRIC_DESCRIPTIONS: Record<ScorecardMetricKey, string> = {
  activeAds: "Cantidad de anuncios que tuvieron al menos una impresión durante el período seleccionado.",
  linkClickCtr: "Porcentaje de impresiones que resultaron en un clic, considerando todos los anuncios activos del período.",
  frequency:
    "Promedio de veces que una misma persona vio alguno de tus anuncios. Frecuencia alta en varios anuncios a la vez es señal de audiencia saturada.",
  cpa: "Costo promedio por conversión del evento seleccionado, considerando la inversión y los resultados de todos los anuncios activos.",
};

type RankingSortColumn = "key" | "campaignName" | "impressions" | "linkClicks" | "linkClickCtr" | "spend" | "conversions" | "cpa" | "frequency";

const RANKING_COLUMNS: { key: RankingSortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Anuncio", align: "left", width: "w-[20%]" },
  { key: "campaignName", label: "Campaña", align: "left", width: "w-[16%]" },
  { key: "impressions", label: "Impresiones", align: "right", width: "w-[10%]" },
  { key: "linkClicks", label: "Clicks", align: "right", width: "w-[9%]" },
  { key: "linkClickCtr", label: "CTR", align: "right", width: "w-[8%]" },
  { key: "spend", label: "Gasto", align: "right", width: "w-[10%]" },
  { key: "conversions", label: "Conversiones", align: "right", width: "w-[9%]" },
  { key: "cpa", label: "CPA", align: "right", width: "w-[9%]" },
  { key: "frequency", label: "Frecuencia", align: "right", width: "w-[9%]" },
];

// Alto fijo de 8 filas visibles (header 36px + 8 filas × ~34px), el resto
// scrollea — mismo criterio que PageRankingTable en SeoPageCountBlock.tsx
// (Prompt 60), sin header sticky (esa tabla tampoco lo usa).
const RANKING_TABLE_MAX_HEIGHT = 36 + 8 * 34;

// Tabla "Ranking de anuncios" (Prompt 95) — mismo patrón de columnas
// ordenables + selección de fila que PageRankingTable (SeoPageCountBlock.tsx,
// Prompt 60): click en el header reordena, click en la fila la selecciona
// para el gráfico de evolución de abajo, remarcada visualmente. Padding
// parejo (pl-2 solo en la primera columna, pr-2 en todas — Prompt 36).
function AdRankingTable({
  rows,
  currencyCode,
  selectedKey,
  onSelect,
}: {
  rows: MetaAdsAdRankingRow[];
  currencyCode: string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [sort, setSort] = useState<{ column: RankingSortColumn; direction: "asc" | "desc" }>({ column: "spend", direction: "desc" });

  const sortedRows = [...rows].sort((a, b) => {
    let diff: number;
    if (sort.column === "key") diff = a.key.localeCompare(b.key);
    else if (sort.column === "campaignName") diff = a.campaignName.localeCompare(b.campaignName);
    else diff = a.current[sort.column] - b.current[sort.column];
    return sort.direction === "asc" ? diff : -diff;
  });

  function toggleSort(column: RankingSortColumn) {
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === "asc" ? "desc" : "asc" } : { column, direction: "desc" }));
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin anuncios para este período.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="overflow-y-auto" style={{ maxHeight: RANKING_TABLE_MAX_HEIGHT }}>
        <table className="w-full min-w-[720px] table-fixed text-xs">
          <thead>
            <tr className="text-xs font-medium text-muted-foreground">
              {RANKING_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "border-b border-border py-2 pr-2",
                    column.key === "key" && "pl-2",
                    column.width,
                    column.align === "right" ? "text-right" : "text-left"
                  )}
                >
                  <span
                    onClick={() => toggleSort(column.key)}
                    className={cn("inline-flex cursor-pointer select-none items-center gap-1", column.align === "right" && "justify-end")}
                  >
                    {column.label}
                    <ArrowUpDown className={cn("h-3 w-3 shrink-0", sort.column === column.key ? "opacity-100" : "opacity-30")} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.key}
                onClick={() => onSelect(row.key)}
                className={cn("cursor-pointer border-b border-border last:border-0", row.key === selectedKey ? "bg-accent" : "hover:bg-muted/50")}
              >
                <td className="truncate break-words py-2 pl-2 pr-2 align-top text-foreground" title={row.key}>
                  {row.key}
                </td>
                <td className="truncate break-words py-2 pr-2 align-top text-foreground" title={row.campaignName}>
                  {row.campaignName}
                </td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.current.impressions)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.current.linkClicks)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatPercent(row.current.linkClickCtr)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatCurrency(row.current.spend, currencyCode)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.current.conversions)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatCurrency(row.current.cpa, currencyCode)}</td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatDecimal(row.current.frequency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface AdTrendPoint {
  label: string;
  fullLabel: string;
  value: number;
  cpa: number;
}

const CPA_LINE_COLOR = "#eb6834";

// "Meta Ads > Anuncios" (Prompt 95) — reemplaza el placeholder del Prompt
// 74: 4 scorecards con MetricScorecardGroup (Prompt 92), selector de evento
// de conversión independiente, y ranking de anuncios (tabla ordenable +
// seleccionable) con gráfico de evolución del anuncio elegido — Gasto o
// Conversiones como barra principal (selector), CPA siempre como línea en
// eje secundario autoescalado. No toca Visión General, Costos, Conversiones
// ni ningún otro bloque.
export function MetaAdsAnunciosDashboard({ clientId, breadcrumbSubtitle }: MetaAdsAnunciosDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [conversionEvent, setConversionEvent] = useState<string | null>(() => searchParams.get("conversion_event"));

  const [data, setData] = useState<MetaAdsAnunciosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAdKey, setSelectedAdKey] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<"spend" | "conversions">("spend");
  const [rankingGranularity, setRankingGranularity] = useState<Granularity>(() => getDefaultGranularity(range));

  const effectiveConversionEvent = conversionEvent ?? DEFAULT_CONVERSION_ACTION_TYPE;

  // Cache por (rango, evento, granularidad) para los gráficos individuales
  // de los 3 scorecards de cuenta completa (CTR/Frecuencia/CPA promedio) —
  // mismo criterio que Costos/Conversiones.
  const chartDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`);
  const chartCacheRef = useRef<Map<string, Promise<MetaAdsAnunciosResponse>>>(new Map());

  function getOrFetchChart(datasetKey: string, g: Granularity): Promise<MetaAdsAnunciosResponse> {
    const cache = chartCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchMetaAdsAnuncios(clientId, range, effectiveConversionEvent, { granularity: g });
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const makeFetchTrend = useCallback(
    (metricKey: Exclude<ScorecardMetricKey, "activeAds">) => (g: Granularity): Promise<ScorecardTrendPoint[]> => {
      const datasetKey = `${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`;
      return getOrFetchChart(datasetKey, g).then((json) =>
        (json.timeSeries?.current ?? []).map((point) => ({ label: formatPointBucketLabel(point.date, g), value: point[metricKey] as number }))
      );
    },
    [clientId, range, effectiveConversionEvent]
  );

  // "Anuncios activos" no necesita otro pedido de red: el ranking ya trae la
  // serie diaria por anuncio (impressions incluido) — cuenta anuncios
  // distintos con >0 impresiones por bucket, bucketizado del lado del
  // cliente con el mismo criterio que el resto de esta hoja.
  const activeAdsFetchTrend = useCallback(
    (g: Granularity): Promise<ScorecardTrendPoint[]> => {
      const ranking = data?.ranking ?? [];
      const points = enumerateWindowBuckets(range, g).map((bucket) => {
        const activeKeys = new Set<string>();
        for (const row of ranking) {
          for (const point of row.daily) {
            if (point.date >= bucket.startDate && point.date <= bucket.endDate && point.impressions > 0) {
              activeKeys.add(row.key);
              break;
            }
          }
        }
        return { label: formatAdBucketLabel(bucket, g), value: activeKeys.size };
      });
      return Promise.resolve(points);
    },
    [data?.ranking, range]
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
    setRankingGranularity(getDefaultGranularity(range));
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`;
    if (chartDatasetKeyRef.current !== datasetKey) {
      chartCacheRef.current = new Map();
      chartDatasetKeyRef.current = datasetKey;
    }

    setLoading(true);
    setError(null);

    fetchMetaAdsAnuncios(clientId, range, effectiveConversionEvent)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        if (conversionEvent === null) {
          const topEvent = json.availableConversionEvents[0]?.actionType;
          if (topEvent && topEvent !== effectiveConversionEvent) setConversionEvent(topEvent);
        }
        // Mantiene la fila seleccionada si el anuncio sigue en el nuevo
        // ranking, si no vuelve a la primera (mayor Gasto, orden por
        // defecto) — mismo criterio que SeoPageCountBlock.tsx.
        setSelectedAdKey((prev) => {
          const stillExists = prev && json.ranking.some((row) => row.key === prev);
          return stillExists ? prev : (json.ranking[0]?.key ?? null);
        });
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

  const scorecardMetrics: MetricScorecardConfig[] = useMemo(() => {
    if (!data?.metrics) return [];
    const m = data.metrics;
    return [
      {
        key: "activeAds",
        label: "Anuncios activos",
        currentValue: data.activeAdsCurrent,
        previousValue: data.activeAdsPrevious,
        format: "number",
        higherIsBetter: true,
        infoText: METRIC_DESCRIPTIONS.activeAds,
        fetchTrend: activeAdsFetchTrend,
      },
      {
        key: "linkClickCtr",
        label: "CTR promedio",
        currentValue: m.linkClickCtr,
        previousValue: m.previous.linkClickCtr,
        format: "percentage",
        higherIsBetter: true,
        infoText: METRIC_DESCRIPTIONS.linkClickCtr,
        fetchTrend: makeFetchTrend("linkClickCtr"),
      },
      {
        key: "frequency",
        label: "Frecuencia promedio",
        currentValue: m.frequency,
        previousValue: m.previous.frequency,
        format: "decimal",
        higherIsBetter: false,
        infoText: METRIC_DESCRIPTIONS.frequency,
        fetchTrend: makeFetchTrend("frequency"),
      },
      {
        key: "cpa",
        label: "Costo por resultado promedio",
        currentValue: m.cpa,
        previousValue: m.previous.cpa,
        format: "currency",
        currencyCode,
        higherIsBetter: false,
        infoText: METRIC_DESCRIPTIONS.cpa,
        fetchTrend: makeFetchTrend("cpa"),
      },
    ];
  }, [data?.metrics, data?.activeAdsCurrent, data?.activeAdsPrevious, currencyCode, makeFetchTrend, activeAdsFetchTrend]);

  // Gráfico de evolución del anuncio seleccionado (Prompt 95, punto 4) —
  // reutiliza `row.daily` (ya viene en el mismo fetch del ranking, sin pedir
  // de nuevo) y lo bucketiza según rankingGranularity, igual que
  // SeoPageCountBlock.tsx. CPA se recalcula por bucket (spend÷conversions
  // del bucket), nunca promediando los CPA diarios.
  const selectedAd = data?.ranking.find((row) => row.key === selectedAdKey) ?? null;
  const adTrendData: AdTrendPoint[] = selectedAd
    ? enumerateWindowBuckets(range, rankingGranularity).map((bucket) => {
        let spend = 0;
        let conversions = 0;
        for (const point of selectedAd.daily) {
          if (point.date >= bucket.startDate && point.date <= bucket.endDate) {
            spend += point.spend;
            conversions += point.conversions;
          }
        }
        return {
          label: formatAdBucketLabel(bucket, rankingGranularity),
          fullLabel: formatAdBucketFullLabel(bucket, rankingGranularity),
          value: rankingMetric === "spend" ? spend : conversions,
          cpa: conversions > 0 ? spend / conversions : 0,
        };
      })
    : [];

  const formatRankingValue = (value: number) => (rankingMetric === "spend" ? formatCurrency(value, currencyCode) : formatNumber(value));
  const formatRankingValueCompact = (value: number) => (rankingMetric === "spend" ? formatCompactCurrency(value, currencyCode) : formatCompactNumber(value));

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
          <MetricScorecardGroup metrics={scorecardMetrics} defaultSelectedKey="activeAds" />

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <p className="text-base font-bold text-foreground">Ranking de Anuncios</p>
              <AdRankingTable rows={data.ranking} currencyCode={currencyCode} selectedKey={selectedAdKey} onSelect={setSelectedAdKey} />

              <div className="flex flex-col gap-3 border-t border-border pt-6">
                {!selectedAd ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground" title={selectedAd.key}>
                        Evolución: {selectedAd.key}
                      </p>
                      <div className="flex items-center gap-4">
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant={rankingMetric === "spend" ? "default" : "ghost"}
                            onClick={() => setRankingMetric("spend")}
                          >
                            Gasto
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={rankingMetric === "conversions" ? "default" : "ghost"}
                            onClick={() => setRankingMetric("conversions")}
                          >
                            Conversiones
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          {AGGREGATION_OPTIONS.map((option) => (
                            <Button
                              key={option.value}
                              type="button"
                              size="sm"
                              variant={rankingGranularity === option.value ? "default" : "ghost"}
                              onClick={() => setRankingGranularity(option.value)}
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Leyenda: métrica de barra activa + CPA (la línea de CPA
                        se muestra siempre, sin importar cuál de las 2 barras
                        esté elegida — mismo criterio que la línea de CTR en
                        SeoPageCountBlock.tsx). */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                        {rankingMetric === "spend" ? "Gasto" : "Conversiones"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CPA_LINE_COLOR }} />
                        CPA
                      </div>
                    </div>

                    {adTrendData.length === 0 ? (
                      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
                    ) : (
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={adTrendData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                            <YAxis
                              yAxisId="value"
                              tick={{ fontSize: 11 }}
                              className="fill-muted-foreground"
                              width={56}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={formatRankingValueCompact}
                            />
                            {/* Eje de CPA a la derecha, SIN dominio fijo —
                                autoescala según los datos (a diferencia del
                                eje de CTR en otros bloques, que usa un rango
                                0-100% fijo porque ahí siempre tiene sentido
                                la misma escala; acá el CPA varía demasiado
                                entre anuncios como para fijarle un techo). */}
                            <YAxis
                              yAxisId="cpa"
                              orientation="right"
                              tick={{ fontSize: 11 }}
                              className="fill-muted-foreground"
                              width={64}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value: number) => formatCompactCurrency(value, currencyCode)}
                            />
                            <Tooltip
                              cursor={{ fill: "hsl(var(--muted))" }}
                              content={({ active, payload }) => {
                                if (!active || !payload || payload.length === 0) return null;
                                const point = payload[0]?.payload as AdTrendPoint | undefined;
                                if (!point) return null;
                                return (
                                  <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                                    <p className="font-medium text-foreground">{point.fullLabel}</p>
                                    <p className="text-muted-foreground">
                                      {rankingMetric === "spend" ? "Gasto" : "Conversiones"}: {formatRankingValue(point.value)}
                                    </p>
                                    <p className="text-muted-foreground">CPA: {formatCurrency(point.cpa, currencyCode)}</p>
                                  </div>
                                );
                              }}
                            />
                            <Bar yAxisId="value" dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                              {rankingGranularity !== "day" && (
                                <LabelList
                                  dataKey="value"
                                  position="top"
                                  formatter={(value: string | number | boolean | null | undefined) => formatRankingValue(Number(value ?? 0))}
                                  fontSize={10}
                                />
                              )}
                            </Bar>
                            <Line
                              yAxisId="cpa"
                              type="monotone"
                              dataKey="cpa"
                              stroke={CPA_LINE_COLOR}
                              strokeWidth={2}
                              dot={{ r: 3, fill: CPA_LINE_COLOR, strokeWidth: 0 }}
                              activeDot={{ r: 4 }}
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
