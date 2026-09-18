"use client";

// "Cuánto se mira el contenido según la edad": curva de retención de video por rango etario —
// % de reproducciones que llegan a cada hito de avance del video (Inicio/25%/50%/75%/100%),
// una línea por rango etario (18-24 a 65+). A diferencia del resto del Calendario, acá no hay
// desglose por Objetivo ni por inversión: es una métrica de ENGAGEMENT del video en sí (cuánto se
// mira), no de conversión — por eso no lleva toggle de "tipo de conversión" ni columna de costo.
//
// Datos REALES de Meta Ads (ver lib/reporting/metaInvestmentData.ts — fetchVideoRetentionByAge):
// desglose por edad a nivel campaña, usando los campos de Meta "video_play_actions" (inicios de
// reproducción, el 100% de referencia) y "video_pXX_watched_actions" (reproducciones que llegaron
// a cada hito). Cada rango etario se grafica sólo si tuvo al menos 1 inicio de reproducción este
// mes — un rango sin actividad de video (por ejemplo porque la cuenta no le mostró video ads a esa
// edad) simplemente no aparece.
//
// Debajo del gráfico, una tabla por rango etario (Reproducciones / Llega al 25% / Al 50% / Al
// 100%) con la mejor fila resaltada, y el insight de Claude a partir de esos mismos números.

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { cn } from "@/lib/utils";

interface VideoRetentionByAge {
  ageRange: string;
  videoPlays: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

// Orden fijo de visualización — el mismo que usa Meta para "age" en el resto de la página
// (AudienceAnalysis.tsx).
const AGE_ORDER = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

const AGE_COLOR: Record<string, string> = {
  "18-24": "#dc2626", // red-600
  "25-34": "#ea580c", // orange-600
  "35-44": "#ca8a04", // yellow-600
  "45-54": "#16a34a", // green-600
  "55-64": "#2563eb", // blue-600
  "65+": "#7c3aed", // violet-600
};

interface Milestone {
  label: string;
  key: "start" | "p25" | "p50" | "p75" | "p100";
}

const MILESTONES: Milestone[] = [
  { label: "Inicio", key: "start" },
  { label: "25%", key: "p25" },
  { label: "50%", key: "p50" },
  { label: "75%", key: "p75" },
  { label: "100%", key: "p100" },
];

const VIEW_W = 760;
const VIEW_H = 280;
const PAD = { top: 36, right: 24, bottom: 26, left: 42 };
const INNER_W = VIEW_W - PAD.left - PAD.right;
const INNER_H = VIEW_H - PAD.top - PAD.bottom;
const TICK_FRACTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];

interface AgeCurve {
  ageRange: string;
  videoPlays: number;
  retention: { milestone: Milestone; index: number; pct: number }[];
}

