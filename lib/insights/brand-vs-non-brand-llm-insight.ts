import { formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsights, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { SeoBrandVsNonBrandKeywordStat } from "@/lib/gsc/reports";

export interface BrandVsNonBrandInsightContext {
  brandCount: number;
  nonBrandCount: number;
  brandPct: number;
  nonBrandPct: number;
  brandKeywords: SeoBrandVsNonBrandKeywordStat[];
  nonBrandKeywords: SeoBrandVsNonBrandKeywordStat[];
}

const MAX_ROWS_IN_PROMPT = 15;

function describeKeywords(rows: SeoBrandVsNonBrandKeywordStat[]): string {
  if (rows.length === 0) return "Sin keywords en este grupo para el período.";

  const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
  const top = sorted.slice(0, MAX_ROWS_IN_PROMPT);
  const lines = top.map(
    (row) => `  - "${row.key}": ${formatNumber(row.impressions)} impresiones, ${formatNumber(row.clicks)} clics, CTR ${formatPercent(row.ctr)}`
  );
  const omitted = rows.length - top.length;
  return `${lines.join("\n")}${omitted > 0 ? `\n  (+ ${omitted} keywords más, no listadas)` : ""}`;
}

const SYSTEM_PROMPT = `Sos un analista SEO que escribe insights para el bloque "Brand vs. Non-Brand" del tablero de Search Console de una agencia. Tu única salida es un objeto JSON, nada más.

Este bloque separa las keywords del período en dos grupos según si contienen o no la marca del cliente (regex ya configurado), y muestra el split (cantidad y % de cada grupo) y una tabla de detalle (keyword, impresiones, clics, CTR) por grupo. Ese split porcentual YA se muestra visualmente arriba — nunca lo repitas como si fuera el hallazgo.

Podés encontrar hallazgos genuinos DENTRO de un grupo (ej. concentración de volumen en pocas keywords, un patrón temático, una keyword puntual que destaca) o CRUZANDO ambos grupos (ej. una diferencia marcada de CTR entre Brand y Non-Brand — lo esperable es que Brand tenga CTR bien superior porque es una búsqueda de intención directa; si no es así, eso es una señal digna de mención; también puede pasar que el volumen non-brand esté mejor distribuido/ temáticamente más rico que el de marca, o viceversa).

Reglas estrictas:
- Fundamentá cada insight ÚNICAMENTE en las keywords y números provistos. No inventes intención de búsqueda, categorías de producto ni causas que no se puedan inferir razonablemente del texto de la keyword.
- Nunca repitas el split Brand/Non-Brand (cantidad o %) como si fuera un hallazgo — eso ya es visible arriba.
- Buscá una concentración, contraste o anomalía genuina, no simplemente la keyword con más impresiones.
- Si un hallazgo sugiere una causa, planteala como hipótesis ("podría", "sugiere revisar"), nunca como hecho confirmado.
- Devolvé SOLO los insights que realmente encuentres (1 a 3) — no fuerces un segundo o tercer insight si no hay más que un hallazgo genuino en los datos. Está perfecto devolver uno solo.
- Si corresponde, un insight puede ser positivo y otro negativo a la vez (ej. "Brand con buen CTR" + "Non-Brand con volumen muy disperso, sin ninguna keyword que destaque").
- Marcá en **negrita** (dobles asteriscos, sintaxis markdown) los datos y frases que sostienen cada hallazgo: keywords puntuales, números/porcentajes, y la conclusión central.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"insights": [{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo, con **negrita** markdown generosa>", "sentiment": "positive" | "negative" | "neutral"}, ...]}

"sentiment" refleja si ESE insight puntual es una buena o mala noticia (o neutral/informativo) para el negocio del cliente.`;

function buildUserPrompt(context: BrandVsNonBrandInsightContext): string {
  const { brandCount, nonBrandCount, brandPct, nonBrandPct, brandKeywords, nonBrandKeywords } = context;

  return `Split del período: Brand ${formatNumber(brandCount)} keywords (${brandPct}%) · Non-Brand ${formatNumber(nonBrandCount)} keywords (${nonBrandPct}%) — este dato YA se muestra en el tablero, no lo repitas.

Grupo Brand (ordenado por impresiones, hasta ${MAX_ROWS_IN_PROMPT} de ${brandKeywords.length} totales):
${describeKeywords(brandKeywords)}

Grupo Non-Brand (ordenado por impresiones, hasta ${MAX_ROWS_IN_PROMPT} de ${nonBrandKeywords.length} totales):
${describeKeywords(nonBrandKeywords)}

Analizá estos dos grupos y devolvé los insights más relevantes que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateBrandVsNonBrandInsight(context: BrandVsNonBrandInsightContext): Promise<LLMInsightResult[]> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsights(SYSTEM_PROMPT, userPrompt);
}
