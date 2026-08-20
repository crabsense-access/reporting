import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getOrGenerateInsight } from "@/lib/insights/insight-cache";
import { generateBrandVsNonBrandInsight } from "@/lib/insights/brand-vs-non-brand-llm-insight";
import { LLM_INSIGHT_MODEL, type LLMInsightResult } from "@/lib/insights/llm-client";
import { fetchBrandVsNonBrand } from "@/lib/gsc/reports";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

const DASHBOARD_KEY = "seo_brand_vs_non_brand";

interface BrandVsNonBrandInsightResponse {
  insights: LLMInsightResult[];
  generatedAt: string;
}

// GET /api/dashboard/[clientId]/seo/brand-vs-non-brand/insight?from=...&to=...&force=0|1
// Insight(s) por LLM sobre el CONTENIDO de las listas Brand/Non-Brand (ver
// brand-vs-non-brand-llm-insight.ts) — no sobre el split %, que ya se
// muestra en la barra del bloque. Puede haber 1 a 3 hallazgos genuinos a la
// vez, así que se cachean serializados como JSON adentro de la misma
// columna `insight_text` que usa el resto de la plataforma (mismo mecanismo
// de dashboard_insights, sin cambiar el esquema) y se des-serializan acá.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const forceRegenerate = searchParams.get("force") === "1";

  if (!from || !to) {
    return NextResponse.json({ error: "Los parámetros from y to son obligatorios." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  if (!(await isAdminEmail(supabase, user.email))) {
    if (!(await isClientUserOfClient(supabase, user.email, clientId))) {
      return NextResponse.json({ error: "No tenés acceso a este tablero." }, { status: 403 });
    }
  }

  const { data: dataSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", clientId)
    .eq("source_type", "search_console")
    .maybeSingle();

  if (!dataSource) {
    return NextResponse.json({ error: "Este cliente no tiene Search Console conectado." }, { status: 404 });
  }

  const config = dataSource.config as GSCConfig;
  const range: DateRangeValue = { from, to };

  try {
    const result = await withCache(
      {
        clientId,
        source: "search_console",
        query: "fetchBrandVsNonBrand",
        params: { siteUrl: config.site_url, from: range.from, to: range.to, brandRegex: config.brand_regex ?? null },
      },
      () => fetchBrandVsNonBrand(config.site_url, range, config.brand_regex ?? null)
    );

    const cached = await getOrGenerateInsight({
      supabase,
      clientId,
      dashboard: DASHBOARD_KEY,
      metricKey: "insights",
      rangeFrom: from,
      rangeTo: to,
      model: LLM_INSIGHT_MODEL,
      forceRegenerate,
      generate: async () => {
        const insights = await generateBrandVsNonBrandInsight({
          brandCount: result.brandCount,
          nonBrandCount: result.nonBrandCount,
          brandPct: result.brandPct,
          nonBrandPct: result.nonBrandPct,
          brandKeywords: result.brandKeywords,
          nonBrandKeywords: result.nonBrandKeywords,
        });
        const sentiment = insights.some((item) => item.sentiment === "negative")
          ? "negative"
          : insights.some((item) => item.sentiment === "positive")
            ? "positive"
            : "neutral";
        return { text: JSON.stringify(insights), sentiment };
      },
    });

    const payload: BrandVsNonBrandInsightResponse = {
      insights: JSON.parse(cached.text) as LLMInsightResult[],
      generatedAt: cached.generatedAt,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insight de brand vs. non-brand", error);
    return NextResponse.json({ error: "No se pudo generar el insight." }, { status: 502 });
  }
}
