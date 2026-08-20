"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { addDays, differenceInCalendarDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowUp, ArrowUpDown, Info, Search, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCompactNumber, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks } from "@/lib/charts";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { SeoPageChurnResult, SeoPageChurnStats } from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoPageChurnResponse {
  connected: boolean;
  result: SeoPageChurnResult | null;
}

interface PageChurnCardProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
  defaultGranularity: Granularity;
  /** "new" = páginas que aparecieron (ventana actual); "lost" = páginas que desaparecieron (ventana anterior). */
  type: "new" | "lost";
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];
const WINDOW_OPTIONS = [7, 14, 30, 60, 90] as const;
const NEW_COLOR = "#059669"; // emerald-600, misma familia que text-emerald-600 usado en el resto del tablero
const LOST_COLOR = "hsl(var(--destructive))";
// Segmento "Impresiones" de la barra apilada, en ambas tarjetas — gris
// claro, bien distinto del verde de NEW_COLOR y del rojo de LOST_COLOR.
const IMPRESSIONS_COLOR = "#9ca3af"; // gray-400

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

// Misma clave de agrupamiento que keywordCountBucketKey (lib/gsc/reports.ts,
// no exportada — un componente "use client" no puede importar VALORES de ese
// módulo, solo tipos, porque carga googleapis) — día = fecha literal, semana
// = semana ISO, mes = "YYYY-MM".
function pageBucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const parsed = parseISO(date);
  return `${getISOWeekYear(parsed)}-W${String(getISOWeek(parsed)).padStart(2, "0")}`;
}

// Enumera TODOS los buckets de calendario que cubren `window` completa (uno
// por día/semana/mes), sin depender de result.trend — ver el comentario en
// chartData (más abajo) sobre por qué result.trend NO sirve para esto: le
// falta el primer bucket de la ventana.
function enumerateWindowBuckets(window: DateRangeValue, granularity: Granularity): { key: string; startDate: string; endDate: string }[] {
  const buckets = new Map<string, { key: string; startDate: string; endDate: string }>();
  let cursor = parseISO(window.from);
  const end = parseISO(window.to);
  while (cursor <= end) {
    const date = format(cursor, "yyyy-MM-dd");
    const key = pageBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { key, startDate: date, endDate: date };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    buckets.set(key, bucket);
    cursor = addDays(cursor, 1);
  }
  return [...buckets.values()].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
}

// Fondo de "mapa de calor" para una celda: la opacidad es proporcional al
// valor de la fila sobre el máximo de esa columna (cuanto más oscuro, más
// alto). `max <= 0` (columna vacía) deja la celda sin colorear.
function heatmapCellStyle(value: number, max: number, rgb: string, maxOpacity: number): CSSProperties {
  if (max <= 0) return {};
  const intensity = Math.min(value / max, 1);
  return { backgroundColor: `rgba(${rgb}, ${(intensity * maxOpacity).toFixed(2)})` };
}

// Número DENTRO del segmento apilado (no arriba/afuera) — solo para la
// barra apilada de "Páginas Nuevas". Si el segmento es petiso (poca altura
// renderizada), usa una fuente más chica para que el número siga entrando
// adentro en vez de salirse del segmento o superponerse con el de al lado.
function renderInsideBarLabel(
  props: {
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    value?: number | string | React.ReactNode;
  },
  formatValue: (value: number) => string,
  textColor: string
) {
  const x = Number(props.x);
  const y = Number(props.y);
  const width = Number(props.width);
  const height = Number(props.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const numericValue = Number(props.value);
  if (!Number.isFinite(numericValue)) return null;

  const fontSize = height < 16 ? 8 : 11;

  return (
    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="central" fontSize={fontSize} fontWeight={600} fill={textColor}>
      {formatValue(numericValue)}
    </text>
  );
}

interface ChartPoint {
  label: string;
  fullLabel: string;
  value: number;
  impressions: number;
  bucketKey: string;
}

// Fila de resumen fija al pie de la tabla: fondo gris MUY claro (más claro
// que --muted, que ya es 96% de luminosidad) pero sólido a propósito —
// sticky necesita opacidad completa o las filas de arriba se transparentan
// por debajo al scrollear. Borde superior un poco más oscuro que --border.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";
const SUMMARY_ROW_BORDER = "hsl(220 13% 70%)";

type SortColumn = "key" | "days" | "impressions" | "clicks" | "ctr";

const COLUMN_DESCRIPTIONS: Record<SortColumn, string> = {
  key: "URL de la página tal como la reportó Search Console.",
  impressions: "Cantidad de veces que la página apareció en los resultados de búsqueda, en el período correspondiente.",
  days: "Cantidad de días del período en los que esta página tuvo al menos una impresión, y qué porcentaje representa sobre el total de días del período seleccionado.",
  clicks: "Cantidad de clicks que recibió la página, en el período correspondiente.",
  ctr: "Click-through rate: clicks sobre impresiones, en el período correspondiente.",
};

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Página", align: "left", width: "w-[58%]" },
  { key: "days", label: "Días", align: "right", width: "w-[11%]" },
  { key: "impressions", label: "Impresiones", align: "right", width: "w-[13%]" },
  { key: "clicks", label: "Clicks", align: "right", width: "w-[9%]" },
  { key: "ctr", label: "CTR", align: "right", width: "w-[9%]" },
];

