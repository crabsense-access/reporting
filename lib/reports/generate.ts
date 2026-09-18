import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAnthropicClient, isAnthropicPaused } from "@/lib/anthropic/client";
import { buildToolset } from "@/lib/reports/tools";
import { buildSystemPrompt } from "@/lib/reports/systemPrompt";
import { buildPromptMessage, type PlatformObjective } from "@/lib/reports/buildPromptMessage";
import { parseReportContent } from "@/lib/reports/types";
import type { ReportPlatform } from "@/lib/reports/platforms";
import type { Database } from "@/lib/types";

const MAX_TOOL_ITERATIONS = 8;
const MODEL = "claude-opus-5";
const PROMPT_PREVIEW_LENGTH = 60;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  query_search_console: "Search Console",
  query_ga4: "Google Analytics 4",
  query_meta_ads: "Meta Ads",
  query_google_ads: "Google Ads",
};

export type ReportProgressEvent =
  | { type: "status"; message: string }
  | { type: "done"; reportId: string }
  | { type: "error"; message: string };

export type ReportProgressListener = (event: ReportProgressEvent) => void;

interface GenerateReportParams {
  supabase: SupabaseClient<Database>;
  clientId: string;
  clientName: string;
  rol: string;
  selectedPlatforms: ReportPlatform[];
  objetivos: Partial<Record<ReportPlatform, PlatformObjective>>;
  periodoInstrucciones: string;
  reglaPrincipal: string;
  formatoEntregable: string;
  estructuraFinal: string;
  metricasInsights: Partial<Record<ReportPlatform, string>>;
  formatoInsight: string;
  priorizacion: string;
  reglas: string;
  top10Acciones: string;
  principioFinal: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  createdBy: string;
}

async function markFailed(
  supabase: SupabaseClient<Database>,
  reportId: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from("reports")
    .update({ status: "failed", error_message: errorMessage })
    .eq("id", reportId);
}

// Instrumenta cada paso ya existente del loop de tool calling con eventos de progreso — la
// lógica de negocio (loop, guardado, esquema de salida) es la misma que antes. Nunca throwea:
// cualquier fallo se resuelve emitiendo un evento "error" y devolviendo (el caller cierra el
// stream HTTP en su propio finally).
export async function generateReport(
  {
    supabase,
    clientId,
    clientName,
    rol,
    selectedPlatforms,
    objetivos,
    periodoInstrucciones,
    reglaPrincipal,
    formatoEntregable,
    estructuraFinal,
    metricasInsights,
    formatoInsight,
    priorizacion,
    reglas,
    top10Acciones,
    principioFinal,
    dateRangeStart,
    dateRangeEnd,
    createdBy,
  }: GenerateReportParams,
  onEvent: ReportProgressListener
): Promise<void> {
  // Circuito de pausa manual (ver isAnthropicPaused): cortamos antes de tocar la base o de armar
  // el prompt, así "Generar informe" no crea una fila huérfana en "reports" ni intenta pegarle a
  // la API mientras está pausada.
  if (isAnthropicPaused()) {
    onEvent({
      type: "error",
      message:
        "La generación de informes con IA está pausada temporalmente. Probá de nuevo más tarde.",
    });
    return;
  }

  const rolPreview = rol.length > PROMPT_PREVIEW_LENGTH ? `${rol.slice(0, PROMPT_PREVIEW_LENGTH)}...` : rol;
  onEvent({ type: "status", message: `Analizando tu pedido: "${rolPreview}"` });

  const promptText = buildPromptMessage(
    rol,
    selectedPlatforms,
    objetivos,
    periodoInstrucciones,
    reglaPrincipal,
    formatoEntregable,
    estructuraFinal,
    metricasInsights,
    formatoInsight,
    priorizacion,
    reglas,
    top10Acciones,
    principioFinal,
    dateRangeStart,
    dateRangeEnd
  );

  const { data: report, error: insertError } = await supabase
    .from("reports")
    .insert({
      client_id: clientId,
      prompt_text: promptText,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      status: "generating",
      created_by: createdBy,
    })
    .select("id")
    .single();

  if (insertError || !report) {
    onEvent({
      type: "error",
      message: `No se pudo crear el informe: ${insertError?.message ?? "error desconocido"}.`,
    });
    return;
  }

  const reportId = report.id;

  try {
    const { data: dataSources, error: dataSourcesError } = await supabase
      .from("data_sources")
      .select("*")
      .eq("client_id", clientId);

    if (dataSourcesError) {
      throw new Error(`No se pudieron leer las fuentes de datos del cliente: ${dataSourcesError.message}`);
    }

    // Intersección: solo se ofrecen a Claude los tools de las plataformas que el admin
    // seleccionó en el form Y que además están efectivamente conectadas para este cliente.
    const selectedDataSources = (dataSources ?? []).filter((dataSource) =>
      (selectedPlatforms as string[]).includes(dataSource.source_type)
    );
    const { tools, executors } = buildToolset(selectedDataSources);
    const client = getAnthropicClient();
    const system = buildSystemPrompt({ clientName, dateRangeStart, dateRangeEnd });

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: promptText }];

    let finalText: string | null = null;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      // Streaming (en vez de .create()) porque un prompt exigente puede producir un informe
      // final largo — con max_tokens alto, una request no-streaming corre riesgo de timeout.
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        thinking: { type: "adaptive" },
        system,
        tools,
        messages,
      });
      const response = await stream.finalMessage();

      if (response.stop_reason === "end_turn") {
        onEvent({ type: "status", message: "Redactando el informe..." });
        finalText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        break;
      }

      if (response.stop_reason !== "tool_use") {
        throw new Error(`Claude terminó con stop_reason inesperado: ${response.stop_reason}.`);
      }

      messages.push({ role: "assistant", content: response.content });

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      for (const toolUse of toolUseBlocks) {
        const displayName = TOOL_DISPLAY_NAMES[toolUse.name] ?? toolUse.name;
        onEvent({ type: "status", message: `Consultando ${displayName}...` });
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (toolUse): Promise<Anthropic.ToolResultBlockParam> => {
          const executor = executors.get(toolUse.name);
          if (!executor) {
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `La herramienta "${toolUse.name}" no está disponible para este cliente.`,
              is_error: true,
            };
          }
          try {
            const result = await executor(toolUse.input as Record<string, unknown>);
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            };
          } catch (error) {
            return {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: error instanceof Error ? error.message : "Error desconocido al ejecutar la herramienta.",
              is_error: true,
            };
          }
        })
      );

      messages.push({ role: "user", content: toolResults });
    }

    if (finalText === null) {
      const message = "Se alcanzó el límite de iteraciones de tools sin que el modelo generara el informe final.";
      await markFailed(supabase, reportId, message);
      onEvent({ type: "error", message });
      return;
    }

    let structuredContent;
    try {
      structuredContent = parseReportContent(JSON.parse(finalText));
    } catch (error) {
      const message = `No se pudo interpretar el informe generado: ${error instanceof Error ? error.message : "error desconocido"}.`;
      await markFailed(supabase, reportId, message);
      onEvent({ type: "error", message });
      return;
    }

    await supabase
      .from("reports")
      .update({ status: "completed", structured_content: structuredContent })
      .eq("id", reportId);

    onEvent({ type: "done", reportId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al generar el informe.";
    await markFailed(supabase, reportId, message);
    onEvent({ type: "error", message });
  }
}
