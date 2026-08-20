import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";

const SENTIMENT_META: Record<
  InsightSentiment,
  { icon: typeof TrendingUp; border: string; bg: string; spikeBg: string; text: string }
> = {
  positive: {
    icon: TrendingUp,
    border: "border-emerald-400",
    bg: "bg-emerald-50",
    spikeBg: "bg-emerald-100",
    text: "text-emerald-700",
  },
  negative: {
    icon: TrendingDown,
    border: "border-destructive/50",
    bg: "bg-destructive/5",
    spikeBg: "bg-destructive/10",
    text: "text-destructive",
  },
  neutral: {
    icon: Minus,
    border: "border-border",
    bg: "bg-secondary/40",
    spikeBg: "bg-secondary/70",
    text: "text-muted-foreground",
  },
};

// Versión de solo lectura de InsightsList para el mockup: sin descarte ni
// contexto compartido, para no pisar el sessionStorage de dismiss del
// dashboard real cuando ambos se navegan en el mismo browser.
export function MockupInsights({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
      {insights.map((insight) => {
        const meta = SENTIMENT_META[insight.sentiment];
        const Icon = meta.icon;

        return (
          <div
            key={insight.label}
            className={cn(
              "flex items-start gap-2 rounded-md border-l-4 px-3 py-2 text-sm",
              meta.border,
              meta.text,
              insight.isSpike ? meta.spikeBg : meta.bg,
              insight.isSpike && "border-l-[6px]"
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{insight.text}</span>
          </div>
        );
      })}
    </div>
  );
}