// Tabla con columnas ordenables por click en el header — mismo patrón que
// KeywordChurnTable (components/dashboard/seo/KeywordChurnCard.tsx), pero a
// nivel página: sin brand pill (no aplica acá) y con 5 columnas en vez de 3
// (se agregan Clicks y CTR).
function PageChurnTable({
  rows,
  totalDays,
  type,
}: {
  rows: SeoPageChurnStats[];
  totalDays: number;
  type: "new" | "lost";
}) {
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
    column: "impressions",
    direction: "desc",
  });

  // Filtro por URL: `filterDraft` es lo que se está tipeando, `activeFilter`
  // es lo que efectivamente se aplica — solo se sincronizan al hacer click
  // en la lupa o apretar Enter, no en cada tecla.
  const [filterDraft, setFilterDraft] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  function applyFilter() {
    setActiveFilter(filterDraft.trim());
  }

  function clearFilter() {
    setFilterDraft("");
    setActiveFilter("");
  }

  const filteredRows = useMemo(() => {
    if (!activeFilter) return rows;
    const needle = activeFilter.toLowerCase();
    return rows.filter((row) => row.key.toLowerCase().includes(needle));
  }, [rows, activeFilter]);

  // Para el "mapa de calor" de las columnas Impresiones, Días y Clicks: la
  // transparencia de cada celda es relativa al máximo DENTRO del resultado
  // filtrado, no de la tabla completa ni a un umbral fijo.
  const maxImpressions = useMemo(() => filteredRows.reduce((max, row) => Math.max(max, row.impressions), 0), [filteredRows]);
  const maxDays = useMemo(() => filteredRows.reduce((max, row) => Math.max(max, row.days), 0), [filteredRows]);
  const maxClicks = useMemo(() => filteredRows.reduce((max, row) => Math.max(max, row.clicks), 0), [filteredRows]);

  // Fila de resumen del pie — sobre el resultado filtrado (todas sus filas,
  // no solo las visibles sin scrollear). Días es un promedio simple (no
  // ponderado); Impresiones y Clicks son sumas directas; CTR se recalcula a
  // partir de esos totales (nunca promediando porcentajes por fila).
  const summary = useMemo(() => {
    const impressions = filteredRows.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = filteredRows.reduce((sum, row) => sum + row.clicks, 0);
    const days = filteredRows.length > 0 ? filteredRows.reduce((sum, row) => sum + row.days, 0) / filteredRows.length : 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    return { impressions, clicks, days, ctr };
  }, [filteredRows]);

  const sortedRows = useMemo(() => {
    const copy = [...filteredRows];
    copy.sort((a, b) => {
      if (sort.column === "key") {
        return sort.direction === "asc" ? a.key.localeCompare(b.key) : b.key.localeCompare(a.key);
      }
      const diff = a[sort.column] - b[sort.column];
      return sort.direction === "asc" ? diff : -diff;
    });
    return copy;
  }, [filteredRows, sort]);

  function toggleSort(column: SortColumn) {
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === "asc" ? "desc" : "asc" } : { column, direction: "desc" }));
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin páginas para este período.</p>;
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
                <div className={cn("flex items-center gap-2", column.key === "key" ? "justify-between" : column.align === "right" && "justify-end")}>
                  <span
                    onClick={() => toggleSort(column.key)}
                    className="group relative inline-flex shrink-0 select-none cursor-pointer items-center gap-1"
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
                  {column.key === "key" && (
                    // A la misma altura que el label "Página" — mismo <div>
                    // flex que lo contiene. Ocupa el 70% del ancho de la
                    // columna Página, el input crece dentro de ese espacio.
                    // `stopPropagation` para que tipear/clickear acá no
                    // dispare el toggleSort del header.
                    <div className="flex w-[70%] min-w-0 items-center gap-1 normal-case" onClick={(event) => event.stopPropagation()}>
                      <input
                        type="text"
                        value={filterDraft}
                        onChange={(event) => setFilterDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") applyFilter();
                        }}
                        placeholder="Buscar página…"
                        className="h-5 w-full min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-[10px] font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <button
                        type="button"
                        onClick={applyFilter}
                        title="Buscar página"
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Search className="h-3 w-3" />
                      </button>
                      {activeFilter && (
                        <button
                          type="button"
                          onClick={clearFilter}
                          title="Limpiar filtro"
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="py-6 text-center text-sm text-muted-foreground">
                Ninguna página coincide con &quot;{activeFilter}&quot;.
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr key={row.key} className="border-b border-border last:border-0">
                <td className="break-words py-2 pl-2 pr-2 align-top text-foreground">{row.key}</td>
                <td
                  className="py-2 pr-2 text-right align-top text-foreground"
                  style={heatmapCellStyle(row.days, maxDays, "115, 115, 115", 0.45)}
                  title={`Días en los que "${row.key}" tuvo impresiones`}
                >
                  {formatNumber(row.days)} ({totalDays > 0 ? Math.round((row.days / totalDays) * 100) : 0}%)
                </td>
                <td
                  className="py-2 pr-2 text-right align-top text-foreground"
                  style={heatmapCellStyle(row.impressions, maxImpressions, type === "lost" ? "239, 68, 68" : "34, 197, 94", 0.55)}
                >
                  {formatNumber(row.impressions)}
                </td>
                <td
                  className="py-2 pr-2 text-right align-top text-foreground"
                  style={heatmapCellStyle(row.clicks, maxClicks, type === "lost" ? "239, 68, 68" : "34, 197, 94", 0.4)}
                >
                  {formatNumber(row.clicks)}
                </td>
                <td className="py-2 pr-2 text-right align-top text-foreground">{formatPercent(row.ctr)}</td>
              </tr>
            ))
          )}
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
              {formatDecimal(summary.days)}
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
              {formatNumber(summary.clicks)}
            </td>
            <td
              className="sticky bottom-0 z-10 h-9 py-2 pr-2 text-right align-top"
              style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
            >
              {formatPercent(summary.ctr)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// Tarjeta "Páginas Nuevas" / "Páginas Perdidas" (SEO > Páginas > Resumen) —
// mismo patrón visual que KeywordChurnCard, pero a nivel página: sin brand
// pill, sin insight por LLM (no pedido para esta hoja), tabla de 5 columnas
// en vez de 3, y con SU PROPIO selector de ventana (7/14/30/60/90 días) que
// ancla en `range.to` (el "hasta" del rango global), no en "hoy" — a
// diferencia de Keywords, donde la ventana está atada 1:1 al rango global sin
// selector propio.
export function PageChurnCard({ clientId, range, segment, defaultGranularity, type }: PageChurnCardProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [windowDays, setWindowDays] = useState<number>(30);
  const [data, setData] = useState<SeoPageChurnResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Drill-down: click en una barra del gráfico de tendencia filtra la tabla
  // a esa fecha puntual (ver churnDrilldown.ts).
  const [selectedBucketKey, setSelectedBucketKey] = useState<string | null>(null);

  useEffect(() => {
    setGranularity(defaultGranularity);
  }, [range, defaultGranularity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      to: range.to,
      windowDays: String(windowDays),
      granularity,
      segment,
    });
    fetch(`/api/dashboard/${clientId}/seo/pages/churn?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar la rotación de páginas.");
        }
        return (await response.json()) as SeoPageChurnResponse;
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
  }, [clientId, range, segment, windowDays, granularity]);

  const result = data?.result ?? null;
  const total = result ? (type === "new" ? result.totalNew : result.totalLost) : 0;
  const color = type === "new" ? NEW_COLOR : LOST_COLOR;
  const title = type === "new" ? "Páginas Nuevas" : "Páginas Perdidas";
  const tableRows = result ? (type === "new" ? result.newPages : result.lostPages) : [];
  const netPositive = (result?.net ?? 0) >= 0;

  // Gráfico de barras apiladas (Prompts 53-58), ahora unificado entre
  // "Páginas Nuevas" y "Páginas Perdidas" — el mismo cálculo, parametrizado
  // por `activeWindow` (ventana ACTUAL para nuevas, ANTERIOR para perdidas,
  // ya coincide con lo que se usa para el drill-down más abajo) y por qué
  // extremo de `dailyImpressions` marca el bucket de cada página (PRIMERA
  // impresión = fecha de "debut" para nuevas; ÚLTIMA impresión = fecha de
  // "despedida" antes de desaparecer, para perdidas — dailyImpressions ya
  // viene ordenado ascendente por fecha en ambos casos).
  //
  // Ya NO se usa result.trend para saber qué buckets de fecha existen —
  // result.trend (Prompt 38, lib/gsc/reports.ts) arranca en el índice 1 de
  // sus buckets ordenados (necesita un bucket ANTERIOR dentro de la ventana
  // para poder calcular su diferencia adyacente gainedCount/lostCount), así
  // que el PRIMER bucket de la ventana queda directamente afuera. Cualquier
  // página que debutó/desapareció en ese primer bucket (ej. el primer día si
  // la agregación es "Día") terminaba contada en la tabla y en el scorecard,
  // pero en NINGÚN bucket del gráfico — la suma de barras daba menos que el
  // Total de la tabla (Prompt 57, ya corregido para "nuevas"; Prompt 58
  // extiende la misma corrección a "perdidas"). Acá se recalculan los
  // buckets de fecha del lado del cliente con enumerateWindowBuckets,
  // cubriendo la ventana activa COMPLETA — así ninguna página queda afuera
  // de ningún bucket. El segmento de impresiones suma, para esas mismas
  // páginas agrupadas por su bucket, `page.impressions` — el TOTAL de
  // impresiones de la página en TODA la ventana activa (el mismo campo que
  // usa la columna Impresiones y la fila Total de la tabla) — así la suma de
  // todas las barras coincide siempre con el Total de la tabla. Los buckets
  // sin ninguna página se excluyen del todo (no se muestran como barra en 0).
  const activeWindow = result ? (type === "new" ? result.currentWindow : result.previousWindow) : null;
  const entityWindowBuckets = activeWindow ? enumerateWindowBuckets(activeWindow, granularity) : [];

  // Bucket de cada página: PRIMERA impresión (nuevas) o ÚLTIMA impresión
  // (perdidas) dentro de la ventana activa — dailyImpressions ya viene
  // ordenado ascendente en ambos casos. Se factoriza en una sola función
  // para que el conteo del gráfico (chartData, abajo) y el filtro del
  // drill-down (filteredTableRows) usen EXACTAMENTE el mismo criterio.
  function boundaryPointOf(page: SeoPageChurnStats) {
    return type === "new" ? page.dailyImpressions[0] : page.dailyImpressions[page.dailyImpressions.length - 1];
  }

  const selectedBucket = entityWindowBuckets.find((bucket) => bucket.key === selectedBucketKey) ?? null;
  // El drill-down (Prompt 59) YA NO usa resolveActiveDateRange/
  // filterEntitiesByDateRange (components/dashboard/seo/churnDrilldown.ts,
  // compartido con KeywordChurnCard). Esas funciones asumen que el gráfico
  // de tendencia SIEMPRE bucketiza currentWindow (así construye su trend
  // fetchKeywordChurn, y así lo hacía fetchPageChurn hasta el Prompt 53) y
  // remapean la posición relativa de un bucket "Perdidas" desde currentWindow
  // hacia previousWindow — pero desde el Prompt 58, entityWindowBuckets ya
  // enumera directamente la ventana activa correcta (previousWindow para
  // "Perdidas"), así que ese remapeo quedó doblemente aplicado y corría la
  // fecha fuera de rango: por eso el click en una barra de "Páginas
  // Perdidas" no encontraba ninguna página. Acá el bucket seleccionado ya
  // está en la ventana correcta, así que el rango activo es directamente sus
  // fechas — y el filtro usa el mismo `boundaryPointOf` que agrupa las
  // barras (no "alguna actividad dentro del rango", que podía traer páginas
  // de OTROS buckets), así la tabla muestra siempre exactamente las páginas
  // que esa barra representa. KeywordChurnCard sigue usando
  // churnDrilldown.ts sin cambios (no pedido, y ahí sigue siendo correcto).
  const filteredTableRows = selectedBucket
    ? tableRows.filter((page) => {
        const boundaryPoint = boundaryPointOf(page);
        return !!boundaryPoint && boundaryPoint.date >= selectedBucket.startDate && boundaryPoint.date <= selectedBucket.endDate;
      })
    : tableRows;

  const chartData: ChartPoint[] = entityWindowBuckets
    .map((bucket) => {
      let value = 0;
      let impressions = 0;
      for (const page of tableRows) {
        const boundaryPoint = boundaryPointOf(page);
        if (boundaryPoint && boundaryPoint.date >= bucket.startDate && boundaryPoint.date <= bucket.endDate) {
          value += 1;
          impressions += page.impressions;
        }
      }
      return {
        label: formatBucketLabel(bucket, granularity),
        fullLabel: formatBucketFullLabel(bucket, granularity),
        value,
        impressions,
        bucketKey: bucket.key,
      };
    })
    .filter((point) => point.value > 0);
  // Barra apilada (value + impressions) — el eje tiene que cubrir el total
  // de la pila, no solo el segmento de páginas.
  const chartMaxValue = chartData.reduce((max, point) => Math.max(max, point.value + point.impressions), 0);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <Card className="w-full min-w-0">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className={cn("text-2xl font-semibold", type === "new" ? "text-emerald-600" : "text-destructive")}>
              {result ? formatNumber(total) : "—"}
            </span>
            {result && (
              <Badge
                variant="outline"
                className={cn("gap-1", netPositive ? "border-emerald-200 text-emerald-600" : "border-destructive/30 text-destructive")}
              >
                {netPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                Rotación: {formatNumber(result.churn)} · Neto: {result.net >= 0 ? "+" : ""}
                {formatNumber(result.net)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Ventana, después el período de comparativa, después la
              agregación — en ese orden, apiladas verticalmente, justo
              arriba del gráfico. */}
          <div className="flex flex-col gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Ventana:</span>
              {WINDOW_OPTIONS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  size="sm"
                  variant={windowDays === days ? "default" : "ghost"}
                  className="h-7 px-2 text-xs"
                  onClick={() => setWindowDays(days)}
                >
                  {days}d
                </Button>
              ))}
            </div>
            <div className="min-h-5">
              {!loading &&
                result &&
                (type === "new" ? (
                  <p className="text-sm text-foreground">
                    <strong className="font-bold">Período seleccionado:</strong> {formatWindowDate(result.currentWindow.from)} a{" "}
                    {formatWindowDate(result.currentWindow.to)} (<strong className="font-bold">{windowDayCount(result.currentWindow)} días</strong>)
                  </p>
                ) : (
                  <p className="text-sm text-foreground">
                    {/* Ventana donde la página SÍ estaba (la anterior) — la
                        ventana "ahora no está" es la ventana actual ya visible
                        arriba, no hace falta repetirlo acá. */}
                    <strong className="font-bold">Período de comparativa:</strong> {formatWindowDate(result.previousWindow.from)} a{" "}
                    {formatWindowDate(result.previousWindow.to)} (<strong className="font-bold">{windowDayCount(result.previousWindow)} días</strong>)
                  </p>
                ))}
            </div>
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
          <div className="flex flex-col gap-2">
            {/* Leyenda — barra apilada de 2 segmentos en ambas tarjetas
                (cantidad de páginas del bucket + impresiones de esas páginas
                en ese mismo bucket, reutilizando dailyImpressions por página
                del Prompt 50). */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                {type === "new" ? "Páginas nuevas" : "Páginas perdidas"}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: IMPRESSIONS_COLOR }} />
                Impresiones
              </div>
            </div>
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
                          <p className="font-medium text-foreground">{point.fullLabel}</p>
                          <p className="text-muted-foreground">
                            {type === "new" ? "Páginas nuevas" : "Páginas perdidas"}: {formatNumber(point.value)}
                          </p>
                          <p className="text-muted-foreground">Impresiones: {formatNumber(point.impressions)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="value"
                    stackId="pages"
                    radius={[0, 0, 0, 0]}
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
                    <LabelList dataKey="value" content={(props) => renderInsideBarLabel(props, formatCompactNumber, "#ffffff")} />
                  </Bar>
                  <Bar
                    dataKey="impressions"
                    stackId="pages"
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
                        fill={IMPRESSIONS_COLOR}
                        fillOpacity={selectedBucketKey && selectedBucketKey !== point.bucketKey ? 0.35 : 1}
                        stroke={selectedBucketKey === point.bucketKey ? "hsl(var(--foreground))" : "none"}
                        strokeWidth={selectedBucketKey === point.bucketKey ? 2 : 0}
                      />
                    ))}
                    <LabelList
                      dataKey="impressions"
                      content={(props) => renderInsideBarLabel(props, formatCompactNumber, "hsl(var(--foreground))")}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {!loading && result && (
          <PageChurnTable rows={filteredTableRows} totalDays={windowDayCount(result.currentWindow)} type={type} />
        )}
      </CardContent>
      </Card>
    </div>
  );
}
