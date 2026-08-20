"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsList } from "@/components/dashboard/InsightsList";
import type { InsightSentiment } from "@/lib/insights/generateInsight";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import type { DateRangeValue } from "@/lib/date-range";
import type {
  SeoDecliningMetric,
  SeoDecliningPageStat,
  SeoDecliningPagesMultiWindowResult,
  SeoDecliningPagesWindowResult,
} from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoDecliningPagesResponse {
  connected: boolean;
  result: SeoDecliningPagesMultiWindowResult | null;
}

interface SeoDecliningPagesBlockProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
}

// No se importa DECLINE_WINDOW_OPTIONS como valor desde lib/gsc/reports.ts a
// propósito: ese módulo arrastra googleapis (server-only) y rompería el
// bundle del cliente — mismo criterio ya usado en otros bloques de esta
// hoja. El selector reemplaza al rango global para este bloque: cambiar de
// botón NO vuelve a pedir datos, las 5 ventanas ya vienen juntas en la
// respuesta (ver fetchDecliningPagesWindows).
const WINDOW_OPTIONS = [7, 15, 30, 60, 90] as const;
const DEFAULT_WINDOW_DAYS = 30;

// Mismo formato "dd-M-aaaa" ya usado para mostrar rangos de fecha en el
// resto de la hoja Páginas (ver formatWindowDate en PageChurnCard.tsx).
function formatRangeDate(iso: string): string {
  return format(parseISO(iso), "dd-M-yyyy");
}

// Réplica en el cliente de subDaysIso (lib/gsc/reports.ts, server-only) —
// misma aritmética de fechas, para que el header "Comparando..." esté
// SIEMPRE visible (calculado desde `range.to` + la ventana elegida) sin
// esperar la respuesta del servidor, y cambie al instante al tocar un botón.
function subDaysIso(dateIso: string, days: number): string {
  return format(subDays(parseISO(dateIso), days), "yyyy-MM-dd");
}

function computeWindowRange(rangeEnd: string, windowDays: number): { current: DateRangeValue; previous: DateRangeValue } {
  const currentFrom = subDaysIso(rangeEnd, windowDays - 1);
  return {
    current: { from: currentFrom, to: rangeEnd },
    previous: { from: subDaysIso(currentFrom, windowDays), to: subDaysIso(currentFrom, 1) },
  };
}

