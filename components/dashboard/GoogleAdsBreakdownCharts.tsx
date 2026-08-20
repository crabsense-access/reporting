"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import type { GoogleAdsMetricKey } from "@/components/dashboard/GoogleAdsTrendChart";
import type { GoogleAdsBreakdownRow } from "@/lib/google-ads/reports";

// Mismos slots 3+ de la paleta categórica validada que usa
// MetaAdsBreakdownCharts (slots 1-2 reservados para azul/naranja de
// selección de métrica) — aqua, amarillo, magenta, verde.
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

// Dispositivo y red ya vienen con un puñado de valores fijos (ver
// DEVICE_LABELS/NETWORK_LABELS en lib/google-ads/reports.ts) — mismo tipo de
// gráfico que plataforma/dispositivo en Meta.
function GoogleAdsBreakdownDonut({
  rows,
  metricKey,
  formatValue,
}: {
  rows: GoogleAdsBreakdownRow[];
  metricKey: GoogleAdsMetricKey;
  formatValue: (value: number) => string;
}) {
  const data = rows.map((row) => ({ name: row.key, value: row.current[metricKey] as number }));
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

// Campaña / grupo de anuncios: barras ordenadas por la métrica elegida,
// nombres truncados en el eje (mismo criterio que MetaAdsRankedBars).
function GoogleAdsRankedBars({
  rows,
  metricKey,
  formatValue,
  color,
}: {
  rows: GoogleAdsBreakdownRow[];
  metricKey: GoogleAdsMetricKey;
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

// Horario y día de la semana: barras en orden cronológico fijo (no por
// spend) — mismo criterio que MetaAdsHourlyBars. Las filas ya vienen
// ordenadas cronológicamente desde reports.ts.
function GoogleAdsOrderedBars({
  rows,
  metricKey,
  formatValue,
  color,
  labelFormatter,
}: {
  rows: GoogleAdsBreakdownRow[];
  metricKey: GoogleAdsMetricKey;
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

// Anuncio / palabra clave: puede haber muchas más filas que campañas o
// grupos — lista con scroll en vez de gráfico de barras, mismo criterio que
// MetaAdsRankedTable.
function GoogleAdsRankedTable({
  rows,
  metricKey,
  formatValue,
}: {
  rows: GoogleAdsBreakdownRow[];
  metricKey: GoogleAdsMetricKey;
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

interface GoogleAdsBreakdownSectionProps {
  breakdowns: {
    device: GoogleAdsBreakdownRow[];
    network: GoogleAdsBreakdownRow[];
    hourly: GoogleAdsBreakdownRow[];
    dayOfWeek: GoogleAdsBreakdownRow[];
    campaign: GoogleAdsBreakdownRow[];
    adGroup: GoogleAdsBreakdownRow[];
    ad: GoogleAdsBreakdownRow[];
    keyword: GoogleAdsBreakdownRow[];
  };
  metricKey: GoogleAdsMetricKey;
  metricLabel: string;
  formatValue: (value: number) => string;
  color: string;
}

function sortByMetricDesc(rows: GoogleAdsBreakdownRow[], metricKey: GoogleAdsMetricKey): GoogleAdsBreakdownRow[] {
  return [...rows].sort((a, b) => (b.current[metricKey] as number) - (a.current[metricKey] as number));
}

// Los 8 desgloses reflejan siempre la métrica seleccionada (ver
// GoogleAdsDashboard: cuando hay 2 seleccionadas, se usa la primera) — el
// server ya trae cada dimensión ordenada por spend por defecto, acá se
// reordena según la métrica elegida (horario y día de la semana se
// mantienen siempre en su orden cronológico).
export function GoogleAdsBreakdownSection({
  breakdowns,
  metricKey,
  metricLabel,
  formatValue,
  color,
}: GoogleAdsBreakdownSectionProps) {
  const sortedCampaigns = sortByMetricDesc(breakdowns.campaign, metricKey);
  const sortedAdGroups = sortByMetricDesc(breakdowns.adGroup, metricKey);
  const sortedAds = sortByMetricDesc(breakdowns.ad, metricKey);
  const sortedKeywords = sortByMetricDesc(breakdowns.keyword, metricKey);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por dispositivo</p>
          <GoogleAdsBreakdownDonut rows={breakdowns.device} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por red</p>
          <GoogleAdsBreakdownDonut rows={breakdowns.network} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por horario</p>
          <GoogleAdsOrderedBars
            rows={breakdowns.hourly}
            metricKey={metricKey}
            formatValue={formatValue}
            color={color}
            labelFormatter={(key) => `${Number(key)}h`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por día de la semana</p>
          <GoogleAdsOrderedBars
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
          <p className="text-sm font-medium text-foreground">{metricLabel} por campaña</p>
          <GoogleAdsRankedBars rows={sortedCampaigns} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por grupo de anuncios</p>
          <GoogleAdsRankedBars rows={sortedAdGroups} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por anuncio</p>
          <GoogleAdsRankedTable rows={sortedAds} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por palabra clave</p>
          <GoogleAdsRankedTable rows={sortedKeywords} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>
    </div>
  );
}
