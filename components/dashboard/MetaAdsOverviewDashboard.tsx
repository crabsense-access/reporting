"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { generateInsight } from "@/lib/insights/generateInsight";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import { formatCompactNumber, formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks } from "@/lib/charts";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue, Granularity } from "@/lib/date-range";
import { formatMetricValue, type MetaAdsMetricFormat } from "@/lib/meta-ads/metric-defs";
import type { MetaAdsMetrics, MetaAdsTimeSeriesPoint } from "@/lib/meta-ads/reports";

interface MetaAdsOverviewResponse {
  connected: boolean;
  metrics: MetaAdsMetrics | null;
  timeSeries: { current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] } | null;
  activeAdCount: number | null;
}

interface MetaAdsOverviewDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

async function fetchMetaAdsOverview(
  clientId: string,
  range: DateRangeValue,
  options: { granularity?: Granularity; includeAdCount?: boolean } = {}
): Promise<MetaAdsOverviewResponse> {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (options.granularity) params.set("granularity", options.granularity);
  if (options.includeAdCount) params.set("include_ad_count", "1");
  const response = await fetch(`/api/dashboard/${clientId}/meta-ads?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar el tablero de Meta Ads.");
  }
  return (await response.json()) as MetaAdsOverviewResponse;
}

type OverviewMetricKey = "impressions" | "frequency" | "linkClicks" | "linkClickCtr";

interface OverviewMetricDef {
  key: OverviewMetricKey;
  label: string;
  /** Nombre corto para el título del gráfico compartido ("Evolución diaria de {titleLabel}"). */
  titleLabel: string;
  format: MetaAdsMetricFormat;
  /** Frecuencia: un valor MÁS ALTO es señal de fatiga de anuncio (peor). */
  higherIsBetter: boolean;
}

const METRIC_OPTIONS: OverviewMetricDef[] = [
  { key: "impressions", label: "Impresiones", titleLabel: "Impresiones", format: "number", higherIsBetter: true },
  { key: "frequency", label: "Frecuencia", titleLabel: "Frecuencia", format: "decimal", higherIsBetter: false },
  { key: "linkClicks", label: "Clicks", titleLabel: "Clicks", format: "number", higherIsBetter: true },
  { key: "linkClickCtr", label: "CTR", titleLabel: "CTR", format: "percentage", higherIsBetter: true },
];

// Textos del acordeón "Info" de cada scorecard.
const METRIC_DESCRIPTIONS: Record<OverviewMetricKey, string> = {
  impressions: "Cantidad de veces que se mostraron tus anuncios en Meta (Facebook/Instagram). Es la base del alcance de la campaña.",
  frequency:
    "Promedio de veces que una misma persona vio tu anuncio en el período. Frecuencia muy alta es señal de fatiga de anuncio — la misma audiencia ve el mismo creativo demasiadas veces.",
  linkClicks: "Cantidad de clics que generaron tus anuncios.",
  linkClickCtr: "Porcentaje de impresiones que resultaron en un clic — mide qué tan atractivo es el anuncio para quien lo ve.",
};

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

const GRANULARITY_ADJECTIVE: Record<Granularity, string> = { day: "diaria", week: "semanal", month: "mensual" };

// Bandas de nivel absoluto de Frecuencia — fuera de ese rango intermedio hay
// algo puntual para destacar; dentro (2 a 4), un rango razonable.
const FREQUENCY_LOW_MAX = 2;
const FREQUENCY_HIGH_MIN = 4;
// "Subió de forma marcada" (Impresiones × Frecuencia, más abajo) — sin un
// número explícito en el pedido, se usa un umbral menor al de spike (25%,
// generateInsight.ts) porque Frecuencia es una métrica de rango más chico.
const FREQUENCY_MARKED_RISE_PCT = 15;
// "Se mantuvieron estables" (Clicks × Impresiones) — mismo umbral que usa
// generateInsight() en todo el proyecto para considerar una variación como
// "sin cambios".
const STABLE_THRESHOLD_PCT = 5;
// Tolerancia (en puntos porcentuales) para considerar que la caída de
// clicks y de impresiones es "similar" — sin un número explícito en el
// pedido.
const SIMILAR_DROP_TOLERANCE_PP = 10;
const MIN_ACTIVE_ADS_FOR_PAUSE_REC = 5;

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100;
  return ((current - previous) / previous) * 100;
}

// Insight dinámico de Impresiones — descubrimiento + recomendación, según
// si subieron/bajaron y, si subieron, si ese crecimiento vino acompañado de
// una suba marcada de Frecuencia (mismo público viendo el anuncio más veces,
// no público nuevo). Siempre suma el CTR del período como contexto cruzado
// (Prompt 77), no solo cuando hay fatiga — negrita en los números clave,
// mismo criterio de markdown que ya usa InsightCard en el resto del proyecto.
function buildImpressionsInsight(m: MetaAdsMetrics): Insight {
  const variationPct = pctChange(m.impressions, m.previous.impressions);
  const rose = variationPct >= 0;
  const freqRoseMarkedly = pctChange(m.frequency, m.previous.frequency) >= FREQUENCY_MARKED_RISE_PCT;
  const ctrDeltaPct = pctChange(m.linkClickCtr, m.previous.linkClickCtr);
  const ctrRose = m.linkClickCtr >= m.previous.linkClickCtr;

  let discovery = `Las impresiones ${rose ? "subieron" : "bajaron"} un **${Math.abs(variationPct).toFixed(0)}%** este período (**${formatNumber(m.previous.impressions)}** → **${formatNumber(m.impressions)}**).`;
  if (rose && freqRoseMarkedly) {
    discovery += ` Gran parte de ese crecimiento viene de mostrarle el anuncio más veces a la misma audiencia (Frecuencia: **${formatDecimal(m.frequency)}**), no de alcanzar gente nueva.`;
  } else {
    discovery += ` En paralelo, el CTR ${ctrRose ? "acompañó, con una suba" : "se movió en sentido contrario, con una caída"} del **${Math.abs(ctrDeltaPct).toFixed(0)}%** (ahora **${formatPercent(m.linkClickCtr)}**).`;
  }

  let recommendation: string;
  let sentiment: InsightSentiment;
  if (!rose) {
    recommendation = "**Revisá el presupuesto diario** — puede estar limitando el alcance — o si estás **perdiendo subastas** frente a la competencia.";
    sentiment = "negative";
  } else if (m.frequency > FREQUENCY_HIGH_MIN) {
    recommendation = "Considerá **ampliar la audiencia objetivo** para evitar mostrarle el anuncio de más a la misma gente.";
    sentiment = "neutral";
  } else {
    recommendation = "Buen crecimiento de alcance, sin señales de saturación de audiencia por ahora.";
    sentiment = "positive";
  }

  return {
    label: "Impresiones",
    current: m.impressions,
    previous: m.previous.impressions,
    variationPct,
    sentiment,
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de Frecuencia — descubrimiento + recomendación por banda
// de nivel absoluto. Siempre suma el CTR del período como contexto cruzado
// (Prompt 77), con una tercera frase cuando ambos se mueven en la dirección
// de fatiga (Frecuencia sube y CTR cae a la vez).
function buildFrequencyInsight(m: MetaAdsMetrics): Insight {
  const rose = m.frequency >= m.previous.frequency;
  const ctrFell = m.linkClickCtr < m.previous.linkClickCtr;

  let discovery = `La frecuencia promedio es **${formatDecimal(m.frequency)}** este período (${rose ? "subió" : "bajó"} desde **${formatDecimal(m.previous.frequency)}**).`;
  discovery += ` El CTR en el mismo período fue de **${formatPercent(m.linkClickCtr)}** (${ctrFell ? "cayó" : "se mantuvo o mejoró"} vs. el período anterior).`;
  if (rose && ctrFell) {
    discovery += " Frecuencia en alza y CTR en baja al mismo tiempo es el patrón clásico de fatiga de anuncio.";
  }

  let recommendation: string;
  let sentiment: InsightSentiment;
  if (m.frequency > FREQUENCY_HIGH_MIN) {
    recommendation =
      "Es alta — la misma audiencia está viendo el anuncio muchas veces. **Renová la creatividad** o **ampliá la audiencia** para evitar fatiga.";
    sentiment = "negative";
  } else if (m.frequency >= FREQUENCY_LOW_MAX) {
    recommendation = "Está en un rango razonable, sin acción urgente.";
    sentiment = "neutral";
  } else {
    recommendation = "Frecuencia saludable, hay margen para **escalar la inversión** sin saturar a la audiencia todavía.";
    sentiment = "positive";
  }

  return {
    label: "Frecuencia",
    current: m.frequency,
    previous: m.previous.frequency,
    variationPct: pctChange(m.frequency, m.previous.frequency),
    sentiment,
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de Clicks — descubrimiento + recomendación siempre
// presente (Prompt 77: antes no había recomendación cuando los clicks
// subían, o cuando bajaban sin encajar en ninguna de las 2 bandas). Siempre
// suma el CTR del período como contexto cruzado, y distingue si la caída
// viene de menor alcance (impresiones cayeron de forma similar) o de menor
// interés (impresiones estables/subieron pero los clicks cayeron igual).
function buildClicksInsight(m: MetaAdsMetrics): Insight {
  const clicksVariationPct = pctChange(m.linkClicks, m.previous.linkClicks);
  const impressionsVariationPct = pctChange(m.impressions, m.previous.impressions);
  const clicksRose = clicksVariationPct >= 0;
  const impressionsStableOrRose = impressionsVariationPct >= -STABLE_THRESHOLD_PCT;

  let discovery = `Los clics ${clicksRose ? "subieron" : "bajaron"} un **${Math.abs(clicksVariationPct).toFixed(0)}%** este período (**${formatNumber(m.previous.linkClicks)}** → **${formatNumber(m.linkClicks)}**), con un CTR de **${formatPercent(m.linkClickCtr)}**.`;
  if (!clicksRose && impressionsStableOrRose) {
    discovery += " Los clics cayeron aunque las impresiones se mantuvieron — el anuncio se está mostrando igual pero generando menos interés.";
  }

  let recommendation: string;
  if (clicksRose) {
    recommendation = "Buen volumen de interacción — si el CTR se sostiene, es buen momento para mantener o **escalar la inversión**.";
  } else {
    const impressionsFell = impressionsVariationPct < 0;
    const similarDrop = impressionsFell && Math.abs(clicksVariationPct - impressionsVariationPct) <= SIMILAR_DROP_TOLERANCE_PP;
    if (similarDrop) {
      recommendation = "La caída de clics viene de **menor alcance**, no de menor interés — revisá el **presupuesto** o la **puja**.";
    } else if (impressionsStableOrRose) {
      recommendation = "Probá **renovar la creatividad** o el **copy** del anuncio.";
    } else {
      recommendation = "La caída no se explica del todo por el alcance — vale la pena revisar **segmentación**, **puja** y **creatividad** en conjunto.";
    }
  }

  return {
    label: "Clicks",
    current: m.linkClicks,
    previous: m.previous.linkClicks,
    variationPct: clicksVariationPct,
    sentiment: clicksRose ? "positive" : "negative",
    isSpike: false,
    text: `${discovery} ${recommendation}`,
  };
}

// Insight dinámico de CTR — descubrimiento con inversión/anuncios activos/
// conversiones del período (Prompt 72), más una recomendación por prioridad
// explícita: CTR+conversiones ambos suben > CTR sube sin conversiones > CTR
// baja con muchos anuncios activos > CTR baja con inversión en alza. Necesita
// `activeAdCount`, pedido aparte (ver fetchMetaAdsActiveAdCount) solo cuando
// esta métrica está seleccionada.
function buildCtrInsight(m: MetaAdsMetrics, activeAdCount: number): Insight {
  const ctrVariationPct = pctChange(m.linkClickCtr, m.previous.linkClickCtr);
  const ctrRose = m.linkClickCtr >= m.previous.linkClickCtr;
  const conversionsRose = m.conversions > m.previous.conversions;
  const spendRose = m.spend > m.previous.spend;
  const adsLabel = activeAdCount === 1 ? "anuncio activo" : "anuncios activos";

  const discovery = `Con **${formatCurrency(m.spend, m.currencyCode)}** invertidos en **${formatNumber(activeAdCount)} ${adsLabel}** este período, el CTR fue de **${formatPercent(m.linkClickCtr)}** (${ctrRose ? "subió" : "bajó"} **${Math.abs(ctrVariationPct).toFixed(0)}%** vs. el período anterior), generando **${formatNumber(m.conversions)} conversiones**.`;

  let recommendation: string | null = null;
  let sentiment: InsightSentiment = ctrRose ? "positive" : "negative";
  if (ctrRose && conversionsRose) {
    recommendation =
      "La mejora de CTR se está traduciendo en más conversiones — la estrategia actual está funcionando, buen momento para **escalar la inversión**.";
  } else if (ctrRose && !conversionsRose) {
    recommendation =
      "El anuncio genera más interés pero no se traduce en conversiones — revisá la **landing page** o la **oferta**, el problema probablemente no está en el anuncio.";
    sentiment = "neutral";
  } else if (!ctrRose && activeAdCount >= MIN_ACTIVE_ADS_FOR_PAUSE_REC) {
    recommendation = `Con **${formatNumber(activeAdCount)} anuncios activos** y CTR a la baja, conviene identificar cuáles rinden peor y **pausarlos** o **refrescar su creatividad**.`;
  } else if (!ctrRose && spendRose) {
    recommendation = "La inversión subió pero el CTR cayó — vale la pena **revisar la estrategia** antes de seguir escalando el presupuesto.";
  }

  return {
    label: "CTR",
    current: m.linkClickCtr,
    previous: m.previous.linkClickCtr,
    variationPct: ctrVariationPct,
    sentiment,
    isSpike: false,
    text: recommendation ? `${discovery} ${recommendation}` : discovery,
  };
}


// Los puntos que alimentan el gráfico compartido vienen YA bucketizados por
// Meta a la granularidad pedida (time_increment=1/7/monthly, ver
// fetchMetaAdsTimeSeries en lib/meta-ads/reports.ts) — Meta calcula reach y
// frequency deduplicados dentro de cada bucket ahí mismo, así que nunca hay
// que sumar/promediar esos campos del lado del cliente (sumar reach diario
// para aproximar una semana o un mes da un número inflado, verificado contra
// la cuenta real: ~15% de error).
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

function formatBarLabelValue(value: number, format: MetaAdsMetricFormat): string {
  if (format === "decimal") return formatDecimal(value);
  if (format === "percentage") return formatPercent(value);
  return formatCompactNumber(value);
}

// Tick del eje Y en un <text> plano en vez del tick por defecto de Recharts
// (un componente <Text> que auto-parte el texto en varias líneas cuando no
// entra en el `width` del eje) — mismo criterio que Meta Ads > Costos.
function renderCompactMetricTick(
  props: { x?: string | number; y?: string | number; payload?: { value?: number } },
  format: MetaAdsMetricFormat
) {
  const { x, y, payload } = props;
  if (x === undefined || y === undefined || payload?.value === undefined) return <g />;
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
      {formatBarLabelValue(payload.value, format)}
    </text>
  );
}

// Label de la línea de referencia del promedio como un pill — mismo criterio
// que SEO > Visión General (SeoDashboard.tsx).
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
  impressions: number;
  frequency: number;
  linkClicks: number;
  linkClickCtr: number;
  cumulative: number;
}

// Línea de CTR en eje secundario (Prompt 72) — mismo color ya usado para
// CTR en otros gráficos de barra+línea del proyecto (ver SeoPageCountBlock).
const CTR_LINE_COLOR = "#0ea5e9"; // sky-500
// Rango FIJO 0-50% en pasos de 10% (Prompt 73) — el CTR de Meta Ads rara vez
// supera unos pocos puntos porcentuales, así que 0-100%/25% (criterio usado
// en SEO para otros ejes de CTR) dejaba la línea aplastada contra el piso.
const CTR_AXIS_DOMAIN: [number, number] = [0, 0.5];
const CTR_AXIS_TICKS = [0, 0.1, 0.2, 0.3, 0.4, 0.5];

// Color de la línea de Total Acumulado (Prompt 84) — distinto del azul de
// las barras y del celeste de CTR.
const TOTAL_LINE_COLOR = "#10b981"; // emerald-500

// Pill del valor final de la línea de Total Acumulado, mismo estilo que
// renderAveragePillLabel pero anclado al último punto de la línea (el
// acumulado no comparte escala visual con las barras individuales).
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

// Acceso directo a una de las 3 hojas nuevas de Meta Ads (Prompt 74) — solo
// nombre + valor + flecha, sin badge de variación (no es un scorecard
// completo, es solo navegación).
function MetaAdsShortcutCard({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40 hover:bg-accent"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-lg font-semibold text-foreground">{value}</span>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

// Rediseño de Meta Ads > Visión General (sigue el mismo estilo visual que
// SEO > Visión General, SeoDashboard.tsx): 4 scorecards clickeables (radio),
// cada una con su propio mini gráfico de tendencia sin tocar, insights de
// reglas entre las tarjetas y el gráfico, y un gráfico de barras COMPARTIDO
// nuevo con selector Día/Semana/Mes. No reemplaza a MetaAdsDashboard — la
// hoja de Costos sigue usando ese componente sin cambios.
export function MetaAdsOverviewDashboard({ clientId, breadcrumbSubtitle }: MetaAdsOverviewDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Primer segmento de la ruta actual (/{clientSlug}/dashboard/...) — para
  // armar los links de la franja de accesos directos (Prompt 74).
  const clientSlug = pathname.split("/")[1];

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [chartMetric, setChartMetric] = useState<OverviewMetricKey>("impressions");
  const [granularity, setGranularity] = useState<Granularity>(() => getDefaultGranularity(range));

  const [data, setData] = useState<MetaAdsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Serie del gráfico compartido, a la granularidad elegida en el selector
  // Día/Semana/Mes — pedida aparte del fetch principal de arriba (que sigue
  // yendo SIN granularity, exactamente como antes), para no alterar en nada
  // el fetch de current/previous que alimenta los valores/badges.
  const [chartSeries, setChartSeries] = useState<MetaAdsTimeSeriesPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(true);

  // Caché en memoria por granularidad (Prompt 73) — mismo criterio que
  // overviewCacheRef en SeoDashboard.tsx: el gráfico compartido de abajo Y
  // el selector Día/Semana/Mes propio de cada una de las 4 tarjetas
  // comparten este único caché, así no se duplica el fetch cuando coinciden
  // en la misma granularidad (el caso más común).
  const chartDatasetKeyRef = useRef<string>(`${clientId}|${range.from}|${range.to}`);
  const chartCacheRef = useRef<Map<string, Promise<MetaAdsOverviewResponse>>>(new Map());

  function getOrFetchChart(datasetKey: string, g: Granularity): Promise<MetaAdsOverviewResponse> {
    const cache = chartCacheRef.current;
    const cacheKey = `${datasetKey}|${g}`;
    let pending = cache.get(cacheKey);
    if (!pending) {
      pending = fetchMetaAdsOverview(clientId, range, { granularity: g });
      cache.set(cacheKey, pending);
      pending.catch(() => {
        if (cache.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    return pending;
  }

  // Wrapper estable de un solo argumento (granularidad) para pasarle a cada
  // MetaAdsOverviewScorecard — reusa el caché de arriba.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchChartSeries = useCallback(
    (g: Granularity) => getOrFetchChart(`${clientId}|${range.from}|${range.to}`, g).then((json) => json.timeSeries?.current ?? []),
    [clientId, range]
  );

  useEffect(() => {
    setGranularity(getDefaultGranularity(range));
  }, [range]);

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
    let cancelled = false;
    setLoading(true);
    setError(null);

    // includeAdCount siempre en true (Prompt 74): la franja de accesos
    // directos necesita "Anuncios" (cantidad de anuncios activos) sin
    // importar qué tarjeta esté seleccionada, no solo para el insight de CTR
    // como antes — así que se pide una sola vez acá junto con todo lo demás
    // en vez de en un efecto aparte.
    fetchMetaAdsOverview(clientId, range, { includeAdCount: true })
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
  }, [clientId, range, granularity]);

  const activeAdCount = data?.activeAdCount ?? null;
  const currencyCode = data?.metrics?.currencyCode ?? "USD";

  // Memoizado (Prompt 92): fetchTrend de cada tarjeta envuelve fetchChartSeries
  // (ya useCallback-estable), pero si el array de métricas se reconstruyera en
  // cada render, cada fetchTrend sería una función nueva y ScorecardCard
  // volvería a pedir el gráfico individual en cada render.
  const overviewMetrics: MetricScorecardConfig[] = useMemo(
    () =>
      data?.metrics
        ? METRIC_OPTIONS.map((def) => ({
            key: def.key,
            label: def.label,
            currentValue: data.metrics![def.key],
            previousValue: data.metrics!.previous[def.key],
            format: def.format,
            currencyCode,
            higherIsBetter: def.higherIsBetter,
            infoText: METRIC_DESCRIPTIONS[def.key],
            fetchTrend: (g: Granularity) =>
              fetchChartSeries(g).then((points) =>
                points.map((point) => ({ label: formatBucketLabel(point.date, g), value: point[def.key] as number }))
              ),
          }))
        : [],
    [data?.metrics, currencyCode, fetchChartSeries]
  );

  // Insight dinámico: UNO solo a la vez, según la tarjeta seleccionada — el
  // de CTR necesita activeAdCount, pedido aparte (ver efecto de arriba) y
  // por eso no se muestra hasta que esa segunda consulta también resuelva.
  const getSelectedMetricInsight = useCallback(
    (key: string): Insight | null => {
      if (!data?.metrics) return null;
      if (key === "impressions") return buildImpressionsInsight(data.metrics);
      if (key === "frequency") return buildFrequencyInsight(data.metrics);
      if (key === "linkClicks") return buildClicksInsight(data.metrics);
      if (key === "linkClickCtr") return activeAdCount !== null ? buildCtrInsight(data.metrics, activeAdCount) : null;
      return null;
    },
    [data?.metrics, activeAdCount]
  );

  let runningTotal = 0;
  const chartData: ChartPoint[] = chartSeries.map((point) => {
    runningTotal += point[chartMetric];
    return {
      label: formatBucketLabel(point.date, granularity),
      fullLabel: formatBucketFullLabel(point.date, granularity),
      impressions: point.impressions,
      frequency: point.frequency,
      linkClicks: point.linkClicks,
      linkClickCtr: point.linkClickCtr,
      cumulative: runningTotal,
    };
  });

  const activeMetric = METRIC_OPTIONS.find((option) => option.key === chartMetric)!;
  const averageValue = chartData.length > 0 ? chartData.reduce((sum, point) => sum + point[chartMetric], 0) / chartData.length : 0;
  const chartMaxValue = chartData.reduce((max, point) => Math.max(max, point[chartMetric]), 0);
  const totalValue = chartData[chartData.length - 1]?.cumulative ?? 0;
  // La línea de CTR en eje secundario se oculta cuando la métrica
  // seleccionada YA es CTR — ya está representada como las barras
  // principales, no hace falta duplicarla (Prompt 72).
  const showCtrLine = chartMetric !== "linkClickCtr";
  // El Total Acumulado (Prompt 84) solo tiene sentido para métricas
  // aditivas (Impresiones/Clicks) — Frecuencia y CTR son tasas/promedios,
  // sumarlas día a día no da un número interpretable (mismo criterio de
  // "nunca sumar/promediar una tasa" ya aplicado en el resto del proyecto).
  const showTotalLine = activeMetric.format === "number";

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
            metrics={overviewMetrics}
            selectedKey={chartMetric}
            onSelectedKeyChange={(key) => setChartMetric(key as OverviewMetricKey)}
            getInsight={getSelectedMetricInsight}
            sectionKey="ads"
            keyPrefix="meta-overview"
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
                  {/* Leyenda de la línea de CTR (Prompt 72) — solo cuando la
                      línea se muestra (la métrica seleccionada no es ya CTR). */}
                  {(showCtrLine || showTotalLine) && (
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                        {activeMetric.titleLabel}
                      </div>
                      {showCtrLine && (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CTR_LINE_COLOR }} />
                          CTR
                        </div>
                      )}
                      {showTotalLine && (
                        <div className="flex items-center gap-1.5">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: TOTAL_LINE_COLOR }} />
                          Total Acumulado
                        </div>
                      )}
                    </div>
                  )}
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: showTotalLine ? 56 : 24, right: showTotalLine ? 16 : 4, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 12 }}
                          className="fill-muted-foreground"
                          tickLine={false}
                          axisLine={false}
                          interval={0}
                        />
                        <YAxis
                          yAxisId="value"
                          tick={(props) => renderCompactMetricTick(props, activeMetric.format)}
                          width={40}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={activeMetric.format !== "number"}
                          ticks={activeMetric.format === "number" ? integerYAxisTicks(chartMaxValue) : undefined}
                        />
                        {showCtrLine && (
                          <YAxis
                            yAxisId="ctr"
                            orientation="right"
                            domain={CTR_AXIS_DOMAIN}
                            ticks={CTR_AXIS_TICKS}
                            tick={{ fontSize: 12 }}
                            className="fill-muted-foreground"
                            width={48}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value: number) => formatPercent(value)}
                          />
                        )}
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
                                  {point.fullLabel}: {formatMetricValue(point[chartMetric], activeMetric.format, currencyCode)}
                                </p>
                                {showCtrLine && <p className="text-muted-foreground">CTR: {formatPercent(point.linkClickCtr)}</p>}
                                {showTotalLine && (
                                  <p className="text-muted-foreground">
                                    Acumulado: {formatMetricValue(point.cumulative, activeMetric.format, currencyCode)}
                                  </p>
                                )}
                                <p className="text-muted-foreground">
                                  Promedio del período: {formatMetricValue(averageValue, activeMetric.format, currencyCode)}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Bar yAxisId="value" dataKey={chartMetric} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                          {granularity !== "day" && (
                            <LabelList
                              dataKey={chartMetric}
                              position="top"
                              formatter={(value: string | number | boolean | null | undefined) =>
                                formatBarLabelValue(Number(value ?? 0), activeMetric.format)
                              }
                              fontSize={11}
                            />
                          )}
                        </Bar>
                        {showCtrLine && (
                          <Line
                            yAxisId="ctr"
                            type="monotone"
                            dataKey="linkClickCtr"
                            stroke={CTR_LINE_COLOR}
                            strokeWidth={2}
                            dot={{ r: 3, fill: CTR_LINE_COLOR, strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                          />
                        )}
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
                              renderCumulativeTotalPillLabel(
                                props,
                                chartData.length,
                                `Total: ${formatBarLabelValue(totalValue, activeMetric.format)}`
                              )
                            }
                          />
                        )}
                        <ReferenceLine
                          yAxisId="value"
                          y={averageValue}
                          stroke="hsl(var(--muted-foreground))"
                          strokeDasharray="4 4"
                          strokeWidth={1.5}
                          label={(props) =>
                            renderAveragePillLabel(props, `Promedio: ${formatMetricValue(averageValue, activeMetric.format, currencyCode)}`)
                          }
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Franja de accesos directos a las hojas nuevas de Meta Ads
              (Prompts 74-76) — Costos ya es una hoja real; Conversiones,
              Anuncios y Audiencia son placeholder por ahora. Los 4 valores
              ya vienen en este mismo fetch (spend/conversions/activeAdCount/
              reach), sin pedir nada aparte. */}
          <h2 className="text-lg font-semibold text-foreground">Más Secciones</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaAdsShortcutCard
              href={`/${clientSlug}/dashboard/ads/meta-ads/costos`}
              label="Costos"
              value={formatCurrency(data.metrics.spend, data.metrics.currencyCode)}
            />
            <MetaAdsShortcutCard
              href={`/${clientSlug}/dashboard/ads/meta-ads/conversiones`}
              label="Conversiones"
              value={formatNumber(data.metrics.conversions)}
            />
            <MetaAdsShortcutCard
              href={`/${clientSlug}/dashboard/ads/meta-ads/anuncios`}
              label="Anuncios"
              value={activeAdCount !== null ? formatNumber(activeAdCount) : "—"}
            />
            <MetaAdsShortcutCard
              href={`/${clientSlug}/dashboard/ads/meta-ads/audiencia`}
              label="Audiencia"
              value={formatNumber(data.metrics.reach)}
            />
          </div>
        </>
      )}
    </div>
  );
}
