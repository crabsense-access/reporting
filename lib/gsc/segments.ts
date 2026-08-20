import type { GSCConfig } from "@/lib/types";

type GSCFilterOperator = "includingRegex" | "excludingRegex" | "equals";

// "device"/"equals" se suma para las tablas de brand/no-brand keywords de
// Keywords > Resumen (filtrar por Desktop/Mobile) — verificado contra la
// cuenta real que convive bien en el mismo grupo junto al filtro de "query".
export interface GSCDimensionFilter {
  dimension: "page" | "query" | "device";
  operator: GSCFilterOperator;
  expression: string;
}

export interface GSCDimensionFilterGroup {
  filters: GSCDimensionFilter[];
}

export interface GSCSegmentQuery {
  label: string;
  siteUrl: string;
  dimensionFilterGroups: GSCDimensionFilterGroup[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fallback cuando no hay `home_page_regex` configurado (Prompt 69): matchea
// la URL raíz del sitio. `site_url` puede venir como "sc-domain:ejemplo.com"
// (propiedad de dominio) o como URL de prefijo ("https://www.ejemplo.com/")
// — en ambos casos `page` siempre llega como URL completa (con protocolo),
// así que se arma un regex sobre el dominio pelado. Best-effort: si el sitio
// sirve la home bajo un subdominio/protocolo distinto al de `site_url`, no
// va a matchear — para esos casos conviene configurar `home_page_regex`
// explícitamente en vez de depender de este fallback.
function buildFallbackHomeRegex(siteUrl: string): string {
  const domain = siteUrl
    .replace(/^sc-domain:/, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  return `^https?:\\/\\/${escapeRegExp(domain)}\\/?$`;
}

// Regex de la home del sitio (segmento "Home", Prompt 69) — el campo
// configurable `home_page_regex` tiene prioridad; sin configurar, cae al
// fallback de arriba. Se exporta para que fetchSeoPerformance (lib/gsc/
// reports.ts) use EXACTAMENTE el mismo regex al clasificar páginas para el
// desglose por tipo de contenido — una sola fuente de verdad.
export function resolveHomePageRegex(config: GSCConfig): string {
  const configured = config.home_page_regex?.trim();
  return configured ? configured : buildFallbackHomeRegex(config.site_url);
}

// Arma las consultas para separar tráfico Home / Blog - Portada / Blog -
// Notas a partir del config guardado en data_sources. Listas para pasarle
// `siteUrl` + `dimensionFilterGroups` a searchanalytics.query. "Home" (antes
// "Institucional") ya NO es "todo lo que no es blog" — es EXCLUSIVAMENTE la
// página principal del sitio (resolveHomePageRegex), porque "todo el sitio"
// ya está cubierto por el segmento "Todo el sitio" (ver resolvePageSegment).
export function buildGSCSegments(config: GSCConfig): GSCSegmentQuery[] {
  const homeSegment: GSCSegmentQuery = {
    label: "Home",
    siteUrl: config.site_url,
    dimensionFilterGroups: [
      { filters: [{ dimension: "page", operator: "includingRegex", expression: resolveHomePageRegex(config) }] },
    ],
  };

  if (!config.blog) return [homeSegment];

  const { blog } = config;
  const blogSiteUrl = blog.same_property ? config.site_url : blog.site_url ?? config.site_url;

  return [
    homeSegment,
    {
      label: "Blog - Portada",
      siteUrl: blogSiteUrl,
      dimensionFilterGroups: [
        { filters: [{ dimension: "page", operator: "includingRegex", expression: blog.home_regex }] },
      ],
    },
    {
      label: "Blog - Notas",
      siteUrl: blogSiteUrl,
      dimensionFilterGroups: [
        { filters: [{ dimension: "page", operator: "includingRegex", expression: blog.posts_regex }] },
      ],
    },
  ];
}

// ============================================================================
// Selector transversal de segmento (SEO > Páginas) — agrega la opción
// "Todo el sitio" (sin filtro) delante de los segmentos de buildGSCSegments.
// Se persiste como query param (?segment=) igual que el rango de fechas.
// ============================================================================

export type SeoPageSegmentKey = "all" | "institucional" | "blog-portada" | "blog-notas";

export interface SeoPageSegmentOption {
  key: SeoPageSegmentKey;
  label: string;
}

// La KEY interna ("institucional") no cambia — solo la etiqueta visible
// (antes "Institucional", ahora "Home") — no afecta la persistencia en URL
// ni la lógica de segmentación, que sigue siendo la misma condición
// (home_regex/posts_regex del blog).
const SEGMENT_KEY_TO_LABEL: Record<Exclude<SeoPageSegmentKey, "all">, string> = {
  institucional: "Home",
  "blog-portada": "Blog - Portada",
  "blog-notas": "Blog - Notas",
};

// "Home" ahora es un filtro real (solo la página principal, ver
// resolveHomePageRegex) — distinto de "Todo el sitio" sin importar si hay
// blog configurado o no, así que siempre se ofrece. Blog - Portada / Blog -
// Notas siguen dependiendo de tener blog configurado.
export function buildPageSegmentOptions(config: GSCConfig): SeoPageSegmentOption[] {
  const options: SeoPageSegmentOption[] = [
    { key: "all", label: "Todo el sitio" },
    { key: "institucional", label: "Home" },
  ];
  if (config.blog) {
    options.push({ key: "blog-portada", label: "Blog - Portada" }, { key: "blog-notas", label: "Blog - Notas" });
  }
  return options;
}

// Resuelve un `segmentKey` persistido en la URL a la GSCSegmentQuery real —
// reusa buildGSCSegments tal cual, sin duplicar la lógica de filtros. Si el
// key pedido no existe para este cliente (ej. blog-portada sin blog
// configurado), cae a "Todo el sitio".
export function resolvePageSegment(config: GSCConfig, segmentKey: SeoPageSegmentKey): GSCSegmentQuery {
  if (segmentKey === "all") {
    return { label: "Todo el sitio", siteUrl: config.site_url, dimensionFilterGroups: [] };
  }
  const label = SEGMENT_KEY_TO_LABEL[segmentKey];
  const match = buildGSCSegments(config).find((segment) => segment.label === label);
  return match ?? { label: "Todo el sitio", siteUrl: config.site_url, dimensionFilterGroups: [] };
}
