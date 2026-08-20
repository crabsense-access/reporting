"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { generateInsight, type InsightSentiment } from "@/lib/insights/generateInsight";
import { formatNumber } from "@/lib/format";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { SeoClicksBucket, SeoPageParetoStat, SeoPagesClicksParetoResult, SeoPagesClicksResult } from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoPagesClicksResponse {
  connected: boolean;
  result: SeoPagesClicksResult | null;
}

interface SeoPagesClicksParetoResponse {
  connected: boolean;
  result: SeoPagesClicksParetoResult | null;
}

interface SeoPagesClicksParetoBlockProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
  defaultGranularity: Granularity;
}

function formatBucketLabel(bucket: SeoClicksBucket, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `${format(start, "d")}-${format(end, "d")} ${format(start, "MMM", { locale: es })}`
    : `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
}

// Texto de Info reutilizado tal cual del scorecard "Clicks" de SEO > Visión
// General > Rendimiento en Búsqueda (Prompt 67) — mismo concepto de
// métrica, ya redactado ahí (Prompt 73: no se reescribe texto nuevo).
const CLICKS_INFO_TEXT = "Cantidad de clicks que recibieron las páginas del sitio desde los resultados de búsqueda de Google, en el período seleccionado.";

// current/previous NO dependen de la granularidad pedida (solo bucketiza
// `series` distinto) — misma consulta para la carga inicial (con
// defaultGranularity) y para fetchTrend de la tarjeta (con la granularidad
// que el usuario elija ahí).
async function fetchPagesClicks(
  clientId: string,
  range: DateRangeValue,
  segment: SeoPageSegmentKey,
  granularity: Granularity
): Promise<SeoPagesClicksResult | null> {
  const params = new URLSearchParams({ from: range.from, to: range.to, granularity, segment });
  const response = await fetch(`/api/dashboard/${clientId}/seo/pages/clicks?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar los clicks.");
  }
  const json = (await response.json()) as SeoPagesClicksResponse;
  return json.result;
}

// El sentiment del insight de Pareto se decide por el NIVEL absoluto de
// concentración (X), no por cómo varió vs. el período anterior — mismo
// criterio que SeoClicksBlock (hoja Keywords), duplicado acá a propósito
// para que este bloque no dependa de aquel.
function paretoConcentrationSentiment(cutoffCount: number, cutoffPagesPercent: number, totalPages: number): InsightSentiment {
  if (totalPages === 0) return "neutral";
  if (cutoffCount === 1) return "negative";
  if (cutoffPagesPercent < 10) return "negative";
  if (cutoffPagesPercent < 25) return "neutral";
  return "positive";
}

// Redacta el mensaje principal según la banda — mantiene N/T/X/topPage/
// topPagePct en negrita (mismo parser de markdown que ya usa InsightCard).
function paretoConcentrationText(result: SeoPagesClicksParetoResult, topPage: SeoPageParetoStat | null, topPagePct: number): string {
  const { cutoffCount: N, totalPages: T, cutoffPagesPercent: X } = result;

  if (T === 0) return "Sin actividad de páginas en este período.";

  if (N === 1 && topPage) {
    return `Todo tu tráfico relevante depende de una sola página: **'${topPage.key}'**, responsable del **${topPagePct}%** de tus clicks. Es una dependencia crítica — conviene diversificar activamente.`;
  }
  if (X < 10) {
    return `Tu tráfico está muy concentrado: solo **${N}** de tus **${T}** páginas (**${X}%**) generan el 80% de tus clicks. Si alguna de estas páginas pierde posiciones, gran parte de tu tráfico queda en riesgo.`;
  }
  if (X < 25) {
    return `Tu tráfico está moderadamente concentrado: **${N}** de tus **${T}** páginas (**${X}%**) generan el 80% de tus clicks.${
      topPage ? ` Tu página más fuerte, **'${topPage.key}'**, aporta el **${topPagePct}%** de ese total.` : ""
    }`;
  }
  return `Tu tráfico está bien diversificado: hacen falta **${N}** de tus **${T}** páginas (**${X}%**) para llegar al 80% de tus clicks.${
    topPage ? ` Tu página más fuerte, **'${topPage.key}'**, aporta el **${topPagePct}%** de ese total.` : ""
  }`;
}

// Preview por defecto de cada grupo (el del corte del 80% y la cola larga
// de abajo) — cada uno se ve completo hasta 10 filas; si tiene más, scrollea
// de forma independiente dentro de su propio contenedor.
const PARETO_GROUP_MAX_ROWS = 10;

