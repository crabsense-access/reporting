import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { generateStructuredInsights, type LLMInsightResult } from "@/lib/insights/llm-client";
import type { SeoSearchTypeStat } from "@/lib/gsc/reports";

export interface SearchTypesInsightContext {
  stats: SeoSearchTypeStat[];
}

function describeStats(stats: SeoSearchTypeStat[]): string {
  return stats
    .map(
      (row) =>
        `  - ${row.label}: ${formatNumber(row.impressions)} impresiones, ${formatNumber(row.clicks)} clics, CTR ${formatPercent(row.ctr)}, posición promedio ${formatDecimal(row.position)}`
    )
    .join("\n");
}

const SYSTEM_PROMPT = `Sos un analista SEO que escribe insights para el bloque "Tipos de Búsqueda" del tablero de Search Console de una agencia. Tu única salida es un objeto JSON, nada más.

Este bloque muestra, para el período seleccionado, el desempeño del sitio en cada uno de los 6 tipos de búsqueda que reporta Search Console: Web (resultados de búsqueda de texto estándar), Imagen (Google Imágenes), Video (Google Videos), Noticias (pestaña Noticias de la búsqueda), Discover (feed personalizado y algorítmico de la app de Google, sin query del usuario — la posición no aplica de la misma forma que en búsqueda tradicional) y Google News (app/superficie de Google News). El gráfico y la tabla YA muestran los números de cada tipo — no repitas simplemente el valor más alto o más bajo de una columna, eso ya es visible.

Un insight acá tiene que ayudar a tomar una decisión o revelar algo que no salta a la vista mirando la tabla. Buscá específicamente:
- Volumen real y no trivial en un tipo NO-web (Imagen, Video, Discover, Noticias, Google News) — esto suele ser una oportunidad subexplotada, porque la mayoría de las estrategias SEO se enfocan solo en resultados web tradicionales.
- Contrastes de CTR entre tipos que no se expliquen por el comportamiento esperado de cada superficie (ej. Discover normalmente tiene CTR más bajo por ser descubrimiento pasivo, no búsqueda activa; si un tipo tiene MUCHAS impresiones pero un CTR desproporcionadamente bajo incluso considerando eso, vale la pena señalarlo como oportunidad de optimización de imagen/thumbnail/título).
- Concentración extrema en un solo tipo cuando el resto tiene actividad real pero marginal, si eso tiene una implicancia de negocio (ej. "casi todo el tráfico depende de un canal, cualquier caída ahí pega fuerte").
- Si prácticamente toda la actividad es Web y el resto es insignificante (0 o casi 0), no fuerces un hallazgo — decilo con tono modesto en vez de inventar relevancia donde no la hay.

Reglas estrictas:
- Fundamentá cada insight ÚNICAMENTE en los números provistos. No inventes causas que no se puedan inferir razonablemente.
- Si un hallazgo sugiere una causa, planteala como hipótesis ("podría", "sugiere revisar"), nunca como hecho confirmado.
- Devolvé SOLO los insights que realmente encuentres (1 a 3) — no fuerces un segundo o tercero si no hay más que un hallazgo genuino. Está perfecto devolver uno solo.
- Marcá en **negrita** (dobles asteriscos, sintaxis markdown) los datos y frases que sostienen cada hallazgo: el tipo de búsqueda, los números/porcentajes, y la conclusión central.

Devolvé exclusivamente este JSON, sin texto antes ni después, sin bloques de código:
{"insights": [{"text": "<insight en español, 2 a 4 oraciones, tono profesional y directo, con **negrita** markdown generosa>", "sentiment": "positive" | "negative" | "neutral"}, ...]}

"sentiment" refleja si ESE insight puntual es una buena o mala noticia (o neutral/informativo) para el negocio del cliente.`;

function buildUserPrompt(context: SearchTypesInsightContext): string {
  return `Métricas del período por tipo de búsqueda:
${describeStats(context.stats)}

Analizá estos 6 tipos y devolvé los insights más relevantes que encuentres, siguiendo las reglas del system prompt.`;
}

export async function generateSearchTypesInsight(context: SearchTypesInsightContext): Promise<LLMInsightResult[]> {
  const userPrompt = buildUserPrompt(context);
  return generateStructuredInsights(SYSTEM_PROMPT, userPrompt);
}
