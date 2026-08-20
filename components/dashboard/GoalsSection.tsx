import { GoalCard } from "@/components/dashboard/GoalCard";
import type { CachedInsight } from "@/lib/insights/insight-cache";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { GoalMetric } from "@/lib/ga4/types";

interface GoalsSectionProps {
  clientId: string;
  range: DateRangeValue;
  defaultGranularity: Granularity;
  goals: GoalMetric[];
  llmInsights: Record<string, CachedInsight> | null;
  llmInsightsLoading: boolean;
}

export function GoalsSection({
  clientId,
  range,
  defaultGranularity,
  goals,
  llmInsights,
  llmInsightsLoading,
}: GoalsSectionProps) {
  const primary = goals.filter((goal) => goal.type === "primary");
  const secondary = goals.filter((goal) => goal.type === "secondary");
  const orderedGoals = [...primary, ...secondary];

  if (orderedGoals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este cliente todavía no tiene objetivos configurados en su conexión GA4.
      </p>
    );
  }

  return (
    <section className="flex w-full flex-col gap-4">
      <h2 className="text-lg font-semibold text-foreground">Objetivos</h2>
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-6">
        {orderedGoals.map((goal) => {
          const cached = llmInsights?.[goal.name];
          return (
            <GoalCard
              key={`${goal.type}-${goal.name}`}
              clientId={clientId}
              range={range}
              defaultGranularity={defaultGranularity}
              goal={goal}
              llmInsight={cached ? { text: cached.text, sentiment: cached.sentiment } : null}
              llmInsightLoading={llmInsightsLoading && !cached}
            />
          );
        })}
      </div>
    </section>
  );
}