// Tabla de ranking fijo (sin headers ordenables, ya viene ordenada por
// clicks desc desde el backend) para el desglose de Pareto — Página + Clicks,
// sin pill de marca (no aplica a páginas), separada en dos grupos con scroll
// independiente: las páginas del corte del 80% arriba, el resto (cola larga)
// abajo, con un borde superior remarcado + label inline en la primera fila
// del segundo grupo para marcar el corte (no como fila extra).
function ParetoTable({ topPages, restPages, totalClicks }: { topPages: SeoPageParetoStat[]; restPages: SeoPageParetoStat[]; totalClicks: number }) {
  function clicksCellLabel(clicks: number): string {
    const pct = totalClicks > 0 ? (clicks / totalClicks) * 100 : 0;
    return `${formatNumber(clicks)} (${pct.toFixed(1)}%)`;
  }

  // Alto máximo de cada grupo = 10 × alto real de una fila — medido en el
  // DOM en vez de asumir un valor fijo en píxeles (el alto de fila varía
  // según fuente/tema). Es un `max-height`, no un alto fijo: si un grupo
  // tiene menos de 10 filas ocupa solo lo que necesita, sin espacio vacío.
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
  }, []);

  if (topPages.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin páginas para este período.</p>;
  }

  const groupMaxHeight = rowHeight !== null ? rowHeight * PARETO_GROUP_MAX_ROWS : undefined;

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground">
            <th className="w-[70%] py-2 pl-2 pr-2 text-left">Página</th>
            <th className="w-[30%] py-2 pr-2 text-right">Clicks</th>
          </tr>
        </thead>
      </table>

      <div className="overflow-y-auto" style={groupMaxHeight !== undefined ? { maxHeight: groupMaxHeight } : undefined}>
        <table className="w-full table-fixed text-xs">
          <tbody>
            {topPages.map((row, index) => (
              <tr key={row.key} ref={index === 0 ? bodyRowRef : undefined} className="border-b border-border bg-emerald-50 last:border-0">
                <td className="w-[70%] break-words py-2 pl-2 pr-2 align-top text-foreground">{row.key}</td>
                <td className="w-[30%] py-2 pr-2 text-right align-top text-foreground">{clicksCellLabel(row.clicks)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {restPages.length > 0 && (
        <>
          {/* Divisor propio (no superpuesto a una fila) — evita que se
              recorte con el overflow-y-auto de los contenedores de arriba/
              abajo, a diferencia de un label flotante. */}
          <div className="flex items-center gap-2 py-1">
            <span className="inline-block shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              80% de clicks ({formatNumber(topPages.length)} páginas) ↑
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="overflow-y-auto" style={groupMaxHeight !== undefined ? { maxHeight: groupMaxHeight } : undefined}>
            <table className="w-full table-fixed text-xs">
              <tbody>
                {restPages.map((row) => (
                  <tr key={row.key} className="border-b border-border last:border-0">
                    <td className="w-[70%] break-words py-2 pl-2 pr-2 align-top text-foreground">{row.key}</td>
                    <td className="w-[30%] py-2 pr-2 text-right align-top text-foreground">{clicksCellLabel(row.clicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Bloque "Clicks" (SEO > Páginas > Concentración) — scorecard con
// MetricScorecardGroup (Prompt 92, refactor de Prompt 73) más el análisis
// de Pareto de concentración de clicks por página sin cambios (2 Cards
// separadas en vez de 1 con divisor interno, ver SeoClicksBlock.tsx), con
// insight de reglas (generateInsight, no LLM), respetando el segmento
// elegido en el selector transversal de la hoja Páginas.
export function SeoPagesClicksParetoBlock({ clientId, range, segment, defaultGranularity }: SeoPagesClicksParetoBlockProps) {
  const [result, setResult] = useState<SeoPagesClicksResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paretoResult, setParetoResult] = useState<SeoPagesClicksParetoResult | null>(null);
  const [paretoLoading, setParetoLoading] = useState(true);
  const [paretoError, setParetoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPagesClicks(clientId, range, segment, defaultGranularity)
      .then((res) => {
        if (!cancelled) setResult(res);
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
  }, [clientId, range, segment, defaultGranularity]);

  const fetchTrend = useCallback(
    (granularity: Granularity): Promise<ScorecardTrendPoint[]> =>
      fetchPagesClicks(clientId, range, segment, granularity).then((res) =>
        (res?.series ?? []).map((bucket) => ({ label: formatBucketLabel(bucket, granularity), value: bucket.clicks }))
      ),
    [clientId, range, segment]
  );

  // Pareto tiene su propia carga (no depende de la granularidad del gráfico
  // de arriba) — un único cálculo sobre el rango global seleccionado.
  useEffect(() => {
    let cancelled = false;
    setParetoLoading(true);
    setParetoError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to, segment });
    fetch(`/api/dashboard/${clientId}/seo/pages/clicks/pareto?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo calcular la concentración de clicks.");
        }
        return (await response.json()) as SeoPagesClicksParetoResponse;
      })
      .then((json) => {
        if (!cancelled) setParetoResult(json.result);
      })
      .catch((err: Error) => {
        if (!cancelled) setParetoError(err.message);
      })
      .finally(() => {
        if (!cancelled) setParetoLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, range, segment]);

  // Insight de reglas (no LLM) sobre la concentración de Pareto. El
  // sentiment/color se decide por el NIVEL absoluto de X
  // (paretoConcentrationSentiment), no por la variación vs. el período
  // anterior — generateInsight() solo se usa acá para redactar la cláusula
  // de cierre sobre esa variación (banco de frases ya existente), IGNORANDO
  // el sentiment que devuelve.
  const topPage = paretoResult?.topPages[0] ?? null;
  const topPagePct = topPage && paretoResult && paretoResult.totalClicks > 0 ? Math.round((topPage.clicks / paretoResult.totalClicks) * 100) : 0;

  const paretoComparisonInsight = paretoResult
    ? generateInsight({
        label: "Concentración de clicks por página (Pareto)",
        current: paretoResult.cutoffPagesPercent / 100,
        previous: paretoResult.previousCutoffPagesPercent / 100,
        format: "percentage",
        higherIsBetter: true,
      })
    : null;

  const paretoInsight =
    paretoResult && paretoComparisonInsight
      ? {
          ...paretoComparisonInsight,
          sentiment: paretoConcentrationSentiment(paretoResult.cutoffCount, paretoResult.cutoffPagesPercent, paretoResult.totalPages),
          // El badge "Pico" agrega una línea extra que rompe la altura fija
          // del contenedor del insight — se apaga acá, no en InsightCard.
          isSpike: false,
          text: [paretoConcentrationText(paretoResult, topPage, topPagePct), paretoComparisonInsight.text]
            .filter((sentence): sentence is string => !!sentence)
            .join(" "),
        }
      : null;

  const metrics: MetricScorecardConfig[] = result
    ? [
        {
          key: "clicks",
          label: "Clicks",
          currentValue: result.current,
          previousValue: result.previous,
          format: "number",
          higherIsBetter: true,
          infoText: CLICKS_INFO_TEXT,
          fetchTrend,
          formatChartValue: (value) => `${formatNumber(value)} clicks`,
          variationPctDecimals: 0,
        },
      ]
    : [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error ? (
        <Card className="w-full min-w-0">
          <CardContent className="flex h-32 flex-col items-center justify-center gap-2 pt-6 text-sm text-muted-foreground">
            <p>{error}</p>
          </CardContent>
        </Card>
      ) : loading || !result ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <MetricScorecardGroup metrics={metrics} gridClassName="grid grid-cols-1" />
      )}

      <Card className="w-full min-w-0">
        <CardContent className="flex flex-col gap-3 pt-6">
          <h3 className="text-base font-semibold text-foreground">Pareto</h3>

          {paretoError ? (
            <p className="text-sm text-muted-foreground">{paretoError}</p>
          ) : paretoLoading || !paretoResult ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <p className="text-sm text-foreground">
                El <strong className="font-bold">{paretoResult.cutoffPagesPercent}%</strong> de tus páginas generó el{" "}
                <strong className="font-bold">80%</strong> de tus clicks, y representó el{" "}
                <strong className="font-bold">{paretoResult.cutoffImpressionsPercent}%</strong> de tus impresiones.
              </p>

              {/* Alto fijo (no min-height) para que, si este bloque queda
                  lado a lado con el de Impresiones, la tabla de abajo
                  arranque siempre a la misma altura en los dos — sin
                  importar si un insight tiene más texto que el otro. */}
              <div className="h-32 overflow-y-auto">
                {paretoInsight && <InsightsList insights={[paretoInsight]} sectionKey="seo" keyPrefix="pages_clicks_pareto" />}
              </div>

              <ParetoTable topPages={paretoResult.topPages} restPages={paretoResult.restPages} totalClicks={paretoResult.totalClicks} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
