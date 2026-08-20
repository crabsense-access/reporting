"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { SeoMetricKey } from "@/lib/gsc/metric-defs";
import type { SeoBreakdownRow } from "@/lib/gsc/reports";

const CATEGORICAL_COLORS = ["#1baf7a", "#eda100", "#e87ba4", "#008300"];

const DEVICE_LABELS: Record<string, string> = { MOBILE: "Móvil", DESKTOP: "Escritorio", TABLET: "Tablet" };

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

function SeoBreakdownDonut({
  rows,
  metricKey,
  formatValue,
}: {
  rows: SeoBreakdownRow[];
  metricKey: SeoMetricKey;
  formatValue: (value: number) => string;
}) {
  const data = rows.map((row) => ({ name: DEVICE_LABELS[row.key] ?? row.key, value: row.current[metricKey] as number }));
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

function SeoRankedBars({
  rows,
  metricKey,
  formatValue,
  color,
}: {
  rows: SeoBreakdownRow[];
  metricKey: SeoMetricKey;
  formatValue: (value: number) => string;
  color: string;
}) {
  // Los códigos de país de Search Console vienen en ISO-3166 alpha-3
  // minúscula ("usa", "arg") — se muestran en mayúscula, sin traducir a
  // nombre completo (evita mantener una tabla de 200 países para un uso que
  // hoy es solo de lectura rápida en un gráfico).
  const data = rows.map((row) => ({ name: row.key.toUpperCase(), value: row.current[metricKey] as number }));

  if (data.length === 0 || data.every((item) => item.value === 0)) return <EmptyBreakdown />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
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

// Búsqueda (query) y página: textos largos y potencialmente muchas filas —
// lista con scroll en vez de gráfico de barras.
function SeoRankedTable({
  rows,
  metricKey,
  formatValue,
}: {
  rows: SeoBreakdownRow[];
  metricKey: SeoMetricKey;
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

interface SeoBreakdownSectionProps {
  breakdowns: {
    query: SeoBreakdownRow[];
    page: SeoBreakdownRow[];
    country: SeoBreakdownRow[];
    device: SeoBreakdownRow[];
  };
  metricKey: SeoMetricKey;
  metricLabel: string;
  formatValue: (value: number) => string;
  color: string;
}

function sortByMetricDesc(rows: SeoBreakdownRow[], metricKey: SeoMetricKey): SeoBreakdownRow[] {
  return [...rows].sort((a, b) => (b.current[metricKey] as number) - (a.current[metricKey] as number));
}

export function SeoBreakdownSection({ breakdowns, metricKey, metricLabel, formatValue, color }: SeoBreakdownSectionProps) {
  const sortedQuery = sortByMetricDesc(breakdowns.query, metricKey);
  const sortedPage = sortByMetricDesc(breakdowns.page, metricKey);
  const sortedCountry = sortByMetricDesc(breakdowns.country, metricKey);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por dispositivo</p>
          <SeoBreakdownDonut rows={breakdowns.device} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por país</p>
          <SeoRankedBars rows={sortedCountry} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por término de búsqueda</p>
          <SeoRankedTable rows={sortedQuery} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por página</p>
          <SeoRankedTable rows={sortedPage} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>
    </div>
  );
}
