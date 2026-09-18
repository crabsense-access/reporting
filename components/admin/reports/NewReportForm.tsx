"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { GeneratingOverlay } from "@/components/admin/reports/GeneratingOverlay";
import { useGenerateReport } from "@/components/admin/reports/useGenerateReport";
import { PlataformasBlock } from "@/components/admin/reports/blocks/PlataformasBlock";
import { ObjetivosBlock, type PlatformObjectiveValue } from "@/components/admin/reports/blocks/ObjetivosBlock";
import { MetricasInsightsBlock } from "@/components/admin/reports/blocks/MetricasInsightsBlock";
import { PeriodoBlock } from "@/components/admin/reports/blocks/PeriodoBlock";
import { ReglaPrincipalBlock } from "@/components/admin/reports/blocks/ReglaPrincipalBlock";
import { FormatoEntregableBlock } from "@/components/admin/reports/blocks/FormatoEntregableBlock";
import { EstructuraFinalBlock } from "@/components/admin/reports/blocks/EstructuraFinalBlock";
import { FormatoInsightBlock } from "@/components/admin/reports/blocks/FormatoInsightBlock";
import { PriorizacionBlock } from "@/components/admin/reports/blocks/PriorizacionBlock";
import { ReglasBlock } from "@/components/admin/reports/blocks/ReglasBlock";
import { Top10AccionesBlock } from "@/components/admin/reports/blocks/Top10AccionesBlock";
import { PrincipioFinalBlock } from "@/components/admin/reports/blocks/PrincipioFinalBlock";
import { getPresetRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import type { ReportPlatform } from "@/lib/reports/platforms";
import { readGoalString } from "@/lib/reports/objectives";
import {
  DEFAULT_ESTRUCTURA_FINAL,
  DEFAULT_FORMATO_ENTREGABLE,
  DEFAULT_FORMATO_INSIGHT,
  DEFAULT_METRICAS_INSIGHTS,
  DEFAULT_PERIODO_INSTRUCCIONES,
  DEFAULT_PRINCIPIO_FINAL,
  DEFAULT_PRIORIZACION,
  DEFAULT_REGLAS,
  DEFAULT_REGLA_PRINCIPAL,
  DEFAULT_TOP10_ACCIONES,
} from "@/lib/reports/promptBlocks";

interface ConnectedSource {
  platform: ReportPlatform;
  config: Record<string, unknown>;
}

interface NewReportFormProps {
  clientId: string;
  clientName: string;
  connectedSources: ConnectedSource[];
}

export function NewReportForm({ clientId, clientName, connectedSources }: NewReportFormProps) {
  const connectedPlatforms = connectedSources.map((source) => source.platform);

  const [rol, setRol] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<ReportPlatform[]>(connectedPlatforms);
  const [objectives, setObjectives] = useState<Partial<Record<ReportPlatform, PlatformObjectiveValue>>>(() =>
    Object.fromEntries(
      connectedSources.map((source) => [
        source.platform,
        {
          principal: readGoalString(source.config, "primary_goal"),
          secundario: readGoalString(source.config, "secondary_goal"),
        },
      ])
    )
  );
  const hasSecondaryGoal = Object.fromEntries(
    connectedSources.map((source) => [source.platform, readGoalString(source.config, "secondary_goal").trim().length > 0])
  );
  const [metricasInsights, setMetricasInsights] = useState<Partial<Record<ReportPlatform, string>>>(() =>
    Object.fromEntries(
      connectedSources.map((source) => [source.platform, DEFAULT_METRICAS_INSIGHTS[source.platform] ?? ""])
    )
  );

  const [preset, setPreset] = useState<DateRangePreset>("7d");
  const [range, setRange] = useState<DateRangeValue>(getPresetRange("7d"));
  const [periodoInstrucciones, setPeriodoInstrucciones] = useState(DEFAULT_PERIODO_INSTRUCCIONES);
  const [reglaPrincipal, setReglaPrincipal] = useState(DEFAULT_REGLA_PRINCIPAL);
  const [formatoEntregable, setFormatoEntregable] = useState(DEFAULT_FORMATO_ENTREGABLE);
  const [estructuraFinal, setEstructuraFinal] = useState(DEFAULT_ESTRUCTURA_FINAL);
  const [formatoInsight, setFormatoInsight] = useState(DEFAULT_FORMATO_INSIGHT);
  const [priorizacion, setPriorizacion] = useState(DEFAULT_PRIORIZACION);
  const [reglas, setReglas] = useState(DEFAULT_REGLAS);
  const [top10Acciones, setTop10Acciones] = useState(DEFAULT_TOP10_ACCIONES);
  const [principioFinal, setPrincipioFinal] = useState(DEFAULT_PRINCIPIO_FINAL);
  const { steps, isSubmitting, error, generate } = useGenerateReport(clientId);

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setPreset(nextPreset);
    setRange(nextRange);
  }

  function handleObjectiveChange(platform: ReportPlatform, field: "principal" | "secundario", value: string) {
    setObjectives((prev) => ({
      ...prev,
      [platform]: { principal: "", secundario: "", ...prev[platform], [field]: value },
    }));
  }

  function handleMetricasInsightsChange(platform: ReportPlatform, value: string) {
    setMetricasInsights((prev) => ({ ...prev, [platform]: value }));
  }

  function handleSubmit() {
    const objetivosPayload = Object.fromEntries(
      selectedPlatforms.map((platform) => {
        const objective = objectives[platform] ?? { principal: "", secundario: "" };
        return [platform, { principal: objective.principal.trim(), secundario: objective.secundario.trim() }];
      })
    );

    const metricasInsightsPayload = Object.fromEntries(
      selectedPlatforms.map((platform) => [platform, (metricasInsights[platform] ?? "").trim()])
    );

    generate({
      rol: rol.trim(),
      selectedPlatforms,
      objetivos: objetivosPayload,
      metricasInsights: metricasInsightsPayload,
      periodoInstrucciones: periodoInstrucciones.trim(),
      reglaPrincipal: reglaPrincipal.trim(),
      formatoEntregable: formatoEntregable.trim(),
      estructuraFinal: estructuraFinal.trim(),
      formatoInsight: formatoInsight.trim(),
      priorizacion: priorizacion.trim(),
      reglas: reglas.trim(),
      top10Acciones: top10Acciones.trim(),
      principioFinal: principioFinal.trim(),
      dateRangeStart: range.from,
      dateRangeEnd: range.to,
    });
  }

  const canSubmit = rol.trim().length > 0 && selectedPlatforms.length > 0 && !isSubmitting;

  // Bloques del formulario como lista, no como JSX hardcodeado — agregar un bloque nuevo más
  // adelante es sumar una entrada acá, no reestructurar el árbol de componentes.
  const sections = [
    {
      id: "rol",
      title: "Rol",
      description: "Definí el rol o persona que Claude adopta para redactar el informe.",
      content: (
        <Textarea
          value={rol}
          onChange={(event) => setRol(event.target.value)}
          placeholder="Ej: Actuá como consultor de marketing digital senior, con expertise en paid media, analítica web y SEO."
        />
      ),
    },
    {
      id: "plataformas",
      title: "Plataformas a analizar",
      description: "Fuentes de datos conectadas de este cliente. Destildá las que no querés incluir en este informe.",
      content: (
        <PlataformasBlock
          connectedPlatforms={connectedPlatforms}
          selected={selectedPlatforms}
          onChange={setSelectedPlatforms}
        />
      ),
    },
    {
      id: "objetivos",
      title: "Objetivos",
      description: "Precargados desde la configuración del cliente — editables solo para este informe.",
      content: (
        <ObjetivosBlock
          selectedPlatforms={selectedPlatforms}
          objectives={objectives}
          hasSecondaryGoal={hasSecondaryGoal}
          onChange={handleObjectiveChange}
        />
      ),
    },
    {
      id: "metricas-insights",
      title: "Métricas & Insights",
      description: "Qué mostrar y cómo estructurar los insights, por plataforma.",
      content: (
        <MetricasInsightsBlock
          selectedPlatforms={selectedPlatforms}
          values={metricasInsights}
          onChange={handleMetricasInsightsChange}
        />
      ),
    },
    {
      id: "periodo",
      title: "Período",
      description: "Rango de fechas a analizar e instrucciones sobre cómo usarlo.",
      content: (
        <PeriodoBlock
          preset={preset}
          range={range}
          onRangeChange={handleRangeChange}
          instrucciones={periodoInstrucciones}
          onInstruccionesChange={setPeriodoInstrucciones}
        />
      ),
    },
    {
      id: "regla-principal",
      title: "Regla principal del análisis",
      description: "Qué priorizar al elegir qué mostrar en el informe.",
      content: <ReglaPrincipalBlock value={reglaPrincipal} onChange={setReglaPrincipal} />,
    },
    {
      id: "formato-entregable",
      title: "Formato del entregable",
      description: "Cómo debe verse el informe final: extensión, cantidad de puntos por plataforma, etc.",
      content: <FormatoEntregableBlock value={formatoEntregable} onChange={setFormatoEntregable} />,
    },
    {
      id: "estructura-final",
      title: "Estructura final",
      description: "Qué mostrar antes de entrar al detalle de cada plataforma.",
      content: <EstructuraFinalBlock value={estructuraFinal} onChange={setEstructuraFinal} />,
    },
    {
      id: "formato-insight",
      title: "Formato del Insight",
      description: "Estructura que debe seguir cada insight individual.",
      content: <FormatoInsightBlock value={formatoInsight} onChange={setFormatoInsight} />,
    },
    {
      id: "priorizacion",
      title: "Priorización",
      description: "Cómo clasificar la importancia de cada insight.",
      content: <PriorizacionBlock value={priorizacion} onChange={setPriorizacion} />,
    },
    {
      id: "reglas",
      title: "Reglas",
      description: "Restricciones obligatorias para todo el análisis y el informe.",
      content: <ReglasBlock value={reglas} onChange={setReglas} />,
    },
    {
      id: "top10-acciones",
      title: "TOP 10 - Acciones finales",
      description: "Cómo armar el listado de acciones prioritarias al cierre del informe.",
      content: <Top10AccionesBlock value={top10Acciones} onChange={setTop10Acciones} />,
    },
    {
      id: "principio-final",
      title: "Principio final",
      description: "La lógica y el criterio rector que debe guiar todo el análisis.",
      content: <PrincipioFinalBlock value={principioFinal} onChange={setPrincipioFinal} />,
    },
  ];

  if (isSubmitting) {
    return <GeneratingOverlay clientName={clientName} steps={steps} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent>{section.content}</CardContent>
        </Card>
      ))}

      <div className="flex flex-col gap-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end">
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            Ejecutar
          </Button>
        </div>
      </div>
    </div>
  );
}
