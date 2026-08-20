import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isClientUserOfClient } from "@/lib/auth/roles";
import { withCache } from "@/lib/cache/withCache";
import { fetchSearchTypeStat, SEO_SEARCH_TYPES, type SeoSearchTypeStat } from "@/lib/gsc/reports";
import { resolvePageSegment, type SeoPageSegmentKey } from "@/lib/gsc/segments";
import type { DateRangeValue } from "@/lib/date-range";
import type { GSCConfig } from "@/lib/types";

interface SeoSearchTypesResponse {
  connected: boolean;
  result: SeoSearchTypeStat[] | null;
}

const VALID_SEGMENT_KEYS: SeoPageSegmentKey[] = ["all", "institucional", "blog-portada", "blog-notas"];

// GET /api/dashboard/[clientId]/seo/search-types?from=...&to=...&segment=all|institucional|blog-portada|blog-notas
// "Tipos de Búsqueda" (SEO > Tipos de Búsqueda > Resumen) — ver
// fetchSearchTypeStat en lib/gsc/reports.ts. `type` no es una dimensión
// combinable con otras en la misma consulta a Search Console, así que se
// hacen 6 llamadas en paralelo (una por tipo), cada una cacheada por
// separado (la cache key incluye el valor de `type`). Respeta el segmento
// elegido en el selector transversal de la hoja. Siempre devuelve los 6
// tipos, con 0 en las métricas de los que no tengan datos.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  const { searchParams } = new URL(request.url);

  const from = searchParams.get("from");
  const to = searchParams.get("to");
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
    const payload: SeoSearchTypesResponse = { connected: false, result: null };
    return NextResponse.json(payload);
  }

  const config = dataSource.config as GSCConfig;
  const segment = resolvePageSegment(config, segmentKey);
  const range: DateRangeValue = { from, to };

  try {
    const result = await Promise.all(
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
    const payload: SeoSearchTypesResponse = { connected: true, result };
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error consultando tipos de búsqueda", error);
    return NextResponse.json({ error: "No se pudo calcular la distribución por tipo de búsqueda." }, { status: 502 });
  }
}
