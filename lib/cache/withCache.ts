import { unstable_cache } from "next/cache";
import { differenceInCalendarDays, parseISO } from "date-fns";

export type CacheSource = "ga4" | "search_console" | "meta_ads";

export interface CacheDescriptor {
  clientId: string;
  source: CacheSource;
  /** Nombre de la función/consulta que se está cacheando (ej. "fetchKeywordChurn"). */
  query: string;
  /**
   * TODOS los parámetros relevantes de la consulta (from, to, granularity,
   * segmento, dimensiones, filtros, etc.) — deben alcanzar para que dos
   * consultas con los mismos parámetros compartan cache y dos consultas con
   * parámetros distintos NUNCA lo hagan. Debe incluir `to` (fecha "hasta"
   * del rango consultado) para que el TTL se pueda calcular, salvo que se
   * pase `ttlSeconds` explícito (ver abajo).
   */
  params: Record<string, unknown>;
  /**
   * TTL fijo en segundos, para cuando el caller ya sabe cuánto cachear en vez de dejar que
   * withCache lo calcule con la heurística de `params.to` (ver resolveTtlSeconds más abajo) —
   * usado por el Calendario de inversión (ver metaInvestmentData.ts / app/api/reporting/
   * chart-insights/route.ts) para cachear a un TTL fijo mientras el mes está en curso. Si no se
   * pasa, se sigue usando esa heurística — los callers existentes (GA4/Search Console) no cambian
   * de comportamiento.
   */
  ttlSeconds?: number;
}

// Search Console y GA4 tardan un par de días en "cerrar" los datos más
// recientes (pueden seguir moviéndose). Si el rango consultado llega hasta
// alguno de esos últimos 3 días, cache corta; si el rango ya quedó atrás de
// esa ventana, los números no van a cambiar más → cache larga.
const RECENT_WINDOW_DAYS = 3;
export const SHORT_TTL_SECONDS = 30 * 60;
export const LONG_TTL_SECONDS = 24 * 60 * 60;
/** TTL fijo de 3 horas — Calendario de inversión (datos e insights de Anthropic) mientras el mes consultado está en curso, ver metaInvestmentData.ts / app/api/reporting/chart-insights/route.ts. */
export const THREE_HOURS_SECONDS = 3 * 60 * 60;

// Serialización determinística: ordena las keys (recursivamente) para que
// el mismo conjunto de parámetros en distinto orden genere el mismo string,
// y por lo tanto la misma cache key.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildCacheKey(descriptor: CacheDescriptor): string {
  return `${descriptor.source}:${descriptor.query}:${descriptor.clientId}:${stableStringify(descriptor.params)}`;
}

function resolveTtlSeconds(to: unknown): number {
  if (typeof to !== "string") return SHORT_TTL_SECONDS;
  const daysSinceTo = differenceInCalendarDays(new Date(), parseISO(to));
  return daysSinceTo < RECENT_WINDOW_DAYS ? SHORT_TTL_SECONDS : LONG_TTL_SECONDS;
}

// Envuelve una consulta a GA4 (lib/ga4/client.ts), Search Console
// (lib/gsc/client.ts) o Meta Ads (lib/meta-ads/reports.ts) con unstable_cache
// de Next.js. La key es determinística
// (mismos parámetros → mismo hit, sin importar el orden en que se arman) y el
// TTL se decide en cada llamada según si el rango consultado toca datos
// todavía "abiertos" (últimos 3 días) o no — por eso se llama a
// unstable_cache() de nuevo en cada invocación en vez de una sola vez a nivel
// de módulo, es la única forma de variar `revalidate` por consulta.
// Tag `client:${clientId}` en todas las entradas para poder invalidar por
// cliente más adelante (todavía no hay un botón que lo dispare).
export function withCache<T>(descriptor: CacheDescriptor, fn: () => Promise<T>): Promise<T> {
  const cacheKey = buildCacheKey(descriptor);
  const cached = unstable_cache(fn, [cacheKey], {
    revalidate: descriptor.ttlSeconds ?? resolveTtlSeconds(descriptor.params.to),
    tags: [`client:${descriptor.clientId}`],
  });
  return cached();
}
