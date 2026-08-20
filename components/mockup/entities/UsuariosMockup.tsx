"use client";

import { useState } from "react";

import { Scorecard } from "@/components/dashboard/Scorecard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { CompositionTable } from "@/components/mockup/CompositionTable";
import { CohortGrid } from "@/components/mockup/CohortGrid";
import { DeviceBreakdown } from "@/components/mockup/DeviceBreakdown";
import { MockupInsights } from "@/components/mockup/MockupInsights";
import { MockupNote } from "@/components/mockup/MockupNote";
import { MockupPageShell } from "@/components/mockup/MockupPageShell";
import { SectionCard } from "@/components/mockup/SectionCard";
import { USUARIOS_NAV_GROUPS } from "@/components/mockup/entities/navGroups";
import { generateInsight } from "@/lib/insights/generateInsight";
import { generateCohortMatrix, generateScorecard, generateShares, generateTrend } from "@/lib/mock/generateMockData";
import { getDefaultRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import { formatDuration, formatNumber, formatPercent } from "@/lib/format";

const COHORT_LABELS = ["Cohorte -5", "Cohorte -4", "Cohorte -3", "Cohorte -2", "Cohorte -1", "Cohorte actual"];
const WEEK_LABELS = ["Sem. 0", "Sem. 1", "Sem. 2", "Sem. 3", "Sem. 4", "Sem. 5", "Sem. 6", "Sem. 7"];

export function UsuariosMockup() {
  const [{ preset, range }, setRangeState] = useState<{ preset: DateRangePreset; range: DateRangeValue }>(() => ({
    preset: "30d",
    range: getDefaultRange(),
  }));

  const activeUsers = generateScorecard("usuarios:activos", 8400, 0.15);
  const newUsers = generateScorecard("usuarios:nuevos", 3200, 0.2);
  const returningPct = generateScorecard("usuarios:recurrentes-pct", 42, 0.12);
  const avgDuration = generateScorecard("usuarios:duracion", 185, 0.15);

  const trend = generateTrend("usuarios:tendencia", { base: activeUsers.current / 30 + 40, volatility: 0.28 });

  const insights = [
    generateInsight({
      label: "Usuarios activos",
      current: activeUsers.current,
      previous: activeUsers.previous,
      format: "number",
      higherIsBetter: true,
    }),
    generateInsight({
      label: "Usuarios nuevos",
      current: newUsers.current,
      previous: newUsers.previous,
      format: "number",
      higherIsBetter: true,
    }),
  ];

  const nuevosVsRecurrentes = generateShares(
    "usuarios:nuevos-vs-recurrentes",
    ["Nuevos", "Recurrentes"],
    activeUsers.current,
    { sort: false }
  );

  const canalAdquisicion = generateShares(
    "usuarios:canal-adquisicion",
    ["Organic Search", "Direct", "Paid Search", "Social", "Referral", "Email"],
    activeUsers.current
  );

  const geografia = generateShares(
    "usuarios:geografia",
    ["Argentina", "México", "España", "Colombia", "Chile", "Estados Unidos", "Perú"],
    activeUsers.current
  ).slice(0, 6);

  const frecuenciaSesiones = generateShares(
    "usuarios:frecuencia-sesiones",
    ["1 sesión", "2-3 sesiones", "4-6 sesiones", "7-10 sesiones", "11+ sesiones"],
    activeUsers.current,
    { sort: false }
  );

  const lifecycle = generateShares(
    "usuarios:lifecycle",
    ["Nuevo (<7 días)", "Reciente (7-30 días)", "Establecido (30-90 días)", "Fiel (90+ días)"],
    activeUsers.current,
    { sort: false }
  );

  const cohortMatrix = generateCohortMatrix("usuarios:cohortes", COHORT_LABELS.length, WEEK_LABELS.length);

  const recurrenciaPorCanal = generateShares(
    "usuarios:recurrencia-canal",
    ["Organic Search", "Direct", "Paid Search", "Social", "Referral"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const edad = generateShares(
    "usuarios:edad",
    ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const genero = generateShares("usuarios:genero", ["Femenino", "Masculino", "No especificado"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const intereses = generateShares(
    "usuarios:intereses",
    ["Tecnología", "Viajes", "Deportes", "Moda y Belleza", "Comida y Bebida", "Finanzas", "Entretenimiento", "Fitness y Bienestar"],
    100
  ).slice(0, 6);

  const dispositivo = generateShares("usuarios:dispositivo", ["Mobile", "Desktop", "Tablet"], 100, {
    sort: false,
  }).map((item) => ({ label: item.label, pct: item.pct }));

  const idioma = generateShares(
    "usuarios:idioma",
    ["Español", "Inglés", "Portugués", "Otro"],
    100,
    { sort: false }
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const navegador = generateShares(
    "usuarios:navegador",
    ["Chrome", "Safari", "Firefox", "Edge", "Otro"],
    100
  ).map((item) => ({ label: item.label, pct: item.pct }));

  const sistemaOperativo = generateShares(
    "usuarios:so",
    ["Android", "iOS", "Windows", "macOS", "Otro"],
    100
  ).map((item) => ({ label: item.label, pct: item.pct }));

  return (
    <MockupPageShell title="Usuarios" groups={USUARIOS_NAV_GROUPS} activeSubitemKey="audiencia">
      <DateRangeSelector
        preset={preset}
        range={range}
        onChange={(nextPreset, nextRange) => setRangeState({ preset: nextPreset, range: nextRange })}
      />

      <SectionCard id="resumen" title="Resumen">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Scorecard label="Usuarios activos" value={formatNumber(activeUsers.current)} />
          <Scorecard label="Usuarios nuevos" value={formatNumber(newUsers.current)} />
          <Scorecard label="% recurrentes" value={formatPercent(returningPct.current / 100)} />
          <Scorecard label="Duración media" value={formatDuration(avgDuration.current)} />
        </div>
        <MockupInsights insights={insights} />
        <TrendChart data={trend} />
      </SectionCard>

      <SectionCard id="nuevos-vs-recurrentes" title="Nuevos vs. Recurrentes">
        <CompositionTable items={nuevosVsRecurrentes} />
      </SectionCard>

      <SectionCard id="canal-adquisicion" title="Canal de Adquisición">
        <CompositionTable items={canalAdquisicion} />
      </SectionCard>

      <SectionCard id="geografia" title="Geografía (top países)">
        <CompositionTable items={geografia} />
      </SectionCard>

      <SectionCard id="frecuencia-sesiones" title="Frecuencia de Sesiones">
        <CompositionTable items={frecuenciaSesiones} />
      </SectionCard>

      <SectionCard id="lifecycle" title="Antigüedad / Lifecycle">
        <CompositionTable items={lifecycle} />
      </SectionCard>

      <SectionCard id="retencion-cohorte" title="Retención por Cohorte">
        <CohortGrid cohortLabels={COHORT_LABELS} weekLabels={WEEK_LABELS} matrix={cohortMatrix} />
      </SectionCard>

      <SectionCard
        id="recurrencia-canal"
        title="Recurrencia por Canal"
        description="% de usuarios recurrentes sobre el total de cada canal."
      >
        <DeviceBreakdown groups={[{ title: "Canal", items: recurrenciaPorCanal }]} />
      </SectionCard>

      <SectionCard id="demografia" title="Demografía">
        <DeviceBreakdown groups={[{ title: "Edad", items: edad }, { title: "Género", items: genero }]} />
        <MockupNote>Depende de que el cliente tenga Google Signals habilitado.</MockupNote>
      </SectionCard>

      <SectionCard id="intereses" title="Intereses (top categorías de afinidad)">
        <DeviceBreakdown groups={[{ title: "Categoría", items: intereses }]} />
        <MockupNote>Depende de que el cliente tenga Google Signals habilitado.</MockupNote>
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
