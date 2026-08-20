"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Skeleton } from "@/components/ui/skeleton";
import type { SeoMetricKey } from "@/lib/gsc/metric-defs";
import type { SeoTimeSeriesPoint } from "@/lib/gsc/reports";

// Misma paleta categórica validada que Meta Ads / Google Ads / GA4.
export const METRIC_SLOT_COLORS = ["#2a78d6", "#eb6834"] as const;

export interface SeoChartMetric {
  key: SeoMetricKey;
  label: string;
  formatValue: (value: number) => string;
  color: string;
}

interface SeoTrendChartProps {
  current: SeoTimeSeriesPoint[];
  previous: SeoTimeSeriesPoint[];
  metrics: SeoChartMetric[];
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

function buildSingleMetricData(current: SeoTimeSeriesPoint[], previous: SeoTimeSeriesPoint[], metricKey: SeoMetricKey) {
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
function buildDualAxisData(current: SeoTimeSeriesPoint[], metrics: SeoChartMetric[]) {
  return current.map((point) => {
    const row: Record<string, string | number | null> = { label: formatBucketLabel(point.date) };
    metrics.forEach((metric) => {
      row[metric.key] = point[metric.key] as number;
    });
    return row;
  });
}

export function SeoTrendChart({ current, previous, metrics, loading }: SeoTrendChartProps) {
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
