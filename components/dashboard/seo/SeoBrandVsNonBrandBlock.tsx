"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowUpDown, Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCard } from "@/components/dashboard/InsightsList";
import { BrandKeywordPill } from "@/components/dashboard/seo/BrandKeywordPill";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DateRangeValue } from "@/lib/date-range";
import type { SeoBrandVsNonBrandKeywordStat, SeoBrandVsNonBrandResult } from "@/lib/gsc/reports";
import type { LLMInsightResult } from "@/lib/insights/llm-client";

interface SeoBrandVsNonBrandResponse {
  connected: boolean;
  result: SeoBrandVsNonBrandResult | null;
}

interface SeoBrandVsNonBrandInsightResponse {
  insights: LLMInsightResult[];
  generatedAt: string;
}

interface SeoBrandVsNonBrandBlockProps {
  clientId: string;
  range: DateRangeValue;
}

const BRAND_COLOR = "#10b981"; // emerald-500
const NON_BRAND_COLOR = "#94a3b8"; // slate-400, contraste neutro

// Fila de resumen fija al pie de las tablas: fondo gris MUY claro (más
// claro que --muted, que ya es 96% de luminosidad) pero sólido a propósito
// — sticky necesita opacidad completa o las filas de arriba se
// transparentan por debajo al scrollear. Borde superior un poco más oscuro
// que --border para que la separación se note.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";

// Barra 100% apilada con 2 segmentos — el de Brand siempre se ve, aunque sea
// angosto, incluso cuando brandCount es 0 (no se elimina la barra).
function BrandDistributionBar({ result }: { result: SeoBrandVsNonBrandResult }) {
  const hasKeywords = result.totalKeywords > 0;
  const brandWidth = hasKeywords ? Math.max(result.brandPct, 2) : 0;
  const nonBrandWidth = hasKeywords ? 100 - brandWidth : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {hasKeywords && (
          <>
            <div style={{ width: `${brandWidth}%`, backgroundColor: BRAND_COLOR }} title={`Brand: ${result.brandCount} (${result.brandPct}%)`} />
            <div
              style={{ width: `${nonBrandWidth}%`, backgroundColor: NON_BRAND_COLOR }}
              title={`Non-Brand: ${result.nonBrandCount} (${result.nonBrandPct}%)`}
            />
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: BRAND_COLOR }} />
          <span className="font-medium text-foreground">Brand:</span> {formatNumber(result.brandCount)} ({result.brandPct}%)
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: NON_BRAND_COLOR }} />
          <span className="font-medium text-foreground">Non-Brand:</span> {formatNumber(result.nonBrandCount)} ({result.nonBrandPct}%)
        </div>
      </div>
    </div>
  );
}

type SortColumn = "key" | "impressions" | "clicks" | "ctr";

const COLUMNS: { key: SortColumn; label: string; align: "left" | "right"; width: string }[] = [
  { key: "key", label: "Keyword", align: "left", width: "w-[40%]" },
  { key: "impressions", label: "Impresiones", align: "right", width: "w-[20%]" },
  { key: "clicks", label: "Clicks", align: "right", width: "w-[20%]" },
  { key: "ctr", label: "CTR", align: "right", width: "w-[20%]" },
];

