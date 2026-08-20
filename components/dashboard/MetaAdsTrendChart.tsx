"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { MetaAdsPeriodMetrics, MetaAdsTimeSeriesPoint } from "@/lib/meta-ads/reports";

export type MetaAdsMetricKey = keyof MetaAdsPeriodMetrics;

// Paleta categórica validada (dataviz skill, references/palette.md, slots 1-2
// blue/orange) — corrida contra el fondo de esta app (#fff) y aprobada:
// CVD ΔE 24.7, normal-vision ΔE 33.6, ambas muy por encima del piso. El
// orden es fijo por posición de selección (primera métrica = azul, segunda
// = naranja), no por cuál métrica es — así el color de cada scorecard
// siempre matchea con su línea en el gráfico.
export const METRIC_SLOT_COLORS = ["#2a78d6", "#eb6834"] as const;

export interface MetaAdsChartMetric {
  key: MetaAdsMetricKey;
  label: string;
  formatValue: (value: number) => string;
  color: string;
}

interface MetaAdsTrendChartProps {
  current: MetaAdsTimeSeriesPoint[];
  previous: MetaAdsTimeSeriesPoint[];
  metrics: MetaAdsChartMetric[];
  loading?: boolean;
}

export function formatBucketLabel(date: string): string {
  if (!date) return "";
  try {
    return format(parseISO(date), "d MMM", { locale: es });
  } catch {
    return date;
  }
}

// Empareja current[i] con previous[i] por posición, no por fecha real — el
// período anterior tiene el mismo largo (ver getPreviousPeriod) pero cae en
// otras fechas de calendario; el eje X muestra las fechas del período
// actual y ambas líneas se comparan "día 1 vs día 1".
function buildSingleMetricData(current: MetaAdsTimeSeriesPoint[], previous: MetaAdsTimeSeriesPoint[], metricKey: MetaAdsMetricKey) {
  const length = Math.max(current.length, previous.length);
  const points: { label: string; current: number | null; previous: number | null }[] = [];

  for (let i = 0; i < length; i += 1) {
    const currentPoint = current[i];
    const previousPoint = previous[i];
    points.push({
      label: currentPoint ? formatBucketLabel(currentPoint.date) : "",
      current: currentPoint ? (currentPoint[metricKey] as number) : null,
      previous: previousPoint ? (previousPoint[metricKey] as number) : null,
    });
  }

  return points;
}

// Con 2 métricas seleccionadas, cada una se grafica en su propio eje Y (uno
// a la izquierda, otro a la derecha) en vez de indexarlas a un % de cambio
// compartido — a pedido explícito, aunque dos ejes con escalas
// independientes pueden hacer que las líneas "se crucen" sin que eso
// refleje una relación real entre las métricas.
// Solo se grafica el período actual acá — el período anterior (línea
// tenue) solo tiene sentido con 1 sola métrica seleccionada, con 2 ejes
// distintos ya se vuelve demasiado para leer (4 líneas).
function buildDualAxisData(current: MetaAdsTimeSeriesPoint[], metrics: MetaAdsChartMetric[]) {
  return current.map((point) => {
    const row: Record<string, string | number | null> = { label: formatBucketLabel(point.date) };
    metrics.forEach((metric) => {
      row[metric.key] = point[metric.key] as number;
    });
    return row;
  });
}

export function MetaAdsTrendChart({ current, previous, metrics, loading }: MetaAdsTrendChartProps) {
  if (loading) {
    return <Skeleton className="h-72 w-full" />;
  }

  if (metrics.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Seleccioná una métrica para ver su evolución.
      </div>
    );
  }

  if (current.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
        Sin datos para este período.
      </div>
    );
  }

  if (metrics.length === 1) {
    const metric = metrics[0]!;
    const data = buildSingleMetricData(current, previous, metric.key);

    return (
      <div className="flex h-72 w-full flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{metric.label} a lo largo del tiempo</p>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 12 }}
              className="fill-muted-foreground"
              width={56}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => metric.formatValue(value)}
            />
            <Tooltip
              formatter={(value) => (value === null ? "—" : metric.formatValue(Number(value)))}
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                backgroundColor: "hsl(var(--card))",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="current" name={metric.label} stroke={metric.color} strokeWidth={2} dot={false} connectNulls />
            <Line
              type="monotone"
              dataKey="previous"
              name={`${metric.label} (período anterior)`}
              stroke={metric.color}
              strokeOpacity={0.35}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  const data = buildDualAxisData(current, metrics);
  const [leftMetric, rightMetric] = metrics;

  return (
    <div className="flex h-72 w-full flex-col gap-2">
      <p className="text-sm font-medium text-foreground">{metrics.map((metric) => metric.label).join(" vs. ")}</p>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <YAxis
            yAxisId={leftMetric!.key}
            orientation="left"
            tick={{ fontSize: 12, fill: leftMetric!.color }}
            width={56}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => leftMetric!.formatValue(value)}
          />
          {rightMetric && (
            <YAxis
              yAxisId={rightMetric.key}
              orientation="right"
              tick={{ fontSize: 12, fill: rightMetric.color }}
              width={56}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) => rightMetric.formatValue(value)}
            />
          )}
          <Tooltip
            formatter={(value, name, entry) => {
              if (value === null || value === undefined) return ["—", name];
              const dataKey = String(entry?.dataKey ?? "");
              const metric = metrics.find((item) => item.key === dataKey);
              return [metric ? metric.formatValue(Number(value)) : String(value), name];
            }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(var(--border))",
              backgroundColor: "hsl(var(--card))",
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {metrics.map((metric) => (
            <Line
              key={metric.key}
              yAxisId={metric.key}
              type="monotone"
              dataKey={metric.key}
              name={metric.label}
              stroke={metric.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
