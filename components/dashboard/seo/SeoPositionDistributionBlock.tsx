"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowUpDown } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandKeywordPill } from "@/components/dashboard/seo/BrandKeywordPill";
import { formatCompactNumber, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { integerYAxisTicks } from "@/lib/charts";
import type { DateRangeValue } from "@/lib/date-range";
import type { SeoPositionRange, SeoPositionRangeGroup, SeoPositionRangeKeywordStat, SeoPositionRangeResult } from "@/lib/gsc/reports";

interface SeoPositionDistributionResponse {
  connected: boolean;
  brandRegex: string | null;
  result: SeoPositionRangeResult | null;
}

interface SeoPositionDistributionBlockProps {
  clientId: string;
  range: DateRangeValue;
}

// No se importa como valor desde lib/gsc/reports.ts a propósito: ese módulo
// arrastra googleapis (server-only) y rompería el bundle del cliente si
// "use client" importa algo que no sea un `type` de ahí.
const POSITION_RANGES: SeoPositionRange[] = ["1", "2-3", "4-10", "+10"];

// De mejor a peor.
const RANGE_COLORS: Record<SeoPositionRange, string> = {
  "1": "#10b981",
  "2-3": "#14b8a6",
  "4-10": "#f59e0b",
  "+10": "#f87171",
};

// Fila de resumen fija al pie de cada tabla: fondo gris MUY claro (más
// claro que --muted) pero sólido a propósito — sticky necesita opacidad
// completa o las filas de arriba se transparentan por debajo al scrollear.
// Borde superior un poco más oscuro que --border. Mismo criterio ya usado
// en las tablas de Brand/Non-Brand y Nuevas/Perdidas.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";
const SUMMARY_ROW_BORDER = "hsl(220 13% 70%)";

interface ChartPoint {
  range: SeoPositionRange;
  count: number;
}

// Label sobre cada barra: valor nominal + qué % representa sobre el total
// de keywords del gráfico (no sobre el eje Y) — mismo criterio que el pill
// de promedio de otros gráficos de este tablero, pero acá va fijo arriba de
// cada barra en vez de sobre una ReferenceLine.
function renderBarValueLabel(props: { x?: unknown; y?: unknown; width?: unknown; value?: unknown }, totalCount: number) {
  const x = Number(props.x);
  const y = Number(props.y);
  const width = Number(props.width);
  const value = Number(props.value);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(value)) return null;
  const pct = totalCount > 0 ? Math.round((value / totalCount) * 100) : 0;
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-foreground">
      {`${formatCompactNumber(value)} (${pct}%)`}
    </text>
  );
}

type SortColumn = "key" | "clicks";

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Keyword", align: "left", width: "w-[65%]" },
  { key: "clicks", label: "Clicks", align: "right", width: "w-[35%]" },
];

