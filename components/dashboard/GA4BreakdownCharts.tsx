"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { GA4BasicMetricKey } from "@/lib/ga4/metric-defs";
import type { GA4BreakdownRow } from "@/lib/ga4/reports";

const CATEGORICAL_COLORS = ["#1baf7a", "#eda100", "#e87ba4", "#008300"];

function EmptyBreakdown() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      Sin datos para este período.
    </div>
  );
}

const TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  backgroundColor: "hsl(var(--card))",
  fontSize: 12,
};

const NEW_VS_RETURNING_LABELS: Record<string, string> = { new: "Nuevos", returning: "Recurrentes" };

function GA4BreakdownDonut({
  rows,
  metricKey,
  formatValue,
  labelMap,
}: {
  rows: GA4BreakdownRow[];
  metricKey: GA4BasicMetricKey;
  formatValue: (value: number) => string;
  labelMap?: Record<string, string>;
}) {
  const data = rows.map((row) => ({ name: labelMap?.[row.key] ?? row.key, value: row.current[metricKey] as number }));
  const total = data.reduce((sum, item) => sum + item.value, 0);

  if (total <= 0) return <EmptyBreakdown />;

  return (
    <div className="flex items-center gap-4">
      <div className="h-36 w-36 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={42}
              outerRadius={66}
              paddingAngle={2}
              label={({ percent }) => `${((percent ?? 0) * 100).toFixed(1)}%`}
              labelLine={false}
              fontSize={11}
            >
              {data.map((item, index) => (
                <Cell key={item.name} fill={CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatValue(Number(value))} contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-1.5">
        {data.map((item, index) => (
          <div key={item.name} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length] }}
            />
            <span className="text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GA4RankedBars({
  rows,
  metricKey,
  formatValue,
  color,
}: {
  rows: GA4BreakdownRow[];
  metricKey: GA4BasicMetricKey;
  formatValue: (value: number) => string;
  color: string;
}) {
  const data = rows.map((row) => ({ name: row.key, value: row.current[metricKey] as number }));

  if (data.length === 0 || data.every((item) => item.value === 0)) return <EmptyBreakdown />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            tickFormatter={(name: string) => (name.length > 16 ? `${name.slice(0, 16)}…` : name)}
          />
          <Tooltip formatter={(value) => formatValue(Number(value))} labelFormatter={(name) => name} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="value"
              position="top"
              formatter={(value: string | number | boolean | null | undefined) => formatValue(Number(value ?? 0))}
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Horario y día de la semana: barras en orden cronológico fijo, ya vienen
// ordenadas desde reports.ts.
function GA4OrderedBars({
  rows,
  metricKey,
  formatValue,
  color,
  labelFormatter,
}: {
  rows: GA4BreakdownRow[];
  metricKey: GA4BasicMetricKey;
  formatValue: (value: number) => string;
  color: string;
  labelFormatter?: (key: string) => string;
}) {
  const data = rows.map((row) => ({
    name: labelFormatter ? labelFormatter(row.key) : row.key,
    fullLabel: row.key,
    value: row.current[metricKey] as number,
  }));

  if (data.length === 0 || data.every((item) => item.value === 0)) return <EmptyBreakdown />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(value) => formatValue(Number(value))}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
            contentStyle={TOOLTIP_STYLE}
          />
          <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// País y página de destino: lista con scroll (nombres largos / muchas filas).
function GA4RankedTable({
  rows,
  metricKey,
  formatValue,
}: {
  rows: GA4BreakdownRow[];
  metricKey: GA4BasicMetricKey;
  formatValue: (value: number) => string;
}) {
  if (rows.length === 0 || rows.every((row) => row.current[metricKey] === 0)) return <EmptyBreakdown />;

  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-sm last:border-0">
          <span className="min-w-0 flex-1 truncate text-muted-foreground" title={row.key}>
            {row.key}
          </span>
          <span className="shrink-0 font-medium text-foreground">{formatValue(row.current[metricKey] as number)}</span>
        </div>
      ))}
    </div>
  );
}

interface GA4BreakdownSectionProps {
  breakdowns: {
    device: GA4BreakdownRow[];
    operatingSystem: GA4BreakdownRow[];
    channel: GA4BreakdownRow[];
    country: GA4BreakdownRow[];
    landingPage: GA4BreakdownRow[];
    newVsReturning: GA4BreakdownRow[];
    hourly: GA4BreakdownRow[];
    dayOfWeek: GA4BreakdownRow[];
  };
  metricKey: GA4BasicMetricKey;
  metricLabel: string;
  formatValue: (value: number) => string;
  color: string;
}

function sortByMetricDesc(rows: GA4BreakdownRow[], metricKey: GA4BasicMetricKey): GA4BreakdownRow[] {
  return [...rows].sort((a, b) => (b.current[metricKey] as number) - (a.current[metricKey] as number));
}

export function GA4BreakdownSection({ breakdowns, metricKey, metricLabel, formatValue, color }: GA4BreakdownSectionProps) {
  const sortedChannel = sortByMetricDesc(breakdowns.channel, metricKey);
  const sortedCountry = sortByMetricDesc(breakdowns.country, metricKey);
  const sortedLandingPage = sortByMetricDesc(breakdowns.landingPage, metricKey);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por dispositivo</p>
          <GA4BreakdownDonut rows={breakdowns.device} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por sistema operativo</p>
          <GA4BreakdownDonut rows={breakdowns.operatingSystem} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por nuevo/recurrente</p>
          <GA4BreakdownDonut rows={breakdowns.newVsReturning} metricKey={metricKey} formatValue={formatValue} labelMap={NEW_VS_RETURNING_LABELS} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por canal</p>
          <GA4RankedBars rows={sortedChannel} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por horario</p>
          <GA4OrderedBars rows={breakdowns.hourly} metricKey={metricKey} formatValue={formatValue} color={color} labelFormatter={(key) => `${key}h`} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por día de la semana</p>
          <GA4OrderedBars
            rows={breakdowns.dayOfWeek}
            metricKey={metricKey}
            formatValue={formatValue}
            color={color}
            labelFormatter={(key) => key.slice(0, 3)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por país</p>
          <GA4RankedTable rows={sortedCountry} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por página de destino</p>
          <GA4RankedTable rows={sortedLandingPage} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>
    </div>
  );
}
