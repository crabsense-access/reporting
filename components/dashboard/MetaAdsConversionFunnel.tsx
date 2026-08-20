"use client";

import { Cell, Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip } from "recharts";

import { formatNumber, formatPercent } from "@/lib/format";

interface FunnelStage {
  name: string;
  value: number;
}

interface MetaAdsConversionFunnelProps {
  impressions: number;
  linkClicks: number;
  conversions: number;
  /** CTR entre Impresiones y Clicks — ya calculado en el resto del proyecto (linkClickCtr). */
  ctr: number;
  /** Tasa de Conversión entre Clicks y Conversiones — ya calculada en el resto del proyecto (conversionRate). */
  conversionRate: number;
}

// Mismos 3 colores ya usados en el proyecto para series categóricas
// (CATEGORICAL_COLORS en MetaAdsBreakdownCharts.tsx) — acá en el orden de
// las 3 etapas del funnel.
const STAGE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a"];

function formatLabelValue(value: string | number | boolean | null | undefined): string {
  return formatNumber(Number(value ?? 0));
}

// Funnel Impresiones → Clicks → Conversiones (Prompt 93, punto 4) — 3 etapas
// vía Funnel/FunnelChart de recharts (cada una más angosta según el volumen
// relativo, ya lo resuelve el componente solo a partir de `value`), con el
// CTR y la Tasa de Conversión superpuestos entre las etapas correspondientes
// como 2 pills posicionados a 1/3 y 2/3 de alto del contenedor — recharts no
// tiene un concepto nativo de "anotación entre etapas del funnel".
export function MetaAdsConversionFunnel({ impressions, linkClicks, conversions, ctr, conversionRate }: MetaAdsConversionFunnelProps) {
  if (impressions === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>;
  }

  const data: FunnelStage[] = [
    { name: "Impresiones", value: impressions },
    { name: "Clicks", value: linkClicks },
    { name: "Conversiones", value: conversions },
  ];

  const tooltipContent = ({ active, payload }: { active?: boolean; payload?: readonly unknown[] }) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = (payload[0] as { payload?: FunnelStage })?.payload;
    if (!point) return null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <p className="font-medium text-foreground">
          {point.name}: {formatNumber(point.value)}
        </p>
      </div>
    );
  };

  return (
    <div className="relative h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <FunnelChart>
          <Tooltip content={tooltipContent} />
          <Funnel dataKey="value" data={data} isAnimationActive>
            <LabelList position="right" dataKey="name" fill="hsl(var(--foreground))" stroke="none" fontSize={12} />
            <LabelList position="center" dataKey="value" fill="#ffffff" stroke="none" fontSize={12} formatter={formatLabelValue} />
            {data.map((stage, index) => (
              <Cell key={stage.name} fill={STAGE_COLORS[index % STAGE_COLORS.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 top-1/3 flex -translate-y-1/2 justify-center">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: "hsl(var(--muted-foreground))" }}
        >
          CTR {formatPercent(ctr)}
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-2/3 flex -translate-y-1/2 justify-center">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: "hsl(var(--muted-foreground))" }}
        >
          Tasa de Conversión {formatPercent(conversionRate)}
        </span>
      </div>
    </div>
  );
}
