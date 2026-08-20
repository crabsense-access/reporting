"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InsightCard } from "@/components/dashboard/InsightsList";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { InsightSentiment } from "@/lib/insights/generateInsight";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { GoalMetric, TrendPoint } from "@/lib/ga4/types";

export interface GoalLlmInsightDisplay {
  text: string;
  sentiment: InsightSentiment;
}

const AGGREGATION_OPTIONS: { value: Granularity; label: string }[] = [
  { value: "day", label: "Día" },
  { value: "week", label: "Semana" },
  { value: "month", label: "Mes" },
];

interface GoalCardProps {
  clientId: string;
  range: DateRangeValue;
  defaultGranularity: Granularity;
  goal: GoalMetric;
  llmInsight: GoalLlmInsightDisplay | null;
  llmInsightLoading: boolean;
}

export function GoalCard({ clientId, range, defaultGranularity, goal, llmInsight, llmInsightLoading }: GoalCardProps) {
  const [granularity, setGranularity] = useState<Granularity>(defaultGranularity);
  const [trend, setTrend] = useState<TrendPoint[]>(goal.trend);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insightVisible, setInsightVisible] = useState(false);

  // Si cambia el rango de fechas general llega un `goal` nuevo: volvemos a
  // la agregación por defecto y al trend que ya vino con la respuesta.
  useEffect(() => {
    setGranularity(defaultGranularity);
    setTrend(goal.trend);
    setError(null);
  }, [goal, defaultGranularity]);

  async function loadTrend(value: Granularity) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: range.from,
        to: range.to,
        granularity: value,
        goal: goal.name,
        type: goal.type,
      });
      const response = await fetch(`/api/dashboard/${clientId}/metrics?${params.toString()}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setTrend(data.goals?.[0]?.trend ?? []);
    } catch {
      setError("No se pudo actualizar el gráfico.");
    } finally {
      setLoading(false);
    }
  }

  function handleGranularityChange(value: Granularity) {
    setGranularity(value);
    if (value === defaultGranularity) {
      setTrend(goal.trend);
      setError(null);
      return;
    }
    loadTrend(value);
  }

  const isPositive = goal.variationPct >= 0;

  return (
    <Card className="w-full min-w-0">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
        <div className="flex flex-col gap-1">
          <Badge
            variant="outline"
            className={cn(
              "w-fit gap-1",
              goal.type === "primary"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-secondary bg-secondary text-secondary-foreground"
            )}
          >
            {goal.type === "primary" ? "Primario" : "Secundario"}
          </Badge>
          <CardTitle className="text-base">{goal.name}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold text-foreground">{formatNumber(goal.total)}</span>
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                isPositive ? "border-emerald-200 text-emerald-600" : "border-destructive/30 text-destructive"
              )}
            >
              {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(goal.variationPct).toFixed(1)}%
            </Badge>
          </div>
        </div>
        <div className="flex gap-1">
          {AGGREGATION_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={granularity === option.value ? "default" : "ghost"}
              onClick={() => handleGranularityChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => loadTrend(granularity)}>
              Reintentar
            </Button>
          </div>
        ) : (
          <TrendChart data={trend} loading={loading} />
        )}

        {(llmInsightLoading || llmInsight) && (
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-fit gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => setInsightVisible((v) => !v)}
            >
              <Sparkles className="h-3 w-3" />
              {insightVisible ? "Ocultar insight" : "Mostrar insight"}
            </Button>
            {insightVisible &&
              (llmInsightLoading ? (
                <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  Analizando el dato…
                </div>
              ) : (
                llmInsight && (
                  <InsightCard
                    insight={{
                      label: goal.name,
                      current: 0,
                      previous: 0,
                      variationPct: 0,
                      sentiment: llmInsight.sentiment,
                      isSpike: false,
                      text: llmInsight.text,
                    }}
                    onDismiss={() => setInsightVisible(false)}
                  />
                )
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