export function VideoRetentionChart({
  segments,
  monthIsComplete,
  clientId,
}: {
  /** Un elemento por rango etario con reproducciones de video este mes — ver lib/reporting/metaInvestmentData.ts. */
  segments: VideoRetentionByAge[];
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const curves = useMemo<AgeCurve[]>(() => {
    const byAge = new Map(segments.map((s) => [s.ageRange, s]));
    return AGE_ORDER.filter((age) => (byAge.get(age)?.videoPlays ?? 0) > 0).map((age) => {
      const s = byAge.get(age)!;
      const retention = MILESTONES.map((milestone, index) => {
        const raw = milestone.key === "start" ? s.videoPlays : s[milestone.key];
        const pct = s.videoPlays > 0 ? Math.min(100, (raw / s.videoPlays) * 100) : 0;
        return { milestone, index, pct };
      });
      return { ageRange: age, videoPlays: s.videoPlays, retention };
    });
  }, [segments]);

  const totalVideoPlays = curves.reduce((sum, c) => sum + c.videoPlays, 0);
  const hasData = curves.length > 0 && totalVideoPlays > 0;

  const slot = INNER_W / (MILESTONES.length - 1);
  const xAt = (index: number) => PAD.left + slot * index;
  const yAt = (pct: number) => PAD.top + INNER_H - (pct / 100) * INNER_H;

  const rows = useMemo(() => {
    return curves
      .map((c) => {
        const at = (key: Milestone["key"]) => c.retention.find((r) => r.milestone.key === key)?.pct ?? 0;
        return {
          ageRange: c.ageRange,
          videoPlays: c.videoPlays,
          p25: at("p25"),
          p50: at("p50"),
          p100: at("p100"),
        };
      })
      .sort((a, b) => AGE_ORDER.indexOf(a.ageRange) - AGE_ORDER.indexOf(b.ageRange));
  }, [curves]);

  const bestAgeByP25 = rows.length > 0 ? [...rows].sort((a, b) => b.p25 - a.p25)[0]!.ageRange : null;

  const insightMetrics = useMemo(() => {
    if (!hasData) return null;
    const withP25 = rows.filter((r) => r.videoPlays > 0);
    const best = withP25.length > 0 ? [...withP25].sort((a, b) => b.p25 - a.p25)[0]! : null;
    const worst = withP25.length > 0 ? [...withP25].sort((a, b) => a.p25 - b.p25)[0]! : null;
    const p25Values = withP25.map((r) => r.p25);
    const minP25 = p25Values.length > 0 ? Math.min(...p25Values) : 0;
    const maxP25 = p25Values.length > 0 ? Math.max(...p25Values) : 0;

    return {
      reproduccionesTotales: formatNumber(totalVideoPlays),
      retencion25Rango: `${formatPercent(minP25 / 100)} – ${formatPercent(maxP25 / 100)}`,
      edades: rows.map((r) => ({
        edad: r.ageRange,
        reproducciones: formatNumber(r.videoPlays),
        llega25: formatPercent(r.p25 / 100),
        llega50: formatPercent(r.p50 / 100),
        llega100: formatPercent(r.p100 / 100),
      })),
      mejorRetencion: best ? { edad: best.ageRange, llega25: formatPercent(best.p25 / 100) } : null,
      peorRetencion: worst ? { edad: worst.ageRange, llega25: formatPercent(worst.p25 / 100) } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, hasData, totalVideoPlays]);

  const handleMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((relX - PAD.left) / slot);
    setHoverIndex(Math.min(MILESTONES.length - 1, Math.max(0, index)));
  };

  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;
  const tooltipLeft = hoverX !== null ? `${(hoverX / VIEW_W) * 100}%` : "0%";
  const tooltipFromRightEdge = hoverX !== null && hoverX > VIEW_W * 0.6;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-0.5 pb-2">
        <CardTitle className="text-lg font-bold text-foreground">Cuánto se mira el contenido según la edad</CardTitle>
        <span className="text-xs text-muted-foreground">
          {hasData
            ? `El porcentaje de reproducción se mide sobre ${formatNumber(totalVideoPlays)} inicios de video, el indicador más confiable de esta sección.`
            : "Todavía no hay reproducciones de video este mes."}
        </span>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasData ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Todavía no hay datos este mes.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-3">
              {curves.map((c) => (
                <span key={c.ageRange} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <span className="h-2 w-4 rounded-full" style={{ backgroundColor: AGE_COLOR[c.ageRange] ?? "#6b7280" }} />
                  {c.ageRange}
                </span>
              ))}
            </div>

            <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="h-full w-full"
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {TICK_FRACTIONS.map((frac) => {
                  const y = PAD.top + INNER_H - frac * INNER_H;
                  return (
                    <g key={frac}>
                      <line
                        x1={PAD.left}
                        x2={VIEW_W - PAD.right}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        className="text-border"
                        strokeWidth={1}
                        strokeDasharray={frac === 0 ? undefined : "3 3"}
                      />
                      <text x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                        {Math.round(frac * 100)}%
                      </text>
                    </g>
                  );
                })}

                {curves.map((c) => {
                  const color = AGE_COLOR[c.ageRange] ?? "#6b7280";
                  const path = c.retention.reduce((acc, r, i) => `${acc}${i === 0 ? "M" : "L"} ${xAt(r.index)},${yAt(r.pct)} `, "");
                  return (
                    <g key={c.ageRange}>
                      <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                      {c.retention.map((r) => (
                        <circle key={r.index} cx={xAt(r.index)} cy={yAt(r.pct)} r={2.5} fill="#ffffff" stroke={color} strokeWidth={2} />
                      ))}
                    </g>
                  );
                })}

                {MILESTONES.map((m, i) => (
                  <text key={m.key} x={xAt(i)} y={VIEW_H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                    {m.label}
                  </text>
                ))}

                {hoverX !== null && (
                  <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + INNER_H} stroke="currentColor" className="text-border" strokeWidth={1} />
                )}
                {hoverIndex !== null &&
                  curves.map((c) => {
                    const r = c.retention[hoverIndex];
                    if (!r || hoverX === null) return null;
                    return <circle key={c.ageRange} cx={hoverX} cy={yAt(r.pct)} r={4} fill="#ffffff" stroke={AGE_COLOR[c.ageRange] ?? "#6b7280"} strokeWidth={2} />;
                  })}
              </svg>

              {hoverIndex !== null && (
                <div
                  className={cn(
                    "pointer-events-none absolute top-2 flex min-w-[140px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md",
                    tooltipFromRightEdge ? "-translate-x-full" : ""
                  )}
                  style={{ left: tooltipLeft }}
                >
                  <span className="font-medium text-foreground">{MILESTONES[hoverIndex]!.label} del video</span>
                  {[...curves]
                    .sort((a, b) => (b.retention[hoverIndex]?.pct ?? 0) - (a.retention[hoverIndex]?.pct ?? 0))
                    .map((c) => (
                      <span key={c.ageRange} className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AGE_COLOR[c.ageRange] ?? "#6b7280" }} />
                          {c.ageRange}
                        </span>
                        <span className="font-medium text-foreground">{formatPercent((c.retention[hoverIndex]?.pct ?? 0) / 100)}</span>
                      </span>
                    ))}
                </div>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Edad</th>
                    <th className="py-1.5 pr-4 font-medium">Reproducciones</th>
                    <th className="py-1.5 pr-4 font-medium">Llega al 25%</th>
                    <th className="py-1.5 pr-4 font-medium">Al 50%</th>
                    <th className="py-1.5 font-medium">Al 100%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isBest = r.ageRange === bestAgeByP25;
                    return (
                      <tr key={r.ageRange} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-4 font-medium text-foreground">{r.ageRange}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{formatNumber(r.videoPlays)}</td>
                        <td className={cn("py-2 pr-4", isBest ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {formatPercent(r.p25 / 100)}
                        </td>
                        <td className={cn("py-2 pr-4", isBest ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {formatPercent(r.p50 / 100)}
                        </td>
                        <td className={cn("py-2", isBest ? "font-semibold text-foreground" : "text-muted-foreground")}>
                          {formatPercent(r.p100 / 100)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {insightMetrics && (
          <ChartInsightPanel
            chart="video-retention"
            metrics={insightMetrics}
            accentColor={AGE_COLOR["65+"] ?? "#7c3aed"}
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}
