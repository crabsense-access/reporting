import type Anthropic from "@anthropic-ai/sdk";

import { getAnthropicClient } from "@/lib/anthropic/client";

// Genera una leyenda breve de "hallazgos principales" para un gráfico del
// calendario de inversión: un titular corto + 1-2 oraciones + una lista de
// 2-4 cifras clave, a partir de las métricas YA CALCULADAS y formateadas
// del lado del cliente (mismos números que se ven en el gráfico y sus
// pills/tooltips) — Claude sólo las interpreta y redacta, no recalcula ni
// reformatea valores, para que el texto nunca contradiga lo que el usuario
// ve en pantalla.

const MODEL = "claude-opus-5";

export interface ChartInsightHighlight {
  label: string;
  value: string;
}

export interface ChartInsight {
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced && fenced[1] ? fenced[1].trim() : trimmed;
}

function parseChartInsight(text: string): ChartInsight {
  const raw: unknown = JSON.parse(extractJsonText(text));

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claude no devolvió un objeto JSON.");
  }
  const { headline, body, highlights } = raw as Record<string, unknown>;
  if (typeof headline !== "string" || typeof body !== "string" || !Array.isArray(highlights)) {
    throw new Error("El JSON de Claude no tiene el formato esperado (headline/body/highlights).");
  }

  const cleanHighlights: ChartInsightHighlight[] = highlights.filter(
    (item): item is ChartInsightHighlight =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).label === "string" &&
      typeof (item as Record<string, unknown>).value === "string"
  );

  return { headline: headline.trim(), body: body.trim(), highlights: cleanHighlights };
}

interface GenerateChartInsightParams {
  instructions: string;
  metrics: unknown;
}

export async function generateChartInsight({ instructions, metrics }: GenerateChartInsightParams): Promise<ChartInsight> {
  const client = getAnthropicClient();

  const system =
    "Sos un analista de marketing digital que redacta hallazgos breves para un dashboard de reporting " +
    "en español (Argentina), tono profesional y directo, sin relleno. Respondé ÚNICAMENTE con un " +
    "objeto JSON válido, sin texto adicional ni bloques de código, con esta forma exacta: " +
    '{"headline": string, "body": string, "highlights": [{"label": string, "value": string}]}. ' +
    '"headline" es un titular de hasta 8 palabras con el hallazgo más importante del período. ' +
    '"body" son 1 o 2 oraciones que dan contexto al hallazgo, sin repetir las cifras exactas que ya ' +
    'van en "highlights". "highlights" son entre 2 y 4 cifras clave — usá EXACTAMENTE los valores ya ' +
    "formateados que te paso en los datos (no los recalcules, no cambies el formato de moneda ni de " +
    'decimales), con una "label" corta (2-3 palabras) para cada una.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: `${instructions}\n\nDatos del período (JSON, ya calculados y formateados):\n${JSON.stringify(metrics, null, 2)}`,
      },
    ],
  });

  return parseChartInsight(extractResponseText(response));
}

function extractResponseText(response: Anthropic.Message): string {
  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock) {
    throw new Error("Claude no devolvió contenido de texto.");
  }
  return textBlock.text;
}

export interface ChartInsightByType {
  tipo: string;
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
  esMejor: boolean;
}

function parseChartInsightsByType(text: string): ChartInsightByType[] {
  const raw: unknown = JSON.parse(extractJsonText(text));

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claude no devolvió un objeto JSON.");
  }
  const { items } = raw as Record<string, unknown>;
  if (!Array.isArray(items)) {
    throw new Error("El JSON de Claude no tiene el formato esperado (items).");
  }

  const parsed: ChartInsightByType[] = items.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Un item del JSON de Claude no es un objeto válido.");
    }
    const { tipo, headline, body, highlights, esMejor } = item as Record<string, unknown>;
    if (
      typeof tipo !== "string" ||
      typeof headline !== "string" ||
      typeof body !== "string" ||
      !Array.isArray(highlights) ||
      typeof esMejor !== "boolean"
    ) {
      throw new Error("Un item del JSON de Claude no tiene el formato esperado (tipo/headline/body/highlights/esMejor).");
    }
    const cleanHighlights: ChartInsightHighlight[] = highlights.filter(
      (h): h is ChartInsightHighlight =>
        typeof h === "object" &&
        h !== null &&
        typeof (h as Record<string, unknown>).label === "string" &&
        typeof (h as Record<string, unknown>).value === "string"
    );
    return { tipo: tipo.trim(), headline: headline.trim(), body: body.trim(), highlights: cleanHighlights, esMejor };
  });

  if (parsed.length === 0) {
    throw new Error("Claude no devolvió ningún hallazgo por tipo.");
  }

  return parsed;
}

interface GenerateChartInsightsByTypeParams {
  instructions: string;
  metrics: unknown;
}

/**
 * Igual que generateChartInsight, pero le pide a Claude un hallazgo INDEPENDIENTE por cada
 * tipo de campaña presente en los datos (en vez de un único resumen combinado), marcando
 * cuál de los tipos tiene mejor performance general para destacarlo en la UI.
 */