// Tabla ordenable (Keyword/Clicks) para un solo rango de posición — mismo
// patrón que las demás tablas de esta hoja: headers clickeables, altura
// fija con scroll interno, fila de resumen fija al pie.
function PositionRangeTable({
  rows,
  brandRegex,
  maxHeight,
  firstRowRef,
}: {
  rows: SeoPositionRangeKeywordStat[];
  brandRegex: string | null;
  maxHeight: number | undefined;
  firstRowRef?: RefObject<HTMLTableRowElement | null>;
}) {
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({ column: "clicks", direction: "desc" });

  const brandPattern = useMemo(() => {
    if (!brandRegex) return null;
    try {
      return new RegExp(brandRegex, "i");
    } catch {
      return null;
    }
  }, [brandRegex]);

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = sort.column === "key" ? a.key.localeCompare(b.key) : a.clicks - b.clicks;
      return sort.direction === "asc" ? diff : -diff;
    });
    return copy;
  }, [rows, sort]);

  function toggleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: column === "key" ? "asc" : "desc" }
    );
  }

  const totalClicks = useMemo(() => rows.reduce((sum, row) => sum + row.clicks, 0), [rows]);

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground" style={{ borderBottom: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            {COLUMNS.map((column) => (
              <th
                key={column.key}
                className={cn("h-9 py-2 pr-2", column.key === "key" && "pl-2", column.width, column.align === "right" ? "text-right" : "text-left")}
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
      </table>

      {rows.length === 0 ? (
        <div className="flex items-center justify-center px-2 text-center text-sm text-muted-foreground" style={{ height: maxHeight }}>
          Sin keywords en este rango.
        </div>
      ) : (
        <div className="overflow-y-auto" style={maxHeight !== undefined ? { maxHeight } : undefined}>
          <table className="w-full table-fixed text-xs">
            <tbody>
              {sortedRows.map((row, index) => {
                const isBrand = brandPattern?.test(row.key) ?? false;
                return (
                  <tr key={row.key} ref={index === 0 ? firstRowRef : undefined} className="border-b border-border last:border-0">
                    <td className="w-[65%] break-words py-2 pl-2 pr-2 align-top text-foreground">
                      {row.key}
                      {isBrand && (
                        <>
                          {" "}
                          <BrandKeywordPill />
                        </>
                      )}
                    </td>
                    <td className="w-[35%] py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.clicks)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              {/* `sticky` + el borde van en cada <td> (no en el <tr>) — es
                  el patrón robusto para que el borde se mueva pegado con la
                  fila en vez de quedar "atrás" al scrollear. */}
              <tr className="font-semibold text-foreground">
                <td
                  className="sticky bottom-0 z-10 h-9 w-[65%] break-words py-2 pl-2 pr-2 align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
                >
                  Total
                </td>
                <td
                  className="sticky bottom-0 z-10 h-9 w-[35%] py-2 pr-2 text-right align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}
                >
                  {formatNumber(totalClicks)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// Bloque "Distribución por Rango de Posición" (SEO > Visión General v2,
// debajo de los bloques de Pareto) — foto del período seleccionado, sin
// comparación contra el período anterior ni serie temporal. Un gráfico de
// 4 barras (una por rango, calculado sobre la posición promedio ponderada
// por impresiones) y, debajo de cada barra, la tabla de esa keywords de
// ese rango.
export function SeoPositionDistributionBlock({ clientId, range }: SeoPositionDistributionBlockProps) {
  const [result, setResult] = useState<SeoPositionRangeResult | null>(null);
  const [brandRegex, setBrandRegex] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/dashboard/${clientId}/seo/position-distribution?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo calcular la distribución por rango de posición.");
        }
        return (await response.json()) as SeoPositionDistributionResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setResult(json.result);
          setBrandRegex(json.brandRegex);
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
  }, [clientId, range]);

  // Alto máximo compartido por las 4 tablas = 10 × alto real de una fila —
  // medido en el DOM (no un valor fijo hardcodeado) sobre la primera tabla
  // que tenga contenido.
  const bodyRowRef = useRef<HTMLTableRowElement>(null);
  const [rowHeight, setRowHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    function measure() {
      const height = bodyRowRef.current?.getBoundingClientRect().height ?? 0;
      if (height > 0) setRowHeight(height);
    }

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (bodyRowRef.current) observer.observe(bodyRowRef.current);
    return () => observer.disconnect();
  }, [result]);

  const groupMaxHeight = rowHeight !== null ? rowHeight * 10 : undefined;

  const groupByRange = new Map<SeoPositionRange, SeoPositionRangeGroup>((result?.groups ?? []).map((group) => [group.range, group]));
  const chartData: ChartPoint[] = POSITION_RANGES.map((positionRange) => ({
    range: positionRange,
    count: groupByRange.get(positionRange)?.count ?? 0,
  }));
  const totalChartCount = chartData.reduce((sum, point) => sum + point.count, 0);
  const chartMaxValue = chartData.reduce((max, point) => Math.max(max, point.count), 0);

  // Referencia del primer <tr> con contenido, para medir el alto de fila —
  // la primera tabla no vacía cubre la inmensa mayoría de los casos reales.
  let measureAssigned = false;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Distribución por Rango de Posición</h2>
      <Card className="w-full min-w-0">
      <CardContent className="flex flex-col gap-6 pt-6">
        {error ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !result ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: SeoPositionRange) => `POS ${value}`}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    className="fill-muted-foreground"
                    width={32}
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
                            Posición {point.range}: {formatNumber(point.count)} keywords
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {chartData.map((point) => (
                      <Cell key={point.range} fill={RANGE_COLORS[point.range]} />
                    ))}
                    <LabelList dataKey="count" content={(props) => renderBarValueLabel(props, totalChartCount)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-6">
              {POSITION_RANGES.map((positionRange) => {
                const group = groupByRange.get(positionRange);
                const rows = group?.keywords ?? [];
                const assignRef = !measureAssigned && rows.length > 0;
                if (assignRef) measureAssigned = true;
                return (
                  <div key={positionRange} className="flex flex-col gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RANGE_COLORS[positionRange] }} />
                      <h3 className="text-sm font-semibold text-foreground">Posición {positionRange}</h3>
                    </div>
                    <PositionRangeTable
                      rows={rows}
                      brandRegex={brandRegex}
                      maxHeight={groupMaxHeight}
                      firstRowRef={assignRef ? bodyRowRef : undefined}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
