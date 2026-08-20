"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowUpDown } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { InsightsList } from "@/components/dashboard/InsightsList";
import { BrandKeywordPill } from "@/components/dashboard/seo/BrandKeywordPill";
import type { InsightSentiment } from "@/lib/insights/generateInsight";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DateRangeValue } from "@/lib/date-range";
import type { SeoTopPageStat, SeoTopPagesResult } from "@/lib/gsc/reports";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoTopPagesResponse {
  connected: boolean;
  result: SeoTopPagesResult | null;
}

interface SeoTopPagesBlockProps {
  clientId: string;
  range: DateRangeValue;
  segment: SeoPageSegmentKey;
}

// Fila de resumen / header: mismo criterio ya usado en el resto de las
// tablas de la hoja — fondo sólido (sticky necesita opacidad completa) y el
// borde grueso se dibuja con box-shadow inset (no border) para que nunca
// quede tapado por el repintado de las filas que scrollean detrás.
const SUMMARY_ROW_BG = "hsl(220 20% 98%)";
const SUMMARY_ROW_BORDER = "hsl(220 13% 70%)";

// Layout de 2 niveles con flexbox (no <table>/rowspan): la columna Página
// ocupa toda la altura del bloque porque flex por defecto estira ("stretch")
// a sus hijos a la misma altura — así el bloque "Keywords + Total" que sí
// tiene varias filas define el alto, y Página lo sigue sin repetirse. Los
// mismos porcentajes (outer 50/50, inner sobre el 50% del wrapper) se usan
// en el header y en cada bloque para que las columnas queden alineadas
// verticalmente.
//
// Página sigue ancha (para que entre la URL completa) pero menos que antes,
// para darle más lugar a Keywords; las 4 columnas numéricas quedan con el
// MISMO ancho absoluto de siempre (12/10/9/9% del total) — el espacio que
// pierde Página es exactamente el que gana Keywords.
const PAGE_COL = "w-[40%]";
const REST_COL = "w-[60%]";
const KEYWORD_COL = "w-[33.33%]"; // 33.33% de 60% = 20% del total
const IMPRESSIONS_COL = "w-[20%]"; // 20% de 60% = 12% del total
const CLICKS_COL = "w-[16.67%]"; // 16.67% de 60% = 10% del total
const CTR_COL = "w-[15%]"; // 15% de 60% = 9% del total
const POSITION_COL = "w-[15%]"; // 15% de 60% = 9% del total

// 4 filas de keywords fijas por bloque, el resto scrollea. A diferencia de
// otras tablas del tablero, acá el alto de fila NO se mide en el DOM ni se
// estima: se FUERZA con `h-8` (32px) en cada fila + `truncate` en la
// keyword (una sola línea, con `title` para ver el texto completo al
// pasar el mouse) — así el alto real SIEMPRE coincide exactamente con este
// cálculo, sin importar si una keyword es larga. Medir o estimar el alto
// dejaba esto en manos de un valor variable: si una fila terminaba más alta
// que las demás (keyword larga haciendo wrap a 2 líneas), no había alto
// reservado para esa segunda línea y el texto se superponía con la fila de
// abajo — parecía "todas las keywords en la misma fila".
const KEYWORD_VISIBLE_ROWS = 4;
const KEYWORD_ROW_HEIGHT_PX = 32; // = h-8, coincide exacto con text-xs + py-2 de una sola línea
// `maxHeight` (no `height` fija): el área de keywords de cada bloque toma
// el alto real de sus keywords si tiene menos de 4 (sin espacio en blanco
// de más), y recién scrollea si supera ese tope — mismo criterio que
// SeoBrandVsNonBrandBlock/SeoPositionDistributionBlock. Como consecuencia,
// cada bloque de página mide distinto según cuántas keywords tenga.
const KEYWORD_AREA_HEIGHT_PX = KEYWORD_VISIBLE_ROWS * KEYWORD_ROW_HEIGHT_PX;

