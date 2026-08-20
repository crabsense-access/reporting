"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpDown, Info, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCard } from "@/components/dashboard/InsightsList";
import { BrandKeywordPill } from "@/components/dashboard/seo/BrandKeywordPill";
import { EntityDailyLineChart } from "@/components/dashboard/seo/EntityDailyLineChart";
import { filterEntitiesByDateRange, resolveActiveDateRange } from "@/components/dashboard/seo/churnDrilldown";
import { formatCompactNumber, formatDecimal, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks } from "@/lib/charts";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { CachedInsight } from "@/lib/insights/insight-cache";
import type { SeoKeywordChurnQueryStats, SeoKeywordChurnResult, SeoKeywordChurnTrendBucket } from "@/lib/gsc/reports";

interface SeoKeywordChurnResponse {
  connected: boolean;
  brandRegex: string | null;
  result: SeoKeywordChurnResult | null;
}

interface KeywordChurnCardProps {
  clientId: string;
  range: DateRangeValue;
  defaultGranularity: Granularity;
  /** "new" = keywords que aparecieron (ventana actual); "lost" = keywords que desaparecieron (ventana anterior). */
  type: "new" | "lost";
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];
const NEW_COLOR = "#059669"; // emerald-600, misma familia que text-emerald-600 usado en el resto del tablero
const LOST_COLOR = "hsl(var(--destructive))";

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

// Formato de fecha argentino (dd-M-aaaa) para las ventanas actual/anterior.
function formatWindowDate(iso: string): string {
  return format(parseISO(iso), "dd-M-yyyy");
}

function windowDayCount(window: DateRangeValue): number {
  return differenceInCalendarDays(parseISO(window.to), parseISO(window.from)) + 1;
}

// Fondo de "mapa de calor" para una celda: la opacidad es proporcional al
// valor de la fila sobre el máximo de esa columna (cuanto más oscuro, más
// alto). `max <= 0` (columna vacía) deja la celda sin colorear.
function heatmapCellStyle(value: number, max: number, rgb: string, maxOpacity: number): CSSProperties {
  if (max <= 0) return {};
  const intensity = Math.min(value / max, 1);
  return { backgroundColor: `rgba(${rgb}, ${(intensity * maxOpacity).toFixed(2)})` };
}

interface ChartPoint {
  label: string;
  fullLabel: string;
  value: number;
  bucketKey: string;
}

// Fila de resumen fija al pie de la tabla: fondo gris MUY claro (más claro
// que --muted, que ya es 96% de luminosidad) pero sólido a propósito —
// sticky necesita opacidad completa o las filas de arriba se transparentan
// por debajo al scrollear. Borde superior un poco más oscuro que --border.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";
const SUMMARY_ROW_BORDER = "hsl(220 13% 70%)";

type SortColumn = "key" | "days" | "impressions";

const COLUMN_DESCRIPTIONS: Record<SortColumn, string> = {
  key: "Consulta de búsqueda (keyword) tal como la reportó Search Console.",
  impressions: "Cantidad de veces que el sitio apareció en los resultados de búsqueda para esta keyword, en el período correspondiente.",
  days: "Cantidad de días del período en los que esta keyword tuvo al menos una impresión, y qué porcentaje representa sobre el total de días del período seleccionado.",
};

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Keyword", align: "left", width: "w-[70%]" },
  { key: "impressions", label: "Impresiones", align: "right", width: "w-[15%]" },
  { key: "days", label: "Días c/imp", align: "right", width: "w-[15%]" },
];

