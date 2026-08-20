"use client";

import { useState } from "react";

import { Scorecard } from "@/components/dashboard/Scorecard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { CompositionTable } from "@/components/mockup/CompositionTable";
import { DeviceBreakdown } from "@/components/mockup/DeviceBreakdown";
import { MockupInsights } from "@/components/mockup/MockupInsights";
import { MockupNote } from "@/components/mockup/MockupNote";
import { MockupPageShell } from "@/components/mockup/MockupPageShell";
import { SectionCard } from "@/components/mockup/SectionCard";
import { SESIONES_NAV_GROUPS } from "@/components/mockup/entities/navGroups";
import { generateInsight } from "@/lib/insights/generateInsight";
import { generateScorecard, generateShares, generateTrend } from "@/lib/mock/generateMockData";
import { getDefaultRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";

export function SesionesMockup() {
  const [{ preset, range }, setRangeState] = useState<{ preset: DateRangePreset; range: DateRangeValue }>(() => ({
    preset: "30d",
    range: getDefaultRange(),
  }));

  const totalSessions = generateScorecard("sesiones:totales", 11200, 0.16);
  const avgDuration = generateScorecard("sesiones:duracion", 142, 0.15);
  const pagesPerSession = generateScorecard("sesiones:paginas-por-sesion", 3.4, 0.14);
  const engagementRate = generateScorecard("sesiones:engagement-rate", 58, 0.1);

  const trend = generateTrend("sesiones:tendencia", { base: totalSessions.current / 30 + 60, volatility: 0.26 });

  const insights = [
    generateInsight({
      label: "Sesiones totales",
      current: totalSessions.current,
      previous: totalSessions.previous,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Engagement rate",
      current: engagementRate.current / 100,
      previous: engagementRate.previous / 100,
      format: "percentage",
      higherIsBetter: true,
    }),
  ];

  const porCanal = generateShares(
    "sesiones:canal",
    ["Organic Search", "Direct", "Paid Search", "Social", "Referral", "Email"],
    totalSessions.current
  );

  const landingPages = generateShares(
    "sesiones:landing-pages",
    ["/", "/blog/articulo-1", "/precios", "/producto/x", "/contacto", "/blog/articulo-2"],
    totalSessions.current
  );

  const tipoTrafico = generateShares(
    "sesiones:tipo-trafico",
    ["Orgánico", "Directo", "Pago", "Referral", "Social"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const engagementVsNoEngagement = generateShares(
    "sesiones:engagement-vs-no",
    ["Con engagement", "Sin engagement"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const eventosPorSesion = generateShares(
    "sesiones:eventos-por-sesion",
    ["0 eventos", "1-3 eventos", "4-6 eventos", "7-10 eventos", "11+ eventos"],
    totalSessions.current,
    { sort: false }
  );

  const duracionSesion = generateShares(
    "sesiones:duracion-distribucion",
    ["0-10s", "10-30s", "30-60s", "1-3 min", "3-10 min", "10+ min"],
    totalSessions.current,
    { sort: false }
  );

  const dispositivo = generateShares("sesiones:dispositivo", ["Mobile", "Desktop", "Tablet"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const idioma = generateShares("sesiones:idioma", ["Español", "Inglés", "Portugués", "Otro"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const navegador = generateShares("sesiones:navegador", ["Chrome", "Safari", "Firefox", "Edge", "Otro"], 100).map(
    (item) => ({ label: item.label, pct: item.pct })
  );

  const sistemaOperativo = generateShares("sesiones:so", ["Android", "iOS", "Windows", "macOS", "Otro"], 100).map(
    (item) => ({ label: item.label, pct: item.pct })
  );

  return (
    <MockupPageShell title="Sesiones" groups={SESIONES_NAV_GROUPS} activeSubitemKey={null}>
      <DateRangeSelector
        preset={preset}
        range={range}
        onChange={(nextPreset, nextRange) => setRangeState({ preset: nextPreset, range: nextRange })}
      />

      <SectionCard id="resumen" title="Resumen">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Scorecard label="Sesiones totales" value={formatNumber(totalSessions.current)} />
          <Scorecard label="Duración media" value={formatDuration(avgDuration.current)} />
          <Scorecard label="Páginas / sesión" value={pagesPerSession.current.toFixed(1)} />
          <Scorecard label="Engagement rate" value={formatPercent(engagementRate.current / 100)} />
        </div>
        <MockupInsights insights={insights} />
        <TrendChart data={trend} />
      </SectionCard>

      <SectionCard id="por-canal" title="Por Canal">
        <CompositionTable items={porCanal} />
      </SectionCard>

      <SectionCard id="landing-pages" title="Landing Pages (top N)">
        <CompositionTable items={landingPages} />
      </SectionCard>

      <SectionCard id="tipo-trafico" title="Tipo de Tráfico">
        <DeviceBreakdown groups={[{ title: "Tipo de tráfico", items: tipoTrafico }]} />
      </SectionCard>

      <SectionCard id="engagement" title="Sesiones con Engagement vs. sin Engagement">
        <DeviceBreakdown groups={[{ title: "Engagement", items: engagementVsNoEngagement }]} />
      </SectionCard>

      <SectionCard id="eventos-sesion" title="Eventos por Sesión">
        <CompositionTable items={eventosPorSesion} />
      </SectionCard>

      <SectionCard id="duracion-sesion" title="Distribución de Duración">
        <CompositionTable items={duracionSesion} />
      </SectionCard>

      <SectionCard id="dispositivo" title="Dispositivo">
        <DeviceBreakdown groups={[{ title: "Dispositivo", items: dispositivo }]} />
      </SectionCard>

      <SectionCard id="idioma" title="Idioma">
        <DeviceBreakdown groups={[{ title: "Idioma", items: idioma }]} />
      </SectionCard>

      <SectionCard id="browser-os" title="Browser / OS">
        <DeviceBreakdown
          groups={[
            { title: "Navegador", items: navegador },
            { title: "Sistema Operativo", items: sistemaOperativo },
          ]}
        />
      </SectionCard>

      <MockupNote>
        Estructura en revisión — una vez aprobada, se conecta a datos reales en un prompt aparte.
      </MockupNote>
    </MockupPageShell>
  );
}