// "https://sitio.com/blog/nota" -> "/blog/nota" — mismo criterio ya usado en
// SeoTopPagesBlock (pagePathLabel) para no repetir el dominio en cada
// tarjeta; si la URL no parsea, se muestra tal cual llegó.
function pagePathLabel(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

// No se importa DECLINE_METRIC_PRIORITY como valor desde lib/gsc/reports.ts
// a propósito (googleapis, server-only) — mismo orden que usa el backend
// para elegir la métrica protagonista de cada tarjeta.
const METRIC_ORDER: SeoDecliningMetric[] = ["impressions", "clicks", "ctr", "position"];
const METRIC_LABELS: Record<SeoDecliningMetric, string> = {
  impressions: "Impresiones",
  clicks: "Clicks",
  ctr: "CTR",
  position: "Posición",
};

// % de caída (positivo) — misma fórmula que dropPct en lib/gsc/reports.ts,
// redeclarada acá porque ese módulo no se puede importar como valor desde
// un componente cliente.
function dropPct(previous: number, current: number): number {
  return previous > 0 ? ((previous - current) / previous) * 100 : 0;
}

function qualifiesByMetricMap(stat: SeoDecliningPageStat): Record<SeoDecliningMetric, boolean> {
  return {
    impressions: stat.qualifiesByImpressions,
    clicks: stat.qualifiesByClicks,
    ctr: stat.qualifiesByCtr,
    position: stat.qualifiesByPosition,
  };
}

function decliningPagesSentiment(result: SeoDecliningPagesWindowResult): InsightSentiment {
  return result.pages.length === 0 ? "positive" : "negative";
}

// La página con más métricas caídas a la vez (o, a igualdad, la de mayor
// caída en su métrica protagonista) entre las que califican —
// result.pages[0], ya que el backend ya viene ordenado así.
function decliningPagesText(result: SeoDecliningPagesWindowResult): string {
  if (result.pages.length === 0) return `No se detectaron páginas perdiendo terreno en los últimos ${result.windowDays} días.`;

  const top = result.pages[0]!;
  const label = pagePathLabel(top.page);

  if (top.qualifyingMetricsCount >= 2) {
    const metricNames = METRIC_ORDER.filter((metric) => qualifiesByMetricMap(top)[metric]).map((metric) => METRIC_LABELS[metric]);
    return `La página **${label}** cayó en **${top.qualifyingMetricsCount} de 4** métricas este período: **${metricNames.join(", ")}**.`;
  }

  switch (top.protagonistMetric) {
    case "impressions": {
      const pct = Math.round(dropPct(top.impressionsPrevious, top.impressionsCurrent));
      return `La página **${label}** perdió el **${pct}%** de sus impresiones (de **${formatNumber(top.impressionsPrevious)}** a **${formatNumber(top.impressionsCurrent)}**).`;
    }
    case "clicks": {
      const pct = Math.round(dropPct(top.clicksPrevious, top.clicksCurrent));
      return `La página **${label}** perdió el **${pct}%** de sus clicks (de **${formatNumber(top.clicksPrevious)}** a **${formatNumber(top.clicksCurrent)}**).`;
    }
    case "ctr": {
      const pct = Math.round(dropPct(top.ctrPrevious, top.ctrCurrent));
      return `La página **${label}** tuvo una caída del **${pct}%** en su CTR (de **${formatPercent(top.ctrPrevious)}** a **${formatPercent(top.ctrCurrent)}**).`;
    }
    case "position":
      return `La página **${label}** cayó de posición **${formatDecimal(top.positionPrevious)}** a **${formatDecimal(top.positionCurrent)}**.`;
  }
}

// Chip de flecha roja + delta — mismo lenguaje visual para las 4 métricas,
// sea cual sea la protagonista de la tarjeta.
function DropBadge({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-0.5 text-base font-semibold text-destructive">
      <ArrowDown className="h-4 w-4" />
      {label}
    </span>
  );
}

// Línea protagonista: la primera métrica (en orden Impresiones > Clicks >
// CTR > Posición) que efectivamente cayó para esta página — ver
// protagonistMetric en lib/gsc/reports.ts.
function ProtagonistLine({ stat }: { stat: SeoDecliningPageStat }) {
  if (stat.protagonistMetric === "impressions") {
    const pct = Math.round(dropPct(stat.impressionsPrevious, stat.impressionsCurrent));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-foreground">
          {formatNumber(stat.impressionsPrevious)} impresiones → {formatNumber(stat.impressionsCurrent)} impresiones
        </span>
        <DropBadge label={`-${pct}%`} />
      </div>
    );
  }

  if (stat.protagonistMetric === "clicks") {
    const pct = Math.round(dropPct(stat.clicksPrevious, stat.clicksCurrent));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-foreground">
          {formatNumber(stat.clicksPrevious)} clics → {formatNumber(stat.clicksCurrent)} clics
        </span>
        <DropBadge label={`-${pct}%`} />
      </div>
    );
  }

  if (stat.protagonistMetric === "ctr") {
    const pct = Math.round(dropPct(stat.ctrPrevious, stat.ctrCurrent));
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-foreground">
          CTR {formatPercent(stat.ctrPrevious)} → {formatPercent(stat.ctrCurrent)}
        </span>
        <DropBadge label={`-${pct}%`} />
      </div>
    );
  }

  const positionsDropped = Math.max(1, Math.round(stat.positionCurrent) - Math.round(stat.positionPrevious));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-lg font-semibold text-foreground">
        Antes aparecía en el puesto {formatNumber(Math.round(stat.positionPrevious))} de Google, ahora en el{" "}
        {formatNumber(Math.round(stat.positionCurrent))}
      </span>
      <DropBadge label={`-${formatNumber(positionsDropped)} puestos`} />
    </div>
  );
}

function metricTagValue(stat: SeoDecliningPageStat, metric: SeoDecliningMetric): string {
  if (metric === "impressions") return `impresiones -${formatNumber(Math.abs(stat.deltaImpressions))}`;
  if (metric === "clicks") return `clics -${formatNumber(Math.abs(stat.deltaClicks))}`;
  if (metric === "ctr") return `ctr -${Math.round(dropPct(stat.ctrPrevious, stat.ctrCurrent))}%`;
  const positionsDropped = Math.max(1, Math.round(stat.positionCurrent) - Math.round(stat.positionPrevious));
  return `posición -${formatNumber(positionsDropped)} puestos`;
}