// Tabla con columnas ordenables por click en el header y resaltado de brand
// keywords (regex ya configurada en la conexión de Search Console del
// cliente, ver Keywords > Resumen) — separada de KeywordsTable porque esa
// no tiene ninguna de las dos cosas todavía.
function KeywordChurnTable({
  rows,
  brandRegex,
  totalDays,
  type,
  onHoverRow,
}: {
  rows: SeoKeywordChurnQueryStats[];
  brandRegex: string | null;
  totalDays: number;
  type: "new" | "lost";
  /** Hover de una fila resalta su línea en el gráfico de líneas de abajo (ver EntityDailyLineChart). */
  onHoverRow: (key: string | null) => void;
}) {
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
    column: "impressions",
    direction: "desc",
  });

  const brandPattern = useMemo(() => {
    if (!brandRegex) return null;
    try {
      return new RegExp(brandRegex, "i");
    } catch {
      return null;
    }
  }, [brandRegex]);

  // Para el "mapa de calor" de las columnas Impresiones (verde) y Días c/imp
  // (gris): la transparencia de cada celda es relativa al máximo DENTRO de
  // esta misma tabla, no a un umbral fijo.
  const maxImpressions = useMemo(() => rows.reduce((max, row) => Math.max(max, row.impressions), 0), [rows]);
  const maxDays = useMemo(() => rows.reduce((max, row) => Math.max(max, row.days), 0), [rows]);

  // Fila de resumen del pie — sobre TODAS las keywords de la tabla, no solo
  // las visibles sin scrollear. Días es un promedio simple (no ponderado);
  // Impresiones es una suma directa.
  const summary = useMemo(() => {
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const days = rows.length > 0 ? rows.reduce((sum, row) => sum + row.days, 0) / rows.length : 0;
    return { impressions, days };
  }, [rows]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      if (sort.column === "key") {
        return sort.direction === "asc" ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
      }
      const diff = a[sort.column] - b[sort.column];
      return sort.direction === "asc" ? diff : -diff;
    });
    return copy;
  }, [rows, sort]);

  function toggleSort(column: SortColumn) {
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === "asc" ? "desc" : "asc" } : { column, direction: "desc" }));
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin keywords para este período.</p>;
  }

  return (
    // Alto calculado para mostrar exactamente 10 filas de datos: header (36px,
    // fijo) + 10 filas (~34px c/u) + fila de Total (36px, fijo). Header y
    // Total quedan `sticky` dentro de este mismo contenedor con scroll, así
    // ambos permanecen visibles siempre, con el mismo borde grueso entre sí
    // (grosor y color) — abajo del header, arriba del Total.
    <div className="max-h-[412px] overflow-y-auto">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground">
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "sticky top-0 z-10 h-9 py-2 pr-2",
                  column.key === "key" && "pl-2",
                  column.width,
                  column.align === "right" ? "text-right" : "text-left"
                )}
                style={{ backgroundColor: "hsl(var(--card))", boxShadow: `inset 0 -2px 0 0 ${SUMMARY_ROW_BORDER}` }}
              >
                <span
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    "group relative inline-flex select-none cursor-pointer items-center gap-1",
                    column.align === "right" && "justify-end"
                  )}
                >
                  <span className="inline-flex items-center gap-0.5 truncate">
                    {column.label}
                    <Info className="h-3 w-3 shrink-0 text-muted-foreground/70" />
                  </span>
                  <ArrowUpDown className={cn("h-3 w-3 shrink-0", sort.column === column.key ? "opacity-100" : "opacity-30")} />
                  {/* Mismo estilo que el tooltip del gráfico de barras (recharts
                      <Tooltip> de abajo) — rounded-lg border bg-card shadow-sm. */}
                  <span
                    className={cn(
                      "pointer-events-none absolute top-full z-10 mt-1 hidden w-48 whitespace-normal rounded-lg border border-border bg-card px-3 py-2 text-left text-xs font-normal normal-case text-foreground shadow-sm group-hover:block",
                      column.align === "right" ? "right-0" : "left-0"
                    )}
                  >
                    {COLUMN_DESCRIPTIONS[column.key]}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => {
            const isBrand = brandPattern?.test(row.key) ?? false;
            return (
              <tr
                key={row.key}
                className="border-b border-border last:border-0"
                onMouseEnter={() => onHoverRow(row.key)}
                onMouseLeave={() => onHoverRow(null)}
              >
                <td className="break-words py-2 pl-2 pr-2 align-top text-foreground">
                  {row.key}
                  {isBrand && (
                    <>
                      {" "}
                      <BrandKeywordPill />
                    </>
                  )}
                </td>
                <td
                  className="py-2 pr-2 text-right align-top text-foreground"
                  style={heatmapCellStyle(
                    row.impressions,
                    maxImpressions,
                    type === "lost" ? "239, 68, 68" : "34, 197, 94",
                    0.55
                  )}
                >
                  {formatNumber(row.impressions)}
                </td>
                <td
                  className="py-2 pr-2 text-right align-top text-foreground"
                  style={heatmapCellStyle(row.days, maxDays, "115, 115, 115", 0.45)}
                  title={`Días en los que "${row.key}" tuvo impresiones`}
                >
                  {formatNumber(row.days)} ({totalDays > 0 ? Math.round((row.days / totalDays) * 100) : 0}%)
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          {/* `sticky` + el borde van en cada <td> (no en el <tr>) — es el
              patrón robusto para que el borde se mueva pegado con la fila
              en vez de quedar "atrás" al scrollear. */}
          <tr className="font-semibold text-foreground">
            <td
              className="sticky bottom-0 z-10 h-9 break-words py-2 pl-2 pr-2 align-top"
              style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
            >
              Total
            </td>
            <td
              className="sticky bottom-0 z-10 h-9 py-2 pr-2 text-right align-top"
              style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
            >
              {formatNumber(summary.impressions)}
            </td>
            <td
              className="sticky bottom-0 z-10 h-9 py-2 pr-2 text-right align-top"
              style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
            >
              {formatDecimal(summary.days)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Tarjeta "Keywords Nuevas" / "Keywords Perdidas" (SEO > Visión General v2,
// debajo de Cantidad de Keywords) — parametrizable por `type` para no
// duplicar código entre las dos. La ventana de clasificación es el mismo
// rango global seleccionado arriba del tablero (no una ventana propia); solo
// el selector de agregación Día/Semana/Mes del gráfico de tendencia es
// propio de cada tarjeta (mismo patrón que GoalCard).
export function KeywordChurnCard({ clientId, range, defaultGranularity, type }: KeywordChurnCardProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [data, setData] = useState<SeoKeywordChurnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [llmInsight, setLlmInsight] = useState<CachedInsight | null>(null);
  const [llmInsightLoading, setLlmInsightLoading] = useState(true);
  const [insightVisible, setInsightVisible] = useState(true);
  // Drill-down: click en una barra del gráfico de tendencia filtra la tabla
  // y el gráfico de líneas a esa fecha puntual (ver churnDrilldown.ts);
  // hover en una fila de la tabla resalta su línea (ver EntityDailyLineChart).
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  useEffect(() => {
    setGranularity(defaultGranularity);
  }, [range, defaultGranularity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      granularity,
    });
    fetch(`/api/dashboard/${clientId}/seo/keyword-churn?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar la rotación de keywords.");
        }
        return (await response.json()) as SeoKeywordChurnResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setSelectedBucketKey(null);
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
  }, [clientId, range, granularity]);

  // Insight por LLM sobre el contenido de la lista de keywords nuevas/
  // perdidas (ver keyword-churn-llm-insight.ts) — se pide aparte de los
  // datos de la tarjeta porque tiene su propio caché de 24hs (independiente
  // de la granularidad, que solo afecta al gráfico de tendencia). El botón
  // de refresco fuerza saltear ese caché (ej. después de un cambio de
  // prompt, para no esperar hasta que expire solo).
  function loadInsight(force: boolean): () => void {
    let cancelled = false;
    setLlmInsightLoading(true);

    const params = new URLSearchParams({ from: range.from, to: range.to, type });
    if (force) params.set("force", "1");
    fetch(`/api/dashboard/${clientId}/seo/keyword-churn/insight?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as CachedInsight;
      })
      .then((json) => {
        if (!cancelled) setLlmInsight(json);
      })
      .catch(() => {
        // Best effort: si falla, la tarjeta sigue funcionando sin insight de texto.
      })
      .finally(() => {
        if (!cancelled) setLlmInsightLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return loadInsight(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range, type]);

  const result = data?.result ?? null;
  const total = result ? (type === "new" ? result.totalNew : result.totalLost) : 0;
  const color = type === "new" ? NEW_COLOR : LOST_COLOR;
  const title = type === "new" ? "Keywords Nuevas" : "Keywords Perdidas";
  const tableRows = result ? (type === "new" ? result.newKeywords : result.lostKeywords) : [];

  const chartData: ChartPoint[] = (result?.trend ?? []).map((bucket: SeoKeywordChurnTrendBucket) => ({
    label: formatBucketLabel(bucket, granularity),
    fullLabel: formatBucketFullLabel(bucket, granularity),
    value: type === "new" ? bucket.gainedCount : bucket.lostCount,
    bucketKey: bucket.key,
  }));
  const chartMaxValue = chartData.reduce((max, point) => Math.max(max, point.value), 0);

  const selectedBucket = result?.trend.find((bucket) => bucket.key === selectedBucketKey) ?? null;
  const activeWindow = result ? (type === "new" ? result.currentWindow : result.previousWindow) : null;
  const activeRange = result && activeWindow ? resolveActiveDateRange(type, result.currentWindow, result.previousWindow, selectedBucket) : null;
  const filteredTableRows = activeRange && activeWindow ? filterEntitiesByDateRange(tableRows, activeRange, activeWindow) : tableRows;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <Card className="w-full min-w-0">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="flex flex-col gap-1">
          <span className={cn("text-2xl font-semibold", type === "new" ? "text-emerald-600" : "text-destructive")}>
            {result ? formatNumber(total) : "—"}
          </span>
          {/* Altura fija (no min-height) para que el gráfico de barras de
              abajo arranque siempre a la misma altura en las dos tarjetas
              (Nuevas/Perdidas), sin importar si el insight está oculto, si
              todavía está cargando, o si un texto es más largo que el otro —
              el sobrante scrollea en vez de estirar la tarjeta. */}
          <div className="flex h-44 flex-col gap-1">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-fit gap-1.5 px-2 text-xs"
                onClick={() => setInsightVisible((v) => !v)}
              >
                <Sparkles className="h-3 w-3" />
                {insightVisible ? "Ocultar insight" : "Mostrar insight"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                title="Regenerar insight"
                disabled={llmInsightLoading}
                onClick={() => loadInsight(true)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", llmInsightLoading && "animate-spin")} />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {insightVisible &&
                (llmInsightLoading ? (
                  <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    Analizando las keywords…
                  </div>
                ) : (
                  llmInsight && (
                    <InsightCard
                      insight={{
                        label: title,
                        current: 0,
                        previous: 0,
                        variationPct: 0,
                        // Color fijo por tipo de tarjeta (verde/rojo, igual que
                        // el número de arriba) en vez del sentiment que arma el
                        // LLM — "Nuevas" siempre es una buena noticia y
                        // "Perdidas" siempre una mala, sin importar de qué
                        // hablen las keywords puntuales del texto.
                        sentiment: type === "new" ? "positive" : "negative",
                        isSpike: false,
                        text: llmInsight.text,
                      }}
                      onDismiss={() => setInsightVisible(false)}
                    />
                  )
                ))}
            </div>
            {/* Línea fina que no se mueve con el scroll — da la sensación de
                que el insight continúa más allá del recorte de altura fija. */}
            <div className="h-px shrink-0 bg-border" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-3">
        {/* Período de comparativa, después la agregación — en ese orden,
            justo arriba del gráfico. */}
        {!loading &&
          result &&
          (type === "new" ? (
            <p className="text-sm text-foreground">
              <strong className="font-bold">Período seleccionado:</strong> {formatWindowDate(result.currentWindow.from)} a{" "}
              {formatWindowDate(result.currentWindow.to)} (<strong className="font-bold">{windowDayCount(result.currentWindow)} días</strong>)
            </p>
          ) : (
            <p className="text-sm text-foreground">
              {/* Ventana donde la keyword SÍ estaba (la anterior) — la
                  ventana "ahora no está" es el rango global ya visible
                  arriba del tablero, no hace falta repetirlo acá. */}
              <strong className="font-bold">Período de comparativa:</strong> {formatWindowDate(result.previousWindow.from)} a{" "}
              {formatWindowDate(result.previousWindow.to)} (<strong className="font-bold">{windowDayCount(result.previousWindow)} días</strong>)
            </p>
          ))}
        <div className="flex justify-end gap-1">
          {AGGREGATION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={granularity === option.value ? "default" : "ghost"}
              onClick={() => setGranularity(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !result ? (
          <Skeleton className="h-48 w-full" />
        ) : chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
        ) : (
          <div className="h-48 w-full [&_*]:[outline:none]">
            {/* Recharts 3 activa por default una "accessibility layer" que le
                pone tabIndex a las barras/al SVG — al clickear, el navegador
                dibuja su anillo de foco default (el recuadro azul) sobre lo
                que haya quedado enfocado. [&_*]:[outline:none] (outline
                literal, no la utilidad outline-none de Tailwind, que en v3
                deja un outline transparente en vez de sacarlo del todo) lo
                saca de raíz en TODOS los descendientes de este contenedor —
                acotado acá, no afecta el foco de ningún otro elemento de la
                página. El highlight puntual de la barra seleccionada
                (borde + opacidad vía <Cell>) es aparte y se mantiene. */}
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
                  allowDecimals={false}
                  ticks={integerYAxisTicks(chartMaxValue)}
                  tickFormatter={(value: number) => formatCompactNumber(value)}
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
                          {point.fullLabel}: {formatNumber(point.value)} {type === "new" ? "ganadas" : "perdidas"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="value"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry: unknown) => {
                    const point = (entry as { payload?: ChartPoint })?.payload;
                    if (!point) return;
                    setSelectedBucketKey((prev) => (prev === point.bucketKey ? null : point.bucketKey));
                  }}
                >
                  {chartData.map((point) => (
                    <Cell
                      key={point.bucketKey}
                      fill={color}
                      fillOpacity={selectedBucketKey && selectedBucketKey !== point.bucketKey ? 0.35 : 1}
                      stroke={selectedBucketKey === point.bucketKey ? "hsl(var(--foreground))" : "none"}
                      strokeWidth={selectedBucketKey === point.bucketKey ? 2 : 0}
                    />
                  ))}
                  <LabelList dataKey="value" position="top" formatter={(value: string | number | boolean | null | undefined) => formatCompactNumber(Number(value ?? 0))} fontSize={11} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && result && (
          <div className="flex flex-col gap-2">
            <KeywordChurnTable
              rows={filteredTableRows}
              brandRegex={data?.brandRegex ?? null}
              totalDays={windowDayCount(result.currentWindow)}
              type={type}
              onHoverRow={setHoveredKey}
            />
            {activeRange && (
              <EntityDailyLineChart entities={filteredTableRows} range={activeRange} accentColor={color} hoveredKey={hoveredKey} />
            )}
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
