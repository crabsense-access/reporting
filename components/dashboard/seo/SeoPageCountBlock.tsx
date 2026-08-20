"use client";

import { useEffect, useState } from "react";
import { addDays, format, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { generateInsight } from "@/lib/insights/generateInsight";
import { formatCompactNumber, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks, PERCENT_AXIS_DOMAIN, PERCENT_AXIS_TICKS } from "@/lib/charts";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { SeoPageCountResult, SeoPageRankingStat } from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoPageCountResponse {
  connected: boolean;
  result: SeoPageCountResult | null;
}

interface SeoPageCountBlockProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
  defaultGranularity: Granularity;
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

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

// Misma clave de agrupamiento que keywordCountBucketKey (lib/gsc/reports.ts,
// no exportada — un componente "use client" no puede importar VALORES de ese
// módulo, solo tipos, porque carga googleapis) — día = fecha literal, semana
// = semana ISO, mes = "YYYY-MM". Mismo patrón ya usado en PageChurnCard.tsx.
function pageBucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const parsed = parseISO(date);
  return `${getISOWeekYear(parsed)}-W${String(getISOWeek(parsed)).padStart(2, "0")}`;
}

// Enumera TODOS los buckets de calendario que cubren `range` completo (uno
// por día/semana/mes) — usado para bucketizar del lado del cliente la serie
// diaria por página del ranking (Prompt 60), sin pegarle de nuevo a la API:
// el gráfico de evolución de la página seleccionada comparte la MISMA
// agregación Día/Semana/Mes que ya controla el gráfico de "Páginas Activas"
// de arriba.
function enumerateWindowBuckets(range: DateRangeValue, granularity: Granularity): { key: string; startDate: string; endDate: string }[] {
  const buckets = new Map<string, { key: string; startDate: string; endDate: string }>();
  let cursor = parseISO(range.from);
  const end = parseISO(range.to);
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

interface PageTrendPoint {
  label: string;
  fullLabel: string;
  value: number;
  /** CTR del bucket, siempre presente sin importar la métrica de barra elegida (Prompt 61) — línea en eje secundario. */
  ctr: number;
}

// Línea de CTR (Prompt 61): color bien distinto de todo lo demás en esta
// hoja (verdes/teal de Nuevas, gris de Impresiones, ámbar/rojo de otros
// bloques, y del propio primary/índigo que usa la barra acá) — celeste,
// ningún otro bloque de SEO lo usa.
const CTR_LINE_COLOR = "#0ea5e9"; // sky-500

type RankingSortColumn = "key" | "impressions" | "clicks" | "ctr" | "position";

const RANKING_COLUMNS: { key: RankingSortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Página", align: "left", width: "w-[46%]" },
  { key: "impressions", label: "Impresiones", align: "right", width: "w-[18%]" },
  { key: "clicks", label: "Clicks", align: "right", width: "w-[14%]" },
  { key: "ctr", label: "CTR", align: "right", width: "w-[11%]" },
  { key: "position", label: "Posición promedio", align: "right", width: "w-[11%]" },
];

const METRIC_OPTIONS: { value: "impressions" | "clicks"; label: string }[] = [
  { value: "impressions", label: "Impresiones" },
  { value: "clicks", label: "Clicks" },
];

// Fila de header / resumen del ranking — mismo criterio visual que
// PageChurnTable (components/dashboard/seo/PageChurnCard.tsx): fondo sólido
// sticky + borde grueso vía box-shadow inset, para que nunca quede tapado
// por el repintado de filas que scrollean detrás.
const RANKING_ROW_BORDER = "hsl(220 13% 70%)";

// Tabla del ranking de páginas por impresiones (Prompt 60) — mismo patrón de
// columnas ordenables que PageChurnTable, más selección de fila (click marca
// la página activa para el gráfico de evolución de abajo). Altura fija de 5
// filas visibles (header 36px + 5 filas × ~34px), el resto scrollea.
function PageRankingTable({
  rows,
  selectedKey,
  onSelect,
}: {
  rows: SeoPageRankingStat[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const [sort, setSort] = useState<{ column: RankingSortColumn; direction: "asc" | "desc" }>({
    column: "impressions",
    direction: "desc",
  });

  const sortedRows = [...rows].sort((a, b) => {
    const diff = sort.column === "key" ? a.key.localeCompare(b.key) : a[sort.column] - b[sort.column];
    return sort.direction === "asc" ? diff : -diff;
  });

  function toggleSort(column: RankingSortColumn) {
    setSort((prev) => (prev.column === column ? { column, direction: prev.direction === "asc" ? "desc" : "asc" } : { column, direction: "desc" }));
  }

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin páginas para este período.</p>;
  }

  return (
    <div className="max-h-[206px] overflow-y-auto">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground">
            {RANKING_COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "sticky top-0 z-10 h-9 py-2 pr-2",
                  column.key === "key" && "pl-2",
                  column.width,
                  column.align === "right" ? "text-right" : "text-left"
                )}
                style={{ backgroundColor: "hsl(var(--card))", boxShadow: `inset 0 -2px 0 0 ${RANKING_ROW_BORDER}` }}
              >
                <span
                  onClick={() => toggleSort(column.key)}
                  className={cn(
                    "inline-flex cursor-pointer select-none items-center gap-1",
                    column.align === "right" && "justify-end"
                  )}
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
              className={cn(
                "cursor-pointer border-b border-border last:border-0",
                row.key === selectedKey ? "bg-accent" : "hover:bg-muted/50"
              )}
            >
              <td className="break-words py-2 pl-2 pr-2 align-top text-foreground">{row.key}</td>
              <td className="py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.impressions)}</td>
              <td className="py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.clicks)}</td>
              <td className="py-2 pr-2 text-right align-top text-foreground">{formatPercent(row.ctr)}</td>
              <td className="py-2 pr-2 text-right align-top text-foreground">{formatDecimal(row.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Scorecard autocontenido "Páginas Activas" — mismo patrón exacto que
// SeoKeywordCountBlock (Prompts 20-21), pero contando páginas distintas en
// vez de keywords y respetando el segmento elegido en el selector
// transversal de la hoja Páginas.
export function SeoPageCountBlock({ clientId, range, segment, defaultGranularity }: SeoPageCountBlockProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [result, setResult] = useState<SeoPageCountResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ranking de páginas (Prompt 60): fila seleccionada para el gráfico de
  // evolución de abajo, y qué métrica muestra ese gráfico.
  const [selectedPageKey, setSelectedPageKey] = useState<string | null>(null);
  const [rankingMetric, setRankingMetric] = useState<"impressions" | "clicks">("impressions");

  useEffect(() => {
    setGranularity(defaultGranularity);
  }, [range, defaultGranularity]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to, granularity, segment });
    fetch(`/api/dashboard/${clientId}/seo/pages/count?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar la cantidad de páginas.");
        }
        return (await response.json()) as SeoPageCountResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setResult(json.result);
          // Mantiene la selección si la página sigue estando en el nuevo
          // ranking (ej. solo cambió la agregación Día/Semana/Mes, que no
          // afecta qué páginas entran al ranking) — si no, vuelve a la
          // primera fila (por defecto, la de más impresiones).
          setSelectedPageKey((prev) => {
            const stillExists = prev && json.result?.ranking.some((page) => page.key === prev);
            return stillExists ? prev : (json.result?.ranking[0]?.key ?? null);
          });
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
  }, [clientId, range, segment, granularity]);

  const insight = result
    ? generateInsight({
        label: "Páginas activas",
        current: result.current,
        previous: result.previous,
        format: "number",
        higherIsBetter: true,
      })
    : null;
  const delta = result ? result.current - result.previous : 0;
  const isPositive = (insight?.variationPct ?? 0) >= 0;

  // Ranking + gráfico de evolución de la página seleccionada (Prompt 60):
  // reutiliza `result.ranking`, ya calculado en el mismo fetch de arriba
  // (mismo dataset date×page que alimenta `series`, sin pegarle de nuevo a
  // la API). El bucketizado usa la MISMA `granularity` que el gráfico de
  // "Páginas Activas" — un solo selector controla los dos gráficos.
  const selectedPage = result?.ranking.find((page) => page.key === selectedPageKey) ?? null;
  const pageTrendData: PageTrendPoint[] = selectedPage
    ? enumerateWindowBuckets(range, granularity).map((bucket) => {
        let impressions = 0;
        let clicks = 0;
        for (const point of selectedPage.daily) {
          if (point.date >= bucket.startDate && point.date <= bucket.endDate) {
            impressions += point.impressions;
            clicks += point.clicks;
          }
        }
        return {
          label: formatBucketLabel(bucket, granularity),
          fullLabel: formatBucketFullLabel(bucket, granularity),
          value: rankingMetric === "impressions" ? impressions : clicks,
          ctr: impressions > 0 ? clicks / impressions : 0,
        };
      })
    : [];
  const pageTrendMaxValue = pageTrendData.reduce((max, point) => Math.max(max, point.value), 0);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Páginas Activas</h2>
      <Card className="w-full min-w-0">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-foreground">{result ? formatNumber(result.current) : "—"}</span>
            {insight && (
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  insight.sentiment === "neutral"
                    ? "border-muted-foreground/30 text-muted-foreground"
                    : isPositive
                      ? "border-emerald-200 text-emerald-600"
                      : "border-destructive/30 text-destructive"
                )}
              >
                {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {delta >= 0 ? "+" : "−"}
                {formatNumber(Math.abs(delta))} ({Math.abs(insight.variationPct).toFixed(1)}%)
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-1">
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
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !result ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="flex flex-col gap-6">
            {/* Gráfico de Evolución de la página seleccionada (Prompts
                60-62) — reemplaza por completo al gráfico de tendencia
                original de "Páginas Activas" (Prompts 21/38: barras con
                selector Día/Semana/Mes propio y línea de referencia de
                promedio), eliminado (Prompt 63). Comparte la agregación
                Día/Semana/Mes del header de arriba. Reacciona a la fila
                seleccionada en la tabla de Ranking de abajo: cambiar de fila
                ahí actualiza este gráfico. */}
            {!selectedPage ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-foreground" title={selectedPage.key}>
                    Evolución: {selectedPage.key}
                  </p>
                  <div className="flex gap-1">
                    {METRIC_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={rankingMetric === option.value ? "default" : "ghost"}
                        onClick={() => setRankingMetric(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>
                {pageTrendData.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {/* Leyenda (Prompt 61): la métrica de barra activa + CTR
                        (la línea de CTR se muestra siempre, sin importar cuál
                        de las 2 métricas de barra esté elegida). */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: "hsl(var(--primary))" }} />
                        {rankingMetric === "impressions" ? "Impresiones" : "Clicks"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CTR_LINE_COLOR }} />
                        CTR
                      </div>
                    </div>
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={pageTrendData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
                          <YAxis
                            yAxisId="value"
                            tick={{ fontSize: 12 }}
                            className="fill-muted-foreground"
                            width={40}
                            tickLine={false}
                            axisLine={false}
                            allowDecimals={false}
                            ticks={integerYAxisTicks(pageTrendMaxValue)}
                            tickFormatter={(value: number) => formatCompactNumber(value)}
                          />
                          {/* Eje secundario de CTR (Prompt 61-62) — a la
                              derecha, rango FIJO 0-100% en pasos de 25%
                              (Prompt 62): no autoescala según los datos, así
                              que nunca muestra un máximo irreal aunque el
                              CTR real sea muy bajo. Independiente del eje de
                              Impresiones/Clicks. */}
                          <YAxis
                            yAxisId="ctr"
                            orientation="right"
                            domain={PERCENT_AXIS_DOMAIN}
                            ticks={PERCENT_AXIS_TICKS}
                            tick={{ fontSize: 12 }}
                            className="fill-muted-foreground"
                            width={48}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value: number) => formatPercent(value)}
                          />
                          <Tooltip
                            cursor={{ fill: "hsl(var(--muted))" }}
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0) return null;
                              const point = payload[0]?.payload as PageTrendPoint | undefined;
                              if (!point) return null;
                              const metricLabel = rankingMetric === "impressions" ? "Impresiones" : "Clicks";
                              return (
                                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                                  <p className="font-medium text-foreground">{point.fullLabel}</p>
                                  <p className="text-muted-foreground">
                                    {metricLabel}: {formatNumber(point.value)}
                                  </p>
                                  <p className="text-muted-foreground">CTR: {formatPercent(point.ctr)}</p>
                                </div>
                              );
                            }}
                          />
                          <Bar yAxisId="value" dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                            <LabelList
                              dataKey="value"
                              position="top"
                              formatter={(value: string | number | boolean | null | undefined) => formatCompactNumber(Number(value ?? 0))}
                              fontSize={11}
                            />
                          </Bar>
                          <Line
                            yAxisId="ctr"
                            type="monotone"
                            dataKey="ctr"
                            stroke={CTR_LINE_COLOR}
                            strokeWidth={2}
                            dot={{ r: 3, fill: CTR_LINE_COLOR, strokeWidth: 0 }}
                            activeDot={{ r: 4 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tabla "Ranking de páginas" (Prompt 60) — debajo del gráfico
                de Evolución (Prompt 63). */}
            <div className="flex flex-col gap-2 border-t border-border pt-6">
              <p className="text-sm font-medium text-foreground">Ranking de páginas</p>
              <PageRankingTable rows={result.ranking} selectedKey={selectedPageKey} onSelect={setSelectedPageKey} />
            </div>
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
