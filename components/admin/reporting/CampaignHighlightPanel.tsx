"use client";

// Panel de 2 hallazgos para el ranking de campañas: "Mejor campaña" (mejor CPL del mes) y
// "Oportunidad de mejora" (peor CPL), redactados por Claude a partir de las métricas de esas dos
// campañas puntuales — ya elegidas en CampaignAnalysis.tsx por CPL, Claude sólo escribe el texto
// (ver lib/reports/chartInsights.ts — generateCampaignHighlights — y app/api/reporting/
// chart-insights/route.ts). A diferencia de ChartInsightByTypePanel, acá el color de cada tarjeta
// es semántico (verde = mejor, ámbar = a mejorar), no el color del tipo de campaña — el tipo se
// muestra igual, como referencia, con un punto de color chico junto al nombre.

import { useEffect, useState } from "react";

const ROLE_COLOR: Record<"mejor" | "peor", string> = {
  mejor: "#059669", // emerald-600
  peor: "#d97706", // amber-600
};

const ROLE_BADGE: Record<"mejor" | "peor", string> = {
  mejor: "Mejor CPL del mes",
  peor: "Oportunidad de mejora",
};

export interface ChartInsightHighlight {
  label: string;
  value: string;
}

export interface CampaignHighlight {
  rol: "mejor" | "peor";
  nombre: string;
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
}

type InsightState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: CampaignHighlight[] };

export function CampaignHighlightPanel({
  chart = "campaign-highlights",
  metrics,
  dotColorForCampaign,
  monthIsComplete,
  clientId,
}: {
  chart?: string;
  metrics: unknown;
  dotColorForCampaign?: (nombre: string) => string | undefined;
  /** true cuando el mes que están mostrando estas métricas ya terminó — sólo entonces la ruta cachea la respuesta de Claude (ver app/api/reporting/chart-insights/route.ts). */
  monthIsComplete: boolean;
  clientId?: string;
}) {
  const [state, setState] = useState<InsightState>({ status: "loading" });
  const metricsKey = JSON.stringify(metrics);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch("/api/reporting/chart-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart, metrics: JSON.parse(metricsKey), monthIsComplete, clientId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errorBody?.error ?? `Error ${response.status} al generar el resumen.`);
        }
        return response.json() as Promise<{ items: CampaignHighlight[] }>;
      })
      .then(({ items }) => {
        if (!cancelled) setState({ status: "ready", items });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : "Error desconocido." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, metricsKey, monthIsComplete, clientId]);

  if (state.status === "loading") {
    return (
      <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">No se pudo generar el resumen con IA ({state.message}).</span>
      </div>
    );
  }

  // "mejor" primero siempre, sea cual sea el orden en que respondió la API.
  const ordered = [...state.items].sort((a, b) => (a.rol === "mejor" ? -1 : 1) - (b.rol === "mejor" ? -1 : 1));

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
      {ordered.map((item) => {
        const color = ROLE_COLOR[item.rol];
        const dotColor = dotColorForCampaign?.(item.nombre);
        return (
          <div
            key={item.rol}
            className="flex flex-col gap-2 rounded-lg border-2 p-3"
            style={{ borderColor: color, backgroundColor: `${color}0d` }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {dotColor && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dotColor }} />}
                {item.nombre}
              </span>
              <span
                className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ color, backgroundColor: `${color}1a` }}
              >
                {ROLE_BADGE[item.rol]}
              </span>
            </div>

            <span className="text-base font-bold text-foreground">{item.headline}</span>

            {item.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {item.highlights.map((highlight, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                    style={{ borderColor: color, backgroundColor: `${color}1a` }}
                  >
                    <span className="text-muted-foreground">{highlight.label}:</span>
                    <span className="font-semibold" style={{ color }}>
                      {highlight.value}
                    </span>
                  </span>
                ))}
              </div>
            )}

            <p className="text-xs leading-relaxed text-foreground">{item.body}</p>
          </div>
        );
      })}
    </div>
  );
}
