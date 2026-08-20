"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { BrandKeywordPill } from "@/components/dashboard/seo/BrandKeywordPill";
import { generateInsight, type InsightSentiment } from "@/lib/insights/generateInsight";
import { formatNumber } from "@/lib/format";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { SeoImpressionsBucket, SeoImpressionsParetoKeywordStat, SeoImpressionsParetoResult, SeoImpressionsResult } from "@/lib/gsc/reports";

interface SeoImpressionsResponse {
  connected: boolean;
  result: SeoImpressionsResult | null;
}

interface SeoImpressionsParetoResponse {
  connected: boolean;
  brandRegex: string | null;
  result: SeoImpressionsParetoResult | null;
}

interface SeoImpressionsBlockProps {
  clientId: string;
  range: DateRangeValue;
  defaultGranularity: Granularity;
}

function formatBucketLabel(bucket: SeoImpressionsBucket, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `${format(start, "d")}-${format(end, "d")} ${format(start, "MMM", { locale: es })}`
    : `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
}

// Texto de Info reutilizado tal cual del scorecard "Impresiones" de SEO >
// Visión General > Rendimiento en Búsqueda (Prompt 67) — mismo concepto de
// métrica, ya redactado ahí (Prompt 73: no se reescribe texto nuevo).
const IMPRESSIONS_INFO_TEXT =
  "Cantidad de veces que alguna página del sitio apareció en los resultados de búsqueda de Google, en el período seleccionado.";

// current/previous NO dependen de la granularidad pedida (solo bucketiza
// `series` distinto) — misma consulta para la carga inicial (con
// defaultGranularity) y para fetchTrend de la tarjeta (con la granularidad
// que el usuario elija ahí).
async function fetchImpressions(clientId: string, range: DateRangeValue, granularity: Granularity): Promise<SeoImpressionsResult | null> {
  const params = new URLSearchParams({ from: range.from, to: range.to, granularity });
  const response = await fetch(`/api/dashboard/${clientId}/seo/impressions?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudieron cargar las impresiones.");
  }
  const json = (await response.json()) as SeoImpressionsResponse;
  return json.result;
}

// El sentiment del insight de Pareto se decide por el NIVEL absoluto de
// concentración (X), no por cómo varió vs. el período anterior — mismo
// criterio que el bloque de Clicks (ver SeoClicksBlock.tsx), duplicado acá a
// propósito para que este bloque no dependa de aquel.
function paretoConcentrationSentiment(cutoffCount: number, cutoffKeywordsPercent: number, totalKeywords: number): InsightSentiment {
  if (totalKeywords === 0) return "neutral";
  if (cutoffCount === 1) return "negative";
  if (cutoffKeywordsPercent < 10) return "negative";
  if (cutoffKeywordsPercent < 25) return "neutral";
  return "positive";
}

// Redacta el mensaje principal según la banda — mantiene N/T/X/topKeyword/
// topKeywordPct en negrita (mismo parser de markdown que ya usa InsightCard).
function paretoConcentrationText(
  result: SeoImpressionsParetoResult,
  topKeyword: SeoImpressionsParetoKeywordStat | null,
  topKeywordPct: number
): string {
  const { cutoffCount: N, totalKeywords: T, cutoffKeywordsPercent: X } = result;

  if (T === 0) return "Sin actividad de keywords en este período.";

  if (N === 1 && topKeyword) {
    return `Todo tu tráfico relevante depende de una sola keyword: **'${topKeyword.key}'**, responsable del **${topKeywordPct}%** de tus impresiones. Es una dependencia crítica — conviene diversificar activamente.`;
  }
  if (X < 10) {
    return `Tu tráfico está muy concentrado: solo **${N}** de tus **${T}** keywords (**${X}%**) generan el 80% de tus impresiones. Si alguna de estas keywords pierde posiciones, gran parte de tu tráfico queda en riesgo.`;
  }
  if (X < 25) {
    return `Tu tráfico está moderadamente concentrado: **${N}** de tus **${T}** keywords (**${X}%**) generan el 80% de tus impresiones.${
      topKeyword ? ` Tu keyword más fuerte, **'${topKeyword.key}'**, aporta el **${topKeywordPct}%** de ese total.` : ""
    }`;
  }
  return `Tu tráfico está bien diversificado: hacen falta **${N}** de tus **${T}** keywords (**${X}%**) para llegar al 80% de tus impresiones.${
    topKeyword ? ` Tu keyword más fuerte, **'${topKeyword.key}'**, aporta el **${topKeywordPct}%** de ese total.` : ""
  }`;
}

