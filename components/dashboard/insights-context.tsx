"use client";

import * as React from "react";

import type { InsightSectionKey } from "@/components/dashboard/sidebar/nav-items";
import type { InsightSentiment } from "@/lib/insights/generateInsight";

const STORAGE_KEY = "insights-dismissed-v1";

export type SectionCounts = Record<InsightSentiment, number>;

const EMPTY_COUNTS: SectionCounts = { positive: 0, negative: 0, neutral: 0 };

type SectionsState = Partial<Record<InsightSectionKey, SectionCounts>>;

interface InsightsContextValue {
  isDismissed: (key: string) => boolean;
  dismiss: (key: string) => void;
  sections: SectionsState;
  reportSection: (
    sectionKey: InsightSectionKey,
    reporterId: string,
    insights: { sentiment: InsightSentiment }[]
  ) => void;
}

const InsightsContext = React.createContext<InsightsContextValue | null>(null);

function readDismissedFromStorage(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function countBySentiment(insights: { sentiment: InsightSentiment }[]): SectionCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const insight of insights) {
    counts[insight.sentiment] += 1;
  }
  return counts;
}

function sameCounts(a: SectionCounts | undefined, b: SectionCounts): boolean {
  return !!a && a.positive === b.positive && a.negative === b.negative && a.neutral === b.neutral;
}

function aggregateSections(byReporter: Record<string, Record<string, SectionCounts>>): SectionsState {
  const result: SectionsState = {};
  for (const [sectionKey, reporters] of Object.entries(byReporter)) {
    const total = { ...EMPTY_COUNTS };
    for (const reporter of Object.values(reporters)) {
      total.positive += reporter.positive;
      total.negative += reporter.negative;
      total.neutral += reporter.neutral;
    }
    if (total.positive > 0 || total.negative > 0 || total.neutral > 0) {
      result[sectionKey as InsightSectionKey] = total;
    }
  }
  return result;
}

export function InsightsProvider({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());
  const [byReporter, setByReporter] = React.useState<Record<string, Record<string, SectionCounts>>>({});

  React.useEffect(() => {
    setDismissed(readDismissedFromStorage());
  }, []);

  const dismiss = React.useCallback((key: string) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(key);
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // sessionStorage puede fallar en modo privado/incógnito — el
        // descarte sigue funcionando en memoria para esta carga de página.
      }
      return next;
    });
  }, []);

  const reportSection = React.useCallback(
    (sectionKey: InsightSectionKey, reporterId: string, insights: { sentiment: InsightSentiment }[]) => {
      setByReporter((prev) => {
        const counts = countBySentiment(insights);
        if (sameCounts(prev[sectionKey]?.[reporterId], counts)) {
          return prev; // sin cambios reales: evita un re-render/loop innecesario
        }
        return {
          ...prev,
          [sectionKey]: { ...prev[sectionKey], [reporterId]: counts },
        };
      });
    },
    []
  );

  const sections = React.useMemo(() => aggregateSections(byReporter), [byReporter]);

  const value = React.useMemo<InsightsContextValue>(
    () => ({
      isDismissed: (key: string) => dismissed.has(key),
      dismiss,
      sections,
      reportSection,
    }),
    [dismissed, dismiss, sections, reportSection]
  );

  return <InsightsContext.Provider value={value}>{children}</InsightsContext.Provider>;
}

function useInsightsContext(): InsightsContextValue {
  const ctx = React.useContext(InsightsContext);
  if (!ctx) throw new Error("useInsights* debe usarse dentro de <InsightsProvider>");
  return ctx;
}

export function useInsightsDismiss() {
  const { isDismissed, dismiss } = useInsightsContext();
  return { isDismissed, dismiss };
}

/** Solo lectura — usado por el sidebar para pintar los pills. */
export function useInsightsSections(): SectionsState {
  return useInsightsContext().sections;
}

/**
 * Registra (y desregistra al desmontar) los insights de una instancia de
 * <InsightsList> bajo una sección, agrupados por sentimiento (positivo/
 * negativo/neutral) — cada bucket se muestra como su propio pill, no se
 * mezclan en uno solo. Varias instancias pueden reportar a la misma sección
 * (ej. Analítica tiene métricas + goals, SEO tiene una por segmento) —
 * se identifican por `reporterId` para sumar bien en vez de pisarse entre sí.
 */
export function useRegisterSectionInsights(
  sectionKey: InsightSectionKey,
  insights: { sentiment: InsightSentiment }[]
) {
  const reporterId = React.useId();
  const { reportSection } = useInsightsContext();

  React.useEffect(() => {
    // `reportSection` bails out internally si los conteos no cambiaron, así
    // que re-ejecutar esto en cada render (insights es un array nuevo cada
    // vez) es inofensivo — solo vuelve a registrar el mismo valor.
    reportSection(sectionKey, reporterId, insights);
  });

  React.useEffect(() => {
    return () => reportSection(sectionKey, reporterId, []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, reporterId]);
}
