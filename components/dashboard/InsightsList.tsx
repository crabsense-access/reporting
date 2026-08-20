"use client";

import { Minus, TrendingDown, TrendingUp, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Insight, InsightSentiment } from "@/lib/insights/generateInsight";
import {
  useInsightsDismiss,
  useRegisterSectionInsights,
} from "@/components/dashboard/insights-context";
import type { InsightSectionKey } from "@/components/dashboard/sidebar/nav-items";

// Sin fondo ni borde de color a propósito — solo el texto lleva el color
// del sentimiento, para que el insight se lea liviano (especialmente
// adentro de un scorecard ya de por sí chico). Los picos se marcan con el
// badge "Pico", no con más color.
const SENTIMENT_META: Record<InsightSentiment, { icon: typeof TrendingUp; text: string }> = {
  positive: { icon: TrendingUp, text: "text-emerald-700" },
  negative: { icon: TrendingDown, text: "text-destructive" },
  neutral: { icon: Minus, text: "text-muted-foreground" },
};

export interface KeyedInsight {
  insight: Insight;
  dismissKey: string;
  dismissed: boolean;
}

// Arma las dismissKeys y registra en el contexto de insights los que siguen
// visibles (para el pill del sidebar), sin renderizar nada — separado de
// <InsightsList> para que un caller pueda decidir cómo distribuir cada
// insight en su layout (ej. MetaAdsDashboard los empareja con su scorecard
// en vez de listarlos todos juntos aparte).
export function useKeyedInsights(
  insights: Insight[],
  sectionKey: InsightSectionKey,
  keyPrefix?: string
): KeyedInsight[] {
  const { isDismissed } = useInsightsDismiss();

  const keyed = insights.map((insight) => {
    const dismissKey = `${sectionKey}::${keyPrefix ?? ""}::${insight.label}`;
    return { insight, dismissKey, dismissed: isDismissed(dismissKey) };
  });

  useRegisterSectionInsights(
    sectionKey,
    keyed.filter((item) => !item.dismissed).map(({ insight }) => ({ sentiment: insight.sentiment }))
  );

  return keyed;
}

// Algunos generadores de insight (ver keyword-churn-llm-insight.ts) marcan
// las partes más relevantes del texto con **negrita** estilo markdown — acá
// se parsea esa sintaxis simple a <strong>, el resto de los generadores
// nunca emite "**" así que no les cambia nada.
function renderInsightText(text: string) {
  const parts = text.split(/(\*\*.+?\*\*)/g);
  return parts.map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    )
  );
}

// La cardcita individual (ícono + texto + botón de descarte) — extraída para
// poder reusarla tanto en <InsightsList> (todos juntos) como emparejada
// debajo de un scorecard puntual.
export function InsightCard({ insight, onDismiss }: { insight: Insight; onDismiss: () => void }) {
  const meta = SENTIMENT_META[insight.sentiment];
  const Icon = meta.icon;

  return (
    <div className={cn("flex items-start gap-2 rounded-md py-2 pl-1 pr-1 text-sm", meta.text)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span>{renderInsightText(insight.text)}</span>
        {insight.isSpike && (
          <Badge variant="outline" className={cn("border-current text-[10px] uppercase", meta.text)}>
            Pico
          </Badge>
        )}
        {insight.link && (
          <a
            href={insight.link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium underline underline-offset-2 hover:opacity-80"
          >
            {insight.link.label}
          </a>
        )}
      </div>
      <button
        type="button"
        aria-label={`Descartar: ${insight.label}`}
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface InsightsListProps {
  insights: Insight[];
  /** A qué sección del sidebar (SEO/Analítica/Ads) alimenta el pill. */
  sectionKey: InsightSectionKey;
  /** Namespacing extra para descartes únicos cuando hay varias instancias
   * de InsightsList bajo la misma sección (ej. un segmento de SEO, o
   * "goal" vs "metric" en Analítica). */
  keyPrefix?: string;
}

export function InsightsList({ insights, sectionKey, keyPrefix }: InsightsListProps) {
  const { dismiss } = useInsightsDismiss();
  const keyedInsights = useKeyedInsights(insights, sectionKey, keyPrefix);
  const visible = keyedInsights.filter((item) => !item.dismissed);

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-2">
      {visible.map(({ insight, dismissKey }) => (
        <InsightCard key={dismissKey} insight={insight} onDismiss={() => dismiss(dismissKey)} />
      ))}
    </div>
  );
}