// Tags SIEMPRE visibles (sin ocultar detrás de ningún click) por cada
// métrica que también haya caído, aparte de la protagonista. Vacío si la
// página calificó por una sola métrica.
function DecliningPageTags({ stat }: { stat: SeoDecliningPageStat }) {
  const qualifies = qualifiesByMetricMap(stat);
  const secondaryMetrics = METRIC_ORDER.filter((metric) => metric !== stat.protagonistMetric && qualifies[metric]);
  if (secondaryMetrics.length === 0) return null;

  return (
    <p className="text-xs text-muted-foreground">También bajó: {secondaryMetrics.map((metric) => metricTagValue(stat, metric)).join(" · ")}</p>
  );
}

// Tarjeta por página: la línea protagonista es la primera métrica (en orden
// Impresiones > Clicks > CTR > Posición) que efectivamente cayó, y debajo,
// si corresponde, los tags de las otras métricas que también cayeron.
function DecliningPageCard({ stat }: { stat: SeoDecliningPageStat }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <span className="min-w-0 truncate text-sm font-medium text-foreground" title={stat.page}>
        {pagePathLabel(stat.page)}
      </span>
      <ProtagonistLine stat={stat} />
      <DecliningPageTags stat={stat} />
    </div>
  );
}

// Bloque "Páginas en Declive" (SEO > Páginas > Páginas en Declive) — tarjetas
// de texto simple (sin gráficos ni números con signo) sobre las páginas que
// están perdiendo terreno, comparando una ventana propia (7/15/30/60/90
// días, selector arriba) contra la ventana anterior de igual longitud. El
// selector reemplaza al rango global para este bloque: solo se vuelve a
// pedir datos si cambia clientId/segmento/la fecha "hasta" del rango global
// (el ancla) — cambiar de botón de ventana es instantáneo, las 5 ventanas ya
// vienen calculadas juntas (ver fetchDecliningPagesWindows).
export function SeoDecliningPagesBlock({ clientId, range, segment }: SeoDecliningPagesBlockProps) {
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const [data, setData] = useState<SeoDecliningPagesMultiWindowResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ to: range.to, segment });
    fetch(`/api/dashboard/${clientId}/seo/pages/declining?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudieron cargar las páginas en declive.");
        }
        return (await response.json()) as SeoDecliningPagesResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json.result);
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
  }, [clientId, range.to, segment]);

  const activeResult = data?.windows.find((w) => w.windowDays === windowDays) ?? null;

  // Calculado localmente (no desde `activeResult`) para que el header y los
  // botones no dependan de la respuesta del servidor.
  const { current: currentRange, previous: previousRange } = useMemo(() => computeWindowRange(range.to, windowDays), [range.to, windowDays]);

  const insight = activeResult
    ? {
        label: "Páginas en declive",
        current: 0,
        previous: 0,
        variationPct: 0,
        sentiment: decliningPagesSentiment(activeResult),
        isSpike: false,
        text: decliningPagesText(activeResult),
      }
    : null;

  const hasDecliningPages = (activeResult?.pages.length ?? 0) > 0;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Páginas en Declive</h2>
      <Card className="w-full min-w-0">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">
            Comparando {formatRangeDate(currentRange.from)} - {formatRangeDate(currentRange.to)} vs. {formatRangeDate(previousRange.from)} -{" "}
            {formatRangeDate(previousRange.to)}
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {WINDOW_OPTIONS.map((days) => {
            const count = data?.windows.find((w) => w.windowDays === days)?.pages.length;
            return (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={windowDays === days ? "default" : "outline"}
                onClick={() => setWindowDays(days)}
              >
                {days} días{count !== undefined ? ` (${count})` : ""}
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {error ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !activeResult ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {insight && <InsightsList insights={[insight]} sectionKey="seo" keyPrefix="declining_pages" />}

            {hasDecliningPages ? (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-muted-foreground">Páginas que están perdiendo terreno</span>
                  <span className="text-2xl font-semibold text-foreground">{formatNumber(activeResult.pages.length)}</span>
                </div>
                <div className="flex flex-col gap-3">
                  {activeResult.pages.map((stat) => (
                    <DecliningPageCard key={stat.page} stat={stat} />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No se detectaron páginas perdiendo terreno en los últimos {windowDays} días.</p>
            )}
          </>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
