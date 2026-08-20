"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetaAdsAgeGenderCostCpaChart } from "@/components/dashboard/MetaAdsAgeGenderCostCpaChart";
import { MetaAdsCostCpaChart, type MetaAdsCostCpaPoint } from "@/components/dashboard/MetaAdsCostCpaChart";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { generateInsight } from "@/lib/insights/generateInsight";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/lib/format";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import { DEFAULT_CONVERSION_ACTION_TYPE } from "@/lib/meta-ads/reports";
import type {
  MetaAdsAgeGenderBreakdownRow,
  MetaAdsBreakdownRow,
  MetaAdsConversionEventOption,
  MetaAdsMetrics,
  MetaAdsSimpleStat,
  MetaAdsTimeSeriesPoint,
} from "@/lib/meta-ads/reports";

// Las 7 dimensiones que usa la sección "Desgloses" (Prompts 79-81) —
// campaña/conjunto/anuncio quedan para un próximo prompt.
interface MetaAdsBreakdowns {
  platform: MetaAdsBreakdownRow[];
  device: MetaAdsBreakdownRow[];
  country: MetaAdsBreakdownRow[];
  region: MetaAdsBreakdownRow[];
  ageGender: MetaAdsAgeGenderBreakdownRow[];
  dayOfWeek: MetaAdsSimpleStat[];
  hourly: MetaAdsBreakdownRow[];
}

// Orden fijo (Prompt 79, punto 3) — Audience Network solo si el cliente
// tiene datos ahí, cualquier otra plataforma no listada (ej. Messenger) va
// al final por las dudas, sin descartarla.
const PLATFORM_ORDER = ["facebook", "instagram", "audience_network"];
const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

// El pedido solo menciona "App móvil, Web móvil" en ese orden — se agrega
// Escritorio al final si el cliente tiene datos ahí, en vez de descartarlos.
const DEVICE_ORDER = ["mobile_app", "mobile_web", "desktop"];
const DEVICE_LABELS: Record<string, string> = {
  mobile_app: "App móvil",
  mobile_web: "Web móvil",
  desktop: "Escritorio",
};

// Arma los puntos {key, spend, cpa} del componente reutilizable respetando
// un orden fijo de categorías conocidas — cualquier categoría con datos que
// no esté en `order` se agrega al final, sin perderla.
function buildOrderedCostCpaData(rows: MetaAdsBreakdownRow[], order: string[], labels: Record<string, string>): MetaAdsCostCpaPoint[] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const points: MetaAdsCostCpaPoint[] = [];
  for (const key of order) {
    const row = byKey.get(key);
    if (row) {
      points.push({ key: labels[key] ?? key, spend: row.current.spend, cpa: row.current.cpa });
      byKey.delete(key);
    }
  }
  for (const row of byKey.values()) {
    points.push({ key: labels[row.key] ?? row.key, spend: row.current.spend, cpa: row.current.cpa });
  }
  return points;
}

// Orden lunes→domingo (Prompt 81) — mismo orden que WEEKDAY_KEYS en
// lib/meta-ads/reports.ts (fetchMetaAdsDayOfWeekBreakdown), acá solo se
// traducen las claves a español.
const WEEKDAY_LABELS: Record<string, string> = {
  monday: "LUN",
  tuesday: "MAR",
  wednesday: "MIE",
  thursday: "JUE",
  friday: "VIE",
  saturday: "SAB",
  sunday: "DOM",
};

// Los buckets de horario vienen como "00:00:00 - 00:59:59" — se acortan a
// "0h" para que las 24 categorías entren en una columna de la mitad del
// ancho (mismo criterio que MetaAdsHourlyBars en MetaAdsBreakdownCharts.tsx).
function formatHourLabel(bucket: string): string {
  return `${Number(bucket.slice(0, 2))}h`;
}

interface MetaAdsCostosResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  availableConversionEvents: MetaAdsConversionEventOption[];
  selectedConversionEvent: string;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  breakdowns: MetaAdsBreakdowns | null;
}

interface MetaAdsCostosDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

