"use client";

// "Recomendaciones": el cierre del Calendario de inversión — entre 5 y 8 acciones concretas de
// alto impacto para mejorar la performance de las campañas y los leads, generadas por Claude a
// partir de un resumen de TODAS las secciones reales del mes (ver InvestmentCalendar.tsx —
// recommendationsMetrics — y lib/reports/chartInsights.ts — generateRecommendations). A
// diferencia del resto de los paneles de insight (ChartInsightPanel/CampaignHighlightPanel), que
// comentan UN gráfico puntual, este es el único que mira la cuenta completa — por eso va al
// final de todo, en una card destacada (borde de color + encabezado con fondo tenue) en vez de
// mezclarse visualmente con el resto de las secciones.

import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ACCENT = "#4f46e5"; // indigo-600 — no se repite en ninguna otra sección, para que esta card se distinga como el cierre del Calendario.

const PLAZO_COLOR: Record<string, string> = {
  Inmediato: "#dc2626", // red-600
  "Corto plazo": "#d97706", // amber-600
  "Próximo mes": "#2563eb", // blue-600
};

function plazoColor(plazo: string): string {
  return PLAZO_COLOR[plazo] ?? "#6b7280";
}

export interface Recommendation {
  accion: string;
  detalle: string;
  plazo: string;
}

type RecommendationsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: Recommendation[] };

export function RecommendationsPanel({
  metrics,
  monthIsComplete,
  clientId,
}: {
  /** Resumen ya calculado de TODAS las secciones reales del mes — ver InvestmentCalendar.tsx (recommendationsMetrics). Si es null (todavía no hay datos), el panel no se renderiza. */
  metrics: unknown;
  /** true cuando el mes que están mostrando estas métricas ya terminó — sólo entonces la ruta cachea la respuesta de Claude (ver app/api/reporting/chart-insights/route.ts). */
  monthIsComplete: boolean;
  clientId?: string;
}) {
  const [state, setState] = useState<RecommendationsState>({ status: "loading" });
  // Las métricas son un objeto nuevo en cada render (vienen de un useMemo de la página), así que
  // se compara por su JSON para no re-pedir las recomendaciones salvo que el contenido cambie.
  const metricsKey = JSON.stringify(metrics);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    fetch("/api/reporting/chart-insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chart: "recommendations", metrics: JSON.parse(metricsKey), monthIsComplete, clientId }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorBody = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errorBody?.error ?? `Error ${response.status} al generar las recomendaciones.`);
        }
        return response.json() as Promise<{ items: Recommendation[] }>;
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
  }, [metricsKey, monthIsComplete, clientId]);

  return (
    <Card className="border-2" style={{ borderColor: ACCENT }}>
      <CardHeader className="flex flex-col gap-0.5 pb-3" style={{ backgroundColor: `${ACCENT}0d` }}>
        <CardTitle className="text-xl font-bold text-foreground">Recomendaciones</CardTitle>
        <span className="text-xs text-muted-foreground">
          Las acciones de mayor impacto para mejorar la performance de las campañas y los leads, según los datos del mes.
        </span>
      </CardHeader>

      <CardContent className="pt-4">
        {state.status === "loading" && (
          <div className="flex flex-col gap-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 border-b border-border pb-3 last:border-0">
                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {state.status === "error" && (
          <span className="text-xs text-muted-foreground">No se pudieron generar las recomendaciones ({state.message}).</span>
        )}

        {state.status === "ready" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-4 font-medium">Acción</th>
                  <th className="py-1.5 pr-4 font-medium">Detalle</th>
                  <th className="w-32 py-1.5 font-medium">Plazo</th>
                </tr>
              </thead>
              <tbody>
                {state.items.map((item, index) => (
                  <tr key={index} className="border-b border-border/60 align-top last:border-0">
                    <td className="py-3 pr-3 text-muted-foreground">{index + 1}</td>
                    <td className="py-3 pr-4 font-semibold text-foreground">{item.accion}</td>
                    <td className="py-3 pr-4 leading-relaxed text-muted-foreground">{item.detalle}</td>
                    <td className="py-3">
                      <span
                        className="inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{ color: plazoColor(item.plazo), backgroundColor: `${plazoColor(item.plazo)}1a` }}
                      >
                        {item.plazo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
