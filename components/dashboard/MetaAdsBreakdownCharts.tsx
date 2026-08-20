"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { SENTIMENT_TEXT_CLASS, formatSigned, sentimentFromVariation } from "@/components/dashboard/MetaAdsMetricCard";
import type { MetaAdsMetricKey } from "@/components/dashboard/MetaAdsTrendChart";
import { cn } from "@/lib/utils";
import type { MetaAdsAgeGenderBreakdownRow, MetaAdsBreakdownRow } from "@/lib/meta-ads/reports";

// Mismo criterio "higherIsBetter" que buildMetaAdsInsights
// (lib/insights/dashboard-insights.ts) para las 8 métricas seleccionables,
// más cpc/cpm para las tarjetas fijas — repetido acá porque es sobre color
// de UI, no sobre el texto del insight, pero deben leer igual en la página.
const HIGHER_IS_BETTER: Partial<Record<MetaAdsMetricKey, boolean>> = {
  impressions: true,
  frequency: false,
  linkClicks: true,
  linkClickCtr: true,
  conversions: true,
  conversionRate: true,
  spend: false,
  cpa: false,
  cpc: false,
  cpm: false,
};

// Slots 3+ de la paleta categórica validada (ver MetaAdsTrendChart —
// METRIC_SLOT_COLORS ya usa los slots 1-2 para azul/naranja de selección de
// métrica): aqua, amarillo, magenta, verde — se reusan para cualquier
// desglose por categorías (plataforma, dispositivo, género), evita que se
// confundan con el color de selección de scorecards.
const CATEGORICAL_COLORS = ["#1baf7a", "#eda100", "#e87ba4", "#008300"];

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

const DEVICE_LABELS: Record<string, string> = {
  mobile_app: "App móvil",
  mobile_web: "Web móvil",
  desktop: "Escritorio",
};

const GENDER_LABELS: Record<string, string> = { female: "Mujeres", male: "Hombres" };

// Meta reporta los tramos etarios en este orden fijo — no siempre vienen
// ordenados así en la respuesta.
const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

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

function MetaAdsBreakdownDonut({
  rows,
  metricKey,
  formatValue,
  labelMap,
}: {
  rows: MetaAdsBreakdownRow[];
  metricKey: MetaAdsMetricKey;
  formatValue: (value: number) => string;
  labelMap: Record<string, string>;
}) {
  const data = rows.map((row) => ({ name: labelMap[row.key] ?? row.key, value: row.current[metricKey] }));
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

function MetaAdsRankedBars({
  rows,
  metricKey,
  formatValue,
  color,
}: {
  rows: MetaAdsBreakdownRow[];
  metricKey: MetaAdsMetricKey;
  formatValue: (value: number) => string;
  color: string;
}) {
  const data = rows.map((row) => ({ name: row.key, value: row.current[metricKey] }));

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

// Los buckets vienen como "00:00:00 - 00:59:59" — se muestran cortos ("0h",
// "13h") porque a diferencia de campaña/provincia/anuncio, acá lo que
// importa es leer las 24 barras en fila, no un nombre largo por barra.
function formatHourLabel(bucket: string): string {
  return `${Number(bucket.slice(0, 2))}h`;
}

function MetaAdsHourlyBars({
  rows,
  metricKey,
  formatValue,
  color,
}: {
  rows: MetaAdsBreakdownRow[];
  metricKey: MetaAdsMetricKey;
  formatValue: (value: number) => string;
  color: string;
}) {
  const data = rows.map((row) => ({ name: formatHourLabel(row.key), fullLabel: row.key, value: row.current[metricKey] }));

  if (data.length === 0 || data.every((item) => item.value === 0)) return <EmptyBreakdown />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fontSize: 10 }} className="fill-muted-foreground" tickLine={false} axisLine={false} interval={1} />
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

// Exportado (Prompt 79) para reusarlo tal cual en el bloque "Costo y CPA por
// Edad y Género" de Meta Ads > Costos — mismo patrón visual, una vez por
// métrica (spend/cpa), sin duplicar el componente.
export function MetaAdsAgeGenderBars({
  rows,
  metricKey,
  formatValue,
}: {
  rows: MetaAdsAgeGenderBreakdownRow[];
  metricKey: MetaAdsMetricKey;
  formatValue: (value: number) => string;
}) {
  const genders = [...new Set(rows.map((row) => row.gender))];
  const byAge = new Map<string, Record<string, number | string>>();
  for (const row of rows) {
    const bucket = byAge.get(row.age) ?? { age: row.age };
    bucket[row.gender] = row.current[metricKey];
    byAge.set(row.age, bucket);
  }
  const data = [...byAge.values()].sort((a, b) => AGE_ORDER.indexOf(a.age as string) - AGE_ORDER.indexOf(b.age as string));

  if (data.length === 0) return <EmptyBreakdown />;

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <XAxis dataKey="age" tick={{ fontSize: 11 }} className="fill-muted-foreground" tickLine={false} axisLine={false} />
          <Tooltip formatter={(value) => formatValue(Number(value))} contentStyle={TOOLTIP_STYLE} />
          {genders.map((gender, index) => (
            <Bar
              key={gender}
              dataKey={gender}
              name={GENDER_LABELS[gender] ?? gender}
              fill={CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length]}
              radius={[3, 3, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4">
        {genders.map((gender, index) => (
          <div key={gender} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length] }}
            />
            {GENDER_LABELS[gender] ?? gender}
          </div>
        ))}
      </div>
    </div>
  );
}

// A nivel anuncio individual puede haber muchas más filas que campañas o
// conjuntos — se muestra como lista con scroll en vez de gráfico de barras,
// que con 15 barras se vuelve ilegible. Exportada (Prompt 93) para
// reusarla tal cual en el ranking de campañas de Meta Ads > Conversiones
// (mismo "formato simple" pedido ahí), igual que ya se hizo con
// MetaAdsAgeGenderBars para Costos.
export function MetaAdsRankedTable({
  rows,
  metricKey,
  formatValue,
}: {
  rows: MetaAdsBreakdownRow[];
  metricKey: MetaAdsMetricKey;
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
          <span className="shrink-0 font-medium text-foreground">{formatValue(row.current[metricKey])}</span>
        </div>
      ))}
    </div>
  );
}