export interface CampaignHighlight {
  rol: "mejor" | "peor";
  nombre: string;
  headline: string;
  body: string;
  highlights: ChartInsightHighlight[];
}

function parseCampaignHighlights(text: string): CampaignHighlight[] {
  const raw: unknown = JSON.parse(extractJsonText(text));

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claude no devolvió un objeto JSON.");
  }
  const { items } = raw as Record<string, unknown>;
  if (!Array.isArray(items)) {
    throw new Error("El JSON de Claude no tiene el formato esperado (items).");
  }

  const parsed: CampaignHighlight[] = items.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Un item del JSON de Claude no es un objeto válido.");
    }
    const { rol, nombre, headline, body, highlights } = item as Record<string, unknown>;
    if (
      (rol !== "mejor" && rol !== "peor") ||
      typeof nombre !== "string" ||
      typeof headline !== "string" ||
      typeof body !== "string" ||
      !Array.isArray(highlights)
    ) {
      throw new Error("Un item del JSON de Claude no tiene el formato esperado (rol/nombre/headline/body/highlights).");
    }
    const cleanHighlights: ChartInsightHighlight[] = highlights.filter(
      (h): h is ChartInsightHighlight =>
        typeof h === "object" &&
        h !== null &&
        typeof (h as Record<string, unknown>).label === "string" &&
        typeof (h as Record<string, unknown>).value === "string"
    );
    return { rol, nombre: nombre.trim(), headline: headline.trim(), body: body.trim(), highlights: cleanHighlights };
  });

  if (!parsed.some((item) => item.rol === "mejor") || !parsed.some((item) => item.rol === "peor")) {
    throw new Error("Claude no devolvió un hallazgo de \"mejor\" y otro de \"peor\" campaña.");
  }

  return parsed;
}

interface GenerateCampaignHighlightsParams {
  instructions: string;
  metrics: unknown;
}

/**
 * Genera exactamente 2 hallazgos — uno para la campaña con mejor performance del mes y otro para
 * la de peor performance — ya elegidas de antemano en el código (por CPL, ver CampaignAnalysis.tsx)
 * para que el texto nunca contradiga qué campaña aparece destacada/atrasada en el ranking. Claude
 * sólo redacta el hallazgo de cada una, no decide cuál es cuál.
 */
export async function generateCampaignHighlights({
  instructions,
  metrics,
}: GenerateCampaignHighlightsParams): Promise<CampaignHighlight[]> {
  const client = getAnthropicClient();

  const system =
    "Sos un analista de marketing digital que redacta hallazgos breves para un dashboard de reporting " +
    "en español (Argentina), tono profesional y directo, sin relleno. Vas a recibir datos YA " +
    'CALCULADOS y formateados de dos campañas puntuales: una en "mejor" (la de mejor performance ' +
    'del mes) y otra en "peor" (la de peor performance). Redactá un hallazgo para CADA UNA — no ' +
    "decidas vos cuál es mejor o peor, eso ya viene decidido en los datos. Para la peor, el tono es " +
    "constructivo (una oportunidad de mejora, no un reto). Respondé ÚNICAMENTE con un objeto JSON " +
    'válido, sin texto adicional ni bloques de código, con esta forma exacta: {"items": [{"rol": ' +
    '"mejor" | "peor", "nombre": string, "headline": string, "body": string, "highlights": ' +
    '[{"label": string, "value": string}]}, ...]} (siempre 2 items, uno de cada rol). "nombre" debe ' +
    'copiar EXACTAMENTE el campo "nombre" de esa campaña en los datos de entrada. "headline" es un ' +
    'titular de hasta 7 palabras con el hallazgo principal de esa campaña. "body" es 1 oración de ' +
    'contexto, sin repetir las cifras exactas que ya van en "highlights". "highlights" son 1 a 3 ' +
    "cifras clave de esa campaña — usá EXACTAMENTE los valores ya formateados que te paso en los " +
    "datos (no los recalcules, no cambies el formato de moneda ni de decimales), con una \"label\" " +
    'corta (2-3 palabras) para cada una. No inventes datos que no estén en el JSON de entrada.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [
      {
        role: "user",
        content: `${instructions}\n\nDatos de las dos campañas (JSON, ya calculados y formateados):\n${JSON.stringify(metrics, null, 2)}`,
      },
    ],
  });

  return parseCampaignHighlights(extractResponseText(response));
}

export interface Recommendation {
  accion: string;
  detalle: string;
  plazo: string;
}

function parseRecommendations(text: string): Recommendation[] {
  const raw: unknown = JSON.parse(extractJsonText(text));

  if (typeof raw !== "object" || raw === null) {
    throw new Error("Claude no devolvió un objeto JSON.");
  }
  const { items } = raw as Record<string, unknown>;
  if (!Array.isArray(items)) {
    throw new Error("El JSON de Claude no tiene el formato esperado (items).");
  }

  const parsed: Recommendation[] = items.map((item) => {
    if (typeof item !== "object" || item === null) {
      throw new Error("Un item del JSON de Claude no es un objeto válido.");
    }
    const { accion, detalle, plazo } = item as Record<string, unknown>;
    if (typeof accion !== "string" || typeof detalle !== "string" || typeof plazo !== "string") {
      throw new Error("Un item del JSON de Claude no tiene el formato esperado (accion/detalle/plazo).");
    }
    return { accion: accion.trim(), detalle: detalle.trim(), plazo: plazo.trim() };
  });

  if (parsed.length < 3) {
    throw new Error("Claude no devolvió suficientes recomendaciones.");
  }

  return parsed;
}