// Como cada bloque de página mide distinto (alto variable, ver arriba), no
// hay una cuenta fija que dé "exactamente 5 bloques" — se MIDE en el DOM
// dónde termina el 5to bloque real (igual que se mide el alto de fila en
// otras tablas) y ese valor se usa como `maxHeight` del contenedor general.
// Ver el `useLayoutEffect` en SeoTopPagesBlock.
const PAGE_BLOCKS_VISIBLE = 5;

function pagePathLabel(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

// Insight de reglas (no LLM) sobre qué tan dependiente de marca es el
// tráfico de las páginas top — se calcula sobre TODAS las keywords de TODAS
// las páginas de este resultado (no solo el top 10 del gráfico), sumando
// clicks marca vs. no-marca. El sentiment se decide por el NIVEL absoluto de
// dependencia, mismo criterio que paretoConcentrationSentiment en
// SeoClicksBlock (no hay período anterior acá con el que comparar).
interface BrandDependencyStats {
  brandClicks: number;
  nonBrandClicks: number;
  totalClicks: number;
  brandPct: number;
  nonBrandPct: number;
  totalPages: number;
  totalKeywords: number;
  /** La página con mayor % de clicks de marca sobre sus propios clicks — análogo al `topKeyword` del insight de Pareto (Clicks/Impresiones), pero por página. */
  topDependentPage: { page: string; brandPct: number; clicks: number } | null;
}

function brandDependencySentiment(stats: BrandDependencyStats): InsightSentiment {
  if (stats.totalClicks === 0) return "neutral";
  if (stats.brandPct >= 60) return "negative";
  if (stats.brandPct >= 35) return "neutral";
  return "positive";
}

// Además de la banda de sentiment (nivel absoluto de dependencia, mismo
// criterio que paretoConcentrationSentiment en SeoClicksBlock), agrega los
// números absolutos detrás del % y la página más dependiente — más contexto
// para que el insight no dependa solo de leer un porcentaje suelto.
function brandDependencyText(stats: BrandDependencyStats): string {
  if (stats.totalClicks === 0) return "Sin actividad de keywords en este período.";

  let band: string;
  if (stats.brandPct >= 60) {
    band = `Tus páginas con más actividad dependen fuertemente de marca: el **${stats.brandPct}%** de sus clicks viene de keywords de marca. Esto significa que la mayor parte de ese tráfico llega porque el usuario ya te conocía y buscó tu nombre directamente, no porque te encontró compitiendo por un término genérico — una señal de que el posicionamiento en búsquedas no-marca todavía es débil. Conviene reforzar contenido y SEO para términos genéricos para captar usuarios que todavía no te conocen y reducir esta dependencia.`;
  } else if (stats.brandPct >= 35) {
    band = `Dependencia de marca moderada en tus páginas top: el **${stats.brandPct}%** de sus clicks viene de keywords de marca y el **${stats.nonBrandPct}%** de búsquedas genéricas (non-brand). Es un balance razonable, pero todavía hay margen para ganar tráfico nuevo si se fortalece el posicionamiento en términos genéricos.`;
  } else {
    band = `Buena diversificación: solo el **${stats.brandPct}%** de los clicks de tus páginas top viene de keywords de marca — la mayoría (**${stats.nonBrandPct}%**) llega por búsquedas genéricas (non-brand). Esto indica que tu contenido compite bien por términos que no dependen de que el usuario ya te conozca, una fuente de tráfico más resiliente y escalable a largo plazo.`;
  }

  const numbers = ` De los **${formatNumber(stats.totalClicks)}** clicks analizados en **${formatNumber(stats.totalPages)}** páginas (**${formatNumber(stats.totalKeywords)}** keywords en total), **${formatNumber(stats.brandClicks)}** vinieron de marca y **${formatNumber(stats.nonBrandClicks)}** de búsquedas genéricas.`;

  const topPage = stats.topDependentPage
    ? ` La página más dependiente de marca es **${pagePathLabel(stats.topDependentPage.page)}**: el **${stats.topDependentPage.brandPct}%** de sus **${formatNumber(stats.topDependentPage.clicks)}** clicks viene de keywords de marca.`
    : "";

  return band + numbers + topPage;
}

type SortColumn = "key" | "impressions" | "clicks" | "ctr" | "position";

interface KeywordSort {
  column: SortColumn;
  direction: "asc" | "desc";
}

const SORTABLE_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "key", label: "Keywords" },
  { key: "impressions", label: "Impresiones" },
  { key: "clicks", label: "Clicks" },
  { key: "ctr", label: "CTR" },
  { key: "position", label: "Pos Prom" },
];

