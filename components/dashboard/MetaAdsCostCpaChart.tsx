"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { METRIC_SLOT_COLORS } from "@/components/dashboard/MetaAdsTrendChart";
import { formatCompactCurrency, formatCurrency } from "@/lib/format";

export interface MetaAdsCostCpaPoint {
  key: string;
  spend: number;
  cpa: number;
}

interface MetaAdsCostCpaChartProps {
  data: MetaAdsCostCpaPoint[];
  currencyCode: string;
  /** "horizontal" (Prompt 80) para dimensiones con muchas categorías (País/Región) — barras horizontales, categoría en el eje Y en vez de en el X. Por defecto "vertical" (Plataforma/Dispositivo/Día de la Semana/Horario). */
  orientation?: "vertical" | "horizontal";
  /** false (Prompt 82) para dimensiones con muchas barras (Día de la Semana/Horario), donde el valor arriba de cada una se superpone. Por defecto true. */
  showBarLabels?: boolean;
  /** true (Prompts 82-83, 85) para compactar el eje de valores (K/M, sin decimales) en vez de moneda completa. Por defecto false. */
  compactAxis?: boolean;
  /** Tamaño de fuente de las categorías del eje X en orientation="vertical" (Prompt 85) — más grande para Plataforma/Dispositivo (pocas categorías), default para Día de la Semana/Horario (muchas). Por defecto 10. */
  categoryTickFontSize?: number;
  /** Tope fijo del eje Y en orientation="vertical" (Prompt 89) — para forzar la misma escala en 2 gráficos distintos (ej. Día de la Semana y Horario) y que la diferencia de magnitud entre ambos se note a simple vista. Por defecto undefined (autoescala, como antes). */
  valueDomainMax?: number;
}

// Mismo azul ya usado en el resto del proyecto para la métrica principal.
const COST_COLOR = "hsl(var(--primary))";
// Mismo naranja ya usado para la 2da métrica seleccionada en el gráfico
// comparativo de Meta Ads (METRIC_SLOT_COLORS[1]) — ámbar/naranja, distinto
// del azul de Costo.
const CPA_COLOR = METRIC_SLOT_COLORS[1];

// Ancho generoso para que el valor completo (moneda + separador de miles)
// nunca se corte contra el borde del gráfico.
const VALUE_AXIS_WIDTH = 80;
// El eje compacto (Prompt 82) necesita bastante menos espacio — símbolo de
// moneda + número corto (ej. "US$ 12K"), sin decimales.
const COMPACT_VALUE_AXIS_WIDTH = 56;

// Tick del eje Y en un <text> plano en vez del tick por defecto de Recharts
// (un componente <Text> que auto-parte el texto en varias líneas cuando no
// entra en el `width` del eje) — los valores compactos ("US$ 12K") tienen un
// espacio entre el símbolo y el número, así que con el eje angosto Recharts
// los partía en 2 líneas. Un <text> sin lógica de wrap nunca lo hace (Prompt
// 86, mismo criterio que ya se usó en el gráfico compartido de Evolución).
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

// Leyenda alineada a la derecha (Prompt 81) — mismo criterio en los 2
// orientations.
function Legend() {
  return (
    <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COST_COLOR }} />
        Costo
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CPA_COLOR }} />
        CPA
      </div>
    </div>
  );
}

// Componente reutilizable (Prompt 79, horizontal en el 80, eje compacto y
// labels opcionales en el 82): por cada categoría, 2 barras — Costo y CPA —
// sobre un ÚNICO eje compartido (Prompt 81: sin doble eje autoescalado,
// aunque eso implique que CPA se vea chico al lado de Costo total — es una
// lectura más honesta que dos escalas independientes). El tooltip siempre
// muestra el valor completo en moneda con máximo 1 decimal (Prompt 32); el
// eje y el label sobre cada barra son opcionalmente compactos/ocultables
// para las dimensiones con muchas categorías (Día de la Semana/Horario).
export function MetaAdsCostCpaChart({
  data,
  currencyCode,
  orientation = "vertical",
  showBarLabels = true,
  compactAxis = false,
  categoryTickFontSize = 10,
  valueDomainMax,
}: MetaAdsCostCpaChartProps) {
  const formatValue = (value: number) => formatCurrency(value, currencyCode, 1);
  const formatLabel = (value: string | number | boolean | null | undefined) => formatValue(Number(value ?? 0));
  const formatAxisValue = compactAxis ? (value: number) => formatCompactCurrency(value, currencyCode) : formatValue;

  if (data.length === 0 || data.every((point) => point.spend === 0 && point.cpa === 0)) {
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
    const point = (payload[0] as { payload?: MetaAdsCostCpaPoint })?.payload;
    if (!point) return null;
    return (
      <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <p className="font-medium text-foreground">{label ?? point.key}</p>
        <p className="text-muted-foreground">Costo: {formatValue(point.spend)}</p>
        <p className="text-muted-foreground">CPA: {formatValue(point.cpa)}</p>
      </div>
    );
  };

  if (orientation === "horizontal") {
    // Alto proporcional a la cantidad de categorías (Prompt 80) — Provincia/
    // País pueden tener muchas más filas que Plataforma/Dispositivo, un alto
    // fijo las apretaría hasta volverlas ilegibles.
    const chartHeight = Math.max(240, data.length * 56);

    return (
      <div className="flex flex-col gap-2">
        <Legend />
        <div className="w-full" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
              <YAxis
                type="category"
                dataKey="key"
                tick={{ fontSize: 11, textAnchor: "end" }}
                className="fill-muted-foreground"
                width={110}
                tickLine={false}
                axisLine={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxisValue}
              />
              <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={tooltipContent} />
              <Bar dataKey="spend" fill={COST_COLOR} radius={[0, 4, 4, 0]}>
                {showBarLabels && <LabelList dataKey="spend" position="right" formatter={formatLabel} fontSize={10} />}
              </Bar>
              <Bar dataKey="cpa" fill={CPA_COLOR} radius={[0, 4, 4, 0]}>
                {showBarLabels && <LabelList dataKey="cpa" position="right" formatter={formatLabel} fontSize={10} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Legend />
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis
              dataKey="key"
              tick={{ fontSize: categoryTickFontSize }}
              className="fill-muted-foreground"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={(props) => renderValueTick(props, formatAxisValue)}
              width={compactAxis ? COMPACT_VALUE_AXIS_WIDTH : VALUE_AXIS_WIDTH}
              tickLine={false}
              axisLine={false}
              domain={valueDomainMax !== undefined ? [0, valueDomainMax] : undefined}
            />
            <Tooltip cursor={{ fill: "hsl(var(--muted))" }} content={tooltipContent} />
            <Bar dataKey="spend" fill={COST_COLOR} radius={[4, 4, 0, 0]}>
              {showBarLabels && <LabelList dataKey="spend" position="top" formatter={formatLabel} fontSize={10} />}
            </Bar>
            <Bar dataKey="cpa" fill={CPA_COLOR} radius={[4, 4, 0, 0]}>
              {showBarLabels && <LabelList dataKey="cpa" position="top" formatter={formatLabel} fontSize={10} />}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