interface GenerateRecommendationsParams {
  instructions: string;
  metrics: unknown;
}

/**
 * A diferencia del resto de los generadores de este archivo, que comentan UN gráfico puntual,
 * esto mira un resumen de TODAS las secciones reales del calendario de inversión del mes (ver
 * InvestmentCalendar.tsx — recommendationsMetrics) y devuelve entre 5 y 8 acciones concretas de
 * alto impacto, ordenadas de mayor a menor prioridad — el cierre de la página (ver
 * RecommendationsPanel.tsx).
 */
export async function generateRecommendations({ instructions, metrics }: GenerateRecommendationsParams): Promise<Recommendation[]> {
  const client = getAnthropicClient();

  const system =
    "Sos un estratega de marketing digital que revisa el desempeño completo del mes de una cuenta " +
    "de Meta Ads y redacta recomendaciones accionables para un dashboard de reporting en español " +
    "(Argentina), tono profesional y directo, sin relleno. Vas a recibir un resumen YA CALCULADO y " +
    "formateado de TODAS las secciones del calendario de inversión del mes (resumen general por " +
    "Objetivo, provincias, audiencia, horario, día de la semana y retención de video). Elegí entre " +
    "5 y 8 acciones concretas de ALTO IMPACTO para mejorar la performance de las campañas y los " +
    "leads del próximo período — priorizá lo que tenga mayor potencial de impacto y menor " +
    "riesgo/esfuerzo, ordenadas de mayor a menor prioridad, y basate ÚNICAMENTE en los datos que te " +
    "paso (no inventes campañas, cifras ni hallazgos que no estén en el JSON de entrada). Respondé " +
    'ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques de código, con esta forma ' +
    'exacta: {"items": [{"accion": string, "detalle": string, "plazo": string}, ...]} (entre 5 y 8 ' +
    'items). "accion" es un título corto (4 a 8 palabras) en modo imperativo (ej. "Reasignar ' +
    'presupuesto hacia..."). "detalle" son 1 a 2 oraciones que explican POR QUÉ, citando cifras ' +
    'concretas de los datos de entrada (usá EXACTAMENTE los valores ya formateados, no los ' +
    'recalcules ni cambies el formato). "plazo" es exactamente uno de estos 3 valores: "Inmediato", ' +
    '"Corto plazo" o "Próximo mes".';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [
      {
        role: "user",
        content: `${instructions}\n\nResumen del mes, todas las secciones (JSON, ya calculado y formateado):\n${JSON.stringify(metrics, null, 2)}`,
      },
    ],
  });

  return parseRecommendations(extractResponseText(response));
}

export async function generateChartInsightsByType({
  instructions,
  metrics,
}: GenerateChartInsightsByTypeParams): Promise<ChartInsightByType[]> {
  const client = getAnthropicClient();

  const system =
    "Sos un analista de marketing digital que redacta hallazgos breves para un dashboard de reporting " +
    "en español (Argentina), tono profesional y directo, sin relleno. Vas a recibir datos YA CALCULADOS " +
    "y formateados, desglosados por tipo de campaña. Generá un hallazgo INDEPENDIENTE por cada tipo de " +
    "campaña que aparezca en el array \"porTipo\" de los datos, y marcá con \"esMejor\": true únicamente " +
    "al tipo con mejor performance general del período (considerá volumen de leads y costo por lead — " +
    "en general, menor CPL con volumen razonable es mejor — usá criterio profesional). Los demás tipos " +
    'llevan "esMejor": false. Respondé ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni ' +
    'bloques de código, con esta forma exacta: {"items": [{"tipo": string, "headline": string, "body": ' +
    'string, "highlights": [{"label": string, "value": string}], "esMejor": boolean}, ...]}. "tipo" debe ' +
    'copiar EXACTAMENTE el valor "tipo" de ese elemento en el array "porTipo" de los datos de entrada. ' +
    '"headline" es un titular de hasta 7 palabras con el hallazgo principal de ESE tipo. "body" es 1 ' +
    'oración de contexto para ESE tipo, sin repetir las cifras exactas que ya van en "highlights". ' +
    '"highlights" son 1 a 3 cifras clave de ESE tipo — usá EXACTAMENTE los valores ya formateados que ' +
    "te paso en los datos (no los recalcules, no cambies el formato de moneda ni de decimales), con una " +
    '"label" corta (2-3 palabras) para cada una. No inventes datos que no estén en el JSON de entrada.';

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1536,
    system,
    messages: [
      {
        role: "user",
        content: `${instructions}\n\nDatos del período por tipo de campaña (JSON, ya calculados y formateados):\n${JSON.stringify(metrics, null, 2)}`,
      },
    ],
  });

  return parseChartInsightsByType(extractResponseText(response));
}
