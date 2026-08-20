"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { ScorecardInfoAccordion } from "@/components/dashboard/ScorecardInfoAccordion";
import { ScorecardTrendLineChart, type ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { formatInsightValue, generateInsight, type Insight, type InsightFormat } from "@/lib/insights/generateInsight";
import type { InsightSectionKey } from "@/components/dashboard/sidebar/nav-items";
import { cn } from "@/lib/utils";
import type { Granularity } from "@/lib/date-range";

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

export interface MetricScorecardConfig {
  /** Único dentro del grupo — también se usa como key de selección por defecto. */
  key: string;
  label: string;
  currentValue: number;
  previousValue: number;
  format: InsightFormat;
  /** Obligatorio (y solo usado) cuando format === "currency". */
  currencyCode?: string;
  /** true si un aumento es bueno (clics, impresiones, conversiones...), false si un aumento es malo (costo, CPC, CPM, posición promedio...) — define el color del badge vía generateInsight(), NO la dirección de la flecha. */
  higherIsBetter: boolean;
  infoText: string;
  /** Trae los puntos YA formados (label + value) para el gráfico de tendencia individual de esta tarjeta, según la agregación elegida en su propio selector Día/Semana/Mes. Debe ser una referencia estable (useCallback/useMemo) del lado del caller — si cambia en cada render, esta tarjeta vuelve a pedir datos en cada render. */
  fetchTrend: (granularity: Granularity) => Promise<ScorecardTrendPoint[]>;
  defaultGranularity?: Granularity;
  /** Formatea el tooltip del gráfico individual — por defecto el mismo formatter que el valor grande de la tarjeta. Solo hace falta pasar esto si el tooltip necesita un sufijo (ej. "150 keywords"). */
  formatChartValue?: (value: number) => string;
  /** Decimales del "(X%)" del badge — por defecto 1. Algunos bloques ya existentes redondean a 0 (ver Prompt 92, refactor). */
  variationPctDecimals?: number;
  /** Contenido extra, al pie de la tarjeta, después del acordeón Info — para casos como "Rendimiento en Búsqueda" (SeoDashboard) que ya traían una línea de contexto y un desglose fijo debajo del acordeón. La mayoría de los usos no lo necesita. */
  renderExtra?: () => ReactNode;
}

export interface MetricScorecardGroupProps {
  metrics: MetricScorecardConfig[];
  /** Selección CONTROLADA por el padre — pasar esto (junto con onSelectedKeyChange) cuando algo AFUERA del grupo también necesita saber qué tarjeta está elegida (ej. el gráfico de barras compartido de Meta Ads/SEO Visión General, que vive fuera de este componente pero depende de la misma selección). Si no se pasa, el grupo maneja su propia selección interna. */
  selectedKey?: string;
  onSelectedKeyChange?: (key: string) => void;
  /** Key de la tarjeta seleccionada por defecto en modo no controlado — por defecto la primera de la lista. Ignorado si se pasa selectedKey. */
  defaultSelectedKey?: string;
  /** Dado el key de la tarjeta seleccionada, devuelve el insight único de debajo de la fila (o null para no mostrar nada esa vez). Si no se pasa, el grupo no muestra insight — algunos usos existentes (ver Prompt 92) no tenían insight propio acá y no deben ganar uno nuevo. */
  getInsight?: (selectedKey: string) => Insight | null;
  /** A qué sección del sidebar alimenta el pill de insights (ver InsightsList) — solo se usa si getInsight está presente. */
  sectionKey?: InsightSectionKey;
  keyPrefix?: string;
  /** Clases del grid — por defecto 1 col en mobile, hasta 4 en desktop. Pasar "grid grid-cols-1" para grupos de 1 sola tarjeta a ancho completo. */
  gridClassName?: string;
}

function ScorecardCard({
  metric,
  isSelected,
  onSelect,
}: {
  metric: MetricScorecardConfig;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const formatValue = (value: number) => formatInsightValue(value, metric.format, metric.currencyCode);
  const formatChartValue = metric.formatChartValue ?? formatValue;

  const insight = generateInsight({
    label: metric.label,
    current: metric.currentValue,
    previous: metric.previousValue,
    format: metric.format,
    currencyCode: metric.currencyCode,
    higherIsBetter: metric.higherIsBetter,
  });
  const delta = metric.currentValue - metric.previousValue;
  // La flecha muestra la dirección REAL del cambio — el color del badge (ver
  // className más abajo) es lo que refleja si esa dirección es buena o mala
  // según metric.higherIsBetter (insight.sentiment). Antes de este componente
  // varios de estos scorecards usaban esta misma variable (`isPositive`) para
  // las dos cosas, así que el badge de color siempre salía verde con subas
  // aunque la métrica fuera "mayor es peor" (Costo, CPC, CPM...) — ese es el
  // bug que este componente corrige de raíz (Prompt 92).
  const rose = delta >= 0;

  const [cardGranularity, setCardGranularity] = useState<Granularity>(metric.defaultGranularity ?? "day");
  const [cardSeries, setCardSeries] = useState<ScorecardTrendPoint[]>([]);
  const [cardLoading, setCardLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCardLoading(true);
    metric.fetchTrend(cardGranularity)
      .then((points) => {
        if (!cancelled) setCardSeries(points);
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric.key, metric.fetchTrend, cardGranularity]);

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "w-full min-w-0 cursor-pointer transition-colors",
        isSelected ? "border-2 border-primary" : "hover:border-muted-foreground/40"
      )}
    >
      <CardContent className="flex flex-col gap-2 pt-6">
        <div className="mb-2 flex flex-col gap-1.5">
          <p className="whitespace-nowrap text-sm font-bold text-foreground">{metric.label}</p>
          <div className="flex flex-col items-start gap-1">
            <span className="text-2xl font-semibold text-foreground">{formatValue(metric.currentValue)}</span>
            <Badge
              className={cn(
                "gap-1 border-transparent",
                insight.sentiment === "neutral"
                  ? "bg-muted text-muted-foreground"
                  : insight.sentiment === "positive"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-red-50 text-red-700"
              )}
            >
              {rose ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {delta >= 0 ? "+" : "−"}
              {formatValue(Math.abs(delta))} ({Math.abs(insight.variationPct).toFixed(metric.variationPctDecimals ?? 1)}%)
            </Badge>
          </div>
        </div>
        <div onClick={(event) => event.stopPropagation()} className="flex flex-col gap-2">
          <div className="flex gap-1">
            {AGGREGATION_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                className="h-7 px-2 text-xs uppercase"
                variant={cardGranularity === option.value ? "default" : "ghost"}
                onClick={() => setCardGranularity(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <ScorecardTrendLineChart data={cardSeries} loading={cardLoading} formatValue={formatChartValue} />
        </div>
        <ScorecardInfoAccordion text={metric.infoText} />
        {metric.renderExtra?.()}
      </CardContent>
    </Card>
  );
}

// Componente compartido (Prompt 92) para el patrón "fila de N scorecards +
// insight único debajo, que se recalcula según cuál esté seleccionada" que
// se venía duplicando (con leves inconsistencias, ver el bug de color del
// badge más arriba) en cada hoja que lo necesitaba. Selección tipo radio:
// una sola tarjeta seleccionada a la vez, la primera por defecto.
export function MetricScorecardGroup({
  metrics,
  selectedKey: controlledSelectedKey,
  onSelectedKeyChange,
  defaultSelectedKey,
  getInsight,
  sectionKey,
  keyPrefix,
  gridClassName = "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4",
}: MetricScorecardGroupProps) {
  const isControlled = controlledSelectedKey !== undefined;
  const [internalSelectedKey, setInternalSelectedKey] = useState(defaultSelectedKey ?? metrics[0]?.key ?? "");
  const selectedKey = isControlled ? controlledSelectedKey : internalSelectedKey;
  // Se incrementa en CADA click, incluso re-seleccionando la misma tarjeta —
  // participa del keyPrefix de abajo para que el botón "x" del insight nunca
  // quede oculto de forma permanente: cualquier click en el grupo (aunque
  // sea sobre la tarjeta ya seleccionada) lo vuelve a mostrar.
  const [selectionVersion, setSelectionVersion] = useState(0);

  function handleSelect(key: string) {
    if (!isControlled) setInternalSelectedKey(key);
    onSelectedKeyChange?.(key);
    setSelectionVersion((version) => version + 1);
  }

  const insight = useMemo(() => (getInsight ? getInsight(selectedKey) : null), [getInsight, selectedKey]);

  return (
    <div className="flex flex-col gap-4">
      <div className={gridClassName}>
        {metrics.map((metric) => (
          <ScorecardCard key={metric.key} metric={metric} isSelected={selectedKey === metric.key} onSelect={() => handleSelect(metric.key)} />
        ))}
      </div>
      {insight && sectionKey && (
        <InsightsList insights={[insight]} sectionKey={sectionKey} keyPrefix={`${keyPrefix ?? "scorecard-group"}-v${selectionVersion}`} />
      )}
    </div>
  );
}
