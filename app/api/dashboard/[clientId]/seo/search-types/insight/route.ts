import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getOrGenerateInsight } from "@/lib/insights/insight-cache";
import { generateSearchTypesInsight } from "@/lib/insights/search-types-llm-insight";
import { LLM_INSIGHT_MODEL, type LLMInsightResult } from "@/lib/insights/llm-client";
import { fetchSearchTypeStat, SEO_SEARCH_TYPES } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

const DASHBOARD_KEY = "seo_search_types";

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

interface SearchTypesInsightResponse {
  insights: LLMInsightResult[];
  generatedAt: string;
}

// GET /api/dashboard/[clientId]/seo/search-types/insight?from=...&to=...&segment=...&force=0|1
// Insight(s) por LLM sobre el desempeño de los 6 tipos de búsqueda (ver
// search-types-llm-insight.ts) — recalcula fetchSearchTypeStat acá mismo
// (ya cacheado por withCache, igual que el endpoint principal). Puede haber
// 1 a 3 hallazgos a la vez, cacheados como JSON dentro de la misma columna
// `insight_text` que el resto de la plataforma, mismo mecanismo que
// Brand vs. Non-Brand.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const forceRegenerate = searchParams.get("force") === "1";
  const segmentParam = searchParams.get("segment");
  const segmentKey: SeoPageSegmentKey = VALID_SEGMENT_KEYS.includes(segmentParam as SeoPageSegmentKey)
    ? (segmentParam as SeoPageSegmentKey)
    : "all";

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
  const segment = resolvePageSegment(config, segmentKey);
  const range: DateRangeValue = { from, to };

  try {
    const stats = await Promise.all(
      SEO_SEARCH_TYPES.map((searchType) =>
        withCache(
          {
            clientId,
            source: "search_console",
            query: "fetchSearchTypeStat",
            params: {
              segmentLabel: segment.label,
              siteUrl: segment.siteUrl,
              dimensionFilterGroups: segment.dimensionFilterGroups,
              from: range.from,
              to: range.to,
              type: searchType,
            },
          },
          () => fetchSearchTypeStat(segment, range, searchType)
        )
      )
    );

    const cached = await getOrGenerateInsight({
      supabase,
      clientId,
      dashboard: DASHBOARD_KEY,
      metricKey: `${segmentKey}::insights`,
      rangeFrom: from,
      rangeTo: to,
      model: LLM_INSIGHT_MODEL,
      forceRegenerate,
      generate: async () => {
        const insights = await generateSearchTypesInsight({ stats });
        const sentiment = insights.some((item) => item.sentiment === "negative")
          ? "negative"
          : insights.some((item) => item.sentiment === "positive")
            ? "positive"
            : "neutral";
        return { text: JSON.stringify(insights), sentiment };
      },
    });

    const payload: SearchTypesInsightResponse = {
      insights: JSON.parse(cached.text) as LLMInsightResult[],
      generatedAt: cached.generatedAt,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insight de tipos de búsqueda", error);
    return NextResponse.json({ error: "No se pudo generar el insight." }, { status: 502 });
  }
}
