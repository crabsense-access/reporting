"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";

export interface ScorecardTrendPoint {
  label: string;
  value: number;
}

interface ScorecardTrendLineChartProps {
  data: ScorecardTrendPoint[];
  loading: boolean;
  formatValue: (value: number) => string;
}

// Gráfico de tendencia individual unificado para scorecards (Prompt 73) —
// gráfico de LÍNEAS (no de barras), sin ejes visibles, con el mismo
// comportamiento de tooltip al hover que ya usaban los mini-gráficos de
// Meta Ads (formatter + labelFormatter + contentStyle, ver
// MetaAdsMetricCard.tsx) — se replica ese comportamiento tal cual, sin
// cambiarlo, en el resto de los scorecards de la lista del Prompt 73.
export function ScorecardTrendLineChart({ data, loading, formatValue }: ScorecardTrendLineChartProps) {
  if (loading) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (data.length === 0) {
    return <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Sin datos para este período.</div>;
  }

  return (
    // recharts vuelve focuseable el <svg> que dibuja (recharts-surface) y al
    // clickearlo el navegador le muestra el recuadro de foco por defecto —
    // no tiene nada que ver con la selección de la tarjeta (esa ya se aísla
    // con stopPropagation en el padre). Se apaga acá, en el único componente
    // compartido por los 17 scorecards, para no tener que tocar cada uno.
    <div className="h-32 w-full [&_.recharts-surface]:outline-none [&_.recharts-wrapper]:outline-none">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
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
          <Line type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
