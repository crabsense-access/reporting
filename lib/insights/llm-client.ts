import Anthropic from "@anthropic-ai/sdk";

// Sonnet 5: suficiente calidad de razonamiento para cruzar varias
// dimensiones y encontrar un hallazgo real, a un costo razonable para algo
// que se cachea 24hs por cliente/métrica (ver lib/insights/insight-cache.ts)
// en vez de llamarse en cada carga de página.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 400;

export class LLMInsightError extends Error {}

export interface LLMInsightResult {
  text: string;
  sentiment: "positive" | "negative" | "neutral";
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY.");
  }
  client = new Anthropic({ apiKey });
  return client;
}

function isValidSentiment(value: unknown): value is LLMInsightResult["sentiment"] {
  return value === "positive" || value === "negative" || value === "neutral";
}

// Forzamos la salida estructurada con un tool_use obligatorio (tool_choice
// fijo a "emit_insight") en vez del viejo truco de "prefill" del mensaje del
// assistant — los modelos de la familia Claude 5 ya no aceptan que la
// conversación termine con un mensaje de assistant sin cerrar, así que esta
// es la vía soportada para JSON confiable.
const EMIT_INSIGHT_TOOL: Anthropic.Tool = {
  name: "emit_insight",
  description: "Registra el insight generado a partir del análisis de los datos.",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "El texto del insight, en español." },
      sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
    },
    required: ["text", "sentiment"],
  },
};

export async function generateStructuredInsight(systemPrompt: string, userPrompt: string): Promise<LLMInsightResult> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [EMIT_INSIGHT_TOOL],
      tool_choice: { type: "tool", name: "emit_insight" },
    });
  } catch (error) {
    throw new LLMInsightError(
      `No se pudo generar el insight (Anthropic): ${error instanceof Error ? error.message : "error desconocido"}`
    );
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "emit_insight"
  );
  if (!toolUseBlock) {
    throw new LLMInsightError("El modelo no devolvió el tool_use esperado.");
  }

  const input = toolUseBlock.input;
  if (
    typeof input !== "object" ||
    input === null ||
    typeof (input as Record<string, unknown>).text !== "string" ||
    !isValidSentiment((input as Record<string, unknown>).sentiment)
  ) {
    throw new LLMInsightError("El tool_use del modelo no tiene la forma esperada ({text, sentiment}).");
  }

  const { text, sentiment } = input as { text: string; sentiment: LLMInsightResult["sentiment"] };
  return { text: text.trim(), sentiment };
}

const MAX_TOKENS_MULTI = 800;

// Mismo mecanismo que emit_insight, pero para bloques donde puede haber más
// de un hallazgo genuino a la vez (ej. Brand vs. Non-Brand: un hallazgo
// sobre Brand y otro distinto sobre Non-Brand) — el modelo decide cuántos
// insights reales hay, entre 1 y 3, en vez de forzar siempre uno solo.
const EMIT_INSIGHTS_TOOL: Anthropic.Tool = {
  name: "emit_insights",
  description: "Registra entre 1 y 3 insights genuinos encontrados a partir del análisis de los datos.",
  input_schema: {
    type: "object",
    properties: {
      insights: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "El texto del insight, en español." },
            sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
          },
          required: ["text", "sentiment"],
        },
      },
    },
    required: ["insights"],
  },
};

export async function generateStructuredInsights(systemPrompt: string, userPrompt: string): Promise<LLMInsightResult[]> {
  const anthropic = getClient();

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_MULTI,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      tools: [EMIT_INSIGHTS_TOOL],
      tool_choice: { type: "tool", name: "emit_insights" },
    });
  } catch (error) {
    throw new LLMInsightError(
      `No se pudo generar el insight (Anthropic): ${error instanceof Error ? error.message : "error desconocido"}`
    );
  }

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "emit_insights"
  );
  if (!toolUseBlock) {
    throw new LLMInsightError("El modelo no devolvió el tool_use esperado.");
  }

  const input = toolUseBlock.input as Record<string, unknown>;
  const rawInsights = input.insights;
  if (!Array.isArray(rawInsights) || rawInsights.length === 0) {
    throw new LLMInsightError("El tool_use del modelo no tiene la forma esperada ({insights: [...]}).");
  }

  const insights: LLMInsightResult[] = [];
  for (const item of rawInsights) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as Record<string, unknown>).text !== "string" ||
      !isValidSentiment((item as Record<string, unknown>).sentiment)
    ) {
      throw new LLMInsightError("Un elemento de 'insights' no tiene la forma esperada ({text, sentiment}).");
    }
    const { text, sentiment } = item as { text: string; sentiment: LLMInsightResult["sentiment"] };
    insights.push({ text: text.trim(), sentiment });
  }

  return insights;
}

export { MODEL as LLM_INSIGHT_MODEL };
