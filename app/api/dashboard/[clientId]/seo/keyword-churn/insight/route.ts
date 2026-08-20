import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { getOrGenerateInsight, type CachedInsight } from "@/lib/insights/insight-cache";
import { generateKeywordChurnInsight } from "@/lib/insights/keyword-churn-llm-insight";
import { LLM_INSIGHT_MODEL } from "@/lib/insights/llm-client";
import { fetchKeywordChurn } from "@/lib/gsc/reports";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

const DASHBOARD_KEY = "seo_keyword_churn";

// GET /api/dashboard/[clientId]/seo/keyword-churn/insight?from=...&to=...&type=new|lost&force=0|1
// Insight por LLM sobre el CONTENIDO de la lista de keywords nuevas o
// perdidas (ver keyword-churn-llm-insight.ts) — no sobre el total/neto, que
// ya se muestra aparte en la tarjeta. Recalcula fetchKeywordChurn acá mismo
// (igual que seo/insights recalcula sus propios desgloses) en vez de
// depender de la respuesta ya cacheada del endpoint principal.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const typeParam = searchParams.get("type");
  const forceRegenerate = searchParams.get("force") === "1";
  const type = typeParam === "new" || typeParam === "lost" ? typeParam : null;

  if (!from || !to || !type) {
    return NextResponse.json({ error: "Los parámetros from, to y type son obligatorios." }, { status: 400 });
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
    const churn = await withCache(
      { clientId, source: "search_console", query: "fetchKeywordChurn", params: { siteUrl: config.site_url, from: range.from, to: range.to, granularity: "day" } },
      () => fetchKeywordChurn(config.site_url, range, "day")
    );

    const cached = await getOrGenerateInsight({
      supabase,
      clientId,
      dashboard: DASHBOARD_KEY,
      metricKey: type,
      rangeFrom: from,
      rangeTo: to,
      model: LLM_INSIGHT_MODEL,
      forceRegenerate,
      generate: () =>
        generateKeywordChurnInsight({
          type,
          currentWindowLabel: `${churn.currentWindow.from} a ${churn.currentWindow.to}`,
          previousWindowLabel: `${churn.previousWindow.from} a ${churn.previousWindow.to}`,
          brandRegex: config.brand_regex ?? null,
          keywords: type === "new" ? churn.newKeywords : churn.lostKeywords,
        }),
    });

    const payload: CachedInsight = cached;
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error generando insight de rotación de keywords", error);
    return NextResponse.json({ error: "No se pudo generar el insight." }, { status: 502 });
  }
}