const SORT_COLUMN_WIDTH: Record<SortColumn, string> = {
  key: KEYWORD_COL,
  impressions: IMPRESSIONS_COL,
  clicks: CLICKS_COL,
  ctr: CTR_COL,
  position: POSITION_COL,
};

// Un solo header para toda la tabla (no uno por bloque de página), así que
// el orden elegido es GLOBAL: se aplica por igual a la lista de keywords de
// cada bloque. Mismo patrón de headers ordenables (ícono + toggle asc/desc)
// que el resto de las tablas de la hoja (KeywordChurnCard, PageChurnCard).
function TopPagesHeaderRow({ sort, onToggleSort }: { sort: KeywordSort; onToggleSort: (column: SortColumn) => void }) {
  return (
    <div
      className="sticky top-0 z-10 flex h-9 text-xs font-medium text-muted-foreground"
      style={{ backgroundColor: "hsl(var(--card))", boxShadow: `inset 0 -2px 0 0 ${SUMMARY_ROW_BORDER}` }}
    >
      <div className={cn(PAGE_COL, "flex shrink-0 items-center px-2")}>Página</div>
      <div className={cn(REST_COL, "flex shrink-0")}>
        {SORTABLE_COLUMNS.map((column) => (
          <div
            key={column.key}
            className={cn(
              SORT_COLUMN_WIDTH[column.key],
              "flex shrink-0 items-center py-2",
              column.key === "key" ? "px-2" : "justify-end pr-2"
            )}
          >
            <span
              onClick={() => onToggleSort(column.key)}
              className={cn(
                "inline-flex cursor-pointer select-none items-center gap-1",
                column.key !== "key" && "justify-end"
              )}
            >
              {column.label}
              <ArrowUpDown className={cn("h-3 w-3 shrink-0", sort.column === column.key ? "opacity-100" : "opacity-30")} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopPageBlock({
  page,
  sort,
  blockRef,
}: {
  page: SeoTopPageStat;
  sort: KeywordSort;
  blockRef?: RefObject<HTMLDivElement | null>;
}) {
  const sortedKeywords = useMemo(() => {
    const copy = [...page.keywords];
    copy.sort((a, b) => {
      const diff = sort.column === "key" ? a.query.localeCompare(b.query) : a[sort.column] - b[sort.column];
      return sort.direction === "asc" ? diff : -diff;
    });
    return copy;
  }, [page.keywords, sort]);

  return (
    <div ref={blockRef} className="flex border-b border-border last:border-0">
      {/* Página: una sola vez por bloque, estirada a todo el alto vía flex
          stretch (no rowspan literal, ver comentario de las constantes de
          ancho más arriba). text-xs a propósito: mismo tamaño que el resto
          de las celdas de la tabla, no el tamaño heredado del Card. */}
      <div className={cn(PAGE_COL, "flex shrink-0 items-center break-words px-2 py-2 text-xs text-foreground")}>{page.page}</div>
      <div className={cn(REST_COL, "flex shrink-0 flex-col")}>
        <div className="overflow-y-auto" style={{ maxHeight: KEYWORD_AREA_HEIGHT_PX }}>
          {sortedKeywords.map((keyword) => (
            <div key={keyword.query} className="flex h-8 border-b border-border text-xs last:border-0">
              <div className={cn(KEYWORD_COL, "flex min-w-0 shrink-0 items-center gap-1 px-2 text-foreground")}>
                <span className="min-w-0 truncate" title={keyword.query}>
                  {keyword.query}
                </span>
                {keyword.isBrand && <BrandKeywordPill />}
              </div>
              <div className={cn(IMPRESSIONS_COL, "flex shrink-0 items-center justify-end py-2 pr-2 text-right text-foreground")}>{formatNumber(keyword.impressions)}</div>
              <div className={cn(CLICKS_COL, "flex shrink-0 items-center justify-end py-2 pr-2 text-right text-foreground")}>{formatNumber(keyword.clicks)}</div>
              <div className={cn(CTR_COL, "flex shrink-0 items-center justify-end py-2 pr-2 text-right text-foreground")}>{formatPercent(keyword.ctr)}</div>
              <div className={cn(POSITION_COL, "flex shrink-0 items-center justify-end py-2 pr-2 text-right text-foreground")}>{formatDecimal(keyword.position)}</div>
            </div>
          ))}
        </div>
        {/* Total {página} — fuera del área de scroll de arriba, siempre visible. */}
        <div className="flex h-9 text-xs font-semibold text-foreground" style={{ backgroundColor: SUMMARY_ROW_BG, boxShadow: `inset 0 2px 0 0 ${SUMMARY_ROW_BORDER}` }}>
          <div className={cn(KEYWORD_COL, "flex shrink-0 items-center px-2")}>Total</div>
          <div className={cn(IMPRESSIONS_COL, "flex shrink-0 items-center justify-end py-2 pr-2")}>{formatNumber(page.impressions)}</div>
          <div className={cn(CLICKS_COL, "flex shrink-0 items-center justify-end py-2 pr-2")}>{formatNumber(page.clicks)}</div>
          <div className={cn(CTR_COL, "flex shrink-0 items-center justify-end py-2 pr-2")}>{formatPercent(page.ctr)}</div>
          <div className={cn(POSITION_COL, "flex shrink-0 items-center justify-end py-2 pr-2")}>{formatDecimal(page.position)}</div>
        </div>
      </div>
    </div>
  );
}

// Bloque "Top Páginas" (SEO > Páginas > Resumen) — insight de dependencia de
// marca + tabla anidada de 2 niveles (página → sus keywords), ver
// fetchTopPages en lib/gsc/reports.ts.
export function SeoTopPagesBlock({ clientId, range, segment }: SeoTopPagesBlockProps) {
  const [result, setResult] = useState<SeoTopPagesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cada bloque de página mide distinto (alto variable, ver comentario de
  // PAGE_BLOCKS_VISIBLE), así que "exactamente 5 bloques visibles" se logra
  // MIDIENDO en el DOM dónde termina el 5to bloque real (header + bloques
  // 0-4) y usando eso como `maxHeight` del contenedor — no hay estimación
  // en píxeles que pueda quedar corta o larga como antes.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fifthBlockRef = useRef<HTMLDivElement>(null);
  const [tableMaxHeight, setTableMaxHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    function measure() {
      const container = scrollContainerRef.current;
      const fifthBlock = fifthBlockRef.current;
      // Menos de 5 páginas: no hay 5to bloque que medir, se muestran todas
      // sin recorte ni scroll (no hace falta límite).
      if (!container || !fifthBlock) {
        setTableMaxHeight(undefined);
        return;
      }
      const height = fifthBlock.getBoundingClientRect().bottom - container.getBoundingClientRect().top;
      if (height > 0) setTableMaxHeight(height);
    }

    measure();

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (fifthBlockRef.current) observer.observe(fifthBlockRef.current);
    return () => observer.disconnect();
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ from: range.from, to: range.to, segment });
    fetch(`/api/dashboard/${clientId}/seo/pages/top?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "No se pudo cargar el top de páginas.");
        }
        return (await response.json()) as SeoTopPagesResponse;
      })
      .then((json) => {
        if (!cancelled) setResult(json.result);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, range, segment]);

  // Orden GLOBAL de las keywords dentro de cada bloque de página — un solo
  // header controla el orden de todos los bloques (ver TopPagesHeaderRow).
  const [keywordSort, setKeywordSort] = useState<KeywordSort>({ column: "impressions", direction: "desc" });

  function toggleKeywordSort(column: SortColumn) {
    setKeywordSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { column, direction: column === "key" ? "asc" : "desc" }
    );
  }

  const brandStats = useMemo<BrandDependencyStats | null>(() => {
    if (!result) return null;
    let brandClicks = 0;
    let totalClicks = 0;
    let totalKeywords = 0;
    let topDependentPage: BrandDependencyStats["topDependentPage"] = null;

    for (const page of result.pages) {
      let pageBrandClicks = 0;
      let pageClicks = 0;
      for (const keyword of page.keywords) {
        totalKeywords += 1;
        totalClicks += keyword.clicks;
        pageClicks += keyword.clicks;
        if (keyword.isBrand) {
          brandClicks += keyword.clicks;
          pageBrandClicks += keyword.clicks;
        }
      }
      if (pageClicks > 0) {
        const pageBrandPct = Math.round((pageBrandClicks / pageClicks) * 100);
        // Empate en % → gana la página con más clicks (más representativa).
        if (
          !topDependentPage ||
          pageBrandPct > topDependentPage.brandPct ||
          (pageBrandPct === topDependentPage.brandPct && pageClicks > topDependentPage.clicks)
        ) {
          topDependentPage = { page: page.page, brandPct: pageBrandPct, clicks: pageClicks };
        }
      }
    }

    const brandPct = totalClicks > 0 ? Math.round((brandClicks / totalClicks) * 100) : 0;
    return {
      brandClicks,
      nonBrandClicks: totalClicks - brandClicks,
      totalClicks,
      brandPct,
      nonBrandPct: 100 - brandPct,
      totalPages: result.pages.length,
      totalKeywords,
      topDependentPage,
    };
  }, [result]);

  const brandInsight = brandStats
    ? {
        label: "Dependencia de marca (Top Páginas)",
        current: 0,
        previous: 0,
        variationPct: 0,
        sentiment: brandDependencySentiment(brandStats),
        isSpike: false,
        text: brandDependencyText(brandStats),
      }
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* Título fuera del recuadro de la tarjeta, como encabezado de sección. */}
      <h2 className="text-xl font-semibold text-foreground">Top Páginas</h2>
      <Card className="w-full min-w-0">
      <CardContent className="flex flex-col gap-6 pt-6">
        {error ? (
          <div className="flex h-24 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>{error}</p>
          </div>
        ) : loading || !result ? (
          <Skeleton className="h-48 w-full" />
        ) : result.pages.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">Sin páginas con clicks en este período.</div>
        ) : (
          <>
            {brandInsight && <InsightsList insights={[brandInsight]} sectionKey="seo" keyPrefix="top_pages_brand" />}

            <div ref={scrollContainerRef} className="overflow-y-auto" style={{ maxHeight: tableMaxHeight }}>
              <TopPagesHeaderRow sort={keywordSort} onToggleSort={toggleKeywordSort} />
              {result.pages.map((page, index) => (
                <TopPageBlock
                  key={page.page}
                  page={page}
                  sort={keywordSort}
                  blockRef={index === PAGE_BLOCKS_VISIBLE - 1 ? fifthBlockRef : undefined}
                />
              ))}
            </div>
          </>
        )}
      </CardContent>
      </Card>
    </div>
  );
}
