"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InsightCard, type KeyedInsight } from "@/components/dashboard/InsightsList";
import { formatBucketLabel } from "@/components/dashboard/GoogleAdsTrendChart";
import { cn } from "@/lib/utils";
import type { InsightSentiment } from "@/lib/insights/generateInsight";
import type { GoogleAdsMetricKey } from "@/components/dashboard/GoogleAdsTrendChart";
import type { GoogleAdsTimeSeriesPoint } from "@/lib/google-ads/reports";

export const SENTIMENT_TEXT_CLASS: Record<InsightSentiment, string> = {
  positive: "text-emerald-600",
  negative: "text-destructive",
  neutral: "text-muted-foreground",
};

export function formatSigned(value: number, formatAbs: (absValue: number) => string): string {
  if (value > 0) return `+${formatAbs(value)}`;
  if (value < 0) return `−${formatAbs(Math.abs(value))}`;
  return formatAbs(0);
}

export function sentimentFromVariation(
  current: number,
  previous: number | null,
  higherIsBetter: boolean
): InsightSentiment {
  if (previous === null || previous === 0) return "neutral";
  const variationPct = ((current - previous) / previous) * 100;
  const classificationPct = higherIsBetter ? variationPct : -variationPct;
  if (Math.abs(classificationPct) < 5) return "neutral";
  return classificationPct > 0 ? "positive" : "negative";
}

export function buildMiniSeries(points: GoogleAdsTimeSeriesPoint[], key: GoogleAdsMetricKey) {
  return points.map((point) => ({ label: formatBucketLabel(point.date), value: point[key] as number }));
}

export interface LlmInsightDisplay {
  text: string;
  sentiment: InsightSentiment;
}

interface GoogleAdsMetricCardProps {
  metricKey: GoogleAdsMetricKey;
  label: string;
  value: string;
  formatValue: (value: number) => string;
  chartData: { label: string; value: number }[];
  /** Solo alimenta el % de variación de arriba — el insight en texto de abajo es el de llmInsight. */
  keyedInsight: KeyedInsight | undefined;
  llmInsight: LlmInsightDisplay | null;
  llmInsightLoading: boolean;
  color: string | null;
  onSelect: (key: GoogleAdsMetricKey) => void;
}

// Scorecard autocontenido, mismo diseño que MetaAdsMetricCard: valor +
// variación vs. período anterior + mini gráfico de barras + insight real
// generado por LLM (cruza los 8 desgloses de Google Ads, ver
// lib/insights/google-ads-llm-insight.ts). El insight arranca oculto por
// defecto, un botón lo despliega/oculta.
export function GoogleAdsMetricCard({
  metricKey,
  label,
  value,
  formatValue,
  chartData,
  keyedInsight,
  llmInsight,
  llmInsightLoading,
  color,
  onSelect,
}: GoogleAdsMetricCardProps) {
  const variationInsight = keyedInsight?.insight;
  const delta = variationInsight ? variationInsight.current - variationInsight.previous : 0;
  const [insightVisible, setInsightVisible] = useState(false);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onSelect(metricKey)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(metricKey);
        }
      }}
      aria-pressed={color !== null}
      style={color ? { boxShadow: `0 0 0 2px ${color}` } : undefined}
      className="flex cursor-pointer flex-col gap-2 p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-sm font-medium text-muted-foreground">{label}</span>

      <div className="flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold text-foreground">{value}</span>
        {variationInsight && (
          <span className={cn("text-xs font-medium", SENTIMENT_TEXT_CLASS[variationInsight.sentiment])}>
            {formatSigned(variationInsight.variationPct, (v) => `${v.toFixed(1)}%`)} (
            {formatSigned(delta, formatValue)})
          </span>
        )}
      </div>

      <div className="h-12 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" hide />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))" }}
              formatter={(v) => formatValue(Number(v))}
              labelFormatter={(bucketLabel) => bucketLabel}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--card))",
                fontSize: 12,
                padding: "4px 8px",
              }}
            />
            <Bar dataKey="value" fill="hsl(var(--primary))" fillOpacity={0.55} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {(llmInsightLoading || llmInsight) && (
        <div onClick={(event) => event.stopPropagation()} className="flex flex-col gap-1">
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
                    label,
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
    </Card>
  );
}
