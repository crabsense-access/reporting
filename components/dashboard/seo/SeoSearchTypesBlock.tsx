"use client";

import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightCard } from "@/components/dashboard/InsightsList";
import { formatCompactNumber, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SEARCH_TYPE_GUIDES } from "@/lib/seo/searchTypeGuides";
import type { DateRangeValue } from "@/lib/date-range";
import type { SeoSearchType, SeoSearchTypeStat } from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { LLMInsightResult } from "@/lib/insights/llm-client";

// No se importa SEO_SEARCH_TYPES como valor desde lib/gsc/reports.ts a
// propósito: ese módulo arrastra googleapis (server-only) y rompería el
// bundle del cliente — mismo criterio ya usado en
// SeoPositionDistributionBlock. Orden Web/Imagen/Video/Noticias/Discover/
// Google News, el mismo en que hay que mostrar las tarjetas de guía.
const SEARCH_TYPE_ORDER: SeoSearchType[] = ["web", "image", "video", "news", "discover", "googleNews"];

interface SeoSearchTypesResponse {
  connected: boolean;
  result: SeoSearchTypeStat[] | null;
}

interface SeoSearchTypesInsightResponse {
  insights: LLMInsightResult[];
  generatedAt: string;
}

interface SeoSearchTypesBlockProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
}

type MetricKey = "impressions" | "clicks" | "ctr";

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "impressions", label: "Impresiones" },
  { value: "clicks", label: "Clicks" },
  { value: "ctr", label: "CTR" },
];

// Fila de resumen fija al pie de la tabla — mismo criterio que el resto del
// proyecto (Brand vs. Non-Brand, Distribución por Rango de Posición, etc.):
// fondo gris muy claro pero sólido, borde superior un poco más oscuro que
// --border.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";
const SUMMARY_ROW_BORDER = "hsl(220 13% 70%)";

function formatMetricValue(value: number, metric: MetricKey): string {
  return metric === "ctr" ? formatPercent(value) : formatNumber(value);
}

// Solo para el valor mostrado EN la barra (eje y tooltip siguen con el
// número completo vía formatMetricValue) — impresiones/clicks compactos
// (700K), CTR sigue en porcentaje sin cambios.
function formatBarLabelValue(value: number, metric: MetricKey): string {
  return metric === "ctr" ? formatPercent(value) : formatCompactNumber(value);
}

// Gráfico de barras horizontal: 6 barras (una por tipo de búsqueda),
// reordenadas de mayor a menor según la métrica elegida arriba.
function SearchTypesChart({ stats, metric }: { stats: SeoSearchTypeStat[]; metric: MetricKey }) {
  const sorted = useMemo(() => [...stats].sort((a, b) => b[metric] - a[metric]), [stats, metric]);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} layout="vertical" margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatMetricValue(value, metric)}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            width={90}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))" }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const point = payload[0]?.payload as SeoSearchTypeStat | undefined;
              if (!point) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium text-foreground">{point.label}</p>
                  <p className="text-muted-foreground">Impresiones: {formatNumber(point.impressions)}</p>
                  <p className="text-muted-foreground">Clicks: {formatNumber(point.clicks)}</p>
                  <p className="text-muted-foreground">CTR: {formatPercent(point.ctr)}</p>
                  <p className="text-muted-foreground">Posición promedio: {formatDecimal(point.position)}</p>
                </div>
              );
            }}
          />
          <Bar dataKey={metric} fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
            <LabelList
              dataKey={metric}
              position="right"
              className="fill-foreground"
              fontSize={12}
              fontWeight={600}
              formatter={(value) => formatBarLabelValue(Number(value), metric)}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Tabla de detalle: Tipo | Impresiones | Clicks | Posición promedio | CTR,
