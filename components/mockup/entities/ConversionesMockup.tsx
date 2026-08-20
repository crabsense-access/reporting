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
import { CONVERSIONES_NAV_GROUPS } from "@/components/mockup/entities/navGroups";
import { generateInsight } from "@/lib/insights/generateInsight";
import { generateScorecard, generateShares, generateTrend } from "@/lib/mock/generateMockData";
import { getDefaultRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import { formatCurrency, formatDecimal, formatNumber, formatPercent } from "@/lib/format";

export function ConversionesMockup() {
  const [{ preset, range }, setRangeState] = useState<{ preset: DateRangePreset; range: DateRangeValue }>(() => ({
    preset: "30d",
    range: getDefaultRange(),
  }));

  const totalConversions = generateScorecard("conversiones:totales", 640, 0.2);
  const conversionRate = generateScorecard("conversiones:tasa", 3.2, 0.18);
  const totalValue = generateScorecard("conversiones:valor", 18400, 0.22);
  const conversionsPerUser = generateScorecard("conversiones:por-usuario", 0.18, 0.15);

  const trend = generateTrend("conversiones:tendencia", { base: totalConversions.current / 30 + 5, volatility: 0.32 });

  const insights = [
    generateInsight({
      label: "Conversiones totales",
      current: totalConversions.current,
      previous: totalConversions.previous,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Valor total",
      current: totalValue.current,
      previous: totalValue.previous,
      format: "currency",
      currencyCode: "USD",
      higherIsBetter: true,
    }),
  ];

  const porObjetivoPrimario = generateShares(
    "conversiones:objetivo-primario",
    ["Compra", "Registro"],
    Math.round(totalConversions.current * 0.65),
    { sort: false }
  );

  const porObjetivoSecundario = generateShares(
    "conversiones:objetivo-secundario",
    ["Descarga", "Contacto", "Suscripción newsletter"],
    totalConversions.current - Math.round(totalConversions.current * 0.65),
    { sort: false }
  );

  const porCanal = generateShares(
    "conversiones:canal",
    ["Organic Search", "Direct", "Paid Search", "Social", "Referral", "Email"],
    totalConversions.current
  );

  const porDispositivo = generateShares(
    "conversiones:dispositivo-composicion",
    ["Mobile", "Desktop", "Tablet"],
    totalConversions.current,
    { sort: false }
  );

  const tiempoConversion = generateShares(
    "conversiones:tiempo-conversion",
    ["Mismo día", "1-3 días", "4-7 días", "8-14 días", "15-30 días", "30+ días"],
    totalConversions.current,
    { sort: false }
  );

  const assistedVsLastClick = generateShares(
    "conversiones:assisted-lastclick",
    ["Last-click", "Assisted"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const dispositivo = generateShares("conversiones:dispositivo", ["Mobile", "Desktop", "Tablet"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const idioma = generateShares("conversiones:idioma", ["Español", "Inglés", "Portugués", "Otro"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const navegador = generateShares("conversiones:navegador", ["Chrome", "Safari", "Firefox", "Edge", "Otro"], 100).map(
    (item) => ({ label: item.label, pct: item.pct })
  );

  const sistemaOperativo = generateShares(
    "conversiones:so",
    ["Android", "iOS", "Windows", "macOS", "Otro"],
    100
  ).map((item) => ({ label: item.label, pct: item.pct }));

  return (
    <MockupPageShell title="Conversiones" groups={CONVERSIONES_NAV_GROUPS} activeSubitemKey="conversiones">
      <DateRangeSelector
        preset={preset}
        range={range}
        onChange={(nextPreset, nextRange) => setRangeState({ preset: nextPreset, range: nextRange })}
      />

      <SectionCard id="resumen" title="Resumen">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Scorecard label="Conversiones totales" value={formatNumber(totalConversions.current)} />
          <Scorecard label="Tasa de conversión" value={formatPercent(conversionRate.current / 100)} />
          <Scorecard label="Valor total" value={formatCurrency(totalValue.current, "USD")} />
          <Scorecard label="Conversiones por usuario" value={formatDecimal(conversionsPerUser.current)} />
        </div>
        <MockupInsights insights={insights} />
        <TrendChart data={trend} />
      </SectionCard>

      <SectionCard
        id="por-evento"
        title="Por Evento / Objetivo"
        description="Objetivos primarios y secundarios configurados en GA4."
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objetivos primarios
            </div>
            <CompositionTable items={porObjetivoPrimario} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Objetivos secundarios
            </div>
            <CompositionTable items={porObjetivoSecundario} />
          </div>
        </div>
      </SectionCard>

      <SectionCard id="por-canal" title="Por Canal">
        <CompositionTable items={porCanal} />
      </SectionCard>

      <SectionCard id="por-dispositivo" title="Por Dispositivo">
        <CompositionTable items={porDispositivo} />
      </SectionCard>

      <SectionCard id="tiempo-conversion" title="Tiempo hasta Conversión">
        <CompositionTable items={tiempoConversion} />
      </SectionCard>

      <SectionCard id="assisted-vs-lastclick" title="Assisted vs. Last-click">
        <DeviceBreakdown groups={[{ title: "Tipo de atribución", items: assistedVsLastClick }]} />
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