function MetaAdsRegionList({
  rows,
  metricKey,
  formatValue,
  higherIsBetter,
  color,
}: {
  rows: MetaAdsBreakdownRow[];
  metricKey: MetaAdsMetricKey;
  formatValue: (value: number) => string;
  higherIsBetter: boolean;
  color: string;
}) {
  if (rows.length === 0) return <EmptyBreakdown />;

  const max = Math.max(...rows.map((row) => row.current[metricKey] as number), 0) || 1;

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const value = row.current[metricKey] as number;
        const previousValue = row.previous ? (row.previous[metricKey] as number) : null;
        const sentiment = sentimentFromVariation(value, previousValue, higherIsBetter);
        const variationPct = previousValue ? ((value - previousValue) / previousValue) * 100 : null;
        const widthPct = (value / max) * 100;

        return (
          <div key={row.key} className="flex items-center gap-3 text-sm">
            <span className="w-24 shrink-0 truncate text-muted-foreground" title={row.key}>
              {row.key}
            </span>
            <div className="flex flex-1 items-center gap-2">
              <span className="w-16 shrink-0 text-right font-medium text-foreground">{formatValue(value)}</span>
              <div className="h-2 flex-1 rounded-full bg-secondary">
                <div className="h-2 rounded-full" style={{ width: `${widthPct}%`, backgroundColor: color }} />
              </div>
            </div>
            <span className={cn("w-14 shrink-0 text-right text-xs font-medium", SENTIMENT_TEXT_CLASS[sentiment])}>
              {variationPct === null ? "—" : formatSigned(variationPct, (v) => `${v.toFixed(1)}%`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface MetaAdsBreakdownSectionProps {
  breakdowns: {
    platform: MetaAdsBreakdownRow[];
    device: MetaAdsBreakdownRow[];
    ageGender: MetaAdsAgeGenderBreakdownRow[];
    hourly: MetaAdsBreakdownRow[];
    campaign: MetaAdsBreakdownRow[];
    adSet: MetaAdsBreakdownRow[];
    ad: MetaAdsBreakdownRow[];
    region: MetaAdsBreakdownRow[];
  };
  metricKey: MetaAdsMetricKey;
  metricLabel: string;
  formatValue: (value: number) => string;
  color: string;
}

function sortByMetricDesc(rows: MetaAdsBreakdownRow[], metricKey: MetaAdsMetricKey): MetaAdsBreakdownRow[] {
  return [...rows].sort((a, b) => b.current[metricKey] - a.current[metricKey]);
}

// Los 8 desgloses reflejan siempre la métrica seleccionada (ver
// MetaAdsDashboard: cuando hay 2 seleccionadas, se usa la primera) — cada
// fetch ya trae todas las métricas por fila, así que cambiar de scorecard
// solo cambia qué campo se lee, sin volver a pedir datos. El orden de
// campaña/conjunto/anuncio/provincia se reordena acá según la métrica
// elegida (el server las trae ordenadas por spend, para tener un set
// estable); horario se mantiene siempre cronológico.
export function MetaAdsBreakdownSection({
  breakdowns,
  metricKey,
  metricLabel,
  formatValue,
  color,
}: MetaAdsBreakdownSectionProps) {
  const sortedCampaigns = sortByMetricDesc(breakdowns.campaign, metricKey);
  const sortedAdSets = sortByMetricDesc(breakdowns.adSet, metricKey);
  const sortedAds = sortByMetricDesc(breakdowns.ad, metricKey);
  const sortedRegions = [...breakdowns.region].sort(
    (a, b) => (b.current[metricKey] as number) - (a.current[metricKey] as number)
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por plataforma</p>
          <MetaAdsBreakdownDonut rows={breakdowns.platform} metricKey={metricKey} formatValue={formatValue} labelMap={PLATFORM_LABELS} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por dispositivo</p>
          <MetaAdsBreakdownDonut rows={breakdowns.device} metricKey={metricKey} formatValue={formatValue} labelMap={DEVICE_LABELS} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por edad y género</p>
          <MetaAdsAgeGenderBars rows={breakdowns.ageGender} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por horario</p>
          <MetaAdsHourlyBars rows={breakdowns.hourly} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por campaña</p>
          <MetaAdsRankedBars rows={sortedCampaigns} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por conjunto de anuncios</p>
          <MetaAdsRankedBars rows={sortedAdSets} metricKey={metricKey} formatValue={formatValue} color={color} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por anuncio</p>
          <MetaAdsRankedTable rows={sortedAds} metricKey={metricKey} formatValue={formatValue} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium text-foreground">{metricLabel} por provincia</p>
          <MetaAdsRegionList
            rows={sortedRegions}
            metricKey={metricKey}
            formatValue={formatValue}
            higherIsBetter={HIGHER_IS_BETTER[metricKey] ?? true}
            color={color}
          />
        </CardContent>
      </Card>
    </div>
  );
}
