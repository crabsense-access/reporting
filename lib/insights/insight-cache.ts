import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, InsightSentimentValue } from "@/lib/types";

export interface CachedInsight {
  text: string;
  sentiment: InsightSentimentValue;
  generatedAt: string;
}

// Se regenera como máximo una vez por día por (cliente, tablero, métrica,
// rango, evento de conversión) — balance entre que el insight no quede
// desactualizado muchos días y no llamar al LLM en cada carga de página. El
// botón "Generar insights" del tablero fuerza una regeneración salteando
// esto (ver forceRegenerate).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface GetOrGenerateInsightParams {
  supabase: SupabaseClient<Database>;
  clientId: string;
  dashboard: string;
  metricKey: string;
  rangeFrom: string;
  rangeTo: string;
  conversionEvent?: string;
  model: string;
  forceRegenerate: boolean;
  generate: () => Promise<{ text: string; sentiment: InsightSentimentValue }>;
}

export async function getOrGenerateInsight({
  supabase,
  clientId,
  dashboard,
  metricKey,
  rangeFrom,
  rangeTo,
  conversionEvent = "",
  model,
  forceRegenerate,
  generate,
}: GetOrGenerateInsightParams): Promise<CachedInsight> {
  if (!forceRegenerate) {
    const { data: cached } = await supabase
      .from("dashboard_insights")
      .select("insight_text, sentiment, generated_at")
      .eq("client_id", clientId)
      .eq("dashboard", dashboard)
      .eq("metric_key", metricKey)
      .eq("range_from", rangeFrom)
      .eq("range_to", rangeTo)
      .eq("conversion_event", conversionEvent)
      .maybeSingle();

    if (cached && Date.now() - new Date(cached.generated_at).getTime() < CACHE_TTL_MS) {
      return { text: cached.insight_text, sentiment: cached.sentiment, generatedAt: cached.generated_at };
    }
  }

  const fresh = await generate();
  const generatedAt = new Date().toISOString();

  const { error } = await supabase.from("dashboard_insights").upsert(
    {
      client_id: clientId,
      dashboard,
      metric_key: metricKey,
      range_from: rangeFrom,
      range_to: rangeTo,
      conversion_event: conversionEvent,
      insight_text: fresh.text,
      sentiment: fresh.sentiment,
      model,
      generated_at: generatedAt,
    },
    { onConflict: "client_id,dashboard,metric_key,range_from,range_to,conversion_event" }
  );

  if (error) {
    // El insight ya se generó — no le rompemos la respuesta al usuario por
    // un error al guardar el caché, simplemente se vuelve a generar en la
    // próxima carga (mismo espíritu que el resto de los "best effort" de
    // este proyecto, ej. el precálculo de insights del sidebar).
    console.error("No se pudo guardar el insight en caché", error);
  }

  return { text: fresh.text, sentiment: fresh.sentiment, generatedAt };
}
