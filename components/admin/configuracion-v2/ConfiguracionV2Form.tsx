"use client";

import { useState } from "react";
import { BarChart3, Megaphone, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { GeneratingOverlay } from "@/components/admin/reports/GeneratingOverlay";
import { ReportInfographic } from "@/components/admin/reports/ReportInfographic";
import { PeriodoBlock } from "@/components/admin/reports/blocks/PeriodoBlock";
import { DiagnosticPromptBlock } from "@/components/admin/configuracion-v2/DiagnosticPromptBlock";
import { useGenerateReportInline } from "@/components/admin/configuracion-v2/useGenerateReportInline";
import { readGoalString } from "@/lib/reports/objectives";
import { isSourceConfigured } from "@/lib/reports/dataSourceValidation";
import {
  DIAGNOSTIC_DEFAULT_ROL,
  DIAGNOSTIC_PROMPTS,
  DIAGNOSTIC_REGLAS_FIJAS,
  type DiagnosticPromptId,
} from "@/lib/reports/diagnosticPrompts";
import { PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";
import { getPresetRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import {
  DEFAULT_ESTRUCTURA_FINAL,
  DEFAULT_FORMATO_ENTREGABLE,
  DEFAULT_METRICAS_INSIGHTS,
  DEFAULT_PERIODO_INSTRUCCIONES,
  DEFAULT_PRINCIPIO_FINAL,
  DEFAULT_TOP10_ACCIONES,
} from "@/lib/reports/promptBlocks";
import type { ReportContent } from "@/lib/reports/types";

interface ClientSourceEntry {
  platform: ReportPlatform;
  config: Record<string, unknown>;
}

interface ClientWithSources {
  id: string;
  name: string;
  slug: string;
  sources: ClientSourceEntry[];
}

interface ConfiguracionV2FormProps {
  clients: ClientWithSources[];
}

type PromptState = Record<DiagnosticPromptId, { included: boolean; text: string }>;

const PLATFORM_BADGE: Record<ReportPlatform, { icon: typeof BarChart3; className: string }> = {
  ga4: { icon: BarChart3, className: "border-primary/30 bg-primary/10 text-primary" },
  search_console: { icon: Search, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  google_ads: { icon: Sparkles, className: "border-amber-200 bg-amber-50 text-amber-700" },
  meta_ads: { icon: Megaphone, className: "border-sky-200 bg-sky-50 text-sky-700" },
};

const REQUIRED_ID_FIELD: Record<ReportPlatform, string> = {
  ga4: "property_id",
  search_console: "site_url",
  google_ads: "customer_id",
  meta_ads: "ad_account_id",
};

function buildInitialPromptState(): PromptState {
  return Object.fromEntries(
    DIAGNOSTIC_PROMPTS.map((def) => [def.id, { included: false, text: def.defaultInstruction }])
  ) as PromptState;
}

function periodoLabel(preset: DateRangePreset, range: DateRangeValue): string {
  switch (preset) {
    case "7d":
      return "Últimos 7 días";
    case "30d":
      return "Últimos 30 días";
    case "90d":
      return "Últimos 90 días";
    case "custom":
      return `Personalizado: ${range.from} a ${range.to}`;
  }
}

// [CLIENTE], [PERÍODO] y [URL] se concatenan con su valor real dentro del mismo corchete
// (ej. "[CLIENTE - Rhinoshield]") en vez de reemplazarse — así queda explícito en el prompt
// final qué dato completó cada placeholder.
function applyPlaceholders(text: string, clienteNombre: string, periodo: string, url: string | null): string {
  let result = text.replaceAll("[CLIENTE]", `[CLIENTE - ${clienteNombre}]`).replaceAll(
    "[PERÍODO]",
    `[PERÍODO - ${periodo}]`
  );
  if (url) {
    result = result.replaceAll("[URL o dominio]", `[URL - ${url}]`).replaceAll("[URL]", `[URL - ${url}]`);
  }
  return result;
}

function buildConfigSummary(platforms: ReportPlatform[], sources: ClientSourceEntry[]): string {
  return platforms
    .map((platform) => {
      const source = sources.find((entry) => entry.platform === platform);
      const bits = [PLATFORM_LABELS[platform]];
      if (source) {
        const idValue = source.config[REQUIRED_ID_FIELD[platform]];
        if (typeof idValue === "string" && idValue) bits.push(idValue);
        const primaryGoal = readGoalString(source.config, "primary_goal");
        if (primaryGoal) bits.push(`conversión: ${primaryGoal}`);
      }
      return bits.join(" · ");
    })
    .join("  /  ");
}

export function ConfiguracionV2Form({ clients }: ConfiguracionV2FormProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  const [rol, setRol] = useState(DIAGNOSTIC_DEFAULT_ROL);

  const [promptState, setPromptState] = useState<PromptState>(buildInitialPromptState);

  const [preset, setPreset] = useState<DateRangePreset>("7d");
  const [range, setRange] = useState<DateRangeValue>(getPresetRange("7d"));
  const [periodoInstrucciones, setPeriodoInstrucciones] = useState(DEFAULT_PERIODO_INSTRUCCIONES);

  const [reportContent, setReportContent] = useState<ReportContent | null>(null);
  const [reportMeta, setReportMeta] = useState<{
    createdAt: string;
    dateRangeStart: string;
    dateRangeEnd: string;
  } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const { steps, isSubmitting, error, generate } = useGenerateReportInline(
    selectedClient?.id ?? "",
    async (reportId) => {
      if (!selectedClient) return;
      setLoadingReport(true);
      try {
        const response = await fetch(`/api/clients/${selectedClient.id}/reports/${reportId}`);
        const body = await response.json();
        if (!response.ok || !body.report) {
          setReportError(body?.error ?? "No se pudo cargar el informe generado.");
          return;
        }
        if (body.report.status === "failed") {
          setReportError(body.report.error_message ?? "La generación falló.");
          return;
        }
        setReportContent(body.report.structured_content);
        setReportMeta({
          createdAt: body.report.created_at,
          dateRangeStart: body.report.date_range_start,
          dateRangeEnd: body.report.date_range_end,
        });
      } catch {
        setReportError("No se pudo cargar el informe generado.");
      } finally {
        setLoadingReport(false);
      }
    }
  );

  function handleSelectClient(clientId: string) {
    setSelectedClientId(clientId);
    setRol(DIAGNOSTIC_DEFAULT_ROL);
    setPromptState(buildInitialPromptState());
    setPreset("7d");
    setRange(getPresetRange("7d"));
    setPeriodoInstrucciones(DEFAULT_PERIODO_INSTRUCCIONES);
    setReportContent(null);
    setReportMeta(null);
    setReportError(null);
  }

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setPreset(nextPreset);
    setRange(nextRange);
  }

  const configuredPlatforms = new Set<ReportPlatform>();
  (selectedClient?.sources ?? []).forEach((source) => {
    if (isSourceConfigured({ source_type: source.platform, config: source.config })) {
      configuredPlatforms.add(source.platform);
    }
  });

  const activeIncludedDefs = DIAGNOSTIC_PROMPTS.filter((def) => {
    const activation = def.requiredPlatforms(configuredPlatforms);
    return activation !== null && promptState[def.id]?.included;
  });

  const canSubmit =
    Boolean(selectedClient) && rol.trim().length > 0 && activeIncludedDefs.length > 0 && !isSubmitting;

  function handleSubmit() {
    if (!selectedClient || !canSubmit) return;

    const platformSet = new Set<ReportPlatform>();
    activeIncludedDefs.forEach((def) => {
      (def.requiredPlatforms(configuredPlatforms) ?? []).forEach((platform) => platformSet.add(platform));
    });
    const selectedPlatforms = Array.from(platformSet);

    const periodo = periodoLabel(preset, range);
    const searchConsoleSource = selectedClient.sources.find((entry) => entry.platform === "search_console");
    const urlValue = searchConsoleSource ? readGoalString(searchConsoleSource.config, "site_url") : "";

    const reglaPrincipal = activeIncludedDefs
      .map((def) => {
        const text = applyPlaceholders(
          (promptState[def.id]?.text ?? "").trim(),
          selectedClient.name,
          periodo,
          urlValue || null
        );
        return `### ${def.titulo}\n${text}`;
      })
      .join("\n\n");

    const objetivosPayload = Object.fromEntries(
      selectedPlatforms.map((platform) => {
        const source = selectedClient.sources.find((entry) => entry.platform === platform);
        return [
          platform,
          {
            principal: source ? readGoalString(source.config, "primary_goal") : "",
            secundario: source ? readGoalString(source.config, "secondary_goal") : "",
          },
        ];
      })
    );

    const metricasInsightsPayload = Object.fromEntries(
      selectedPlatforms.map((platform) => [platform, DEFAULT_METRICAS_INSIGHTS[platform] ?? ""])
    );

    setReportContent(null);
    setReportMeta(null);
    setReportError(null);

    generate({
      rol: rol.trim(),
      selectedPlatforms,
      objetivos: objetivosPayload,
      metricasInsights: metricasInsightsPayload,
      periodoInstrucciones: periodoInstrucciones.trim(),
      reglaPrincipal,
      formatoEntregable: DEFAULT_FORMATO_ENTREGABLE,
      estructuraFinal: DEFAULT_ESTRUCTURA_FINAL,
      formatoInsight: "",
      priorizacion: "",
      reglas: DIAGNOSTIC_REGLAS_FIJAS,
      top10Acciones: DEFAULT_TOP10_ACCIONES,
      principioFinal: DEFAULT_PRINCIPIO_FINAL,
      dateRangeStart: range.from,
      dateRangeEnd: range.to,
    });
  }

  if (isSubmitting) {
    return <GeneratingOverlay clientName={selectedClient?.name ?? ""} steps={steps} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Clientes configurados</CardTitle>
          <CardDescription>Elegí el cliente para el que vas a generar el informe.</CardDescription>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay clientes dados de alta.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {clients.map((client) => {
                const platforms = Array.from(new Set(client.sources.map((source) => source.platform)));
                const isSelected = client.id === selectedClientId;

                return (
                  <button
                    type="button"
                    key={client.id}
                    onClick={() => handleSelectClient(client.id)}
                    className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
                      isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <span className="font-medium text-foreground">{client.name}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {platforms.length === 0 && (
                        <span className="text-xs italic text-muted-foreground">Sin fuentes</span>
                      )}
                      {platforms.map((platform) => {
                        const badge = PLATFORM_BADGE[platform];
                        const Icon = badge.icon;
                        return (
                          <Badge key={platform} variant="outline" className={`gap-1 ${badge.className}`}>
                            <Icon className="h-3 w-3" />
                            {PLATFORM_LABELS[platform]}
                          </Badge>
                        );
                      })}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedClient && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Rol</CardTitle>
              <CardDescription>
                Opcional — cada prompt de diagnóstico ya trae su propio rol embebido. Editá este texto solo si
                querés sumar contexto extra.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={rol} onChange={(event) => setRol(event.target.value)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Período</CardTitle>
              <CardDescription>Rango de fechas a analizar e instrucciones sobre cómo usarlo.</CardDescription>
            </CardHeader>
            <CardContent>
              <PeriodoBlock
                preset={preset}
                range={range}
                onRangeChange={handleRangeChange}
                instrucciones={periodoInstrucciones}
                onInstruccionesChange={setPeriodoInstrucciones}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Prompts de diagnóstico</h2>
              <p className="text-sm text-muted-foreground">
                Se activan según las fuentes conectadas y configuradas de {selectedClient.name}. Tildá los que
                querés incluir en el reporte final.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {DIAGNOSTIC_PROMPTS.map((def) => {
                const activation = def.requiredPlatforms(configuredPlatforms);
                const active = activation !== null;

                return (
                  <DiagnosticPromptBlock
                    key={def.id}
                    def={def}
                    active={active}
                    included={promptState[def.id]?.included ?? false}
                    text={promptState[def.id]?.text ?? def.defaultInstruction}
                    configSummary={active ? buildConfigSummary(activation, selectedClient.sources) : null}
                    onToggle={(included) =>
                      setPromptState((prev) => ({ ...prev, [def.id]: { ...prev[def.id], included } }))
                    }
                    onTextChange={(text) =>
                      setPromptState((prev) => ({ ...prev, [def.id]: { ...prev[def.id], text } }))
                    }
                  />
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {(error || reportError) && <p className="text-sm text-destructive">{error ?? reportError}</p>}
            <div className="flex justify-end">
              <Button type="button" onClick={handleSubmit} disabled={!canSubmit || loadingReport}>
                Crear reporte
              </Button>
            </div>
          </div>

          {loadingReport && <p className="text-sm text-muted-foreground">Cargando el informe generado…</p>}

          {reportContent && reportMeta && (
            <ReportInfographic
              content={reportContent}
              clientName={selectedClient.name}
              createdAt={reportMeta.createdAt}
              dateRangeStart={reportMeta.dateRangeStart}
              dateRangeEnd={reportMeta.dateRangeEnd}
            />
          )}
        </>
      )}
    </div>
  );
}
