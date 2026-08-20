"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { SeoPageSegmentSelector } from "@/components/dashboard/seo/SeoPageSegmentSelector";
import { generateInsight } from "@/lib/insights/generateInsight";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import { formatCompactNumber, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks } from "@/lib/charts";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import type {
  SeoOverviewBucket,
  SeoOverviewResult,
  SeoPerformanceBucket,
  SeoPerformanceContentBreakdown,
  SeoPerformanceResult,
} from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoOverviewResponse {
  connected: boolean;
  result: SeoOverviewResult | null;
}

interface SeoPerformanceResponse {
  connected: boolean;
  result: SeoPerformanceResult | null;
}

interface SeoDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

function parseSegmentFromSearchParams(searchParams: URLSearchParams): SeoPageSegmentKey {
  const raw = searchParams.get("segment");
  if (raw === "institucional" || raw === "blog-portada" || raw === "blog-notas") return raw;
  return "all";
}

const ALL_GRANULARITIES: Granularity[] = ["day", "week", "month"];

async function fetchOverviewResult(
  clientId: string,
  range: DateRangeValue,
  segment: SeoPageSegmentKey,
  granularity: Granularity
): Promise<SeoOverviewResult | null> {
  const params = new URLSearchParams({ from: range.from, to: range.to, granularity, segment });
  const response = await fetch(`/api/dashboard/${clientId}/seo/overview?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar la visión general de SEO.");
  }
  const json = (await response.json()) as SeoOverviewResponse;
  return json.result;
}

async function fetchPerformanceResult(
  clientId: string,
  range: DateRangeValue,
  segment: SeoPageSegmentKey,
  granularity: Granularity
): Promise<SeoPerformanceResult | null> {
  const params = new URLSearchParams({ from: range.from, to: range.to, granularity, segment });
  const response = await fetch(`/api/dashboard/${clientId}/seo/performance?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el rendimiento en búsqueda.");
  }
  const json = (await response.json()) as SeoPerformanceResponse;
  return json.result;
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

// Adjetivo de agregación para el título "Evolución {agregación} de {métrica}"
// arriba de cada gráfico de barras compartido (Prompt 70).
const GRANULARITY_ADJECTIVE: Record<Granularity, string> = { day: "diaria", week: "semanal", month: "mensual" };

type OverviewMetricKey = "totalPages" | "totalKeywords" | "avgKeywordsPerPage" | "avgPagesPerKeyword";
type OverviewMetricFormat = "number" | "decimal";

interface OverviewMetricDef {
  key: OverviewMetricKey;
  label: string;
  /** Nombre corto de la métrica para el título del gráfico ("Evolución diaria de {titleLabel}") — sin la palabra "totales", que ahí queda redundante. */
  titleLabel: string;
  format: OverviewMetricFormat;
  /** avgPagesPerKeyword: un valor MÁS ALTO es señal de canibalización (peor) — ver fetchSeoOverview. */
  higherIsBetter: boolean;
}

const METRIC_OPTIONS: OverviewMetricDef[] = [
  { key: "totalPages", label: "Páginas totales", titleLabel: "Páginas", format: "number", higherIsBetter: true },
  { key: "totalKeywords", label: "Keywords totales", titleLabel: "Keywords", format: "number", higherIsBetter: true },
  { key: "avgKeywordsPerPage", label: "Promedio de Kws por Página", titleLabel: "Promedio de Kws por Página", format: "decimal", higherIsBetter: true },
  { key: "avgPagesPerKeyword", label: "Promedio de Páginas por Kw", titleLabel: "Promedio de Páginas por Kw", format: "decimal", higherIsBetter: false },
];

// Textos del acordeón "Info" de cada scorecard (Prompt 65) — explican qué
// significa la métrica y por qué importa en esta hoja.
const METRIC_DESCRIPTIONS: Record<OverviewMetricKey, string> = {
  totalPages:
    "Cantidad de páginas del sitio que aparecen en al menos una búsqueda de Google. Muestra cuánto del contenido del sitio está siendo descubierto, más allá de cuánto contenido existe realmente.",
  totalKeywords:
    "Cantidad de búsquedas distintas por las que el sitio aparece en Google. Es la base de todo lo demás: sin visibilidad en búsquedas, no hay tráfico posible. Sirve para ver si la superficie de búsquedas capturadas está creciendo o achicándose.",
  avgKeywordsPerPage:
    "En promedio, por cuántas búsquedas distintas aparece cada página. Un número alto indica páginas con buena cobertura temática; un número bajo puede señalar contenido muy específico o poco desarrollado.",
  avgPagesPerKeyword:
    "En promedio, en cuántas páginas distintas aparece cada búsqueda. Un número alto es una señal de que varias páginas están compitiendo por las mismas búsquedas (canibalización), lo que puede diluir el ranking en vez de fortalecerlo.",
};

function formatMetricValue(value: number, format: OverviewMetricFormat): string {
  return format === "decimal" ? formatDecimal(value) : formatNumber(value);
}

// Solo para el valor mostrado EN la barra (eje y tooltip siguen con
// formatMetricValue, número completo) — Páginas/Keywords totales compactos
// (700K), los 2 promedios (decimal) sin cambios.
function formatBarLabelValue(value: number, format: OverviewMetricFormat): string {
  return format === "decimal" ? formatDecimal(value) : formatCompactNumber(value);
}

// Diferencia mínima (en puntos porcentuales) entre la variación de Páginas
// totales y Keywords totales para que el cruce de crecimiento (insight 1) se
// considere significativo — por debajo, no hay señal clara que destacar.
const GROWTH_GAP_THRESHOLD_PP = 10;

// Bandas de NIVEL ABSOLUTO del período actual (mismo criterio ya corregido en
// el Prompt 26 para el Pareto — el sentimiento lo define el nivel, no la
// variación período a período) para los insights 2 y 3.
const CANNIBALIZATION_POSITIVE_MAX = 1.2;
const CANNIBALIZATION_NEUTRAL_MAX = 1.5;
const BREADTH_LOW_MAX = 2;
const BREADTH_HIGH_MIN = 8;

// Cláusula informativa de tendencia (dato adicional, nunca driver del
// sentimiento) para el insight de canibalización — "podés mencionar... si
// este valor subió o bajó vs. el período anterior".
function describeTrendClause(current: number, previous: number): string {
  if (current > previous) return `subió respecto al período anterior (de ${formatDecimal(previous)} a ${formatDecimal(current)})`;
  if (current < previous) return `bajó respecto al período anterior (de ${formatDecimal(previous)} a ${formatDecimal(current)})`;
  return `se mantuvo igual que en el período anterior (${formatDecimal(current)})`;
}

// 3 insights de reglas entre los scorecards y el gráfico (Prompt 66) — cada
// uno se omite por completo si no hay una señal clara que destacar (cruce de
// crecimiento por debajo del umbral, o amplitud temática dentro del rango
// esperable).
function buildOverviewInsights(result: SeoOverviewResult): Insight[] {
  const insights: Insight[] = [];

  // 1) Cruce de crecimiento: Páginas vs. Keywords — mismos variationPct que
  // ya calculan los badges de esos 2 scorecards (generateInsight()).
  const pagesInsight = generateInsight({
    label: "Páginas totales",
    current: result.current.totalPages,
    previous: result.previous.totalPages,
    format: "number",
    higherIsBetter: true,
  });
  const keywordsInsight = generateInsight({
    label: "Keywords totales",
    current: result.current.totalKeywords,
    previous: result.previous.totalKeywords,
    format: "number",
    higherIsBetter: true,
  });
  const growthGap = keywordsInsight.variationPct - pagesInsight.variationPct;
  if (growthGap >= GROWTH_GAP_THRESHOLD_PP) {
    insights.push({
      label: "Cruce de crecimiento: Páginas vs. Keywords",
      current: 0,
      previous: 0,
      variationPct: growthGap,
      sentiment: "positive",
      isSpike: false,
      text: "Las páginas que ya tenías ganaron cobertura de búsquedas más rápido de lo que se agregaron páginas nuevas — señal de que el contenido existente está madurando.",
    });
  } else if (growthGap <= -GROWTH_GAP_THRESHOLD_PP) {
    insights.push({
      label: "Cruce de crecimiento: Páginas vs. Keywords",
      current: 0,
      previous: 0,
      variationPct: growthGap,
      sentiment: "neutral",
      isSpike: false,
      text: "Se está publicando contenido más rápido de lo que ese contenido nuevo gana visibilidad en búsquedas — vale la pena revisar el SEO on-page de lo reciente.",
    });
  }

  // 2) Nivel de canibalización (Promedio de Páginas por Kw) — banda por
  // nivel absoluto del período actual.
  const avgPagesPerKeyword = result.current.avgPagesPerKeyword;
  let cannibalizationSentiment: InsightSentiment;
  let cannibalizationText: string;
  if (avgPagesPerKeyword < CANNIBALIZATION_POSITIVE_MAX) {
    cannibalizationSentiment = "positive";
    cannibalizationText = "Cada keyword tiene, en promedio, una página bien definida que la representa — buena señal de consolidación de contenido.";
  } else if (avgPagesPerKeyword <= CANNIBALIZATION_NEUTRAL_MAX) {
    cannibalizationSentiment = "neutral";
    cannibalizationText = "Hay cierta dispersión de keywords entre varias páginas — vale la pena revisar los casos puntuales más adelante.";
  } else {
    cannibalizationSentiment = "negative";
    cannibalizationText = "Varias páginas están compitiendo por las mismas búsquedas en promedio — señal de canibalización que puede estar diluyendo el ranking en vez de fortalecerlo.";
  }
  insights.push({
    label: "Nivel de canibalización",
    current: avgPagesPerKeyword,
    previous: result.previous.avgPagesPerKeyword,
    variationPct: 0,
    sentiment: cannibalizationSentiment,
    isSpike: false,
    text: `${cannibalizationText} Este promedio ${describeTrendClause(avgPagesPerKeyword, result.previous.avgPagesPerKeyword)}.`,
  });

  // 3) Amplitud temática (Promedio de Kws por Página) — misma banda por
  // nivel absoluto; el rango intermedio (esperable) no muestra insight.
  const avgKeywordsPerPage = result.current.avgKeywordsPerPage;
  if (avgKeywordsPerPage < BREADTH_LOW_MAX) {
    insights.push({
      label: "Amplitud temática",
      current: avgKeywordsPerPage,
      previous: result.previous.avgKeywordsPerPage,
      variationPct: 0,
      sentiment: "neutral",
      isSpike: false,
      text: "Las páginas del sitio aparecen, en promedio, por muy pocas búsquedas distintas — puede haber oportunidad de ampliar el contenido para capturar variantes de búsqueda relacionadas.",
    });
  } else if (avgKeywordsPerPage > BREADTH_HIGH_MIN) {
    insights.push({
      label: "Amplitud temática",
      current: avgKeywordsPerPage,
      previous: result.previous.avgKeywordsPerPage,
      variationPct: 0,
      sentiment: "positive",
      isSpike: false,
      text: "Las páginas del sitio tienen buena cobertura temática, apareciendo en promedio por muchas búsquedas distintas.",
    });
  }

  return insights;
}

// ============================================================================
// Sección "Rendimiento en Búsqueda" (Prompt 67) — Impresiones/Clicks/CTR/
// Posición Media a nivel página (dimensions ["date","page"], sin el cruce con
// keyword). No toca nada de la sección "Cobertura de Páginas y Keywords" de
// arriba (Prompts 64-66) — es una sección paralela e independiente, con su
// propio estado (agregación, métrica del gráfico, fetch).
// ============================================================================

type PerformanceMetricKey = "impressions" | "clicks" | "ctr" | "position";
type PerformanceMetricFormat = "number" | "percentage" | "decimal";
type PerformanceContextKey = "avgImpressionsPerPage" | "avgClicksPerPage" | "avgCtrPerPage" | "avgPositionPerPage";

interface PerformanceMetricDef {
  key: PerformanceMetricKey;
  label: string;
  format: PerformanceMetricFormat;
  /** position: un valor MÁS BAJO es mejor (mejor ranking). */
  higherIsBetter: boolean;
  contextLabel: string;
  contextKey: PerformanceContextKey;
}

const PERFORMANCE_METRIC_OPTIONS: PerformanceMetricDef[] = [
  { key: "impressions", label: "Impresiones", format: "number", higherIsBetter: true, contextLabel: "Promedio de Impresiones x pág", contextKey: "avgImpressionsPerPage" },
  { key: "clicks", label: "Clicks", format: "number", higherIsBetter: true, contextLabel: "Promedio de Clicks x pág", contextKey: "avgClicksPerPage" },
  { key: "ctr", label: "CTR", format: "percentage", higherIsBetter: true, contextLabel: "Promedio de CTR x pág", contextKey: "avgCtrPerPage" },
  { key: "position", label: "Posición Media", format: "decimal", higherIsBetter: false, contextLabel: "Promedio de Posición x pág", contextKey: "avgPositionPerPage" },
];

// Textos del acordeón "Info" de cada scorecard de esta sección.
const PERFORMANCE_METRIC_DESCRIPTIONS: Record<PerformanceMetricKey, string> = {
  impressions: "Cantidad de veces que alguna página del sitio apareció en los resultados de búsqueda de Google, en el período seleccionado.",
  clicks: "Cantidad de clicks que recibieron las páginas del sitio desde los resultados de búsqueda de Google, en el período seleccionado.",
  ctr: "Porcentaje de impresiones que se convirtieron en clicks (clicks ÷ impresiones), calculado sobre el total del sitio en el período.",
  position: "Posición promedio en la que aparecieron las páginas del sitio en los resultados de búsqueda, ponderada por las impresiones de cada página.",
};

function formatPerformanceValue(value: number, format: PerformanceMetricFormat): string {
  if (format === "percentage") return formatPercent(value);
  if (format === "decimal") return formatDecimal(value);
  return formatNumber(value);
}

// Solo para el valor mostrado EN la barra (eje y tooltip siguen con
// formatPerformanceValue, número completo) — Impresiones/Clicks compactos
// (700K), CTR y Posición Media (decimal) sin cambios.
function formatPerformanceBarLabelValue(value: number, format: PerformanceMetricFormat): string {
  if (format === "percentage") return formatPercent(value);
  if (format === "decimal") return formatDecimal(value);
  return formatCompactNumber(value);
}

// El dato de contexto ("Promedio de X x pág") siempre va con máximo 1
// decimal (Prompt 32) — a diferencia del valor principal de Impresiones/
// Clicks (formatNumber, redondeado a entero), acá el promedio por página es
// naturalmente fraccionario.
function formatPerformanceContextValue(value: number, format: PerformanceMetricFormat): string {
  if (format === "percentage") return formatPercent(value);
  return formatDecimal(value);
}

const CTR_RELATIVE_DIFF_THRESHOLD = 0.3; // 30%
const POSITION_DIFF_THRESHOLD = 5; // posiciones

// 2 insights entre los scorecards y el gráfico de esta sección — comparan el
// valor AGREGADO del sitio contra el promedio SIMPLE por página, ambos del
// período actual (sin comparar contra el período anterior).
function buildPerformanceInsights(result: SeoPerformanceResult): Insight[] {
  const insights: Insight[] = [];

  // 1) CTR agregado (Σclicks/Σimpresiones) vs. Promedio de CTR x página (simple).
  const ctrAggregate = result.current.ctr;
  const ctrPerPage = result.current.avgCtrPerPage;
  const ctrRelativeDiff = ctrAggregate > 0 ? (ctrPerPage - ctrAggregate) / ctrAggregate : 0;
  if (ctrRelativeDiff >= CTR_RELATIVE_DIFF_THRESHOLD) {
    insights.push({
      label: "CTR agregado vs. por página",
      current: 0,
      previous: 0,
      variationPct: ctrRelativeDiff * 100,
      sentiment: "positive",
      isSpike: false,
      text: "El CTR de una página típica del sitio es más alto que el CTR general — unas pocas páginas de mucho volumen están arrastrando el promedio general hacia abajo.",
    });
  } else if (ctrRelativeDiff <= -CTR_RELATIVE_DIFF_THRESHOLD) {
    insights.push({
      label: "CTR agregado vs. por página",
      current: 0,
      previous: 0,
      variationPct: ctrRelativeDiff * 100,
      sentiment: "negative",
      isSpike: false,
      text: "El CTR general del sitio está siendo sostenido por unas pocas páginas de alto rendimiento — la mayoría de las páginas individuales convierten peor que el promedio general.",
    });
  }

  // 2) Posición Media agregada (ponderada) vs. Promedio de Posición x página
  // (simple) — solo se muestra cuando la página "típica" está notablemente
  // PEOR (número más alto) que el agregado ponderado.
  const positionAggregate = result.current.position;
  const positionPerPage = result.current.avgPositionPerPage;
  const positionDiff = positionPerPage - positionAggregate;
  if (positionDiff >= POSITION_DIFF_THRESHOLD) {
    insights.push({
      label: "Posición Media agregada vs. por página",
      current: 0,
      previous: 0,
      variationPct: positionDiff,
      sentiment: "negative",
      isSpike: false,
      text: 'Pocas páginas de alto tráfico rankean mucho mejor que el resto del sitio — la página "típica" está bastante peor posicionada que lo que sugiere el promedio ponderado.',
    });
  }

  return insights;
}

// Label corto para el eje X ("9 ago", "3-9 ago", "Ago 2026").
function formatBucketLabel(bucket: { startDate: string; endDate: string }, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `${format(start, "d")}-${format(end, "d")} ${format(start, "MMM", { locale: es })}`
    : `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
}

// Label largo para el tooltip ("Semana del 3 al 9 de agosto").
function formatBucketFullLabel(bucket: { startDate: string; endDate: string }, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d 'de' MMMM", { locale: es });
  if (granularity === "month") return format(start, "MMMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `Semana del ${format(start, "d")} al ${format(end, "d 'de' MMMM", { locale: es })}`
    : `Semana del ${format(start, "d 'de' MMMM", { locale: es })} al ${format(end, "d 'de' MMMM", { locale: es })}`;
}

// Label de la línea de referencia del promedio como un pill (rect + texto
// blanco) — mismo criterio que SeoKeywordCountBlock/SeoPageCountBlock.
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

interface ChartPoint {
  label: string;
  fullLabel: string;
  totalPages: number;
  totalKeywords: number;
  avgKeywordsPerPage: number;
  avgPagesPerKeyword: number;
}

interface PerformanceChartPoint {
  label: string;
  fullLabel: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

// "Visión General" (SEO > Visión General, Prompt 64) — cruce página×keyword
// de todo el sitio (segmento elegido): 4 scorecards (Páginas totales,
// Keywords totales, Promedio de Keywords por Página, Promedio de Páginas por
// Keyword) + un gráfico de barras compartido con selector de métrica. Mismo
// selector de segmento transversal que Páginas/Tipos de Búsqueda. Reemplaza
// por completo el diseño anterior de esta hoja (métricas básicas con
// gráficos seleccionables + insights LLM + desgloses) — ver git history si
// hace falta recuperar algo de esa versión.
export function SeoDashboard({ clientId, breadcrumbSubtitle }: SeoDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [segment, setSegment] = useState<SeoPageSegmentKey>(() => parseSegmentFromSearchParams(searchParams));
  const [granularity, setGranularity] = useState<Granularity>(() => getDefaultGranularity(range));
  const [chartMetric, setChartMetric] = useState<OverviewMetricKey>("totalKeywords");
  const [result, setResult] = useState<SeoOverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Fetch "liviano" disparado solo por el selector Día/Semana/Mes (no pisa
  // el Skeleton, ver overviewDatasetKeyRef más abajo) — mientras está en
  // curso, se atenúa el gráfico y se deshabilitan los botones en vez de
  // mostrar una carga completa.
  const [chartUpdating, setChartUpdating] = useState(false);

  // Sección "Rendimiento en Búsqueda" (Prompt 67) — estado propio e
  // independiente del de "Cobertura de Páginas y Keywords" de arriba (propia
  // agregación, propia métrica de gráfico, propio fetch).
  const [performanceGranularity, setPerformanceGranularity] = useState<Granularity>(() => getDefaultGranularity(range));
  const [performanceMetric, setPerformanceMetric] = useState<PerformanceMetricKey>("impressions");
  const [performanceResult, setPerformanceResult] = useState<SeoPerformanceResult | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState<string | null>(null);
  const [performanceChartUpdating, setPerformanceChartUpdating] = useState(false);

  useEffect(() => {
    setGranularity(getDefaultGranularity(range));
    setPerformanceGranularity(getDefaultGranularity(range));
  }, [range]);

  function updateUrl(nextPreset: DateRangePreset, nextRange: DateRangeValue, nextSegment: SeoPageSegmentKey) {
    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    if (nextSegment !== "all") params.set("segment", nextSegment);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });
    updateUrl(nextPreset, nextRange, segment);
  }

  function handleSegmentChange(nextSegment: SeoPageSegmentKey) {
    setSegment(nextSegment);
    updateUrl(preset, range, nextSegment);
  }

  // Caché en memoria (dura mientras el componente esté montado) de los
  // resultados YA bucketizados por agregación, guardados como PROMESA (no
  // como valor resuelto) para que dos pedidos concurrentes de la misma
  // agregación compartan el mismo fetch en vez de duplicarlo. Clave
  // `${datasetKey}|${granularity}` — se vacía entera cada vez que cambia el
  // dataset real (rango/segmento/cliente). Al resolver la agregación activa
  // se precargan en segundo plano las otras dos para ese mismo dataset, así
  // el selector Día/Semana/Mes queda "instantáneo" (solo la animación de
  // Recharts) después del primer render (Prompt 71).
  const overviewDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}|${segment}`);
  const overviewCacheRef = useRef<Map<string, Promise<SeoOverviewResult | null>>>(new Map());

  function getOrFetchOverview(datasetKey: string, g: Granularity): Promise<SeoOverviewResult | null> {
    const cache = overviewCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchOverviewResult(clientId, range, segment, g);
      cache.set(cacheKey, pending);
      pending.catch(() => {
        // Si el fetch falla no lo dejamos cacheado como error permanente —
        // el próximo intento (click real o nuevo prefetch) lo reintenta.
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // Wrapper estable (Prompt 73) para pasarle a cada OverviewScorecard un
  // fetcher de un solo argumento (granularidad) — reusa el mismo caché de
  // arriba, así el selector Día/Semana/Mes de cada tarjeta individual queda
  // "instantáneo" apenas el gráfico compartido ya precargó esa granularidad.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchOverviewSeries = useCallback(
    (g: Granularity) => getOrFetchOverview(`${clientId}|${range.from}|${range.to}|${segment}`, g),
    [clientId, range, segment]
  );

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}|${segment}`;
    const isNewDataset = overviewDatasetKeyRef.current !== datasetKey;
    if (isNewDataset) {
      overviewCacheRef.current = new Map();
      overviewDatasetKeyRef.current = datasetKey;
    }

    if (isNewDataset) setLoading(true); else setChartUpdating(true);
    setError(null);

    getOrFetchOverview(datasetKey, granularity)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setChartUpdating(false);
        for (const g of ALL_GRANULARITIES) {
          if (g !== granularity) getOrFetchOverview(datasetKey, g).catch(() => {});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, range, segment, granularity]);

  // Misma lógica que arriba, para la sección "Rendimiento en Búsqueda" —
  // tiene su propia agregación, su propio caché y su propio fetch
  // independiente.
  const performanceDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}|${segment}`);
  const performanceCacheRef = useRef<Map<string, Promise<SeoPerformanceResult | null>>>(new Map());

  function getOrFetchPerformance(datasetKey: string, g: Granularity): Promise<SeoPerformanceResult | null> {
    const cache = performanceCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchPerformanceResult(clientId, range, segment, g);
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // Mismo wrapper estable que fetchOverviewSeries, para cada PerformanceScorecard.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchPerformanceSeries = useCallback(
    (g: Granularity) => getOrFetchPerformance(`${clientId}|${range.from}|${range.to}|${segment}`, g),
    [clientId, range, segment]
  );

  useEffect(() => {
    let cancelled = false;
    const datasetKey = `${clientId}|${range.from}|${range.to}|${segment}`;
    const isNewDataset = performanceDatasetKeyRef.current !== datasetKey;
    if (isNewDataset) {
      performanceCacheRef.current = new Map();
      performanceDatasetKeyRef.current = datasetKey;
    }

    if (isNewDataset) setPerformanceLoading(true); else setPerformanceChartUpdating(true);
    setPerformanceError(null);

    getOrFetchPerformance(datasetKey, performanceGranularity)
      .then((data) => {
        if (!cancelled) setPerformanceResult(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setPerformanceError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setPerformanceLoading(false);
        setPerformanceChartUpdating(false);
        for (const g of ALL_GRANULARITIES) {
          if (g !== performanceGranularity) getOrFetchPerformance(datasetKey, g).catch(() => {});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, range, segment, performanceGranularity]);

  const chartData: ChartPoint[] = (result?.series ?? []).map((bucket: SeoOverviewBucket) => ({
    label: formatBucketLabel(bucket, granularity),
    fullLabel: formatBucketFullLabel(bucket, granularity),
    totalPages: bucket.totalPages,
    totalKeywords: bucket.totalKeywords,
    avgKeywordsPerPage: bucket.avgKeywordsPerPage,
    avgPagesPerKeyword: bucket.avgPagesPerKeyword,
  }));

  const activeMetric = METRIC_OPTIONS.find((option) => option.key === chartMetric)!;
  // Promedio del rango actualmente visible en el gráfico — se recalcula solo
  // (no es un valor fijo) cada vez que cambia la agregación, el rango o la
  // métrica elegida.
  const averageValue = chartData.length > 0 ? chartData.reduce((sum, point) => sum + point[chartMetric], 0) / chartData.length : 0;
  const chartMaxValue = chartData.reduce((max, point) => Math.max(max, point[chartMetric]), 0);
  const overviewInsights = result ? buildOverviewInsights(result) : [];

  // Memoizado (Prompt 92): fetchTrend de cada tarjeta envuelve fetchOverviewSeries
  // (ya useCallback-estable), pero si el array de métricas se reconstruyera en
  // cada render, cada fetchTrend sería una función nueva y ScorecardCard
  // volvería a pedir el gráfico individual en cada render — se recalcula solo
  // cuando cambia el resultado o fetchOverviewSeries mismo.
  const overviewMetrics: MetricScorecardConfig[] = useMemo(
    () =>
      result
        ? METRIC_OPTIONS.map((def) => ({
            key: def.key,
            label: def.label,
            currentValue: result.current[def.key],
            previousValue: result.previous[def.key],
            format: def.format,
            higherIsBetter: def.higherIsBetter,
            infoText: METRIC_DESCRIPTIONS[def.key],
            fetchTrend: (g: Granularity) =>
              fetchOverviewSeries(g).then((res) =>
                (res?.series ?? []).map((bucket) => ({ label: formatBucketLabel(bucket, g), value: bucket[def.key] }))
              ),
          }))
        : [],
    [result, fetchOverviewSeries]
  );

  const performanceChartData: PerformanceChartPoint[] = (performanceResult?.series ?? []).map((bucket: SeoPerformanceBucket) => ({
    label: formatBucketLabel(bucket, performanceGranularity),
    fullLabel: formatBucketFullLabel(bucket, performanceGranularity),
    impressions: bucket.impressions,
    clicks: bucket.clicks,
    ctr: bucket.ctr,
    position: bucket.position,
  }));

  const activePerformanceMetric = PERFORMANCE_METRIC_OPTIONS.find((option) => option.key === performanceMetric)!;
  const performanceAverageValue =
    performanceChartData.length > 0
      ? performanceChartData.reduce((sum, point) => sum + point[performanceMetric], 0) / performanceChartData.length
      : 0;
  const performanceChartMaxValue = performanceChartData.reduce((max, point) => Math.max(max, point[performanceMetric]), 0);
  const performanceInsights = performanceResult ? buildPerformanceInsights(performanceResult) : [];

  // Memoizado por el mismo motivo que overviewMetrics más arriba. renderExtra
  // reproduce tal cual la línea de contexto ("Promedio de X x pág") + el
  // desglose por tipo de contenido que esta sección ya tenía debajo del
  // acordeón Info (Prompt 68-69) — MetricScorecardGroup no lo hardcodea, solo
  // le da un lugar al pie de la tarjeta para que cada uso lo agregue si lo
  // necesita.
  const performanceMetrics: MetricScorecardConfig[] = useMemo(
    () =>
      performanceResult
        ? PERFORMANCE_METRIC_OPTIONS.map((def) => {
            const contextValue = performanceResult.current[def.contextKey];
            const contentBreakdown = segment === "all" ? performanceResult.contentBreakdown : null;
            return {
              key: def.key,
              label: def.label,
              currentValue: performanceResult.current[def.key],
              previousValue: performanceResult.previous[def.key],
              format: def.format,
              higherIsBetter: def.higherIsBetter,
              infoText: PERFORMANCE_METRIC_DESCRIPTIONS[def.key],
              fetchTrend: (g: Granularity) =>
                fetchPerformanceSeries(g).then((res) =>
                  (res?.series ?? []).map((bucket) => ({ label: formatBucketLabel(bucket, g), value: bucket[def.key] }))
                ),
              renderExtra: () => (
                <>
                  <p className="text-xs text-muted-foreground">
                    {def.contextLabel}: {formatPerformanceContextValue(contextValue, def.format)}
                  </p>
                  {/* Desglose por tipo de contenido (Prompt 68-69) — siempre el split
                      del sitio completo (no del segmento filtrado), por eso se
                      pasa null y no se renderiza cuando el segmento elegido en la
                      hoja no es "Todo el sitio" (sería redundante/engañoso). 4
                      buckets: Home ahora es SOLO la página principal, así que las
                      páginas que no son ni home ni blog quedan en "Otras" en vez de
                      agruparse bajo Home (Prompt 69). */}
                  {contentBreakdown && (
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <p>Home: {formatPerformanceContextValue(contentBreakdown.home[def.key], def.format)}</p>
                      <p>Blog - Portada: {formatPerformanceContextValue(contentBreakdown["blog-portada"][def.key], def.format)}</p>
                      <p>Blog - Notas: {formatPerformanceContextValue(contentBreakdown["blog-notas"][def.key], def.format)}</p>
                      <p>Otras: {formatPerformanceContextValue(contentBreakdown.otras[def.key], def.format)}</p>
                    </div>
                  )}
                </>
              ),
            };
          })
        : [],
    [performanceResult, fetchPerformanceSeries, segment]
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>
      <SeoPageSegmentSelector clientId={clientId} value={segment} onChange={handleSegmentChange} />

      <h2 className="text-lg font-semibold text-foreground">Cobertura de Páginas y Keywords</h2>

      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRangeState({ preset, range: { ...range } })}>
            Reintentar
          </Button>
        </div>
      ) : loading || !result ? (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <MetricScorecardGroup
            metrics={overviewMetrics}
            selectedKey={chartMetric}
            onSelectedKeyChange={(key) => setChartMetric(key as OverviewMetricKey)}
          />

          {overviewInsights.length > 0 && <InsightsList insights={overviewInsights} sectionKey="seo" keyPrefix="overview" />}

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  Evolución {GRANULARITY_ADJECTIVE[granularity]} de {activeMetric.titleLabel}
                  {chartUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                <div className="flex gap-1">
                  {AGGREGATION_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={granularity === option.value ? "default" : "ghost"}
                      disabled={chartUpdating}
                      onClick={() => setGranularity(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {chartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
              ) : (
                <div className={cn("h-64 w-full transition-opacity", chartUpdating && "opacity-50")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                        width={40}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={activeMetric.format === "decimal"}
                        ticks={activeMetric.format === "number" ? integerYAxisTicks(chartMaxValue) : undefined}
                        tickFormatter={(value: number) => formatBarLabelValue(value, activeMetric.format)}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const point = payload[0]?.payload as ChartPoint | undefined;
                          if (!point) return null;
                          return (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium text-foreground">
                                {point.fullLabel}: {formatMetricValue(point[chartMetric], activeMetric.format)}
                              </p>
                              <p className="text-muted-foreground">Promedio del período: {formatMetricValue(averageValue, activeMetric.format)}</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey={chartMetric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                        <LabelList
                          dataKey={chartMetric}
                          position="top"
                          formatter={(value: string | number | boolean | null | undefined) => formatBarLabelValue(Number(value ?? 0), activeMetric.format)}
                          fontSize={11}
                        />
                      </Bar>
                      <ReferenceLine
                        y={averageValue}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={(props) => renderAveragePillLabel(props, `Promedio: ${formatMetricValue(averageValue, activeMetric.format)}`)}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <h2 className="text-lg font-semibold text-foreground">Rendimiento en Búsqueda</h2>

      {performanceError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <p className="text-sm text-destructive">{performanceError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => setRangeState({ preset, range: { ...range } })}>
            Reintentar
          </Button>
        </div>
      ) : performanceLoading || !performanceResult ? (
        <div className="flex flex-col gap-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full" />
            ))}
          </div>
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <MetricScorecardGroup
            metrics={performanceMetrics}
            selectedKey={performanceMetric}
            onSelectedKeyChange={(key) => setPerformanceMetric(key as PerformanceMetricKey)}
          />

          {performanceInsights.length > 0 && <InsightsList insights={performanceInsights} sectionKey="seo" keyPrefix="performance" />}

          <Card className="w-full min-w-0">
            <CardContent className="flex flex-col gap-4 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  Evolución {GRANULARITY_ADJECTIVE[performanceGranularity]} de {activePerformanceMetric.label}
                  {performanceChartUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                </p>
                <div className="flex gap-1">
                  {AGGREGATION_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      size="sm"
                      variant={performanceGranularity === option.value ? "default" : "ghost"}
                      disabled={performanceChartUpdating}
                      onClick={() => setPerformanceGranularity(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              {performanceChartData.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
              ) : (
                <div className={cn("h-64 w-full transition-opacity", performanceChartUpdating && "opacity-50")}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={performanceChartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                      <YAxis
                        tick={{ fontSize: 12 }}
                        className="fill-muted-foreground"
                        width={40}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={activePerformanceMetric.format !== "number"}
                        ticks={activePerformanceMetric.format === "number" ? integerYAxisTicks(performanceChartMaxValue) : undefined}
                        tickFormatter={(value: number) => formatPerformanceBarLabelValue(value, activePerformanceMetric.format)}
                      />
                      <Tooltip
                        cursor={{ fill: "hsl(var(--muted))" }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const point = payload[0]?.payload as PerformanceChartPoint | undefined;
                          if (!point) return null;
                          return (
                            <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                              <p className="font-medium text-foreground">
                                {point.fullLabel}: {formatPerformanceValue(point[performanceMetric], activePerformanceMetric.format)}
                              </p>
                              <p className="text-muted-foreground">
                                Promedio del período: {formatPerformanceValue(performanceAverageValue, activePerformanceMetric.format)}
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey={performanceMetric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                        <LabelList
                          dataKey={performanceMetric}
                          position="top"
                          formatter={(value: string | number | boolean | null | undefined) =>
                            formatPerformanceBarLabelValue(Number(value ?? 0), activePerformanceMetric.format)
                          }
                          fontSize={11}
                        />
                      </Bar>
                      <ReferenceLine
                        y={performanceAverageValue}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={(props) =>
                          renderAveragePillLabel(props, `Promedio: ${formatPerformanceValue(performanceAverageValue, activePerformanceMetric.format)}`)
                        }
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