// Tabla ordenable (Keyword/Clicks/CTR) para un solo grupo (Brand o
// Non-Brand). `maxHeight` viene calculado UNA sola vez en el bloque padre
// (medido sobre la tabla de Non-Brand) para que las dos tablas compartan
// literalmente la misma altura, incluso cuando Brand está vacía. `title` y
// `accentColor` distinguen visualmente cuál tabla es cuál (mismo color que
// su segmento en la barra de arriba) sin necesidad de leer el título.
function BrandVsNonBrandTable({
  title,
  accentColor,
  rows,
  maxHeight,
  firstRowRef,
  showBrandPill,
  emptyMessage,
}: {
  title: string;
  accentColor: string;
  rows: SeoBrandVsNonBrandKeywordStat[];
  maxHeight: number | undefined;
  firstRowRef?: RefObject<HTMLTableRowElement | null>;
  showBrandPill: boolean;
  emptyMessage: string;
}) {
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({ column: "clicks", direction: "desc" });

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = sort.column === "key" ? a.key.localeCompare(b.key) : a[sort.column] - b[sort.column];
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

  // Fila de resumen del pie — sobre TODAS las keywords de la tabla, no solo
  // las visibles sin scrollear. CTR se recalcula de la suma de clicks/
  // impresiones (nunca promediando los CTR% de cada fila).
  const summary = useMemo(() => {
    const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
    return { impressions, clicks, ctr: impressions > 0 ? clicks / impressions : 0 };
  }, [rows]);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground" style={{ borderBottom: `3px solid ${accentColor}` }}>
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
          {emptyMessage}
        </div>
      ) : (
        <div className="overflow-y-auto" style={maxHeight !== undefined ? { maxHeight } : undefined}>
          <table className="w-full table-fixed text-xs">
            <tbody>
              {sortedRows.map((row, index) => (
                <tr key={row.key} ref={index === 0 ? firstRowRef : undefined} className="border-b border-border last:border-0">
                  <td className="w-[40%] break-words py-2 pl-2 pr-2 align-top text-foreground">
                    {row.key}
                    {showBrandPill && (
                      <>
                        {" "}
                        <BrandKeywordPill />
                      </>
                    )}
                  </td>
                  <td className="w-[20%] py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.impressions)}</td>
                  <td className="w-[20%] py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.clicks)}</td>
                  <td className="w-[20%] py-2 pr-2 text-right align-top text-foreground">{formatPercent(row.ctr)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {/* `sticky` + el borde van en cada <td> (no en el <tr>) — es
                  el patrón robusto para que el borde se mueva pegado con la
                  fila en vez de quedar "atrás" al scrollear. */}
              <tr className="font-semibold text-foreground">
                <td
                  className="sticky bottom-0 z-10 h-9 w-[40%] break-words py-2 pl-2 pr-2 align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 3px 0 0 ${accentColor}` }}
                >
                  Total
                </td>
                <td
                  className="sticky bottom-0 z-10 h-9 w-[20%] py-2 pr-2 text-right align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 3px 0 0 ${accentColor}` }}
                >
                  {formatNumber(summary.impressions)}
                </td>
                <td
                  className="sticky bottom-0 z-10 h-9 w-[20%] py-2 pr-2 text-right align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 3px 0 0 ${accentColor}` }}
                >
                  {formatNumber(summary.clicks)}
                </td>
                <td
                  className="sticky bottom-0 z-10 h-9 w-[20%] py-2 pr-2 text-right align-top"
                  style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 3px 0 0 ${accentColor}` }}
                >
                  {formatPercent(summary.ctr)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// Bloque "Brand vs. Non-Brand" (SEO > Visión General v2, arriba de
// Distribución por Rango de Posición) — reusa el mismo dataset de keywords
// agregadas por query del período que ya usan los bloques de Pareto, sin
// pedir nada nuevo a Search Console. Sin selector de agregación: es una
// foto del período, no una serie temporal.
export function SeoBrandVsNonBrandBlock({ clientId, range }: SeoBrandVsNonBrandBlockProps) {
  const [result, setResult] = useState<SeoBrandVsNonBrandResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/dashboard/${clientId}/seo/brand-vs-non-brand?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo calcular la distribución brand vs. non-brand.");
        }
        return (await response.json()) as SeoBrandVsNonBrandResponse;
      })
      .then((json) => {
        if (!cancelled) setResult(json.result);
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

  // Insight(s) por LLM sobre el CONTENIDO de las listas Brand/Non-Brand (ver
  // brand-vs-non-brand-llm-insight.ts) — se piden aparte de la distribución
  // en sí, con su propio caché de 24hs, igual mecanismo que
  // KeywordChurnCard. Puede haber entre 1 y 3 hallazgos a la vez.
  const [llmInsights, setLlmInsights] = useState<LLMInsightResult[] | null>(null);
  const [llmInsightsLoading, setLlmInsightsLoading] = useState(true);
  const [insightsVisible, setInsightsVisible] = useState(true);
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());

  function loadInsights(force: boolean): () => void {
    let cancelled = false;
    setLlmInsightsLoading(true);

    const params = new URLSearchParams({ from: range.from, to: range.to });
    if (force) params.set("force", "1");
    fetch(`/api/dashboard/${clientId}/seo/brand-vs-non-brand/insight?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SeoBrandVsNonBrandInsightResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setLlmInsights(json?.insights ?? null);
          setDismissedIndices(new Set());
        }
      })
      .catch(() => {
        // Best effort: si falla, el bloque sigue funcionando sin insights de texto.
      })
      .finally(() => {
        if (!cancelled) setLlmInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }

  useEffect(() => {
    return loadInsights(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range]);

  // Alto máximo compartido = 10 × alto real de una fila — medido en el DOM
  // (no un valor fijo hardcodeado) sobre la tabla de Non-Brand, que casi
  // siempre tiene contenido; se aplica igual a las dos tablas para que
  // compartan la misma altura incluso si Brand está vacía.
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

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Brand vs. Non-Brand</h2>
      <Card className="w-full min-w-0">
      <CardContent className="flex flex-col gap-6 pt-6">
        {error ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !result ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <BrandDistributionBar result={result} />
            <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10">
              <BrandVsNonBrandTable
                title="Brand"
                accentColor={BRAND_COLOR}
                rows={result.brandKeywords}
                maxHeight={groupMaxHeight}
                showBrandPill
                emptyMessage="No se detectaron keywords de marca en este período."
              />
              <BrandVsNonBrandTable
                title="Non-Brand"
                accentColor={NON_BRAND_COLOR}
                rows={result.nonBrandKeywords}
                maxHeight={groupMaxHeight}
                firstRowRef={bodyRowRef}
                showBrandPill={false}
                emptyMessage="Sin keywords non-brand para este período."
              />
            </div>

            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 w-fit gap-1.5 px-2 text-xs"
                  onClick={() => setInsightsVisible((v) => !v)}
                >
                  <Sparkles className="h-3 w-3" />
                  {insightsVisible ? "Ocultar insight" : "Mostrar insight"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  title="Regenerar insight"
                  disabled={llmInsightsLoading}
                  onClick={() => loadInsights(true)}
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", llmInsightsLoading && "animate-spin")} />
                </Button>
              </div>
              {insightsVisible &&
                (llmInsightsLoading ? (
                  <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                    Analizando las keywords…
                  </div>
                ) : (
                  llmInsights?.map(
                    (insight, index) =>
                      !dismissedIndices.has(index) && (
                        <InsightCard
                          key={index}
                          insight={{
                            label: "Brand vs. Non-Brand",
                            current: 0,
                            previous: 0,
                            variationPct: 0,
                            sentiment: insight.sentiment,
                            isSpike: false,
                            text: insight.text,
                          }}
                          onDismiss={() => setDismissedIndices((prev) => new Set(prev).add(index))}
                        />
                      )
                  )
                ))}
            </div>
          </>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
