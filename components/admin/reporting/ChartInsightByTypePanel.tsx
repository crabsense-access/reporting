"use client";

// Igual que ChartInsightPanel, pero para gráficos con más de un tipo/segmento
// (ej. "Leads y CPL por tipo de campaña"): en vez de un único resumen combinado,
// le pide a Claude un hallazgo INDEPENDIENTE por cada tipo, y destaca visualmente
// el que tiene mejor performance (ver lib/reports/chartInsights.ts —
// generateChartInsightsByType — y app/api/reporting/chart-insights/route.ts).
//
// El color de cada tarjeta se decide por su propio tipo (vía colorForTipo), nunca
// por el tipo que el usuario tenga seleccionado en el toggle del gráfico — así los
// hallazgos no cambian de color ni se vuelven a pedir cuando sólo se cambia el
// toggle de CPL del gráfico.

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface ChartInsightHighlight {
  label: string;
  value: string;
}

export interface ChartInsightByType {
  tipo: string;
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
  esMejor: boolean;
}

type InsightState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: ChartInsightByType[] };

export function ChartInsightByTypePanel({
  chart,
  metrics,
  colorForTipo,
  monthIsComplete,
  clientId,
}: {
  chart: string;
  metrics: unknown;
  colorForTipo: (tipo: string) => string;
  /** true cuando el mes que están mostrando estas métricas ya terminó — sólo entonces la ruta cachea la respuesta de Claude (ver app/api/reporting/chart-insights/route.ts). */
  monthIsComplete: boolean;
  clientId?: string;
}) {
  const [state, setState] = useState<InsightState>({ status: "loading" });
  // Las métricas son un objeto nuevo en cada render (vienen de un useMemo del gráfico), así que se
  // compara por su JSON para no re-pedir el insight salvo que el contenido realmente cambie.
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
        return response.json() as Promise<{ items: ChartInsightByType[] }>;
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
      <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-5 w-4/5 animate-pulse rounded bg-muted" />
            <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
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

  return (
    <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-3">
      {state.items.map((item) => {
        const color = colorForTipo(item.tipo);
        return (
          <div
            key={item.tipo}
            className={cn("flex flex-col gap-2 rounded-lg p-3", item.esMejor ? "border-2" : "border border-border")}
            style={item.esMejor ? { borderColor: color, backgroundColor: `${color}0d` } : undefined}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                {item.tipo}
              </span>
              {item.esMejor && (
                <span
                  className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{ color, backgroundColor: `${color}1a` }}
                >
                  Mejor performance
                </span>
              )}
            </div>

            <span className={cn("text-foreground", item.esMejor ? "text-base font-bold" : "text-sm font-semibold")}>
              {item.headline}
            </span>

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
