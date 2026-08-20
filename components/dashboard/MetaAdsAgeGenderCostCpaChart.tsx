"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/format";
import type { MetaAdsAgeGenderBreakdownRow } from "@/lib/meta-ads/reports";

// Meta reporta los tramos etarios en este orden fijo — no siempre vienen
// ordenados así en la respuesta (mismo criterio que MetaAdsAgeGenderBars en
// MetaAdsBreakdownCharts.tsx).
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

// Verde para Mujeres, ámbar para Hombres — mismos colores que ya usaba
// MetaAdsAgeGenderBars (CATEGORICAL_COLORS[0]/[1] en MetaAdsBreakdownCharts.tsx),
// acá fijados por género explícitamente (no por índice de aparición en la
// respuesta de Meta, que no garantiza que "female" venga siempre primero).
const FEMALE_COLOR = "#1baf7a";
const MALE_COLOR = "#eda100";

const VALUE_AXIS_WIDTH = 80;

interface AgeGenderPoint {
  age: string;
  femaleSpend: number;
  maleSpend: number;
  femaleCpa: number;
  maleCpa: number;
}

// Tick del eje en un <text> plano en vez del tick por defecto de Recharts
// (un componente <Text> que auto-parte el texto en varias líneas cuando no
// entra en el `width` del eje) — formatCurrency en es-AR mete un espacio
// entre el símbolo y el número ("US$ 1.234,5"), mismo motivo por el que se
// aplicó este mismo criterio en MetaAdsCostCpaChart.tsx.
function renderValueTick(
  props: { x?: string | number; y?: string | number; payload?: { value?: number } },
  formatValue: (value: number) => string
) {
  const { x, y, payload } = props;
  if (x === undefined || y === undefined || payload?.value === undefined) return <g />;
  return (
    <text x={Number(x)} y={Number(y)} dy={4} textAnchor="end" fontSize={11} className="fill-muted-foreground">
      {formatValue(payload.value)}
    </text>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}

function LegendDashedLine({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-0 w-3.5 shrink-0 border-t-2 border-dashed" style={{ borderColor: color }} />
      {label}
    </div>
  );
}

// Gráfico combinado "Costo y CPA por edad y género" (Prompts 90-91) —
// reemplaza a los 2 gráficos separados que había antes (uno de Costo, otro
// de CPA, cada uno con sus propias barras por género). Costo son barras
// agrupadas por género, CPA son 2 líneas punteadas (una por género) — mismo
// color por género en ambas métricas, la línea punteada es lo que distingue
// "es CPA, no Costo" a simple vista. Un ÚNICO eje Y compartido (Prompt 91,
// sin doble eje) — mismo criterio ya aplicado en MetaAdsCostCpaChart.tsx:
// aunque CPA quede chico al lado del Costo total, es una lectura más
// honesta que 2 escalas independientes.
export function MetaAdsAgeGenderCostCpaChart({
  rows,
  currencyCode,
}: {
  rows: MetaAdsAgeGenderBreakdownRow[];
  currencyCode: string;
}) {
  const formatValue = (value: number) => formatCurrency(value, currencyCode, 1);

  const byAge = new Map<string, AgeGenderPoint>();
  for (const row of rows) {
    const point = byAge.get(row.age) ?? { age: row.age, femaleSpend: 0, maleSpend: 0, femaleCpa: 0, maleCpa: 0 };
    if (row.gender === "female") {
      point.femaleSpend = row.current.spend;
      point.femaleCpa = row.current.cpa;
    } else if (row.gender === "male") {
      point.maleSpend = row.current.spend;
      point.maleCpa = row.current.cpa;
    }
    byAge.set(row.age, point);
  }
  const data = [...byAge.values()].sort((a, b) => AGE_ORDER.indexOf(a.age) - AGE_ORDER.indexOf(b.age));

  if (data.length === 0 || data.every((point) => point.femaleSpend === 0 && point.maleSpend === 0)) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Sin datos para este período.</div>;
  }

  const tooltipContent = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: readonly unknown[];
    label?: string | number;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const point = (payload[0] as { payload?: AgeGenderPoint })?.payload;
    if (!point) return null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <p className="font-medium text-foreground">{label ?? point.age}</p>
        <p className="text-muted-foreground">Costo Mujeres: {formatValue(point.femaleSpend)}</p>
        <p className="text-muted-foreground">Costo Hombres: {formatValue(point.maleSpend)}</p>
        <p className="text-muted-foreground">CPA Mujeres: {formatValue(point.femaleCpa)}</p>
        <p className="text-muted-foreground">CPA Hombres: {formatValue(point.maleCpa)}</p>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-4 text-xs text-muted-foreground">
        <LegendDot color={FEMALE_COLOR} label="Costo Mujeres" />
        <LegendDot color={MALE_COLOR} label="Costo Hombres" />
        <LegendDashedLine color={FEMALE_COLOR} label="CPA Mujeres" />
        <LegendDashedLine color={MALE_COLOR} label="CPA Hombres" />
      </div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis
              tick={(props) => renderValueTick(props, formatValue)}
              width={VALUE_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={tooltipContent} />
            <Bar dataKey="femaleSpend" name="Costo Mujeres" fill={FEMALE_COLOR} radius={[4, 4, 0, 0]} />
            <Bar dataKey="maleSpend" name="Costo Hombres" fill={MALE_COLOR} radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="femaleCpa"
              name="CPA Mujeres"
              stroke={FEMALE_COLOR}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: FEMALE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="maleCpa"
              name="CPA Hombres"
              stroke={MALE_COLOR}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={{ r: 3, fill: MALE_COLOR, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
