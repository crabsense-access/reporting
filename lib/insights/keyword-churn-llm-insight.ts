import { formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsight, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { SeoKeywordChurnQueryStats } from "@/lib/gsc/reports";

export interface KeywordChurnInsightContext {
  type: "new" | "lost";
  currentWindowLabel: string;
  previousWindowLabel: string;
  brandRegex: string | null;
  keywords: SeoKeywordChurnQueryStats[];
}

const MAX_ROWS_IN_PROMPT = 15;

function describeKeywords(rows: SeoKeywordChurnQueryStats[], brandPattern: RegExp | null): string {
  if (rows.length === 0) return "Sin keywords en esta lista para el período.";

  const top = rows.slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map((row) => {
    const isBrand = brandPattern?.test(row.key) ?? false;
    return `  - "${row.key}"${isBrand ? " (marca)" : ""}: ${formatNumber(row.impressions)} impresiones, ${formatNumber(row.clicks)} clics, CTR ${formatPercent(row.ctr)}, ${row.days} días con impresiones`;
  });
  const omitted = rows.length - top.length;
  return `${lines.join("\n")}${omitted > 0 ? `\n  (+ ${omitted} keywords más, no listadas)` : ""}`;
}

const SYSTEM_PROMPT = `Sos un analista SEO que escribe insights para las tarjetas "Keywords Nuevas" y "Keywords Perdidas" del tablero de Search Console de una agencia. Tu única salida es un objeto JSON, nada más.

Estas tarjetas analizan específicamente el conjunto de keywords que aparecieron por primera vez (Nuevas) o que dejaron de aparecer (Perdidas) entre el período anterior y el actual — no la variación general de tráfico, que ya se muestra aparte. El insight tiene que basarse en el CONTENIDO de esa lista de keywords (de qué tratan, cuánto pesan, si son de marca, cuán concentrado está el volumen, si ya muestran presencia consistente), no en repetir el total de keywords ni el neto — esos números ya están visibles en la tarjeta.

El insight debe responder alguna de estas preguntas: ¿hay un patrón temático entre las keywords que aparecieron/desaparecieron (ej. varias relacionadas a un mismo producto, categoría o intención de búsqueda)? ¿el volumen está concentrado en pocas keywords o repartido parejo? ¿alguna keyword de marca aparece o desaparece (suele ser más relevante que una keyword genérica)? ¿las keywords nuevas ya muestran presencia consistente (muchos días con impresiones) o son un pico aislado? ¿qué implicancia práctica tiene esto para el contenido o el negocio del cliente?

Reglas estrictas:
- Fundamentá el insight ÚNICAMENTE en las keywords y números provistos. No inventes intención de búsqueda, categorías de producto ni causas que no se puedan inferir razonablemente del texto de la keyword.
- Si identificás un patrón temático a partir del texto de las keywords, planteálo con el tono apropiado ("parecen relacionadas a...", "varias mencionan..."), nunca como un hecho verificado externamente.
- No te limites a listar las keywords con más impresiones — buscá qué tienen en común, qué las distingue del resto, o qué las hace relevantes.
- Si la lista es muy corta o no hay ningún patrón claro, decilo con tono modesto en vez de forzar un hallazgo inexistente.
- Nunca repitas literalmente el total de keywords ni el neto — esos datos ya están visibles en la tarjeta.
- Marcá en **negrita** (envolviendo el fragmento entre dobles asteriscos, sintaxis markdown) todos los datos y frases que sostienen el hallazgo: cada keyword puntual que menciones, el patrón temático identificado, los números/porcentajes/cantidad de días relevantes, y la conclusión o implicancia central de la oración final. Usá negrita generosamente — alguien que solo lee las partes en negrita, salteando el resto, tiene que poder entender el hallazgo completo. Un insight de 2-4 oraciones normalmente va a tener varios fragmentos en negrita, no solo uno o dos.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo, con **negrita** markdown generosa en keywords, números y la conclusión central>", "sentiment": "positive" | "negative" | "neutral"}

"sentiment" refleja si el hallazgo es una buena o mala noticia (o neutral/informativo) para el negocio del cliente. En Keywords Nuevas, ganar keywords de marca o de alto volumen suele ser positivo; en Keywords Perdidas, perder keywords de marca o de alto volumen suele ser negativo — pero usá tu criterio según el contenido real de la lista.`;

function buildUserPrompt(context: KeywordChurnInsightContext): string {
  const { type, currentWindowLabel, previousWindowLabel, brandRegex, keywords } = context;

  let brandPattern: RegExp | null = null;
  if (brandRegex) {
    try {
      brandPattern = new RegExp(brandRegex, "i");
    } catch {
      brandPattern = null;
    }
  }

  return `Tipo de análisis: ${type === "new" ? "Keywords Nuevas (aparecieron en el período actual, no estaban en el anterior)" : "Keywords Perdidas (estaban en el período anterior, no aparecen en el actual)"}
Ventana actual: ${currentWindowLabel}
Ventana anterior: ${previousWindowLabel}
Regex de keywords de marca configurado para este cliente: ${brandRegex ?? "no configurado"}

Listado de keywords ${type === "new" ? "nuevas" : "perdidas"} (ordenadas por impresiones, hasta ${MAX_ROWS_IN_PROMPT} de ${keywords.length} totales):
${describeKeywords(keywords, brandPattern)}

Analizá esta lista y devolvé el insight más relevante que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateKeywordChurnInsight(context: KeywordChurnInsightContext): Promise<LLMInsightResult> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsight(SYSTEM_PROMPT, userPrompt);
}