async function fetchMetaAdsCostos(
  clientId: string,
  range: DateRangeValue,
  conversionEvent: string,
  options: { granularity?: Granularity } = {}
): Promise<MetaAdsCostosResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to, conversion_event: conversionEvent });
  if (options.granularity) params.set("granularity", options.granularity);
  const response = await fetch(`/api/dashboard/${clientId}/meta-ads/costos?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el tablero de Costos de Meta Ads.");
  }
  return (await response.json()) as MetaAdsCostosResponse;
}

// "lead" -> "Lead", "add_to_cart" -> "Add to cart" — mismo formato que la
// captura de referencia del Prompt 78 ("Lead (49)").
function formatActionTypeLabel(actionType: string): string {
  const spaced = actionType.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

type CostMetricKey = "spend" | "cpa" | "cpc" | "cpm";

interface CostMetricDef {
  key: CostMetricKey;
  label: string;
  /** Nombre corto para el título del gráfico compartido ("Evolución diaria de {titleLabel}"). */
  titleLabel: string;
}

// "Costo por resultado" (cpa) no tiene label fijo: depende del evento de
// conversión elegido arriba — se arma en runtime con formatActionTypeLabel.
const FIXED_METRIC_OPTIONS: Record<Exclude<CostMetricKey, "cpa">, CostMetricDef> = {
  spend: { key: "spend", label: "Gasto", titleLabel: "Gasto" },
  cpc: { key: "cpc", label: "CPC", titleLabel: "CPC" },
  cpm: { key: "cpm", label: "CPM", titleLabel: "CPM" },
};

const METRIC_DESCRIPTIONS: Record<CostMetricKey, string> = {
  spend: "Inversión total en Meta Ads durante el período seleccionado.",
  cpa: "Cuánto cuesta en promedio cada resultado del evento de conversión seleccionado arriba. Es la métrica de eficiencia más directa para decidir si conviene escalar o ajustar una campaña.",
  cpc: "Costo promedio por cada clic generado por tus anuncios.",
  cpm: "Costo promedio por cada mil impresiones. Sirve para comparar qué tan cara está la subasta independientemente de cuánta gente hace clic.",
};

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const GRANULARITY_ADJECTIVE: Record<Granularity, string> = { day: "diaria", week: "semanal", month: "mensual" };

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

// Insight dinámico de Gasto — descubrimiento + recomendación cruzando
// siempre con el Costo por resultado (gastar más o menos solo se lee bien
// junto a la eficiencia).
function buildSpendInsight(m: MetaAdsMetrics, currencyCode: string): Insight {
  const variationPct = pctChange(m.spend, m.previous.spend);
  const rose = variationPct > 0;
  const cpaRose = m.cpa > m.previous.cpa;

  let discovery = `La inversión ${rose ? "subió" : "bajó"} un **${Math.abs(variationPct).toFixed(0)}%** este período (**${formatCurrency(m.previous.spend, currencyCode)}** → **${formatCurrency(m.spend, currencyCode)}**)`;
  discovery += rose && cpaRose ? ", y el costo por resultado también subió — el aumento de inversión no se está traduciendo en mejor eficiencia." : ".";

  let recommendation: string;
  let sentiment: InsightSentiment;
  if (!rose) {
    recommendation = "Confirmá si fue una decisión intencional (ajuste de presupuesto, pausas) o una limitación externa antes de asumir que fue una mejora.";
    sentiment = "neutral";
  } else if (cpaRose) {
    recommendation = "Revisá si conviene seguir escalando al mismo ritmo, la eficiencia está cayendo.";
    sentiment = "negative";
  } else {
    recommendation = "Buen momento — estás escalando presupuesto sin perder eficiencia.";
    sentiment = "positive";
  }

  return {
    label: "Gasto",
    current: m.spend,
    previous: m.previous.spend,
    variationPct,
    sentiment,
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de Costo por Resultado — descubrimiento + recomendación
// cruzando siempre con el volumen de resultados del evento elegido (las 4
// combinaciones costo↑↓ × volumen↑↓ tienen una lectura distinta cada una).
function buildCpaInsight(m: MetaAdsMetrics, currencyCode: string, eventLabel: string): Insight {
  const variationPct = pctChange(m.cpa, m.previous.cpa);
  const rose = variationPct > 0;
  const volumeVariationPct = pctChange(m.conversions, m.previous.conversions);
  const volumeRose = m.conversions > m.previous.conversions;

  const discovery = `El costo por **${eventLabel}** fue de **${formatCurrency(m.cpa, currencyCode)}** este período (${rose ? "subió" : "bajó"} **${Math.abs(variationPct).toFixed(0)}%** vs. **${formatCurrency(m.previous.cpa, currencyCode)}**), con **${formatNumber(m.conversions)} resultados** totales (${volumeRose ? "subió" : "bajó"} **${Math.abs(volumeVariationPct).toFixed(0)}%** vs. **${formatNumber(m.previous.conversions)}**).`;

  let recommendation: string;
  let sentiment: InsightSentiment;
  if (!rose && volumeRose) {
    recommendation = "Mejor eficiencia y más volumen a la vez — buen momento para escalar la inversión.";
    sentiment = "positive";
  } else if (rose && volumeRose) {
    recommendation = "Estás consiguiendo más resultados pero cada uno cuesta más — evaluá si el volumen extra compensa el costo extra.";
    sentiment = "neutral";
  } else if (rose && !volumeRose) {
    recommendation = "Doble señal de alerta: menos resultados y más caros cada uno. Revisá **segmentación** y **creatividad** antes de seguir invirtiendo.";
    sentiment = "negative";
  } else {
    recommendation = "Cada resultado sale más barato pero hay menos en total — puede ser señal de audiencia saturada, considerá **ampliarla**.";
    sentiment = "neutral";
  }

  return {
    label: `Costo por ${eventLabel}`,
    current: m.cpa,
    previous: m.previous.cpa,
    variationPct,
    sentiment,
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de CPC — descubrimiento simple + recomendación por
// dirección.
function buildCpcInsight(m: MetaAdsMetrics, currencyCode: string): Insight {
  const variationPct = pctChange(m.cpc, m.previous.cpc);
  const rose = variationPct > 0;

  const discovery = `El CPC fue de **${formatCurrency(m.cpc, currencyCode)}** este período (${rose ? "subió" : "bajó"} **${Math.abs(variationPct).toFixed(0)}%** vs. **${formatCurrency(m.previous.cpc, currencyCode)}**).`;

  const recommendation = rose
    ? "Un CPC más caro suele indicar más competencia en la subasta o una audiencia saturada — revisá la **Frecuencia** (hoja Visión General) y considerá **ampliar el público**."
    : "Buena señal de eficiencia en la subasta — si el volumen de resultados acompaña, es buen momento para **escalar presupuesto**.";

  return {
    label: "CPC",
    current: m.cpc,
    previous: m.previous.cpc,
    variationPct,
    sentiment: rose ? "negative" : "positive",
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de CPM — descubrimiento simple + recomendación por
// dirección.
function buildCpmInsight(m: MetaAdsMetrics, currencyCode: string): Insight {
  const variationPct = pctChange(m.cpm, m.previous.cpm);
  const rose = variationPct > 0;

  const discovery = `El CPM fue de **${formatCurrency(m.cpm, currencyCode)}** este período (${rose ? "subió" : "bajó"} **${Math.abs(variationPct).toFixed(0)}%** vs. **${formatCurrency(m.previous.cpm, currencyCode)}**).`;

  const recommendation = rose
    ? "El costo por cada mil impresiones subió — señal de que la subasta está más cara (más competencia por la misma audiencia)."
    : "La subasta está más barata que en el período anterior, buen contexto para **escalar inversión**.";

  return {
    label: "CPM",
    current: m.cpm,
    previous: m.previous.cpm,
    variationPct,
    sentiment: rose ? "negative" : "positive",
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Cuánto por encima del promedio del período tiene que estar un bucket
// (día/semana/mes) del gráfico compartido para considerarlo un pico digno de
// mención (Prompt 87) — distinto del SPIKE_THRESHOLD de 25% en
// generateInsight.ts, que compara período actual vs. anterior (2 puntos).
// Acá se compara 1 bucket contra el promedio de TODOS los buckets visibles
// (7-31+ puntos), una base más ruidosa día a día — un umbral más alto evita
// marcar como "pico" una variación cotidiana normal.
const CHART_PEAK_ABOVE_AVERAGE_THRESHOLD_PCT = 30;

// Insight del gráfico compartido "Evolución" (Prompt 87) — a diferencia de
// los 4 insights de arriba (que comparan período actual vs. anterior), este
// lee el propio gráfico: total/promedio del período y, si algún bucket se
// destaca muy por encima del promedio, lo marca como pico (bold + badge
// "Pico" que ya pinta InsightCard vía isSpike) con una recomendación
// puntual. Sin pico, el mensaje es simplemente que se mantuvo estable.
function buildEvolutionChartInsight(
  chartData: ChartPoint[],
  chartMetric: CostMetricKey,
  activeMetric: CostMetricDef,
  granularity: Granularity,
  currencyCode: string,
  averageValue: number,
  totalValue: number,
  showTotalLine: boolean
): Insight | null {
  if (chartData.length === 0) return null;

  const peak = chartData.reduce((max, point) => (point[chartMetric] > max[chartMetric] ? point : max));
  const peakAboveAveragePct = averageValue > 0 ? ((peak[chartMetric] - averageValue) / averageValue) * 100 : 0;
  const isSpike = peakAboveAveragePct >= CHART_PEAK_ABOVE_AVERAGE_THRESHOLD_PCT;

  const bucketNoun = granularity === "day" ? "día" : granularity === "week" ? "semana" : "mes";
  const bucketCountNoun = granularity === "day" ? "días" : granularity === "week" ? "semanas" : "meses";
  const metricLabelLower = activeMetric.titleLabel.toLowerCase();

  let discovery = showTotalLine
    ? `Durante este período (**${chartData.length} ${bucketCountNoun}**) el ${metricLabelLower} total fue de **${formatCurrency(totalValue, currencyCode)}**, con un promedio de **${formatCurrency(averageValue, currencyCode)}** por ${bucketNoun}.`
    : `El ${metricLabelLower} promedio de este período fue de **${formatCurrency(averageValue, currencyCode)}** por ${bucketNoun}.`;

  if (isSpike) {
    discovery += ` Particularmente, **${peak.fullLabel}** se destacó con **${formatCurrency(peak[chartMetric], currencyCode)}** — un **${peakAboveAveragePct.toFixed(0)}% por encima del promedio**.`;
  }

  const recommendation = !isSpike
    ? `${activeMetric.titleLabel} se mantuvo relativamente estable a lo largo del período, sin picos puntuales que ameriten revisión.`
    : chartMetric === "spend"
      ? "Revisá qué campaña o cambio de presupuesto generó ese pico para decidir si conviene repetirlo o ajustarlo."
      : `Revisá qué pasó ese ${bucketNoun} — un salto puntual en ${metricLabelLower} suele señalar una subasta más cara o un problema de segmentación puntual.`;

  return {
    label: `evolution-chart-${chartMetric}`,
    current: totalValue,
    previous: averageValue,
    variationPct: peakAboveAveragePct,
    sentiment: isSpike ? "negative" : "neutral",
    isSpike,
    text: `${discovery} ${recommendation}`,
  };
}

// Selector nativo (sin Radix) para elegir, contra los action_types reales
// que tuvo la cuenta en el período, cuál se cuenta como "resultado" — solo
// afecta al scorecard "Costo por resultado" y a su insight (Prompt 78), no
// a Gasto/CPC/CPM. Ya viene ordenado por volumen desc (ver
// extractAvailableConversionEvents en lib/meta-ads/reports.ts).
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
      <Label htmlFor="meta-ads-costos-conversion-event" className="text-xs text-muted-foreground">
        Evento de conversión
      </Label>
      <select
        id="meta-ads-costos-conversion-event"
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

function formatBucketFullLabel(date: string, granularity: Granularity): string {
  const start = parseISO(date);
  if (granularity === "day") return format(start, "d 'de' MMMM", { locale: es });
  if (granularity === "month") return format(start, "MMMM yyyy", { locale: es });
  return `Semana del ${format(start, "d 'de' MMMM", { locale: es })}`;
}

// Label de la línea de referencia del promedio como un pill — mismo criterio
// que Visión General / SEO.
function renderAveragePillLabel(props: { viewBox?: { x?: number; y?: number; width?: number } }, text: string) {
  const viewBox = props.viewBox;
  if (viewBox?.x === undefined || viewBox.y === undefined || viewBox.width === undefined) return null;

  const fontSize = 12;
  const paddingX = 10;
  const pillHeight = 22;
  const pillWidth = text.length * 6.5 + paddingX * 2;
  const x = viewBox.x + viewBox.width - pillWidth - 4;
  const y = viewBox.y - pillHeight / 2;

  return (
    <g>
      <rect x={x} y={y} width={pillWidth} height={pillHeight} rx={pillHeight / 2} fill="hsl(var(--muted-foreground))" />
      <text x={x + pillWidth / 2} y={y + pillHeight / 2} dy="0.35em" textAnchor="middle" fontSize={fontSize} fill="#ffffff">
        {text}
      </text>
    </g>
  );
}

// Tick del eje Y en un <text> plano en vez del tick por defecto de Recharts
// (un componente <Text> que auto-parte el texto en varias líneas cuando no
// entra en el `width` del eje) — los valores compactos ("US$ 12K") tienen un
// espacio entre el símbolo y el número, así que con el eje angosto Recharts
// los partía en 2 líneas. Un <text> sin lógica de wrap nunca lo hace.
function renderCompactCurrencyTick(
  props: { x?: string | number; y?: string | number; payload?: { value?: number } },
  currencyCode: string
) {
  const { x, y, payload } = props;
  if (x === undefined || y === undefined || payload?.value === undefined) return <g />;
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
      {formatCompactCurrency(payload.value, currencyCode)}
    </text>
  );
}

interface ChartPoint {
  label: string;
  fullLabel: string;
  spend: number;
  cpa: number;
  cpc: number;
  cpm: number;
  cumulative: number;
}

// Color de la línea de Total Acumulado (Prompt 84) — distinto del azul de las
// barras, mismo criterio que el celeste de la línea de CTR en Visión General.
const TOTAL_LINE_COLOR = "#10b981"; // emerald-500

// Pill del valor final de la línea de Total Acumulado, mismo estilo que
// renderAveragePillLabel pero anclado al último punto de la línea (no a una
// altura fija en todo el ancho del gráfico, ya que el acumulado no comparte
// escala visual con las barras individuales).
function renderCumulativeTotalPillLabel(
  props: { x?: string | number; y?: string | number; index?: number },
  totalPoints: number,
  text: string
) {
  if (props.index !== totalPoints - 1 || props.x === undefined || props.y === undefined) return null;
  const pointX = Number(props.x);
  const pointY = Number(props.y);

  const fontSize = 12;
  const paddingX = 10;
  const pillHeight = 22;
  const pillWidth = text.length * 6.5 + paddingX * 2;
  const x = pointX - pillWidth + 8;
  const y = pointY - pillHeight - 10;

  return (
    <g>
      <rect x={x} y={y} width={pillWidth} height={pillHeight} rx={pillHeight / 2} fill={TOTAL_LINE_COLOR} />
      <text x={x + pillWidth / 2} y={y + pillHeight / 2} dy="0.35em" textAnchor="middle" fontSize={fontSize} fill="#ffffff">
        {text}
      </text>
    </g>
  );
}

// "Meta Ads > Costos" (Prompt 78) — primer contenido real de esta hoja,
// reemplazando el placeholder del Prompt 74: mismo patrón que Visión General
// (Prompts 71-73) — 4 scorecards clickeables (radio) con diseño unificado,
// insight dinámico de reglas entre las tarjetas y el gráfico compartido, y
// gráfico de barras compartido con su propio selector Día/Semana/Mes. Sin
// ranking de campañas/anuncios ni desgloses todavía (llegan en próximos
// prompts) — eso es lo único que esta hoja NO tiene hoy.
export function MetaAdsCostosDashboard({ clientId, breadcrumbSubtitle }: MetaAdsCostosDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  // null = todavía no se eligió evento — al llegar el primer resultado se
  // fija automáticamente al de mayor volumen del período (Prompt 78, punto
  // 2), sin esperar una elección manual.
  const [conversionEvent, setConversionEvent] = useState<string | null>(() => searchParams.get("conversion_event"));
  const [chartMetric, setChartMetric] = useState<CostMetricKey>("spend");
  const [granularity, setGranularity] = useState<Granularity>(() => getDefaultGranularity(range));

  const [data, setData] = useState<MetaAdsCostosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [chartSeries, setChartSeries] = useState<MetaAdsTimeSeriesPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  const effectiveConversionEvent = conversionEvent ?? DEFAULT_CONVERSION_ACTION_TYPE;

  const chartDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`);
  const chartCacheRef = useRef<Map<string, Promise<MetaAdsCostosResponse>>>(new Map());

  function getOrFetchChart(datasetKey: string, g: Granularity): Promise<MetaAdsCostosResponse> {
    const cache = chartCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchMetaAdsCostos(clientId, range, effectiveConversionEvent, { granularity: g });
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchChartSeries = useCallback(
    (g: Granularity) =>
      getOrFetchChart(`${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`, g).then((json) => json.timeSeries?.current ?? []),
    [clientId, range, effectiveConversionEvent]
  );

  useEffect(() => {
    setGranularity(getDefaultGranularity(range));
  }, [range]);

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
    setLoading(true);
    setError(null);

    fetchMetaAdsCostos(clientId, range, effectiveConversionEvent)
      .then((json) => {
        if (cancelled) return;
        setData(json);
        // Si el usuario todavía no eligió evento a mano, se fija al de mayor
        // volumen del período recién conocido — dispara un refetch con el
        // valor correcto (Prompt 78, punto 2).
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

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}|${effectiveConversionEvent}`;
    if (chartDatasetKeyRef.current !== datasetKey) {
      chartCacheRef.current = new Map();
      chartDatasetKeyRef.current = datasetKey;
    }
    setChartLoading(true);

    getOrFetchChart(datasetKey, granularity)
      .then((json) => {
        if (!cancelled) setChartSeries(json.timeSeries?.current ?? []);
      })
      .catch(() => {
        if (!cancelled) setChartSeries([]);
      })
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range, effectiveConversionEvent, granularity]);

  const currencyCode = data?.metrics?.currencyCode ?? "USD";
  const eventLabel = formatActionTypeLabel(effectiveConversionEvent);

  const platformData = data?.breakdowns ? buildOrderedCostCpaData(data.breakdowns.platform, PLATFORM_ORDER, PLATFORM_LABELS) : [];
  const deviceData = data?.breakdowns ? buildOrderedCostCpaData(data.breakdowns.device, DEVICE_ORDER, DEVICE_LABELS) : [];
  const countryData = data?.breakdowns
    ? [...data.breakdowns.country]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((row) => ({ key: row.key, spend: row.current.spend, cpa: row.current.cpa }))
    : [];
  const regionData = data?.breakdowns
    ? [...data.breakdowns.region]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((row) => ({ key: row.key, spend: row.current.spend, cpa: row.current.cpa }))
    : [];
  const dayOfWeekData: MetaAdsCostCpaPoint[] = data?.breakdowns
    ? data.breakdowns.dayOfWeek.map((stat) => ({ key: WEEKDAY_LABELS[stat.key] ?? stat.key, spend: stat.spend, cpa: stat.cpa }))
    : [];
  const hourlyData: MetaAdsCostCpaPoint[] = data?.breakdowns
    ? data.breakdowns.hourly.map((row) => ({ key: formatHourLabel(row.key), spend: row.current.spend, cpa: row.current.cpa }))
    : [];
  // Mismo tope de eje Y en Día de la Semana y Horario (Prompt 89) — comparten
  // el mayor valor entre los 2 gráficos (Costo y CPA de ambos) en vez de
  // autoescalar cada uno por separado, así la diferencia de magnitud entre
  // ambas dimensiones se nota a simple vista en vez de quedar disimulada por
  // 2 escalas distintas. +10% de margen para que la barra más alta no toque
  // el borde superior (mismo aire que dejaba el autoescalado por defecto).
  const dayOfWeekAndHourlyMax =
    [...dayOfWeekData, ...hourlyData].reduce((max, point) => Math.max(max, point.spend, point.cpa), 0) * 1.1;

  const METRIC_OPTIONS: CostMetricDef[] = [
    FIXED_METRIC_OPTIONS.spend,
    { key: "cpa", label: `Costo por ${eventLabel}`, titleLabel: `Costo por ${eventLabel}` },
    FIXED_METRIC_OPTIONS.cpc,
    FIXED_METRIC_OPTIONS.cpm,
  ];

  // Memoizado (Prompt 92): fetchTrend de cada tarjeta envuelve fetchChartSeries
  // (ya useCallback-estable), pero si el array de métricas se reconstruyera en
  // cada render, cada fetchTrend sería una función nueva y ScorecardCard
  // volvería a pedir el gráfico individual en cada render. Las 4 métricas de
  // Costos son siempre moneda y "mayor es peor" (subir el costo nunca es
  // bueno) — a diferencia de Visión General, acá no varía por métrica.
  const costMetrics: MetricScorecardConfig[] = useMemo(
    () =>
      data?.metrics
        ? METRIC_OPTIONS.map((def) => ({
            key: def.key,
            label: def.label,
            currentValue: data.metrics![def.key],
            previousValue: data.metrics!.previous[def.key],
            format: "currency" as const,
            currencyCode,
            higherIsBetter: false,
            infoText: METRIC_DESCRIPTIONS[def.key],
            fetchTrend: (g: Granularity) =>
              fetchChartSeries(g).then((points) =>
                points.map((point) => ({ label: formatBucketLabel(point.date, g), value: point[def.key] as number }))
              ),
          }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.metrics, currencyCode, eventLabel, fetchChartSeries]
  );

  const getSelectedMetricInsight = useCallback(
    (key: string): Insight | null => {
      if (!data?.metrics) return null;
      if (key === "spend") return buildSpendInsight(data.metrics, currencyCode);
      if (key === "cpa") return buildCpaInsight(data.metrics, currencyCode, eventLabel);
      if (key === "cpc") return buildCpcInsight(data.metrics, currencyCode);
      return buildCpmInsight(data.metrics, currencyCode);
    },
    [data?.metrics, currencyCode, eventLabel]
  );

  let runningTotal = 0;
  const chartData: ChartPoint[] = chartSeries.map((point) => {
    runningTotal += point[chartMetric];
    return {
      label: formatBucketLabel(point.date, granularity),
      fullLabel: formatBucketFullLabel(point.date, granularity),
      spend: point.spend,
      cpa: point.cpa,
      cpc: point.cpc,
      cpm: point.cpm,
      cumulative: runningTotal,
    };
  });

  const activeMetric = METRIC_OPTIONS.find((option) => option.key === chartMetric)!;
  const averageValue = chartData.length > 0 ? chartData.reduce((sum, point) => sum + point[chartMetric], 0) / chartData.length : 0;
  const totalValue = chartData[chartData.length - 1]?.cumulative ?? 0;
  // El Total Acumulado solo tiene sentido para el Gasto (Prompt 84) — CPA/CPC/CPM
  // son tasas por unidad, sumarlas día a día no da un número interpretable
  // (mismo criterio de "nunca sumar/promediar una tasa" ya aplicado en el
  // resto del proyecto).
  const showTotalLine = chartMetric === "spend";
  const evolutionChartInsight = buildEvolutionChartInsight(
    chartData,
    chartMetric,
    activeMetric,
    granularity,
    currencyCode,
    averageValue,
    totalValue,
    showTotalLine
  );

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
          <Skeleton className="h-64 w-full" />
        </div>
      ) : !data.metrics ? (
        <p className="text-sm text-muted-foreground">Este cliente todavía no tiene Meta Ads conectado.</p>
      ) : (
        <>
          <h2 className="text-lg font-semibold text-foreground">Métricas Principales</h2>
          <MetricScorecardGroup
            metrics={costMetrics}
            selectedKey={chartMetric}
            onSelectedKeyChange={(key) => setChartMetric(key as CostMetricKey)}
            getInsight={getSelectedMetricInsight}
            sectionKey="ads"
            keyPrefix="meta-costos"
          />

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-base font-bold text-foreground">
                  Evolución {GRANULARITY_ADJECTIVE[granularity]} de {activeMetric.titleLabel}
                  {chartLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                <div className="flex gap-1">
                  {AGGREGATION_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-xs uppercase"
                      variant={granularity === option.value ? "default" : "ghost"}
                      onClick={() => setGranularity(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {chartLoading && chartData.length === 0 ? (
                <Skeleton className="h-64 w-full" />
              ) : chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {showTotalLine && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                        {activeMetric.titleLabel}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TOTAL_LINE_COLOR }} />
                        Total Acumulado
                      </div>
                    </div>
                  )}
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: showTotalLine ? 56 : 24, right: showTotalLine ? 16 : 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 11 }}
                          className="fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis
                          yAxisId="value"
                          tick={(props) => renderCompactCurrencyTick(props, currencyCode)}
                          width={56}
                          tickLine={false}
                          axisLine={false}
                        />
                        {showTotalLine && <YAxis yAxisId="cumulative" hide width={0} domain={[0, "dataMax"]} />}
                        <Tooltip
                          cursor={{ fill: "hsl(var(--muted))" }}
                          content={({ active, payload }) => {
                            if (!active || !payload || payload.length === 0) return null;
                            const point = payload[0]?.payload as ChartPoint | undefined;
                            if (!point) return null;
                            return (
                              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                                <p className="font-medium text-foreground">
                                  {point.fullLabel}: {formatCurrency(point[chartMetric], currencyCode)}
                                </p>
                                {showTotalLine && (
                                  <p className="text-muted-foreground">Acumulado: {formatCurrency(point.cumulative, currencyCode)}</p>
                                )}
                                <p className="text-muted-foreground">Promedio del período: {formatCurrency(averageValue, currencyCode)}</p>
                              </div>
                            );
                          }}
                        />
                        <Bar yAxisId="value" dataKey={chartMetric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                          {granularity !== "day" && (
                            <LabelList
                              dataKey={chartMetric}
                              position="top"
                              formatter={(value: string | number | boolean | null | undefined) => formatCurrency(Number(value ?? 0), currencyCode)}
                              fontSize={11}
                            />
                          )}
                        </Bar>
                        {showTotalLine && (
                          <Line
                            yAxisId="cumulative"
                            type="monotone"
                            dataKey="cumulative"
                            stroke={TOTAL_LINE_COLOR}
                            strokeWidth={2}
                            dot={{ r: 3, fill: TOTAL_LINE_COLOR, strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                            label={(props) =>
                              renderCumulativeTotalPillLabel(props, chartData.length, `Total: ${formatCurrency(totalValue, currencyCode)}`)
                            }
                          />
                        )}
                        <ReferenceLine
                          yAxisId="value"
                          y={averageValue}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={(props) => renderAveragePillLabel(props, `Promedio: ${formatCurrency(averageValue, currencyCode)}`)}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {evolutionChartInsight && (
                    <InsightsList insights={[evolutionChartInsight]} sectionKey="ads" keyPrefix={`meta-costos-evolution-${chartMetric}`} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sección "Desgloses" (Prompt 79) — Costo y CPA por dimensión, con
              el componente reutilizable de barras agrupadas + eje compartido
              (MetaAdsCostCpaChart) para Plataforma/Dispositivo (verticales) y
              País/Región (horizontales, Prompt 80 — pueden tener muchas más
              categorías, van a ancho completo en vez de en el grid de 2
              columnas), y un gráfico combinado aparte (MetaAdsAgeGenderCostCpaChart,
              Prompt 90) para Edad y Género — a diferencia de las otras 4
              dimensiones, acá Costo (barras) y CPA (líneas punteadas) sí van
              en 2 ejes Y independientes dentro del MISMO gráfico, porque no
              tiene sentido ponerlos a la misma escala (CPA es una tasa, no
              una porción del gasto total). CPA usa siempre el evento de
              conversión elegido arriba. */}
          {data.breakdowns && (
            <>
              <h2 className="text-lg font-semibold text-foreground">Desgloses</h2>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por Plataforma</p>
                    <MetaAdsCostCpaChart data={platformData} currencyCode={currencyCode} compactAxis categoryTickFontSize={12} />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por Dispositivo</p>
                    <MetaAdsCostCpaChart data={deviceData} currencyCode={currencyCode} compactAxis categoryTickFontSize={12} />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por País</p>
                    <MetaAdsCostCpaChart data={countryData} currencyCode={currencyCode} orientation="horizontal" compactAxis />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por Región</p>
                    <MetaAdsCostCpaChart data={regionData} currencyCode={currencyCode} orientation="horizontal" compactAxis />
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por Día de la Semana</p>
                    <MetaAdsCostCpaChart
                      data={dayOfWeekData}
                      currencyCode={currencyCode}
                      showBarLabels={false}
                      compactAxis
                      categoryTickFontSize={11}
                      valueDomainMax={dayOfWeekAndHourlyMax}
                    />
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="flex flex-col gap-4 pt-6">
                    <p className="text-sm font-medium text-foreground">Costo por Horario</p>
                    <MetaAdsCostCpaChart
                      data={hourlyData}
                      currencyCode={currencyCode}
                      showBarLabels={false}
                      compactAxis
                      categoryTickFontSize={11}
                      valueDomainMax={dayOfWeekAndHourlyMax}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="flex flex-col gap-4 pt-6">
                  <p className="text-sm font-medium text-foreground">Costo y CPA por edad y género</p>
                  <MetaAdsAgeGenderCostCpaChart rows={data.breakdowns.ageGender} currencyCode={currencyCode} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
