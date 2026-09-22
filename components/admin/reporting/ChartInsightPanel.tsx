"use client";

// Leyenda de "hallazgos principales" para un gráfico del calendario de
// inversión: titular destacado + cifras clave como chips + 1-2 oraciones de
// contexto, generados por Claude a partir de las métricas ya calculadas del
// gráfico (ver lib/reports/chartInsights.ts y app/api/reporting/
// chart-insights/route.ts). Se pide una vez por carga de página (no se
// vuelve a pedir si el usuario sólo cambia el toggle de métrica del
// gráfico) y se re-pide si cambian las métricas de fondo (ej. al pasar de
// día, con datos de prueba distintos).
//
// Dos variantes visuales (prop `variant`): "card" (default — recuadro con borde + fondo tenue del
// color accentColor, mismo look que las tarjetas de ChartInsightByTypePanel/CampaignHighlightPanel)
// y "flow" (título + chips + texto sueltos, sin recuadro — el estilo original, ya no lo usa ningún
// gráfico pero queda disponible). A pedido de Martín, TODOS los consumidores de este componente
// (investment-trend/placements/audience/regions/hourly-performance/weekday-performance/
// video-retention, ver InvestmentTrendChart/PlacementAnalysis/AudienceAnalysis/RegionAnalysis/
// HourlyPerformanceChart/WeekdayPerformanceChart/VideoRetentionChart) pasan variant="card"
// explícitamente.
//
// El espaciado de arriba es independiente de la variante (prop `topSpacing`): "default" (pt-3,
// igual que ChartInsightByTypePanel/CampaignHighlightPanel) salvo que se pida "lg" (pt-8,
// "espaciado top importante" — hoy sólo InvestmentTrendChart.tsx lo pide, a pedido puntual de
// Martín para ESE gráfico).

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface ChartInsightHighlight {
  label: string;
  value: string;
}

export interface ChartInsightData {
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
}

type InsightState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ChartInsightData };

export function ChartInsightPanel({
  chart,
  metrics,
  accentColor,
  bordered = true,
  variant = "card",
  topSpacing = "default",
  monthIsComplete,
  clientId,
}: {
  chart: string;
  metrics: unknown;
  accentColor: string;
  /** false cuando el panel va primero dentro de la card (ej. arriba del gráfico) y no necesita el separador superior. */
  bordered?: boolean;
  /** "card" (default): recuadro con borde + fondo tenue de accentColor. "flow": título + chips + texto sueltos, sin recuadro (ver comentario de cabecera). */
  variant?: "flow" | "card";
  /** "default" (pt-3, default) o "lg" (pt-8, "espaciado top importante") — ver comentario de cabecera. */
  topSpacing?: "default" | "lg";
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
        return response.json() as Promise<ChartInsightData>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
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

  const topPad = topSpacing === "lg" ? "pt-8" : "pt-3";
  const wrapperClass = cn("flex flex-col gap-2", bordered && "border-t border-border", bordered && topPad);
  // Igual que wrapperClass: el separador/espaciado de arriba depende de `bordered`, no de la
  // variante — con bordered=false (ej. PlacementAnalysis.tsx, donde el insight va primero dentro
  // de la card) el recuadro de "card" queda pegado arriba, sin línea divisoria ni padding extra,
  // mismo criterio que ya usaba "flow".
  const cardOuterClass = cn(bordered && "border-t border-border", bordered && topPad);

  if (state.status === "loading") {
    if (variant === "card") {
      return (
        <div className={cardOuterClass}>
          <div className="flex flex-col gap-2 rounded-lg border-2 border-border p-4">
            <div className="h-5 w-56 animate-pulse rounded bg-muted" />
            <div className="flex gap-2">
              <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
              <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      );
    }
    return (
      <div className={wrapperClass}>
        <div className="h-5 w-56 animate-pulse rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={bordered ? cardOuterClass : undefined}>
        <span className="text-xs text-muted-foreground">No se pudo generar el resumen con IA ({state.message}).</span>
      </div>
    );
  }

  const { data } = state;

  if (variant === "card") {
    // color-mix() en vez del truco de sufijo hex (`${color}0d`/`${color}1a`) que usa el resto del
    // archivo: ese truco sólo funciona si accentColor es un hex de 6 dígitos, e
    // InvestmentTrendChart.tsx pasa "hsl(var(--primary))" (queda igual para todos los demás
    // gráficos, que sí pasan hex) — color-mix funciona con cualquier color CSS válido.
    return (
      <div className={cardOuterClass}>
        <div
          className="flex flex-col gap-2 rounded-lg border-2 p-4"
          style={{ borderColor: accentColor, backgroundColor: `color-mix(in oklab, ${accentColor} 5%, transparent)` }}
        >
          <span className="text-base font-bold text-foreground">{data.headline}</span>
          {data.highlights.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {data.highlights.map((highlight, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
                  style={{ borderColor: accentColor, backgroundColor: `color-mix(in oklab, ${accentColor} 10%, transparent)` }}
                >
                  <span className="text-muted-foreground">{highlight.label}:</span>
                  <span className="font-semibold" style={{ color: accentColor }}>
                    {highlight.value}
                  </span>
                </span>
              ))}
            </div>
          )}
          <p className="text-xs leading-relaxed text-foreground">{data.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <span className="text-base font-bold text-foreground">{data.headline}</span>
      {data.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.highlights.map((highlight, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
              style={{ borderColor: accentColor, backgroundColor: `${accentColor}1a` }}
            >
              <span className="text-muted-foreground">{highlight.label}:</span>
              <span className="font-semibold" style={{ color: accentColor }}>
                {highlight.value}
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="text-sm leading-relaxed text-foreground">{data.body}</p>
    </div>
  );
}
