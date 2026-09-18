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
import { useGenerateReportInline } from "@/components/admin/configuracion-v3/useGenerateReportInline";
import { readGoalString } from "@/lib/reports/objectives";
import { isSourceConfigured } from "@/lib/reports/dataSourceValidation";
import { DIAGNOSTIC_REGLAS_FIJAS } from "@/lib/reports/diagnosticPrompts";
import { DEFAULT_ROL_UNIFICADO } from "@/lib/reports/rolDefaults";
import { DEFAULT_EFICIENCIA_TOKENS } from "@/lib/reports/tokenEfficiencyDefaults";
import { DATA_SOURCE_DISPLAY_ORDER, PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";
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

interface ConfiguracionV3FormProps {
  clients: ClientWithSources[];
}

const PLATFORM_BADGE: Record<ReportPlatform, { icon: typeof BarChart3; className: string }> = {
  ga4: { icon: BarChart3, className: "border-primary/30 bg-primary/10 text-primary" },
  search_console: { icon: Search, className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  google_ads: { icon: Sparkles, className: "border-amber-200 bg-amber-50 text-amber-700" },
  meta_ads: { icon: Megaphone, className: "border-sky-200 bg-sky-50 text-sky-700" },
};

// Fuentes activas de un cliente (con config cargada, no solo la fila creada), en el mismo orden
// que el step "Fuentes de datos" del wizard — determina qué plataformas consulta el informe.
function getActivePlatforms(sources: ClientSourceEntry[]): ReportPlatform[] {
  return DATA_SOURCE_DISPLAY_ORDER.filter((platform) => {
    const source = sources.find((entry) => entry.platform === platform);
    return source ? isSourceConfigured({ source_type: source.platform, config: source.config }) : false;
  });
}

export function ConfiguracionV3Form({ clients }: ConfiguracionV3FormProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  const [rol, setRol] = useState(DEFAULT_ROL_UNIFICADO);
  const [eficienciaTokens, setEficienciaTokens] = useState(DEFAULT_EFICIENCIA_TOKENS);

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
    setRol(DEFAULT_ROL_UNIFICADO);
    setEficienciaTokens(DEFAULT_EFICIENCIA_TOKENS);
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

  const activePlatforms = selectedClient ? getActivePlatforms(selectedClient.sources) : [];

  const canSubmit = Boolean(selectedClient) && rol.trim().length > 0 && activePlatforms.length > 0 && !isSubmitting;

  function handleSubmit() {
    if (!selectedClient || !canSubmit) return;

    const selectedPlatforms = activePlatforms;

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

    const trimmedEficienciaTokens = eficienciaTokens.trim();
    const rolFinal = trimmedEficienciaTokens
      ? `${rol.trim()}\n\n### Eficiencia de tokens\n${trimmedEficienciaTokens}`
      : rol.trim();

    setReportContent(null);
    setReportMeta(null);
    setReportError(null);

    generate({
      rol: rolFinal,
      selectedPlatforms,
      objetivos: objetivosPayload,
      metricasInsights: metricasInsightsPayload,
      periodoInstrucciones: periodoInstrucciones.trim(),
      reglaPrincipal: "",
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
          {activePlatforms.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Rol</CardTitle>
                <CardDescription>
                  Este cliente todavía no tiene ninguna fuente de datos configurada.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Rol</CardTitle>
                <CardDescription>
                  Rol único que Claude adopta para analizar en conjunto todas las fuentes configuradas de este
                  cliente ({activePlatforms.map((platform) => PLATFORM_LABELS[platform]).join(", ")}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea value={rol} onChange={(event) => setRol(event.target.value)} rows={16} />
              </CardContent>
            </Card>
          )}

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

          <Card>
            <CardHeader>
              <CardTitle>Eficiencia de tokens</CardTitle>
              <CardDescription>
                Lineamientos de generación que Claude debe seguir al armar el informe (además de qué analizar,
                cómo hacerlo de forma eficiente).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={eficienciaTokens}
                onChange={(event) => setEficienciaTokens(event.target.value)}
                rows={16}
              />
            </CardContent>
          </Card>

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