// con fila de Total al pie (Impresiones/Clicks sumados, CTR recalculado de
// esa suma —nunca promediando los CTR% de cada fila—, Posición promedio
// ponderada por impresiones).
function SearchTypesTable({ stats }: { stats: SeoSearchTypeStat[] }) {
  const totals = useMemo(() => {
    const impressions = stats.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = stats.reduce((sum, row) => sum + row.clicks, 0);
    const weightedPosition = stats.reduce((sum, row) => sum + row.position * row.impressions, 0);
    return {
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? weightedPosition / impressions : 0,
    };
  }, [stats]);

  return (
    <table className="w-full table-fixed text-xs">
      <thead>
        <tr className="text-xs font-medium text-muted-foreground" style={{ borderBottom: `2px solid ${SUMMARY_ROW_BORDER}` }}>
          <th className="h-9 w-[30%] py-2 pl-2 pr-2 text-left">Tipo</th>
          <th className="h-9 w-[20%] py-2 pr-2 text-right">Impresiones</th>
          <th className="h-9 w-[17.5%] py-2 pr-2 text-right">Clicks</th>
          <th className="h-9 w-[17.5%] py-2 pr-2 text-right">Posición promedio</th>
          <th className="h-9 w-[15%] py-2 pr-2 text-right">CTR</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((row) => (
          <tr key={row.type} className="border-b border-border last:border-0">
            <td className="w-[30%] py-2 pl-2 pr-2 align-top text-foreground">{row.label}</td>
            <td className="w-[20%] py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.impressions)}</td>
            <td className="w-[17.5%] py-2 pr-2 text-right align-top text-foreground">{formatNumber(row.clicks)}</td>
            <td className="w-[17.5%] py-2 pr-2 text-right align-top text-foreground">{formatDecimal(row.position)}</td>
            <td className="w-[15%] py-2 pr-2 text-right align-top text-foreground">{formatPercent(row.ctr)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold text-foreground">
          <td className="h-9 w-[30%] py-2 pl-2 pr-2 align-top" style={{ backgroundColor: SUMMARY_ROW_BG, borderTop: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            Total
          </td>
          <td className="h-9 w-[20%] py-2 pr-2 text-right align-top" style={{ backgroundColor: SUMMARY_ROW_BG, borderTop: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            {formatNumber(totals.impressions)}
          </td>
          <td className="h-9 w-[17.5%] py-2 pr-2 text-right align-top" style={{ backgroundColor: SUMMARY_ROW_BG, borderTop: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            {formatNumber(totals.clicks)}
          </td>
          <td className="h-9 w-[17.5%] py-2 pr-2 text-right align-top" style={{ backgroundColor: SUMMARY_ROW_BG, borderTop: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            {formatDecimal(totals.position)}
          </td>
          <td className="h-9 w-[15%] py-2 pr-2 text-right align-top" style={{ backgroundColor: SUMMARY_ROW_BG, borderTop: `2px solid ${SUMMARY_ROW_BORDER}` }}>
            {formatPercent(totals.ctr)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

// Bloque "Tipos de Búsqueda" (SEO > Tipos de Búsqueda > Resumen) — foto del
// período seleccionado (sin comparación contra el período anterior), sobre
// los 6 tipos de búsqueda que soporta Search Console (web/image/video/news/
// discover/googleNews). Respeta el segmento elegido en el selector
// transversal de la hoja.
export function SeoSearchTypesBlock({ clientId, range, segment }: SeoSearchTypesBlockProps) {
  const [metric, setMetric] = useState<MetricKey>("impressions");
  const [stats, setStats] = useState<SeoSearchTypeStat[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to, segment });
    fetch(`/api/dashboard/${clientId}/seo/search-types?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo calcular la distribución por tipo de búsqueda.");
        }
        return (await response.json()) as SeoSearchTypesResponse;
      })
      .then((json) => {
        if (!cancelled) setStats(json.result);
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
  }, [clientId, range, segment]);

  // Insight(s) por LLM sobre el desempeño de los 6 tipos de búsqueda (ver
  // search-types-llm-insight.ts) — se piden aparte de los totales en sí, con
  // su propio caché de 24hs, mismo mecanismo que Brand vs. Non-Brand. Puede
  // haber entre 1 y 3 hallazgos a la vez.
  const [llmInsights, setLlmInsights] = useState<LLMInsightResult[] | null>(null);
  const [llmInsightsLoading, setLlmInsightsLoading] = useState(true);
  const [insightsVisible, setInsightsVisible] = useState(true);
  // Claves estables (no índices numéricos): las tarjetas de guía se calculan
  // aparte de las del LLM y no queremos que, si el LLM todavía está
  // cargando, un descarte se "corra" de tarjeta al llegar la respuesta y
  // cambiar la cantidad de insights del LLM.
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  function loadInsights(force: boolean): () => void {
    let cancelled = false;
    setLlmInsightsLoading(true);

    const params = new URLSearchParams({ from: range.from, to: range.to, segment });
    if (force) params.set("force", "1");
    fetch(`/api/dashboard/${clientId}/seo/search-types/insight?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as SeoSearchTypesInsightResponse;
      })
      .then((json) => {
        if (!cancelled) {
          setLlmInsights(json?.insights ?? null);
          setDismissedKeys(new Set());
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
  }, [clientId, range, segment]);

  // Tarjeta "cómo implementarlo" por cada tipo con 0 impresiones en el
  // período — contenido fijo (searchTypeGuides.ts), no generado por LLM, así
  // que no depende de llmInsightsLoading ni tiene su propio caché: se
  // recalcula localmente en cuanto cambian los totales. Se suma DESPUÉS de
  // los insights del LLM (incluido el que agrupa "sin actividad"), nunca los
  // reemplaza.
  const guideInsights = useMemo(() => {
    if (!stats) return [];
    const statsByType = new Map(stats.map((row) => [row.type, row]));
    return SEARCH_TYPE_ORDER.filter((type) => (statsByType.get(type)?.impressions ?? 0) === 0).map((type) => {
      const guide = SEARCH_TYPE_GUIDES[type];
      return {
        key: `guide-${type}`,
        text: guide.blurb,
        link: { label: "Ver guía oficial de Google →", url: guide.docUrl },
      };
    });
  }, [stats]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Tipos de Búsqueda</h2>
      <Card className="w-full min-w-0">
      <CardHeader className="flex flex-row justify-end">
        <div className="flex gap-1">
          {METRIC_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={metric === option.value ? "default" : "ghost"}
              onClick={() => setMetric(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={cn("flex flex-col gap-6")}>
        {error ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !stats ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <>
            <SearchTypesChart stats={stats} metric={metric} />

            <div className="flex flex-col gap-1">
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
              {insightsVisible && (
                <>
                  {llmInsightsLoading ? (
                    <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                      Analizando los tipos de búsqueda…
                    </div>
                  ) : (
                    llmInsights?.map((insight, index) => {
                      const key = `llm-${index}`;
                      return (
                        !dismissedKeys.has(key) && (
                          <InsightCard
                            key={key}
                            insight={{
                              label: "Tipos de Búsqueda",
                              current: 0,
                              previous: 0,
                              variationPct: 0,
                              sentiment: insight.sentiment,
                              isSpike: false,
                              text: insight.text,
                            }}
                            onDismiss={() => setDismissedKeys((prev) => new Set(prev).add(key))}
                          />
                        )
                      );
                    })
                  )}
                  {guideInsights.map(
                    (guide) =>
                      !dismissedKeys.has(guide.key) && (
                        <InsightCard
                          key={guide.key}
                          insight={{
                            label: "Tipos de Búsqueda",
                            current: 0,
                            previous: 0,
                            variationPct: 0,
                            sentiment: "neutral",
                            isSpike: false,
                            text: guide.text,
                            link: guide.link,
                          }}
                          onDismiss={() => setDismissedKeys((prev) => new Set(prev).add(guide.key))}
                        />
                      )
                  )}
                </>
              )}
            </div>

            <SearchTypesTable stats={stats} />
          </>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