// Preview por defecto de cada grupo (el del corte del 80% y la cola larga
// de abajo) — cada uno se ve completo hasta 10 filas; si tiene más, scrollea
// de forma independiente dentro de su propio contenedor.
const PARETO_GROUP_MAX_ROWS = 10;

// Tabla de ranking fijo (sin headers ordenables, ya viene ordenada por
// impresiones desc desde el backend) para el desglose de Pareto — solo
// Keyword + Impresiones, separada en dos grupos con scroll independiente:
// las keywords del corte del 80% arriba, el resto (cola larga) abajo, con
// un borde superior remarcado + label inline en la primera fila del segundo
// grupo para marcar el corte.
function ParetoTable({
  topKeywords,
  restKeywords,
  totalImpressions,
  brandRegex,
}: {
  topKeywords: SeoImpressionsParetoKeywordStat[];
  restKeywords: SeoImpressionsParetoKeywordStat[];
  totalImpressions: number;
  brandRegex: string | null;
}) {
  const brandPattern = useMemo(() => {
    if (!brandRegex) return null;
    try {
      return new RegExp(brandRegex, "i");
    } catch {
      return null;
    }
  }, [brandRegex]);

  function impressionsCellLabel(impressions: number): string {
    const pct = totalImpressions > 0 ? (impressions / totalImpressions) * 100 : 0;
    return `${formatNumber(impressions)} (${pct.toFixed(1)}%)`;
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

  if (topKeywords.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sin keywords para este período.</p>;
  }

  const groupMaxHeight = rowHeight !== null ? rowHeight * PARETO_GROUP_MAX_ROWS : undefined;

  return (
    <div className="flex flex-col gap-2">
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="border-b border-border text-xs font-medium text-muted-foreground">
            <th className="w-[70%] py-2 pl-2 pr-2 text-left">Keyword</th>
            <th className="w-[30%] py-2 pr-2 text-right">Impresiones</th>
          </tr>
        </thead>
      </table>

      <div className="overflow-y-auto" style={groupMaxHeight !== undefined ? { maxHeight: groupMaxHeight } : undefined}>
        <table className="w-full table-fixed text-xs">
          <tbody>
            {topKeywords.map((row, index) => {
              const isBrand = brandPattern?.test(row.key) ?? false;
              return (
                <tr key={row.key} ref={index === 0 ? bodyRowRef : undefined} className="border-b border-border bg-emerald-50 last:border-0">
                  <td className="w-[70%] break-words py-2 pl-2 pr-2 align-top text-foreground">
                    {row.key}
                    {isBrand && (
                      <>
                        {" "}
                        <BrandKeywordPill />
                      </>
                    )}
                  </td>
                  <td className="w-[30%] py-2 pr-2 text-right align-top text-foreground">{impressionsCellLabel(row.impressions)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {restKeywords.length > 0 && (
        <>
          {/* Divisor propio (no superpuesto a una fila) — evita que se
              recorte con el overflow-y-auto de los contenedores de arriba/
              abajo, a diferencia del label flotante que usábamos antes. */}
          <div className="flex items-center gap-2 py-1">
            <span className="inline-block shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              80% de impresiones ({formatNumber(topKeywords.length)} Kws) ↑
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="overflow-y-auto" style={groupMaxHeight !== undefined ? { maxHeight: groupMaxHeight } : undefined}>
            <table className="w-full table-fixed text-xs">
              <tbody>
                {restKeywords.map((row) => {
                  const isBrand = brandPattern?.test(row.key) ?? false;
                  return (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <td className="w-[70%] break-words py-2 pl-2 pr-2 align-top text-foreground">
                        {row.key}
                        {isBrand && (
                          <>
                            {" "}
                            <BrandKeywordPill />
                          </>
                        )}
                      </td>
                      <td className="w-[30%] py-2 pr-2 text-right align-top text-foreground">{impressionsCellLabel(row.impressions)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// Bloque "Impresiones" (SEO > Visión General v2, inmediatamente arriba de
// "Clicks" — las impresiones anteceden a los clicks en el funnel) — scorecard
// con MetricScorecardGroup (Prompt 92, refactor de Prompt 73) más el
// análisis de Pareto sin cambios (2 Cards separadas en vez de 1 con
// divisor interno, ver SeoClicksBlock.tsx). Cálculo backend independiente,
// sin compartir estado con el bloque de Clicks.
export function SeoImpressionsBlock({ clientId, range, defaultGranularity }: SeoImpressionsBlockProps) {
  const [result, setResult] = useState<SeoImpressionsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paretoResult, setParetoResult] = useState<SeoImpressionsParetoResult | null>(null);
  const [paretoBrandRegex, setParetoBrandRegex] = useState<string | null>(null);
  const [paretoLoading, setParetoLoading] = useState(true);
  const [paretoError, setParetoError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchImpressions(clientId, range, defaultGranularity)
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
  }, [clientId, range, defaultGranularity]);

  const fetchTrend = useCallback(
    (granularity: Granularity): Promise<ScorecardTrendPoint[]> =>
      fetchImpressions(clientId, range, granularity).then((res) =>
        (res?.series ?? []).map((bucket) => ({ label: formatBucketLabel(bucket, granularity), value: bucket.impressions }))
      ),
    [clientId, range]
  );

  // Pareto tiene su propia carga (no depende de la granularidad del gráfico
  // de arriba) — un único cálculo sobre el rango global seleccionado.
  useEffect(() => {
    let cancelled = false;
    setParetoLoading(true);
    setParetoError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to });
    fetch(`/api/dashboard/${clientId}/seo/impressions/pareto?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo calcular la concentración de impresiones.");
        }
        return (await response.json()) as SeoImpressionsParetoResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setParetoResult(json.result);
          setParetoBrandRegex(json.brandRegex);
        }
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
  }, [clientId, range]);

  // Insight de reglas (no LLM) sobre la concentración de Pareto. El
  // sentiment/color se decide por el NIVEL absoluto de X
  // (paretoConcentrationSentiment), no por la variación vs. el período
  // anterior — generateInsight() solo se usa acá para redactar la cláusula
  // de cierre sobre esa variación (banco de frases ya existente), IGNORANDO
  // el sentiment que devuelve.
  const topKeyword = paretoResult?.topKeywords[0] ?? null;
  const topKeywordPct =
    topKeyword && paretoResult && paretoResult.totalImpressions > 0
      ? Math.round((topKeyword.impressions / paretoResult.totalImpressions) * 100)
      : 0;

  const paretoComparisonInsight = paretoResult
    ? generateInsight({
        label: "Concentración de impresiones (Pareto)",
        current: paretoResult.cutoffKeywordsPercent / 100,
        previous: paretoResult.previousCutoffKeywordsPercent / 100,
        format: "percentage",
        higherIsBetter: true,
      })
    : null;

  const paretoInsight =
    paretoResult && paretoComparisonInsight
      ? {
          ...paretoComparisonInsight,
          sentiment: paretoConcentrationSentiment(paretoResult.cutoffCount, paretoResult.cutoffKeywordsPercent, paretoResult.totalKeywords),
          // El badge "Pico" agrega una línea extra que rompe la altura fija
          // del contenedor del insight — se apaga acá, no en InsightCard.
          isSpike: false,
          text: [paretoConcentrationText(paretoResult, topKeyword, topKeywordPct), paretoComparisonInsight.text]
            .filter((sentence): sentence is string => !!sentence)
            .join(" "),
        }
      : null;

  const metrics: MetricScorecardConfig[] = result
    ? [
        {
          key: "impressions",
          label: "Impresiones",
          currentValue: result.current,
          previousValue: result.previous,
          format: "number",
          higherIsBetter: true,
          infoText: IMPRESSIONS_INFO_TEXT,
          fetchTrend,
          formatChartValue: (value) => `${formatNumber(value)} impresiones`,
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
                El <strong className="font-bold">{paretoResult.cutoffKeywordsPercent}%</strong> de tus keywords generó el{" "}
                <strong className="font-bold">80%</strong> de tus impresiones, y representó el{" "}
                <strong className="font-bold">{paretoResult.cutoffClicksPercent}%</strong> de tus clicks.
              </p>

              {/* Alto fijo (no min-height) para que, si este bloque queda
                  lado a lado con el de Clicks, la tabla de abajo arranque
                  siempre a la misma altura en los dos — sin importar si un
                  insight tiene más texto que el otro. */}
              <div className="h-32 overflow-y-auto">
                {paretoInsight && <InsightsList insights={[paretoInsight]} sectionKey="seo" keyPrefix="impressions_pareto" />}
              </div>

              <ParetoTable
                topKeywords={paretoResult.topKeywords}
                restKeywords={paretoResult.restKeywords}
                totalImpressions={paretoResult.totalImpressions}
                brandRegex={paretoBrandRegex}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
