import { getISOWeek, getISOWeekYear } from "date-fns";

import { getGSCClient } from "@/lib/gsc/client";
import type { GSCDimensionFilter, GSCDimensionFilterGroup, GSCSegmentQuery } from "@/lib/gsc/segments";
import { getPreviousPeriod, type DateRangeValue, type Granularity } from "@/lib/date-range";
import type { GSCBlogConfig } from "@/lib/types";

export interface SeoPeriodMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SeoSegmentMetrics extends SeoPeriodMetrics {
  name: string;
  previous: SeoPeriodMetrics;
}

// Sin `dimensions` en el request, la API devuelve una única fila con el
// total agregado de todo el rango de fechas para ese siteUrl + filtros.
async function querySegmentTotals(
  segment: GSCSegmentQuery,
  range: DateRangeValue
): Promise<SeoPeriodMetrics> {
  const client = getGSCClient();

  const response = await client.searchanalytics.query({
    siteUrl: segment.siteUrl,
    requestBody: {
      startDate: range.from,
      endDate: range.to,
      dimensionFilterGroups: segment.dimensionFilterGroups,
    },
  });

  const row = response.data.rows?.[0];

  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

// La Search Console API no soporta múltiples dateRanges en una sola consulta
// (a diferencia de la Data API de GA4), así que el período anterior sale de
// una segunda llamada en paralelo.
export async function fetchSegmentMetrics(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<SeoSegmentMetrics> {
  const [current, previous] = await Promise.all([
    querySegmentTotals(segment, range),
    querySegmentTotals(segment, previousRange),
  ]);

  return { name: segment.label, ...current, previous };
}

const EMPTY_SEO_METRICS: SeoPeriodMetrics = { clicks: 0, impressions: 0, ctr: 0, position: 0 };

function parseSeoRow(row: { clicks?: number | null; impressions?: number | null; ctr?: number | null; position?: number | null }): SeoPeriodMetrics {
  return {
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  };
}

// Igual que querySegmentTotals pero pidiendo una dimensión de agrupación —
// se sigue aplicando el filtro de página del segmento, así el desglose
// queda acotado a ese segmento (verificado contra la cuenta real que
// `dimensions` y `dimensionFilterGroups` conviven bien).
async function queryDimensionRows(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  dimensions: string[],
  rowLimit: number
) {
  const client = getGSCClient();
  const response = await client.searchanalytics.query({
    siteUrl: segment.siteUrl,
    requestBody: {
      startDate: range.from,
      endDate: range.to,
      dimensions,
      dimensionFilterGroups: segment.dimensionFilterGroups,
      rowLimit,
    },
  });
  return response.data.rows ?? [];
}

export interface SeoTimeSeriesPoint extends SeoPeriodMetrics {
  date: string;
}

function enumerateDates(range: DateRangeValue): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

// Igual que Google Ads: ventanas fijas de 7 días arrancando en el primer día
// del rango (no semana calendario), para que el período actual y el
// anterior tengan la misma cantidad de puntos. `ctr` y `position` se
// recalculan sobre la ventana entera en vez de promediar los valores
// diarios — `position` se pondera por impresiones (no todos los días pesan
// igual), `ctr` sale directo de clicks/impressions de la ventana.
function bucketWeekly(daily: SeoTimeSeriesPoint[]): SeoTimeSeriesPoint[] {
  const buckets: SeoTimeSeriesPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const window = daily.slice(i, i + 7);
    const clicks = window.reduce((sum, point) => sum + point.clicks, 0);
    const impressions = window.reduce((sum, point) => sum + point.impressions, 0);
    const weightedPosition = window.reduce((sum, point) => sum + point.position * point.impressions, 0);
    buckets.push({
      date: window[0]!.date,
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? weightedPosition / impressions : 0,
    });
  }
  return buckets;
}

const GSC_ROW_FETCH_LIMIT = 500;

// La API de Search Console omite los días sin ninguna métrica (igual que
// GAQL en Google Ads) — se rellenan los huecos con 0 para un eje de fechas
// continuo.
export async function fetchSegmentTimeSeries(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<{ current: SeoTimeSeriesPoint[]; previous: SeoTimeSeriesPoint[] }> {
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, ["date"], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, ["date"], GSC_ROW_FETCH_LIMIT),
  ]);

  const toDaily = (rows: typeof currentRows, r: DateRangeValue): SeoTimeSeriesPoint[] => {
    const byDate = new Map<string, SeoPeriodMetrics>();
    for (const row of rows) {
      const date = row.keys?.[0];
      if (date) byDate.set(date, parseSeoRow(row));
    }
    return enumerateDates(r).map((date) => ({ date, ...(byDate.get(date) ?? EMPTY_SEO_METRICS) }));
  };

  const currentDaily = toDaily(currentRows, range);
  const previousDaily = toDaily(previousRows, previousRange);

  if (granularity === "week") {
    return { current: bucketWeekly(currentDaily), previous: bucketWeekly(previousDaily) };
  }
  return { current: currentDaily, previous: previousDaily };
}

// Forma uniforme para los 4 desgloses (búsqueda/página/país/dispositivo) —
// mismo criterio que MetaAdsBreakdownRow: además del valor actual, el
// período anterior del mismo segmento (null si esa fila no tuvo actividad
// antes).
export interface SeoBreakdownRow {
  key: string;
  current: SeoPeriodMetrics;
  previous: SeoPeriodMetrics | null;
}

const MAX_BREAKDOWN_ROWS = 8;

// Se pide un rowLimit generoso en ambos períodos (en vez de confiar en que
// el top-N de cada período coincida) y se ordena/recorta acá — así una fila
// que cayó del top pero sigue existiendo en el período anterior se puede
// matchear igual por clave.
async function fetchSegmentBreakdown(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  dimension: string,
  limit: number = MAX_BREAKDOWN_ROWS
): Promise<SeoBreakdownRow[]> {
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, [dimension], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, [dimension], GSC_ROW_FETCH_LIMIT),
  ]);

  const previousByKey = new Map<string, SeoPeriodMetrics>();
  for (const row of previousRows) {
    const key = row.keys?.[0];
    if (key) previousByKey.set(key, parseSeoRow(row));
  }

  return currentRows
    .map((row) => {
      const key = row.keys?.[0];
      if (!key) return null;
      return { key, current: parseSeoRow(row), previous: previousByKey.get(key) ?? null };
    })
    .filter((row): row is SeoBreakdownRow => row !== null)
    .sort((a, b) => b.current.clicks - a.current.clicks)
    .slice(0, limit);
}

export function fetchSegmentQueryBreakdown(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  limit: number = MAX_BREAKDOWN_ROWS
) {
  return fetchSegmentBreakdown(segment, range, previousRange, "query", limit);
}

export function fetchSegmentPageBreakdown(segment: GSCSegmentQuery, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchSegmentBreakdown(segment, range, previousRange, "page");
}

export function fetchSegmentCountryBreakdown(segment: GSCSegmentQuery, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchSegmentBreakdown(segment, range, previousRange, "country");
}

export function fetchSegmentDeviceBreakdown(segment: GSCSegmentQuery, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchSegmentBreakdown(segment, range, previousRange, "device");
}

// ============================================================================
// Keywords > Resumen: 3 análisis a nivel de todo el sitio (no por segmento
// Home/Blog) — Pareto, brand y no-brand keywords.
// ============================================================================

export type SeoDevice = "DESKTOP" | "MOBILE";
export type SeoParetoMetric = "impressions" | "clicks" | "ctr";

const KEYWORDS_ROW_FETCH_LIMIT = 500;

function wholeSiteQuery(siteUrl: string, filters: GSCDimensionFilter[] = []): GSCSegmentQuery {
  return {
    label: "Sitio completo",
    siteUrl,
    dimensionFilterGroups: filters.length > 0 ? [{ filters }] : [],
  };
}

export interface SeoParetoRow {
  key: string;
  value: number;
  cumulativePct: number;
}

export interface SeoParetoResult {
  metric: SeoParetoMetric;
  rows: SeoParetoRow[];
  /** false si no se alcanzó el 80% dentro del límite de filas pedido a la API (long tail muy larga). */
  reachedThreshold: boolean;
}

const PARETO_THRESHOLD = 0.8;

// Principio de Pareto sobre TODAS las keywords del sitio (sin filtrar por
// marca) — se pide un límite generoso de filas, se ordena client-side por
// la métrica elegida (la API de Search Console no soporta ordenar del lado
// del servidor) y se acumula hasta cubrir el 80% del total de esa métrica.
export async function fetchParetoKeywords(
  siteUrl: string,
  range: DateRangeValue,
  metric: SeoParetoMetric
): Promise<SeoParetoResult> {
  const rows = await queryDimensionRows(wholeSiteQuery(siteUrl), range, ["query"], KEYWORDS_ROW_FETCH_LIMIT);

  const parsed = rows
    .map((row) => ({ key: row.keys?.[0], value: parseSeoRow(row)[metric] }))
    .filter((row): row is { key: string; value: number } => !!row.key)
    .sort((a, b) => b.value - a.value);

  const total = parsed.reduce((sum, row) => sum + row.value, 0);

  const resultRows: SeoParetoRow[] = [];
  let cumulative = 0;
  let reachedThreshold = false;
  for (const row of parsed) {
    cumulative += row.value;
    const cumulativePct = total > 0 ? cumulative / total : 0;
    resultRows.push({ key: row.key, value: row.value, cumulativePct });
    if (cumulativePct >= PARETO_THRESHOLD) {
      reachedThreshold = true;
      break;
    }
  }

  return { metric, rows: resultRows, reachedThreshold };
}

// Brand / no-brand: mismo filtro de query (regex de marca) que ya usan los
// segmentos Home/Blog para "page", más un filtro de dispositivo —
// verificado contra la cuenta real que ambos filtros conviven en el mismo
// grupo (AND) sin problema.
export function fetchBrandKeywords(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  brandRegex: string,
  device: SeoDevice,
  limit = 50
) {
  const segment = wholeSiteQuery(siteUrl, [
    { dimension: "device", operator: "equals", expression: device },
    { dimension: "query", operator: "includingRegex", expression: brandRegex },
  ]);
  return fetchSegmentBreakdown(segment, range, previousRange, "query", limit);
}

export function fetchNonBrandKeywords(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  brandRegex: string,
  device: SeoDevice,
  limit = 50
) {
  const segment = wholeSiteQuery(siteUrl, [
    { dimension: "device", operator: "equals", expression: device },
    { dimension: "query", operator: "excludingRegex", expression: brandRegex },
  ]);
  return fetchSegmentBreakdown(segment, range, previousRange, "query", limit);
}

// ============================================================================
// "Cantidad de Keywords" (SEO > Visión General v2) — cuántas queries
// DISTINTAS mostraron el sitio en resultados de Google (≥1 impresión) en el
// período, sobre TODO el sitio (sin filtrar por segmento Home/Blog).
// ============================================================================

interface GSCDateQueryRow {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  // La API ya devuelve esto por defecto (no hace falta pedirlo aparte) — se
  // agregan acá recién cuando algún caller empieza a consumirlos
  // (posición: "Distribución por Rango de Posición"; ctr: "Top Páginas");
  // fetchKeywordCount/fetchKeywordChurn los ignoran igual que antes.
  position?: number | null;
  ctr?: number | null;
}

const GSC_MAX_ROW_LIMIT = 25000;

// La API de Search Console pagina con startRow: si una página devuelve
// exactamente rowLimit filas, puede haber más — se sigue pidiendo hasta que
// una página devuelva menos filas que el límite pedido (verificado contra
// la cuenta real que `startRow` avanza correctamente, sin repetir filas).
async function queryAllRowsPaginated(
  siteUrl: string,
  range: DateRangeValue,
  dimensions: string[],
  dimensionFilterGroups?: GSCDimensionFilterGroup[]
): Promise<GSCDateQueryRow[]> {
  const client = getGSCClient();
  const allRows: GSCDateQueryRow[] = [];
  let startRow = 0;

  for (;;) {
    const response = await client.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: range.from,
        endDate: range.to,
        dimensions,
        type: "web",
        rowLimit: GSC_MAX_ROW_LIMIT,
        startRow,
        ...(dimensionFilterGroups && dimensionFilterGroups.length > 0 ? { dimensionFilterGroups } : {}),
      },
    });
    const rows = response.data.rows ?? [];
    allRows.push(...rows);
    if (rows.length < GSC_MAX_ROW_LIMIT) break;
    startRow += GSC_MAX_ROW_LIMIT;
  }

  return allRows;
}

export interface SeoKeywordCountBucket {
  key: string;
  /** Primer y último día calendario que realmente cayeron en este bucket dentro del rango pedido — usados para armar el label ("Semana del 3 al 9 de agosto"). */
  startDate: string;
  endDate: string;
  count: number;
}

export interface SeoKeywordCountResult {
  current: number;
  previous: number;
  series: SeoKeywordCountBucket[];
}

// Semana calendario ISO (lunes a domingo) vía date-fns — Search Console no
// tiene una dimensión de semana/mes nativa como GA4, así que se calcula acá
// a partir de la fecha diaria.
function keywordCountBucketKey(date: string, granularity: Granularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  const parsed = new Date(`${date}T00:00:00Z`);
  const week = getISOWeek(parsed);
  const year = getISOWeekYear(parsed);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// Enumera TODOS los buckets del rango pedido (uno por día/semana/mes),
// incluso los que no van a tener ninguna fila en los datos reales —
// necesario porque Search Console tiene un lag de reporte de 2-3 días: sin
// esto, los últimos días de un rango reciente (ej. "Últimos 7 días") quedan
// directamente afuera del gráfico en vez de mostrarse en 0, dando la falsa
// impresión de que el rango tiene menos días de los seleccionados.
function enumerateBucketRanges(range: DateRangeValue, granularity: Granularity): Map<string, { startDate: string; endDate: string }> {
  const buckets = new Map<string, { startDate: string; endDate: string }>();
  const cursor = new Date(`${range.from}T00:00:00Z`);
  const end = new Date(`${range.to}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().slice(0, 10);
    const key = keywordCountBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { startDate: date, endDate: date };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    buckets.set(key, bucket);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return buckets;
}

export async function fetchKeywordCount(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoKeywordCountResult> {
  // previousRange termina exactamente un día antes de range.from (ver
  // getPreviousPeriod en lib/date-range.ts) — una sola consulta combinada,
  // desde el inicio del período anterior hasta el fin del actual, cubre
  // ambos rangos sin gaps ni superposición; se separan en memoria por fecha
  // en vez de hacer 2 llamadas.
  const rows = await queryAllRowsPaginated(siteUrl, { from: previousRange.from, to: range.to }, ["date", "query"]);

  const currentQueries = new Set<string>();
  const previousQueries = new Set<string>();
  const buckets = new Map<string, { startDate: string; endDate: string; queries: Set<string> }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const query = row.keys?.[1];
    if (!date || !query) continue;

    if (date >= range.from) {
      currentQueries.add(query);
      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, queries: new Set<string>() };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      bucket.queries.add(query);
      buckets.set(key, bucket);
    } else {
      previousQueries.add(query);
    }
  }

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, queries: new Set() });
  }

  const series: SeoKeywordCountBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, count: bucket.queries.size }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  // OJO: la suma de `count` de todas las barras puede ser MAYOR al `current`
  // de arriba, a propósito — una misma keyword puede tener impresiones en
  // varios días/semanas/meses distintos y cuenta una vez por cada bucket en
  // el que aparece, pero solo una vez en el total deduplicado del período
  // completo. Es esperado, no es un bug: no "corregir" para que sumen igual.
  return { current: currentQueries.size, previous: previousQueries.size, series };
}

// ============================================================================
// "Keywords Nuevas" / "Keywords Perdidas" — clasifica keywords según si
// tuvieron impresiones en la ventana actual pero no en la anterior (nuevas)
// o al revés (perdidas), más una serie de tendencia (ganadas/perdidas por
// bucket) sobre el rango global del tablero. Sobre TODO el sitio.
// ============================================================================

export interface SeoKeywordChurnQueryStats {
  key: string;
  days: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Impresiones día por día, dentro de la ventana en la que se acumuló esta entidad (actual para nuevas, anterior para perdidas) — base del gráfico de líneas de drill-down. */
  dailyImpressions: SeoDailyImpressionPoint[];
}

export interface SeoKeywordChurnTrendBucket {
  key: string;
  startDate: string;
  endDate: string;
  gainedCount: number;
  lostCount: number;
}

export interface SeoKeywordChurnResult {
  currentWindow: DateRangeValue;
  previousWindow: DateRangeValue;
  totalNew: number;
  totalLost: number;
  net: number;
  churn: number;
  newKeywords: SeoKeywordChurnQueryStats[];
  lostKeywords: SeoKeywordChurnQueryStats[];
  trend: SeoKeywordChurnTrendBucket[];
}

interface WindowQueryAccumulator {
  days: Set<string>;
  impressions: number;
  clicks: number;
  /** Impresiones por día — base del gráfico de líneas de tendencia por entidad (drill-down). */
  dailyImpressions: Map<string, number>;
}

export interface SeoDailyImpressionPoint {
  date: string;
  impressions: number;
}

function sortedDailyImpressions(map: Map<string, number>): SeoDailyImpressionPoint[] {
  return [...map.entries()].map(([date, impressions]) => ({ date, impressions })).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function newWindowAccumulator(): WindowQueryAccumulator {
  return { days: new Set<string>(), impressions: 0, clicks: 0, dailyImpressions: new Map<string, number>() };
}

// Suma una fila (date, clicks, impressions) a un acumulador — usado tanto en
// fetchKeywordChurn como en fetchPageChurn para no duplicar esta lógica 2
// veces (una por entidad × 2 ventanas cada una).
function accumulateWindowRow(acc: WindowQueryAccumulator, date: string, clicks: number, impressions: number): void {
  acc.days.add(date);
  acc.impressions += impressions;
  acc.clicks += clicks;
  acc.dailyImpressions.set(date, (acc.dailyImpressions.get(date) ?? 0) + impressions);
}

function toChurnStats(key: string, acc: WindowQueryAccumulator): SeoKeywordChurnQueryStats {
  return {
    key,
    days: acc.days.size,
    impressions: acc.impressions,
    clicks: acc.clicks,
    // Se recalcula acá (clicks/impresiones de la ventana completa) en vez de
    // sumar/promediar el `ctr` que trae cada fila diaria — ese ctr solo vale
    // para ESE día, promediarlo no representa el ctr real de la ventana.
    ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
    dailyImpressions: sortedDailyImpressions(acc.dailyImpressions),
  };
}

// La ventana de clasificación (nuevas/perdidas) es exactamente el rango
// global seleccionado arriba del tablero — no una ventana propia con ancla
// distinta — y la anterior es el mismo largo inmediatamente antes (mismo
// criterio que getPreviousPeriod usa en el resto del proyecto).
export async function fetchKeywordChurn(
  siteUrl: string,
  range: DateRangeValue,
  granularity: Granularity
): Promise<SeoKeywordChurnResult> {
  const currentWindow: DateRangeValue = range;
  const previousWindow = getPreviousPeriod(currentWindow);

  // previousWindow.from es siempre <= range.from (termina justo antes de
  // range.from) — una sola consulta desde ahí hasta range.to cubre tanto
  // las 2 ventanas de clasificación como el rango global para el trend.
  const rows = await queryAllRowsPaginated(siteUrl, { from: previousWindow.from, to: range.to }, ["date", "query"]);

  const currentByQuery = new Map<string, WindowQueryAccumulator>();
  const previousByQuery = new Map<string, WindowQueryAccumulator>();
  const buckets = new Map<string, { startDate: string; endDate: string; queries: Set<string>; hasData: boolean }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const query = row.keys?.[1];
    if (!date || !query) continue;
    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;

    if (date >= currentWindow.from && date <= currentWindow.to) {
      const acc = currentByQuery.get(query) ?? newWindowAccumulator();
      accumulateWindowRow(acc, date, clicks, impressions);
      currentByQuery.set(query, acc);
    } else if (date >= previousWindow.from && date <= previousWindow.to) {
      const acc = previousByQuery.get(query) ?? newWindowAccumulator();
      accumulateWindowRow(acc, date, clicks, impressions);
      previousByQuery.set(query, acc);
    }

    if (date >= range.from && date <= range.to) {
      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, queries: new Set<string>(), hasData: true };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      bucket.queries.add(query);
      buckets.set(key, bucket);
    }
  }

  const newKeywords: SeoKeywordChurnQueryStats[] = [];
  for (const [query, acc] of currentByQuery) {
    if (!previousByQuery.has(query)) newKeywords.push(toChurnStats(query, acc));
  }
  newKeywords.sort((a, b) => b.impressions - a.impressions);

  const lostKeywords: SeoKeywordChurnQueryStats[] = [];
  for (const [query, acc] of previousByQuery) {
    if (!currentByQuery.has(query)) lostKeywords.push(toChurnStats(query, acc));
  }
  lostKeywords.sort((a, b) => b.impressions - a.impressions);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) para que la serie cubra todo el rango — se marcan con
  // `hasData: false` en vez de tratarlos como "0 keywords" a secas, porque
  // acá 0 no es neutro: importa para no inflar `lostCount` más abajo.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, queries: new Set(), hasData: false });
  }

  const sortedBuckets = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, queries: bucket.queries, hasData: bucket.hasData }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  // El primer bucket queda afuera de la serie: no hay un bucket anterior
  // dentro de los datos pedidos contra el cual medir ganadas/perdidas para
  // él (comparar contra "nada" inflaría gainedCount de forma artificial).
  const trend: SeoKeywordChurnTrendBucket[] = [];
  for (let i = 1; i < sortedBuckets.length; i += 1) {
    const current = sortedBuckets[i]!;
    const previous = sortedBuckets[i - 1]!;

    // Mismo motivo que el bucket inicial: un bucket sin ninguna fila
    // reportada todavía (lag de Search Console) no significa "0 keywords
    // activas" — comparar contra el bucket anterior mostraría como
    // "perdidas" todas sus keywords, una falsa alarma por dato incompleto,
    // no por una pérdida real.
    if (!current.hasData) {
      trend.push({ key: current.key, startDate: current.startDate, endDate: current.endDate, gainedCount: 0, lostCount: 0 });
      continue;
    }

    let gainedCount = 0;
    for (const query of current.queries) {
      if (!previous.queries.has(query)) gainedCount += 1;
    }
    let lostCount = 0;
    for (const query of previous.queries) {
      if (!current.queries.has(query)) lostCount += 1;
    }
    trend.push({ key: current.key, startDate: current.startDate, endDate: current.endDate, gainedCount, lostCount });
  }

  return {
    currentWindow,
    previousWindow,
    totalNew: newKeywords.length,
    totalLost: lostKeywords.length,
    net: newKeywords.length - lostKeywords.length,
    churn: newKeywords.length + lostKeywords.length,
    newKeywords,
    lostKeywords,
    trend,
  };
}

// ============================================================================
// "Clicks" (SEO > Visión General v2) — total de clicks del período con
// gráfico de tendencia, más un análisis de Pareto de concentración de clicks
// por keyword. Sobre TODO el sitio.
// ============================================================================

export interface SeoClicksBucket {
  key: string;
  startDate: string;
  endDate: string;
  clicks: number;
}

export interface SeoClicksResult {
  current: number;
  previous: number;
  series: SeoClicksBucket[];
}

// Consulta liviana: dimensions: ["date"] (sin "query"), current y previous en
// paralelo — no hace falta deduplicar nada acá, es una suma directa de
// clicks por día/semana/mes.
export async function fetchClicksTrend(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoClicksResult> {
  const segment = wholeSiteQuery(siteUrl);
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, ["date"], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, ["date"], GSC_ROW_FETCH_LIMIT),
  ]);

  let current = 0;
  const buckets = new Map<string, { startDate: string; endDate: string; clicks: number }>();
  for (const row of currentRows) {
    const date = row.keys?.[0];
    if (!date) continue;
    const clicks = row.clicks ?? 0;
    current += clicks;
    const key = keywordCountBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { startDate: date, endDate: date, clicks: 0 };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    bucket.clicks += clicks;
    buckets.set(key, bucket);
  }

  const previous = previousRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, clicks: 0 });
  }

  const series: SeoClicksBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, clicks: bucket.clicks }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return { current, previous, series };
}

export interface SeoClicksParetoKeywordStat {
  key: string;
  clicks: number;
  impressions: number;
}

export interface SeoClicksParetoResult {
  totalClicks: number;
  totalImpressions: number;
  totalKeywords: number;
  /** Cantidad de keywords (N) necesarias para llegar/superar el 80% de clicks del período. */
  cutoffCount: number;
  /** X: qué % de las keywords del período representa `cutoffCount` (redondeado a entero). */
  cutoffKeywordsPercent: number;
  /** Y: qué % de las impresiones del período generó ese mismo subconjunto de N keywords (redondeado a entero). */
  cutoffImpressionsPercent: number;
  /** Mismo cálculo que `cutoffKeywordsPercent` pero sobre el período anterior — solo para el insight de concentración, no tiene tabla propia. */
  previousCutoffKeywordsPercent: number;
  /** Las N keywords del corte, ordenadas por clicks desc. */
  topKeywords: SeoClicksParetoKeywordStat[];
  /** El resto de las keywords del período (por debajo del corte), ordenadas por clicks desc. */
  restKeywords: SeoClicksParetoKeywordStat[];
}

const CLICKS_PARETO_THRESHOLD = 0.8;

async function fetchClicksParetoKeywords(siteUrl: string, range: DateRangeValue): Promise<SeoClicksParetoKeywordStat[]> {
  const rows = await queryDimensionRows(wholeSiteQuery(siteUrl), range, ["query"], KEYWORDS_ROW_FETCH_LIMIT);
  return rows
    .map((row) => ({ key: row.keys?.[0], clicks: row.clicks ?? 0, impressions: row.impressions ?? 0 }))
    .filter((row): row is SeoClicksParetoKeywordStat => !!row.key);
}

// Ordena por clicks desc y acumula hasta cubrir el 80% del total de clicks —
// mismo principio que fetchParetoKeywords, pero acá además se necesita el
// subconjunto completo (para la tabla) y el % que representa sobre el total
// de KEYWORDS (no de la métrica), más el % de impresiones que ese
// subconjunto explica.
function computeClicksParetoConcentration(rows: SeoClicksParetoKeywordStat[]) {
  const sorted = [...rows].sort((a, b) => b.clicks - a.clicks);
  const totalClicks = sorted.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = sorted.reduce((sum, row) => sum + row.impressions, 0);
  const totalKeywords = sorted.length;

  let cumulativeClicks = 0;
  let cutoffCount = 0;
  if (totalClicks > 0) {
    for (const row of sorted) {
      cumulativeClicks += row.clicks;
      cutoffCount += 1;
      if (cumulativeClicks / totalClicks >= CLICKS_PARETO_THRESHOLD) break;
    }
  }

  const topKeywords = sorted.slice(0, cutoffCount);
  const cutoffImpressions = topKeywords.reduce((sum, row) => sum + row.impressions, 0);

  return {
    totalClicks,
    totalImpressions,
    totalKeywords,
    cutoffCount,
    cutoffKeywordsPercent: totalKeywords > 0 ? Math.round((cutoffCount / totalKeywords) * 100) : 0,
    cutoffImpressionsPercent: totalImpressions > 0 ? Math.round((cutoffImpressions / totalImpressions) * 100) : 0,
    sorted,
    topKeywords,
  };
}

export async function fetchClicksPareto(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<SeoClicksParetoResult> {
  const [currentRows, previousRows] = await Promise.all([
    fetchClicksParetoKeywords(siteUrl, range),
    fetchClicksParetoKeywords(siteUrl, previousRange),
  ]);

  const current = computeClicksParetoConcentration(currentRows);
  const previous = computeClicksParetoConcentration(previousRows);

  return {
    totalClicks: current.totalClicks,
    totalImpressions: current.totalImpressions,
    totalKeywords: current.totalKeywords,
    cutoffCount: current.cutoffCount,
    cutoffKeywordsPercent: current.cutoffKeywordsPercent,
    cutoffImpressionsPercent: current.cutoffImpressionsPercent,
    previousCutoffKeywordsPercent: previous.cutoffKeywordsPercent,
    topKeywords: current.topKeywords,
    restKeywords: current.sorted.slice(current.cutoffCount),
  };
}

// ============================================================================
// "Impresiones" (SEO > Visión General v2, arriba del bloque de Clicks) —
// mismo patrón que "Clicks" (scorecard + tendencia + Pareto), pero con
// impresiones como métrica base. Cálculo independiente, sin compartir estado
// con el bloque de Clicks — reusa fetchClicksParetoKeywords solo porque esa
// consulta ya trae {clicks, impressions} por keyword y sirve para ambos
// bloques, no porque comparta resultado alguno.
// ============================================================================

export interface SeoImpressionsBucket {
  key: string;
  startDate: string;
  endDate: string;
  impressions: number;
}

export interface SeoImpressionsResult {
  current: number;
  previous: number;
  series: SeoImpressionsBucket[];
}

// Consulta liviana: dimensions: ["date"] (sin "query"), current y previous en
// paralelo — suma directa de impresiones por día/semana/mes.
export async function fetchImpressionsTrend(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoImpressionsResult> {
  const segment = wholeSiteQuery(siteUrl);
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, ["date"], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, ["date"], GSC_ROW_FETCH_LIMIT),
  ]);

  let current = 0;
  const buckets = new Map<string, { startDate: string; endDate: string; impressions: number }>();
  for (const row of currentRows) {
    const date = row.keys?.[0];
    if (!date) continue;
    const impressions = row.impressions ?? 0;
    current += impressions;
    const key = keywordCountBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { startDate: date, endDate: date, impressions: 0 };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    bucket.impressions += impressions;
    buckets.set(key, bucket);
  }

  const previous = previousRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, impressions: 0 });
  }

  const series: SeoImpressionsBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, impressions: bucket.impressions }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return { current, previous, series };
}

export interface SeoImpressionsParetoKeywordStat {
  key: string;
  clicks: number;
  impressions: number;
}

export interface SeoImpressionsParetoResult {
  totalClicks: number;
  totalImpressions: number;
  totalKeywords: number;
  /** Cantidad de keywords (N) necesarias para llegar/superar el 80% de IMPRESIONES del período. */
  cutoffCount: number;
  /** X: qué % de las keywords del período representa `cutoffCount` (redondeado a entero). */
  cutoffKeywordsPercent: number;
  /** Y: qué % de los CLICKS del período generó ese mismo subconjunto de N keywords top por impresiones (cruce inverso al de Clicks, redondeado a entero). */
  cutoffClicksPercent: number;
  /** Mismo cálculo que `cutoffKeywordsPercent` pero sobre el período anterior — solo para el insight de concentración. */
  previousCutoffKeywordsPercent: number;
  /** Las N keywords del corte, ordenadas por impresiones desc. */
  topKeywords: SeoImpressionsParetoKeywordStat[];
  /** El resto de las keywords del período (por debajo del corte), ordenadas por impresiones desc. */
  restKeywords: SeoImpressionsParetoKeywordStat[];
}

const IMPRESSIONS_PARETO_THRESHOLD = 0.8;

// Ordena por IMPRESIONES desc y acumula hasta cubrir el 80% del total de
// impresiones — análogo a computeClicksParetoConcentration pero con la
// métrica de corte invertida: acá se calcula qué % de los CLICKS totales
// explica el subconjunto top-por-impresiones (cruce inverso).
function computeImpressionsParetoConcentration(rows: SeoImpressionsParetoKeywordStat[]) {
  const sorted = [...rows].sort((a, b) => b.impressions - a.impressions);
  const totalClicks = sorted.reduce((sum, row) => sum + row.clicks, 0);
  const totalImpressions = sorted.reduce((sum, row) => sum + row.impressions, 0);
  const totalKeywords = sorted.length;

  let cumulativeImpressions = 0;
  let cutoffCount = 0;
  if (totalImpressions > 0) {
    for (const row of sorted) {
      cumulativeImpressions += row.impressions;
      cutoffCount += 1;
      if (cumulativeImpressions / totalImpressions >= IMPRESSIONS_PARETO_THRESHOLD) break;
    }
  }

  const topKeywords = sorted.slice(0, cutoffCount);
  const cutoffClicks = topKeywords.reduce((sum, row) => sum + row.clicks, 0);

  return {
    totalClicks,
    totalImpressions,
    totalKeywords,
    cutoffCount,
    cutoffKeywordsPercent: totalKeywords > 0 ? Math.round((cutoffCount / totalKeywords) * 100) : 0,
    cutoffClicksPercent: totalClicks > 0 ? Math.round((cutoffClicks / totalClicks) * 100) : 0,
    sorted,
    topKeywords,
  };
}

export async function fetchImpressionsPareto(
  siteUrl: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<SeoImpressionsParetoResult> {
  const [currentRows, previousRows] = await Promise.all([
    fetchClicksParetoKeywords(siteUrl, range),
    fetchClicksParetoKeywords(siteUrl, previousRange),
  ]);

  const current = computeImpressionsParetoConcentration(currentRows);
  const previous = computeImpressionsParetoConcentration(previousRows);

  return {
    totalClicks: current.totalClicks,
    totalImpressions: current.totalImpressions,
    totalKeywords: current.totalKeywords,
    cutoffCount: current.cutoffCount,
    cutoffKeywordsPercent: current.cutoffKeywordsPercent,
    cutoffClicksPercent: current.cutoffClicksPercent,
    previousCutoffKeywordsPercent: previous.cutoffKeywordsPercent,
    topKeywords: current.topKeywords,
    restKeywords: current.sorted.slice(current.cutoffCount),
  };
}

// ============================================================================
// "Distribución por Rango de Posición" (SEO > Visión General v2, debajo de
// los bloques de Pareto) — foto del período actual (sin comparación contra
// el período anterior, sin serie temporal). Reusa el mismo mecanismo
// liviano de fetchClicksParetoKeywords: dimensions: ["query"] sin "date",
// que Search Console ya agrega ponderando `position` por impresiones sobre
// todo el rango pedido — no hace falta acumular día por día como en los
// bloques que sí comparan contra el período anterior.
// ============================================================================

export type SeoPositionRange = "1" | "2-3" | "4-10" | "+10";

const SEO_POSITION_RANGE_ORDER: SeoPositionRange[] = ["1", "2-3", "4-10", "+10"];

function classifyPositionRange(position: number): SeoPositionRange {
  if (position < 1.5) return "1";
  if (position < 3.5) return "2-3";
  if (position < 10.5) return "4-10";
  return "+10";
}

export interface SeoPositionRangeKeywordStat {
  key: string;
  clicks: number;
}

export interface SeoPositionRangeGroup {
  range: SeoPositionRange;
  count: number;
  keywords: SeoPositionRangeKeywordStat[];
}

export interface SeoPositionRangeResult {
  groups: SeoPositionRangeGroup[];
}

export async function fetchPositionRangeDistribution(siteUrl: string, range: DateRangeValue): Promise<SeoPositionRangeResult> {
  const rows = await queryDimensionRows(wholeSiteQuery(siteUrl), range, ["query"], KEYWORDS_ROW_FETCH_LIMIT);

  const byRange = new Map<SeoPositionRange, SeoPositionRangeKeywordStat[]>();
  for (const positionRange of SEO_POSITION_RANGE_ORDER) byRange.set(positionRange, []);

  for (const row of rows) {
    const key = row.keys?.[0];
    if (!key) continue;
    const impressions = row.impressions ?? 0;
    if (impressions <= 0) continue;
    const bucket = classifyPositionRange(row.position ?? 0);
    byRange.get(bucket)!.push({ key, clicks: row.clicks ?? 0 });
  }

  const groups: SeoPositionRangeGroup[] = SEO_POSITION_RANGE_ORDER.map((positionRange) => {
    const keywords = byRange.get(positionRange)!;
    return { range: positionRange, count: keywords.length, keywords };
  });

  return { groups };
}

// ============================================================================
// "Brand vs. Non-Brand" (SEO > Visión General v2, arriba de Distribución por
// Rango de Posición) — reusa fetchClicksParetoKeywords (mismo dataset de
// keywords agregadas por query del período que ya usan los bloques de
// Pareto), sin pedirle nada nuevo a Search Console. Sobre TODO el sitio.
// ============================================================================

export interface SeoBrandVsNonBrandKeywordStat {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
}

export interface SeoBrandVsNonBrandResult {
  brandCount: number;
  nonBrandCount: number;
  totalKeywords: number;
  /** 0 si no hay ninguna keyword de marca (o no hay brand_regex configurado) — resultado válido, no un error. */
  brandPct: number;
  nonBrandPct: number;
  brandKeywords: SeoBrandVsNonBrandKeywordStat[];
  nonBrandKeywords: SeoBrandVsNonBrandKeywordStat[];
}

export async function fetchBrandVsNonBrand(
  siteUrl: string,
  range: DateRangeValue,
  brandRegex: string | null
): Promise<SeoBrandVsNonBrandResult> {
  const rows = await fetchClicksParetoKeywords(siteUrl, range);

  let brandPattern: RegExp | null = null;
  if (brandRegex) {
    try {
      brandPattern = new RegExp(brandRegex, "i");
    } catch {
      brandPattern = null;
    }
  }

  const brandKeywords: SeoBrandVsNonBrandKeywordStat[] = [];
  const nonBrandKeywords: SeoBrandVsNonBrandKeywordStat[] = [];

  for (const row of rows) {
    const stat: SeoBrandVsNonBrandKeywordStat = {
      key: row.key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    };
    if (brandPattern?.test(row.key)) {
      brandKeywords.push(stat);
    } else {
      nonBrandKeywords.push(stat);
    }
  }

  const totalKeywords = brandKeywords.length + nonBrandKeywords.length;

  return {
    brandCount: brandKeywords.length,
    nonBrandCount: nonBrandKeywords.length,
    totalKeywords,
    brandPct: totalKeywords > 0 ? Math.round((brandKeywords.length / totalKeywords) * 100) : 0,
    nonBrandPct: totalKeywords > 0 ? Math.round((nonBrandKeywords.length / totalKeywords) * 100) : 0,
    brandKeywords,
    nonBrandKeywords,
  };
}

// ============================================================================
// "Páginas" (SEO > Páginas > Resumen) — mismo patrón que "Cantidad de
// Keywords" (Prompt 20) y "Keywords Nuevas/Perdidas" (Prompt 23), pero
// contando páginas distintas en vez de keywords, y respetando el segmento
// (Todo el sitio / Home / Blog - Portada / Blog - Notas) elegido en
// el selector transversal de la hoja.
// ============================================================================

export interface SeoPageCountBucket {
  key: string;
  startDate: string;
  endDate: string;
  count: number;
}

export interface SeoPageRankingDailyPoint {
  date: string;
  impressions: number;
  clicks: number;
}

export interface SeoPageRankingStat {
  key: string;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Ponderado por impresiones día a día, mismo criterio que el resto del proyecto (ver toPageChurnStats/toTopPageStat). */
  position: number;
  /** Ordenado ascendente por fecha — base del gráfico de evolución por página (Prompt 60). */
  daily: SeoPageRankingDailyPoint[];
}

export interface SeoPageCountResult {
  current: number;
  previous: number;
  series: SeoPageCountBucket[];
  /** Ranking de TODAS las páginas activas de `range`, ordenado por impresiones desc — Prompt 60, mismo dataset (date×page) ya consultado para `series`, sin pegarle una segunda vez a la API. */
  ranking: SeoPageRankingStat[];
}

export async function fetchPageCount(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoPageCountResult> {
  // Misma consulta combinada que fetchKeywordCount (previousRange.from hasta
  // range.to en un solo llamado), ahora con dimensionFilterGroups para
  // acotar al segmento elegido.
  const rows = await queryAllRowsPaginated(
    segment.siteUrl,
    { from: previousRange.from, to: range.to },
    ["date", "page"],
    segment.dimensionFilterGroups
  );

  const currentPages = new Set<string>();
  const previousPages = new Set<string>();
  const buckets = new Map<string, { startDate: string; endDate: string; pages: Set<string> }>();
  const rankingAcc = new Map<string, { impressions: number; clicks: number; weightedPosition: number; daily: Map<string, { impressions: number; clicks: number }> }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const page = row.keys?.[1];
    if (!date || !page) continue;

    if (date >= range.from) {
      currentPages.add(page);
      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, pages: new Set<string>() };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      bucket.pages.add(page);
      buckets.set(key, bucket);

      const clicks = row.clicks ?? 0;
      const impressions = row.impressions ?? 0;
      const position = row.position ?? 0;
      const acc = rankingAcc.get(page) ?? { impressions: 0, clicks: 0, weightedPosition: 0, daily: new Map<string, { impressions: number; clicks: number }>() };
      acc.impressions += impressions;
      acc.clicks += clicks;
      acc.weightedPosition += position * impressions;
      const dayEntry = acc.daily.get(date) ?? { impressions: 0, clicks: 0 };
      dayEntry.impressions += impressions;
      dayEntry.clicks += clicks;
      acc.daily.set(date, dayEntry);
      rankingAcc.set(page, acc);
    } else {
      previousPages.add(page);
    }
  }

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, pages: new Set() });
  }

  const series: SeoPageCountBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, count: bucket.pages.size }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  const ranking: SeoPageRankingStat[] = [...rankingAcc.entries()]
    .map(([key, acc]) => ({
      key,
      impressions: acc.impressions,
      clicks: acc.clicks,
      ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
      position: acc.impressions > 0 ? acc.weightedPosition / acc.impressions : 0,
      daily: [...acc.daily.entries()]
        .map(([date, d]) => ({ date, impressions: d.impressions, clicks: d.clicks }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  // OJO: la suma de `count` de todas las barras puede ser MAYOR al `current`
  // de arriba, a propósito — misma aclaración que fetchKeywordCount: una
  // misma página cuenta una vez por bucket en el que tuvo impresiones, pero
  // solo una vez en el total deduplicado del período completo.
  return { current: currentPages.size, previous: previousPages.size, series, ranking };
}

// ============================================================================
// SEO > Visión General (Prompt 64) — cruce página×keyword.
// ============================================================================

export interface SeoOverviewMetrics {
  totalPages: number;
  totalKeywords: number;
  /** Cruce real página×keyword, NO totalKeywords/totalPages (ver comentario en summarizeOverviewAccumulator). */
  avgKeywordsPerPage: number;
  /** Un valor alto es señal de canibalización: la misma keyword compitiendo en varias páginas. */
  avgPagesPerKeyword: number;
}

export interface SeoOverviewBucket extends SeoOverviewMetrics {
  key: string;
  startDate: string;
  endDate: string;
}

export interface SeoOverviewResult {
  current: SeoOverviewMetrics;
  previous: SeoOverviewMetrics;
  series: SeoOverviewBucket[];
}

interface OverviewAccumulator {
  pages: Set<string>;
  keywords: Set<string>;
  pageToKeywords: Map<string, Set<string>>;
  keywordToPages: Map<string, Set<string>>;
}

function newOverviewAccumulator(): OverviewAccumulator {
  return { pages: new Set(), keywords: new Set(), pageToKeywords: new Map(), keywordToPages: new Map() };
}

function accumulateOverviewRow(acc: OverviewAccumulator, page: string, query: string): void {
  acc.pages.add(page);
  acc.keywords.add(query);

  const keywordsForPage = acc.pageToKeywords.get(page) ?? new Set<string>();
  keywordsForPage.add(query);
  acc.pageToKeywords.set(page, keywordsForPage);

  const pagesForKeyword = acc.keywordToPages.get(query) ?? new Set<string>();
  pagesForKeyword.add(page);
  acc.keywordToPages.set(query, pagesForKeyword);
}

// avgKeywordsPerPage/avgPagesPerKeyword se calculan con el cruce real
// página×keyword (cuántas keywords distintas trae CADA página, promediado
// entre páginas — y viceversa) — NO totalKeywords/totalPages, que da un
// número distinto porque una misma keyword puede aparecer en varias páginas
// (y viceversa), así que ese cociente simple no refleja la distribución real.
function summarizeOverviewAccumulator(acc: OverviewAccumulator): SeoOverviewMetrics {
  const totalPages = acc.pages.size;
  const totalKeywords = acc.keywords.size;
  const sumKeywordsPerPage = [...acc.pageToKeywords.values()].reduce((sum, keywords) => sum + keywords.size, 0);
  const sumPagesPerKeyword = [...acc.keywordToPages.values()].reduce((sum, pages) => sum + pages.size, 0);

  return {
    totalPages,
    totalKeywords,
    avgKeywordsPerPage: totalPages > 0 ? sumKeywordsPerPage / totalPages : 0,
    avgPagesPerKeyword: totalKeywords > 0 ? sumPagesPerKeyword / totalKeywords : 0,
  };
}

// Cruce página×keyword de TODO el sitio (segmento elegido) — dimensions
// ["date","page","query"], paginando 25.000 filas por request (ver
// queryAllRowsPaginated). Mismo criterio que fetchPageCount/fetchKeywordCount
// para current/previous (una sola consulta combinada, split por fecha) y para
// los buckets del gráfico (enumerateBucketRanges completa los que no tuvieron
// ninguna fila). `current`/`previous`/cada bucket de `series` se calculan con
// la MISMA fórmula (summarizeOverviewAccumulator), solo que aplicada a un
// rango de fechas distinto — igual que fetchPageCount/fetchKeywordCount, la
// suma de una métrica de conteo (totalPages/totalKeywords) entre buckets
// puede superar el total deduplicado del período completo a propósito (una
// misma página/keyword cuenta una vez por bucket en el que tuvo actividad).
export async function fetchSeoOverview(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoOverviewResult> {
  const rows = await queryAllRowsPaginated(
    segment.siteUrl,
    { from: previousRange.from, to: range.to },
    ["date", "page", "query"],
    segment.dimensionFilterGroups
  );

  const currentAcc = newOverviewAccumulator();
  const previousAcc = newOverviewAccumulator();
  const buckets = new Map<string, { startDate: string; endDate: string; acc: OverviewAccumulator }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const page = row.keys?.[1];
    const query = row.keys?.[2];
    if (!date || !page || !query) continue;

    if (date >= range.from) {
      accumulateOverviewRow(currentAcc, page, query);

      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, acc: newOverviewAccumulator() };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      accumulateOverviewRow(bucket.acc, page, query);
      buckets.set(key, bucket);
    } else {
      accumulateOverviewRow(previousAcc, page, query);
    }
  }

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, acc: newOverviewAccumulator() });
  }

  const series: SeoOverviewBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, ...summarizeOverviewAccumulator(bucket.acc) }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return {
    current: summarizeOverviewAccumulator(currentAcc),
    previous: summarizeOverviewAccumulator(previousAcc),
    series,
  };
}

// ============================================================================
// SEO > Visión General — sección "Rendimiento en Búsqueda" (Prompt 67).
// ============================================================================

export interface SeoPerformanceMetrics {
  /** Suma total de impresiones de todas las páginas del período. */
  impressions: number;
  /** Suma total de clicks de todas las páginas del período. */
  clicks: number;
  /** Agregado: Σclicks/Σimpresiones de TODO el sitio — NO el promedio de los CTR de cada página. */
  ctr: number;
  /** Agregado: posición ponderada por impresiones de CADA página (no por día) — NO el promedio simple de las posiciones de cada página. */
  position: number;
  avgImpressionsPerPage: number;
  avgClicksPerPage: number;
  /** Promedio SIMPLE (sin ponderar) del CTR propio de cada página — campo aparte, no reutiliza el cálculo de `ctr` de arriba. */
  avgCtrPerPage: number;
  /** Promedio SIMPLE (sin ponderar) de la posición propia de cada página (esa posición ya viene ponderada por las impresiones de ESA página) — campo aparte, no reutiliza el cálculo de `position` de arriba. */
  avgPositionPerPage: number;
}

export interface SeoPerformanceBucket {
  key: string;
  startDate: string;
  endDate: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

// Desglose por tipo de contenido (Prompt 68) — SIEMPRE calculado sobre el
// dataset de página que trajo fetchSeoPerformance, sin una consulta nueva a
// Search Console. Solo representa el sitio COMPLETO cuando ese dataset en sí
// no vino filtrado por segmento (segment="all" → dimensionFilterGroups
// vacío) — por eso el frontend lo oculta directamente cuando el segmento
// elegido en la hoja no es "Todo el sitio" (ver SeoDashboard.tsx).
export type SeoContentType = "home" | "blog-portada" | "blog-notas" | "otras";

export interface SeoContentTypeMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export type SeoPerformanceContentBreakdown = Record<SeoContentType, SeoContentTypeMetrics>;

export interface SeoPerformanceResult {
  current: SeoPerformanceMetrics;
  previous: SeoPerformanceMetrics;
  series: SeoPerformanceBucket[];
  contentBreakdown: SeoPerformanceContentBreakdown;
}

interface PagePerformanceAccumulator {
  impressions: number;
  clicks: number;
  weightedPosition: number;
}

function newPagePerformanceAccumulator(): PagePerformanceAccumulator {
  return { impressions: 0, clicks: 0, weightedPosition: 0 };
}

// Misma condición que buildGSCSegments (lib/gsc/segments.ts), pero evaluada
// acá con RegExp de JS sobre datos YA traídos — no vía dimensionFilterGroups
// de una consulta nueva a Search Console. "Home" (Prompt 69) es EXCLUSIVAMENTE
// la página principal (homePageRegex, mismo criterio que resuelve
// resolveHomePageRegex) — páginas que no son ni home ni blog cuentan aparte
// como "otras", ya no se agrupan bajo "home". Ante una regex inválida
// guardada en config, cae a "otras" (fallback conservador).
function classifyPageContentType(page: string, blog: GSCBlogConfig | null, homePageRegex: string): SeoContentType {
  try {
    if (blog && new RegExp(blog.home_regex).test(page)) return "blog-portada";
    if (blog && new RegExp(blog.posts_regex).test(page)) return "blog-notas";
    if (new RegExp(homePageRegex).test(page)) return "home";
  } catch {
    return "otras";
  }
  return "otras";
}

// Impresiones/Clicks: suma dentro de cada tipo. CTR: Σclicks/Σimpresiones
// DENTRO de cada tipo (no promedio de CTRs). Posición Media: promedio
// ponderado por impresiones DENTRO de cada tipo — reutiliza el mismo
// `weightedPosition` por página que ya acumula fetchSeoPerformance.
function summarizeContentBreakdown(
  pages: Map<string, PagePerformanceAccumulator>,
  blog: GSCBlogConfig | null,
  homePageRegex: string
): SeoPerformanceContentBreakdown {
  const groups: Record<SeoContentType, { impressions: number; clicks: number; weightedPosition: number }> = {
    home: { impressions: 0, clicks: 0, weightedPosition: 0 },
    "blog-portada": { impressions: 0, clicks: 0, weightedPosition: 0 },
    "blog-notas": { impressions: 0, clicks: 0, weightedPosition: 0 },
    otras: { impressions: 0, clicks: 0, weightedPosition: 0 },
  };

  for (const [page, acc] of pages) {
    const group = groups[classifyPageContentType(page, blog, homePageRegex)];
    group.impressions += acc.impressions;
    group.clicks += acc.clicks;
    group.weightedPosition += acc.weightedPosition;
  }

  const toMetrics = (group: { impressions: number; clicks: number; weightedPosition: number }): SeoContentTypeMetrics => ({
    impressions: group.impressions,
    clicks: group.clicks,
    ctr: group.impressions > 0 ? group.clicks / group.impressions : 0,
    position: group.impressions > 0 ? group.weightedPosition / group.impressions : 0,
  });

  return {
    home: toMetrics(groups.home),
    "blog-portada": toMetrics(groups["blog-portada"]),
    "blog-notas": toMetrics(groups["blog-notas"]),
    otras: toMetrics(groups.otras),
  };
}

// Agregado del sitio (ctr/position, ponderados por impresiones) vs. promedio
// SIMPLE por página (avgCtrPerPage/avgPositionPerPage) — dos cálculos
// deliberadamente separados, ver comentarios en SeoPerformanceMetrics: una
// página de mucho volumen puede arrastrar el agregado del sitio hacia un
// valor muy distinto al de la página "típica".
function summarizePagePerformance(pages: Map<string, PagePerformanceAccumulator>): SeoPerformanceMetrics {
  const totalPages = pages.size;
  let impressions = 0;
  let clicks = 0;
  let weightedPositionSum = 0;
  let sumPerPageCtr = 0;
  let sumPerPagePosition = 0;

  for (const page of pages.values()) {
    impressions += page.impressions;
    clicks += page.clicks;
    weightedPositionSum += page.weightedPosition;
    sumPerPageCtr += page.impressions > 0 ? page.clicks / page.impressions : 0;
    sumPerPagePosition += page.impressions > 0 ? page.weightedPosition / page.impressions : 0;
  }

  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weightedPositionSum / impressions : 0,
    avgImpressionsPerPage: totalPages > 0 ? impressions / totalPages : 0,
    avgClicksPerPage: totalPages > 0 ? clicks / totalPages : 0,
    avgCtrPerPage: totalPages > 0 ? sumPerPageCtr / totalPages : 0,
    avgPositionPerPage: totalPages > 0 ? sumPerPagePosition / totalPages : 0,
  };
}

// Rendimiento agregado de TODO el sitio (segmento elegido) a nivel página —
// dimensions ["date","page"] (no "query": esta sección no necesita el cruce
// página×keyword de fetchSeoOverview). Mismo criterio de current/previous en
// una sola consulta combinada y de completar buckets sin filas que el resto
// de fetchXxx de este archivo. Los buckets de `series` solo llevan los 4
// valores agregados (impressions/clicks/ctr/position) — los promedios por
// página son un dato de contexto puntual del período completo, no se grafican.
export async function fetchSeoPerformance(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity,
  blog: GSCBlogConfig | null,
  homePageRegex: string
): Promise<SeoPerformanceResult> {
  const rows = await queryAllRowsPaginated(
    segment.siteUrl,
    { from: previousRange.from, to: range.to },
    ["date", "page"],
    segment.dimensionFilterGroups
  );

  const currentPages = new Map<string, PagePerformanceAccumulator>();
  const previousPages = new Map<string, PagePerformanceAccumulator>();
  const buckets = new Map<string, { startDate: string; endDate: string; impressions: number; clicks: number; weightedPosition: number }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const page = row.keys?.[1];
    if (!date || !page) continue;

    const impressions = row.impressions ?? 0;
    const clicks = row.clicks ?? 0;
    const position = row.position ?? 0;

    if (date >= range.from) {
      const acc = currentPages.get(page) ?? newPagePerformanceAccumulator();
      acc.impressions += impressions;
      acc.clicks += clicks;
      acc.weightedPosition += position * impressions;
      currentPages.set(page, acc);

      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, impressions: 0, clicks: 0, weightedPosition: 0 };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      bucket.impressions += impressions;
      bucket.clicks += clicks;
      bucket.weightedPosition += position * impressions;
      buckets.set(key, bucket);
    } else {
      const acc = previousPages.get(page) ?? newPagePerformanceAccumulator();
      acc.impressions += impressions;
      acc.clicks += clicks;
      acc.weightedPosition += position * impressions;
      previousPages.set(page, acc);
    }
  }

  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, impressions: 0, clicks: 0, weightedPosition: 0 });
  }

  const series: SeoPerformanceBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      startDate: bucket.startDate,
      endDate: bucket.endDate,
      impressions: bucket.impressions,
      clicks: bucket.clicks,
      ctr: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0,
      position: bucket.impressions > 0 ? bucket.weightedPosition / bucket.impressions : 0,
    }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return {
    current: summarizePagePerformance(currentPages),
    previous: summarizePagePerformance(previousPages),
    series,
    contentBreakdown: summarizeContentBreakdown(currentPages, blog, homePageRegex),
  };
}

export interface SeoPageChurnStats {
  key: string;
  days: number;
  impressions: number;
  clicks: number;
  ctr: number;
  /** Impresiones día por día, dentro de la ventana en la que se acumuló esta entidad (actual para nuevas, anterior para perdidas) — base del gráfico de líneas de drill-down. */
  dailyImpressions: SeoDailyImpressionPoint[];
}

export interface SeoPageChurnTrendBucket {
  key: string;
  startDate: string;
  endDate: string;
  gainedCount: number;
  lostCount: number;
}

export interface SeoPageChurnResult {
  currentWindow: DateRangeValue;
  previousWindow: DateRangeValue;
  totalNew: number;
  totalLost: number;
  net: number;
  churn: number;
  newPages: SeoPageChurnStats[];
  lostPages: SeoPageChurnStats[];
  trend: SeoPageChurnTrendBucket[];
}

function toPageChurnStats(key: string, acc: WindowQueryAccumulator): SeoPageChurnStats {
  return {
    key,
    days: acc.days.size,
    impressions: acc.impressions,
    clicks: acc.clicks,
    ctr: acc.impressions > 0 ? acc.clicks / acc.impressions : 0,
    dailyImpressions: sortedDailyImpressions(acc.dailyImpressions),
  };
}

function subDaysIso(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

// A diferencia de fetchKeywordChurn (cuya ventana quedó atada al rango
// global de la hoja Keywords), acá cada tarjeta (Nuevas/Perdidas) tiene su
// propio selector de ventana (7/14/30/60/90 días) — la ventana actual son
// los últimos `windowDays` días terminando en `rangeEnd` (el "hasta" del
// selector de fecha global de la hoja Páginas, no "hoy"), y la anterior es
// el mismo largo inmediatamente antes.
export async function fetchPageChurn(
  segment: GSCSegmentQuery,
  rangeEnd: string,
  windowDays: number,
  granularity: Granularity
): Promise<SeoPageChurnResult> {
  const currentWindow: DateRangeValue = { from: subDaysIso(rangeEnd, windowDays - 1), to: rangeEnd };
  const previousWindow: DateRangeValue = { from: subDaysIso(currentWindow.from, windowDays), to: subDaysIso(currentWindow.from, 1) };

  const rows = await queryAllRowsPaginated(
    segment.siteUrl,
    { from: previousWindow.from, to: currentWindow.to },
    ["date", "page"],
    segment.dimensionFilterGroups
  );

  const currentByPage = new Map<string, WindowQueryAccumulator>();
  const previousByPage = new Map<string, WindowQueryAccumulator>();
  const buckets = new Map<string, { startDate: string; endDate: string; pages: Set<string>; hasData: boolean }>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const page = row.keys?.[1];
    if (!date || !page) continue;
    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;

    if (date >= currentWindow.from && date <= currentWindow.to) {
      const acc = currentByPage.get(page) ?? newWindowAccumulator();
      accumulateWindowRow(acc, date, clicks, impressions);
      currentByPage.set(page, acc);

      const key = keywordCountBucketKey(date, granularity);
      const bucket = buckets.get(key) ?? { startDate: date, endDate: date, pages: new Set<string>(), hasData: true };
      if (date < bucket.startDate) bucket.startDate = date;
      if (date > bucket.endDate) bucket.endDate = date;
      bucket.pages.add(page);
      buckets.set(key, bucket);
    } else if (date >= previousWindow.from && date <= previousWindow.to) {
      const acc = previousByPage.get(page) ?? newWindowAccumulator();
      accumulateWindowRow(acc, date, clicks, impressions);
      previousByPage.set(page, acc);
    }
  }

  const newPages: SeoPageChurnStats[] = [];
  for (const [page, acc] of currentByPage) {
    if (!previousByPage.has(page)) newPages.push(toPageChurnStats(page, acc));
  }
  newPages.sort((a, b) => b.impressions - a.impressions);

  const lostPages: SeoPageChurnStats[] = [];
  for (const [page, acc] of previousByPage) {
    if (!currentByPage.has(page)) lostPages.push(toPageChurnStats(page, acc));
  }
  lostPages.sort((a, b) => b.impressions - a.impressions);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) — se marcan con `hasData: false` para no inflar `lostCount`
  // más abajo (mismo criterio ya aplicado en fetchKeywordChurn).
  for (const [key, meta] of enumerateBucketRanges(currentWindow, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, pages: new Set(), hasData: false });
  }

  const sortedBuckets = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, pages: bucket.pages, hasData: bucket.hasData }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  const trend: SeoPageChurnTrendBucket[] = [];
  for (let i = 1; i < sortedBuckets.length; i += 1) {
    const current = sortedBuckets[i]!;
    const previous = sortedBuckets[i - 1]!;

    if (!current.hasData) {
      trend.push({ key: current.key, startDate: current.startDate, endDate: current.endDate, gainedCount: 0, lostCount: 0 });
      continue;
    }

    let gainedCount = 0;
    for (const page of current.pages) {
      if (!previous.pages.has(page)) gainedCount += 1;
    }
    let lostCount = 0;
    for (const page of previous.pages) {
      if (!current.pages.has(page)) lostCount += 1;
    }
    trend.push({ key: current.key, startDate: current.startDate, endDate: current.endDate, gainedCount, lostCount });
  }

  return {
    currentWindow,
    previousWindow,
    totalNew: newPages.length,
    totalLost: lostPages.length,
    net: newPages.length - lostPages.length,
    churn: newPages.length + lostPages.length,
    newPages,
    lostPages,
    trend,
  };
}

// ============================================================================
// "Top Páginas" (SEO > Páginas > Resumen) — para cada página con al menos 1
// impresión en el período (tenga o no clicks — se cambió de "clicks > 0" a
// "impresiones > 0" para no dejar afuera páginas que sí generan impresiones
// pero todavía ningún click), TODAS sus keywords con ≥1 impresión (misma
// definición de "keyword" que "Cantidad de Keywords"), cada una con isBrand,
// impresiones, clicks, ctr y posición. Respeta el segmento elegido en el
// selector transversal de la hoja (mismo patrón que
// fetchPageCount/fetchPageChurn).
// ============================================================================

export interface SeoTopPageKeywordStat {
  query: string;
  isBrand: boolean;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
}

export interface SeoTopPageStat {
  page: string;
  /** Suma / recálculo sobre las keywords de ESTA página (no la fila de
   * totales de la consulta page-only) — así el bloque de Total de cada
   * página siempre coincide exactamente con la suma de las keywords que se
   * ven debajo, sin importar la anonimización de queries de bajísimo volumen
   * que a veces hace Search Console en el desglose page×query. */
  impressions: number;
  clicks: number;
  ctr: number;
  /** Ponderada por impresiones entre las keywords de la página (nunca un promedio simple). */
  position: number;
  /** Ordenadas por clicks desc. */
  keywords: SeoTopPageKeywordStat[];
}

export interface SeoTopPagesResult {
  /** Ordenadas por clicks desc. */
  pages: SeoTopPageStat[];
}

export async function fetchTopPages(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  brandRegex: string | null
): Promise<SeoTopPagesResult> {
  // 2 consultas: totales por página (para decidir qué páginas califican) y
  // page×query paginada (para las keywords de cada página que sí califica).
  const [pageRows, pageQueryRows] = await Promise.all([
    queryAllRowsPaginated(segment.siteUrl, range, ["page"], segment.dimensionFilterGroups),
    queryAllRowsPaginated(segment.siteUrl, range, ["page", "query"], segment.dimensionFilterGroups),
  ]);

  const qualifyingPages = new Set<string>();
  for (const row of pageRows) {
    const page = row.keys?.[0];
    if (!page) continue;
    if ((row.impressions ?? 0) > 0) qualifyingPages.add(page);
  }

  let brandPattern: RegExp | null = null;
  if (brandRegex) {
    try {
      brandPattern = new RegExp(brandRegex, "i");
    } catch {
      brandPattern = null;
    }
  }

  const keywordsByPage = new Map<string, SeoTopPageKeywordStat[]>();
  for (const row of pageQueryRows) {
    const page = row.keys?.[0];
    const query = row.keys?.[1];
    if (!page || !query || !qualifyingPages.has(page)) continue;

    const impressions = row.impressions ?? 0;
    if (impressions <= 0) continue; // misma definición de "keyword": ≥1 impresión

    const list = keywordsByPage.get(page) ?? [];
    list.push({
      query,
      isBrand: brandPattern?.test(query) ?? false,
      impressions,
      clicks: row.clicks ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    });
    keywordsByPage.set(page, list);
  }

  const pages: SeoTopPageStat[] = [];
  for (const page of qualifyingPages) {
    const keywords = (keywordsByPage.get(page) ?? []).sort((a, b) => b.clicks - a.clicks);
    if (keywords.length === 0) continue; // página calificó por el total, pero sin keywords propias (anonimización de queries de bajísimo volumen, ver comentario de SeoTopPageStat)

    const impressions = keywords.reduce((sum, kw) => sum + kw.impressions, 0);
    const clicks = keywords.reduce((sum, kw) => sum + kw.clicks, 0);
    const weightedPosition = keywords.reduce((sum, kw) => sum + kw.position * kw.impressions, 0);

    pages.push({
      page,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions : 0,
      position: impressions > 0 ? weightedPosition / impressions : 0,
      keywords,
    });
  }

  pages.sort((a, b) => b.clicks - a.clicks);

  return { pages };
}

// ============================================================================
// "Concentración" (SEO > Páginas > Concentración) — mismo patrón que los
// bloques de Pareto de Keywords (Clicks/Impresiones, ver SeoClicksBlock/
// SeoImpressionsBlock más arriba en este archivo), aplicado a páginas en vez
// de keywords: scorecard + tendencia liviana (dimensions: ["date"]) + Pareto
// de concentración (dimensions: ["page"]). A diferencia de los bloques de
// Keywords (sobre todo el sitio), estos SÍ respetan el segmento elegido en
// el selector transversal de la hoja Páginas (mismo patrón que
// fetchPageCount/fetchTopPages).
// ============================================================================

export interface SeoPageParetoStat {
  key: string; // page
  clicks: number;
  impressions: number;
}

// Una sola consulta de totales por página, compartida entre los bloques de
// Clicks e Impresiones de esta sección (ninguno de los dos pide nada que el
// otro no pida también) — evita duplicar el pedido a Search Console. Mismo
// límite sin paginar que ya usa fetchClicksParetoKeywords para keywords
// (KEYWORDS_ROW_FETCH_LIMIT): de sobra para la cantidad de páginas de un
// sitio real.
async function fetchPageParetoRows(segment: GSCSegmentQuery, range: DateRangeValue): Promise<SeoPageParetoStat[]> {
  const rows = await queryDimensionRows(segment, range, ["page"], KEYWORDS_ROW_FETCH_LIMIT);
  return rows
    .map((row) => ({ key: row.keys?.[0], clicks: row.clicks ?? 0, impressions: row.impressions ?? 0 }))
    .filter((row): row is SeoPageParetoStat => !!row.key);
}

export interface SeoPagesClicksResult {
  current: number;
  previous: number;
  series: SeoClicksBucket[];
}

// Idéntico en estructura a fetchClicksTrend, pero recibe `segment` en vez de
// armar wholeSiteQuery(siteUrl) — así respeta el filtro de Home/
// Blog elegido en la hoja Páginas. Duplicado a propósito (mismo criterio que
// SeoImpressionsBlock duplica el sentiment de Pareto de SeoClicksBlock): este
// bloque no depende de fetchClicksTrend ni de la hoja Keywords.
export async function fetchPagesClicksTrend(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoPagesClicksResult> {
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, ["date"], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, ["date"], GSC_ROW_FETCH_LIMIT),
  ]);

  let current = 0;
  const buckets = new Map<string, { startDate: string; endDate: string; clicks: number }>();
  for (const row of currentRows) {
    const date = row.keys?.[0];
    if (!date) continue;
    const clicks = row.clicks ?? 0;
    current += clicks;
    const key = keywordCountBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { startDate: date, endDate: date, clicks: 0 };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    bucket.clicks += clicks;
    buckets.set(key, bucket);
  }

  const previous = previousRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, clicks: 0 });
  }

  const series: SeoClicksBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, clicks: bucket.clicks }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return { current, previous, series };
}

export interface SeoPagesImpressionsResult {
  current: number;
  previous: number;
  series: SeoImpressionsBucket[];
}

// Idéntico en estructura a fetchImpressionsTrend, pero recibe `segment` —
// mismo motivo que fetchPagesClicksTrend.
export async function fetchPagesImpressionsTrend(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<SeoPagesImpressionsResult> {
  const [currentRows, previousRows] = await Promise.all([
    queryDimensionRows(segment, range, ["date"], GSC_ROW_FETCH_LIMIT),
    queryDimensionRows(segment, previousRange, ["date"], GSC_ROW_FETCH_LIMIT),
  ]);

  let current = 0;
  const buckets = new Map<string, { startDate: string; endDate: string; impressions: number }>();
  for (const row of currentRows) {
    const date = row.keys?.[0];
    if (!date) continue;
    const impressions = row.impressions ?? 0;
    current += impressions;
    const key = keywordCountBucketKey(date, granularity);
    const bucket = buckets.get(key) ?? { startDate: date, endDate: date, impressions: 0 };
    if (date < bucket.startDate) bucket.startDate = date;
    if (date > bucket.endDate) bucket.endDate = date;
    bucket.impressions += impressions;
    buckets.set(key, bucket);
  }

  const previous = previousRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);

  // Completa los buckets sin ninguna fila (lag de reporte de Search
  // Console) con 0 en vez de dejarlos afuera de la serie.
  for (const [key, meta] of enumerateBucketRanges(range, granularity)) {
    if (!buckets.has(key)) buckets.set(key, { startDate: meta.startDate, endDate: meta.endDate, impressions: 0 });
  }

  const series: SeoImpressionsBucket[] = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, startDate: bucket.startDate, endDate: bucket.endDate, impressions: bucket.impressions }))
    .sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));

  return { current, previous, series };
}

export interface SeoPagesClicksParetoResult {
  totalClicks: number;
  totalImpressions: number;
  totalPages: number;
  /** Cantidad de páginas (N) necesarias para llegar/superar el 80% de clicks del período. */
  cutoffCount: number;
  /** X: qué % de las páginas del período representa `cutoffCount` (redondeado a entero). */
  cutoffPagesPercent: number;
  /** Y: qué % de las impresiones del período generó ese mismo subconjunto de N páginas (redondeado a entero). */
  cutoffImpressionsPercent: number;
  /** Mismo cálculo que `cutoffPagesPercent` pero sobre el período anterior — solo para el insight de concentración, no tiene tabla propia. */
  previousCutoffPagesPercent: number;
  /** Las N páginas del corte, ordenadas por clicks desc. */
  topPages: SeoPageParetoStat[];
  /** El resto de las páginas del período (por debajo del corte), ordenadas por clicks desc. */
  restPages: SeoPageParetoStat[];
}

export async function fetchPagesClicksPareto(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<SeoPagesClicksParetoResult> {
  const [currentRows, previousRows] = await Promise.all([
    fetchPageParetoRows(segment, range),
    fetchPageParetoRows(segment, previousRange),
  ]);

  const current = computeClicksParetoConcentration(currentRows);
  const previous = computeClicksParetoConcentration(previousRows);

  return {
    totalClicks: current.totalClicks,
    totalImpressions: current.totalImpressions,
    totalPages: current.totalKeywords,
    cutoffCount: current.cutoffCount,
    cutoffPagesPercent: current.cutoffKeywordsPercent,
    cutoffImpressionsPercent: current.cutoffImpressionsPercent,
    previousCutoffPagesPercent: previous.cutoffKeywordsPercent,
    topPages: current.topKeywords,
    restPages: current.sorted.slice(current.cutoffCount),
  };
}

export interface SeoPagesImpressionsParetoResult {
  totalClicks: number;
  totalImpressions: number;
  totalPages: number;
  /** Cantidad de páginas (N) necesarias para llegar/superar el 80% de IMPRESIONES del período. */
  cutoffCount: number;
  /** X: qué % de las páginas del período representa `cutoffCount` (redondeado a entero). */
  cutoffPagesPercent: number;
  /** Y: qué % de los CLICKS del período generó ese mismo subconjunto de N páginas top por impresiones (cruce inverso al de Clicks, redondeado a entero). */
  cutoffClicksPercent: number;
  /** Mismo cálculo que `cutoffPagesPercent` pero sobre el período anterior — solo para el insight de concentración. */
  previousCutoffPagesPercent: number;
  /** Las N páginas del corte, ordenadas por impresiones desc. */
  topPages: SeoPageParetoStat[];
  /** El resto de las páginas del período (por debajo del corte), ordenadas por impresiones desc. */
  restPages: SeoPageParetoStat[];
}

export async function fetchPagesImpressionsPareto(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<SeoPagesImpressionsParetoResult> {
  const [currentRows, previousRows] = await Promise.all([
    fetchPageParetoRows(segment, range),
    fetchPageParetoRows(segment, previousRange),
  ]);

  const current = computeImpressionsParetoConcentration(currentRows);
  const previous = computeImpressionsParetoConcentration(previousRows);

  return {
    totalClicks: current.totalClicks,
    totalImpressions: current.totalImpressions,
    totalPages: current.totalKeywords,
    cutoffCount: current.cutoffCount,
    cutoffPagesPercent: current.cutoffKeywordsPercent,
    cutoffClicksPercent: current.cutoffClicksPercent,
    previousCutoffPagesPercent: previous.cutoffKeywordsPercent,
    topPages: current.topKeywords,
    restPages: current.sorted.slice(current.cutoffCount),
  };
}

// ============================================================================
// "Páginas en Declive" (SEO > Páginas > Páginas en Declive) — selector de
// ventana propio (7/15/30/60/90 días, ver SeoDecliningPagesBlock.tsx),
// independiente del rango global salvo por el ancla (`to`, el "hasta" del
// selector de rango de arriba) — mismo criterio que Páginas Nuevas/Perdidas.
// Una página califica si cae en al menos una de 4 métricas (impresiones,
// clicks, CTR o posición). Para no hacer 10 llamadas (una consulta actual y
// una anterior × 5 ventanas), se trae UNA sola vez datos diarios por página
// (dimensions: ["date","page"]) de los últimos 180 días (90 de la ventana
// más larga + 90 de su comparación) y se agregan en memoria las 5 ventanas
// y las 4 métricas a la vez.
// ============================================================================

// Orden de prioridad para elegir la métrica "protagonista" de una tarjeta
// (la primera de esta lista que efectivamente haya caído) y para el orden
// de los tags secundarios — ver SeoDecliningPagesBlock.tsx.
export type SeoDecliningMetric = "impressions" | "clicks" | "ctr" | "position";
export const DECLINE_METRIC_PRIORITY: SeoDecliningMetric[] = ["impressions", "clicks", "ctr", "position"];

export interface SeoDecliningPageStat {
  page: string;
  clicksCurrent: number;
  clicksPrevious: number;
  /** clicksCurrent − clicksPrevious (negativo = perdió clicks). */
  deltaClicks: number;
  impressionsCurrent: number;
  impressionsPrevious: number;
  /** impressionsCurrent − impressionsPrevious (negativo = perdió impresiones). */
  deltaImpressions: number;
  /** clicks / impressions de cada ventana (nunca promedio de CTR por fila). */
  ctrCurrent: number;
  ctrPrevious: number;
  positionCurrent: number;
  positionPrevious: number;
  /** positionPrevious − positionCurrent (negativo = empeoró: el número de posición subió). */
  deltaPosition: number;
  /** impressionsPrevious >= 10 Y impressionsCurrent <= impressionsPrevious × 0.8. */
  qualifiesByImpressions: boolean;
  /** clicksPrevious >= 10 Y clicksCurrent <= clicksPrevious × 0.8. */
  qualifiesByClicks: boolean;
  /** impressionsPrevious >= 10 Y ctrPrevious > 0 Y ctrCurrent <= ctrPrevious × 0.8 (caída relativa). */
  qualifiesByCtr: boolean;
  /** impressionsPrevious >= 10 Y deltaPosition <= −3 (empeoró ≥3 puestos). */
  qualifiesByPosition: boolean;
  /** Cuántas de las 4 condiciones anteriores son true (1 a 4). */
  qualifyingMetricsCount: number;
  /** Primera métrica que cayó, según DECLINE_METRIC_PRIORITY — la que protagoniza la tarjeta. */
  protagonistMetric: SeoDecliningMetric;
  /** % de caída (o puestos caídos, si protagonistMetric === "position") de la métrica protagonista — usado para desempatar el orden. */
  protagonistDropMagnitude: number;
}

export interface SeoDecliningPagesWindowResult {
  windowDays: number;
  currentWindow: DateRangeValue;
  previousWindow: DateRangeValue;
  /**
   * Todas las páginas que califican en esta ventana, ordenadas primero por
   * qualifyingMetricsCount desc (cayó en más métricas primero) y, a
   * igualdad, por protagonistDropMagnitude desc (mayor caída de la métrica
   * protagonista primero).
   */
  pages: SeoDecliningPageStat[];
}

export interface SeoDecliningPagesMultiWindowResult {
  /** Una entrada por ventana, en el mismo orden que DECLINE_WINDOW_OPTIONS (7/15/30/60/90). */
  windows: SeoDecliningPagesWindowResult[];
}

export const DECLINE_WINDOW_OPTIONS = [7, 15, 30, 60, 90] as const;

// Umbrales de calificación — una página califica si cumple AL MENOS UNA de
// las 4 condiciones (impresiones/clicks/CTR/posición).
const DECLINE_MIN_PREVIOUS_CLICKS = 10;
const DECLINE_MIN_PREVIOUS_IMPRESSIONS = 10;
const DECLINE_DROP_RATIO = 0.8; // actual <= anterior × 0.8 → caída relativa de al menos 20% (impresiones/clicks/CTR)
const DECLINE_POSITION_DROP_THRESHOLD = 3; // deltaPosition <= −3 → empeoró al menos 3 posiciones

interface PageWindowAccumulator {
  clicks: number;
  impressions: number;
  weightedPosition: number;
}

const EMPTY_PAGE_WINDOW_ACC: PageWindowAccumulator = { clicks: 0, impressions: 0, weightedPosition: 0 };

// % de caída (positivo) de una métrica tipo "ratio actual vs. anterior"
// (impresiones/clicks/CTR) — 0 si no hay base contra la cual comparar.
function dropPct(previous: number, current: number): number {
  return previous > 0 ? ((previous - current) / previous) * 100 : 0;
}

// Agrega, a partir del dataset diario ya traído (180 días), los totales por
// página de UNA ventana puntual — se llama una vez por cada una de las 5
// ventanas sobre el mismo array de filas, sin volver a pedir nada a Search
// Console.
function computeDecliningPagesWindow(
  rows: GSCDateQueryRow[],
  rangeEnd: string,
  windowDays: number
): SeoDecliningPagesWindowResult {
  const currentWindow: DateRangeValue = { from: subDaysIso(rangeEnd, windowDays - 1), to: rangeEnd };
  const previousWindow: DateRangeValue = { from: subDaysIso(currentWindow.from, windowDays), to: subDaysIso(currentWindow.from, 1) };

  const currentByPage = new Map<string, PageWindowAccumulator>();
  const previousByPage = new Map<string, PageWindowAccumulator>();

  for (const row of rows) {
    const date = row.keys?.[0];
    const page = row.keys?.[1];
    if (!date || !page) continue;
    const clicks = row.clicks ?? 0;
    const impressions = row.impressions ?? 0;
    const position = row.position ?? 0;

    let target: Map<string, PageWindowAccumulator> | null = null;
    if (date >= currentWindow.from && date <= currentWindow.to) target = currentByPage;
    else if (date >= previousWindow.from && date <= previousWindow.to) target = previousByPage;
    if (!target) continue;

    const acc = target.get(page) ?? { clicks: 0, impressions: 0, weightedPosition: 0 };
    acc.clicks += clicks;
    acc.impressions += impressions;
    acc.weightedPosition += position * impressions;
    target.set(page, acc);
  }

  // Unión de páginas de ambas ventanas: una página nueva (sin datos previos)
  // nunca califica, y una que desapareció del todo en la ventana actual (0
  // clicks/impresiones ahora) sí puede calificar por pérdida de clicks o de
  // impresiones — es exactamente el caso que esta sección quiere detectar.
  const allPages = new Set([...currentByPage.keys(), ...previousByPage.keys()]);

  const pages: SeoDecliningPageStat[] = [];

  for (const page of allPages) {
    const current = currentByPage.get(page) ?? EMPTY_PAGE_WINDOW_ACC;
    const previous = previousByPage.get(page) ?? EMPTY_PAGE_WINDOW_ACC;
    const positionCurrent = current.impressions > 0 ? current.weightedPosition / current.impressions : 0;
    const positionPrevious = previous.impressions > 0 ? previous.weightedPosition / previous.impressions : 0;
    const ctrCurrent = current.impressions > 0 ? current.clicks / current.impressions : 0;
    const ctrPrevious = previous.impressions > 0 ? previous.clicks / previous.impressions : 0;
    const deltaClicks = current.clicks - previous.clicks;
    const deltaImpressions = current.impressions - previous.impressions;
    const deltaPosition = positionPrevious - positionCurrent;

    const qualifiesByImpressions =
      previous.impressions >= DECLINE_MIN_PREVIOUS_IMPRESSIONS && current.impressions <= previous.impressions * DECLINE_DROP_RATIO;
    const qualifiesByClicks = previous.clicks >= DECLINE_MIN_PREVIOUS_CLICKS && current.clicks <= previous.clicks * DECLINE_DROP_RATIO;
    // ctrPrevious > 0 evita que una página con CTR 0 en ambas ventanas
    // (0 <= 0 × 0.8) "califique" por una caída de CTR que en realidad nunca
    // existió.
    const qualifiesByCtr =
      previous.impressions >= DECLINE_MIN_PREVIOUS_IMPRESSIONS && ctrPrevious > 0 && ctrCurrent <= ctrPrevious * DECLINE_DROP_RATIO;
    const qualifiesByPosition = previous.impressions >= DECLINE_MIN_PREVIOUS_IMPRESSIONS && deltaPosition <= -DECLINE_POSITION_DROP_THRESHOLD;

    const qualifyingMetricsCount = [qualifiesByImpressions, qualifiesByClicks, qualifiesByCtr, qualifiesByPosition].filter(Boolean).length;
    if (qualifyingMetricsCount === 0) continue;

    const qualifiesByMetric: Record<SeoDecliningMetric, boolean> = {
      impressions: qualifiesByImpressions,
      clicks: qualifiesByClicks,
      ctr: qualifiesByCtr,
      position: qualifiesByPosition,
    };
    const protagonistMetric = DECLINE_METRIC_PRIORITY.find((metric) => qualifiesByMetric[metric])!;
    const protagonistDropMagnitude =
      protagonistMetric === "impressions"
        ? dropPct(previous.impressions, current.impressions)
        : protagonistMetric === "clicks"
          ? dropPct(previous.clicks, current.clicks)
          : protagonistMetric === "ctr"
            ? dropPct(ctrPrevious, ctrCurrent)
            : Math.round(positionCurrent) - Math.round(positionPrevious); // puestos caídos (positivo)

    pages.push({
      page,
      clicksCurrent: current.clicks,
      clicksPrevious: previous.clicks,
      deltaClicks,
      impressionsCurrent: current.impressions,
      impressionsPrevious: previous.impressions,
      deltaImpressions,
      ctrCurrent,
      ctrPrevious,
      positionCurrent,
      positionPrevious,
      deltaPosition,
      qualifiesByImpressions,
      qualifiesByClicks,
      qualifiesByCtr,
      qualifiesByPosition,
      qualifyingMetricsCount,
      protagonistMetric,
      protagonistDropMagnitude,
    });
  }

  pages.sort((a, b) => {
    if (b.qualifyingMetricsCount !== a.qualifyingMetricsCount) return b.qualifyingMetricsCount - a.qualifyingMetricsCount;
    return b.protagonistDropMagnitude - a.protagonistDropMagnitude;
  });

  return { windowDays, currentWindow, previousWindow, pages };
}

export async function fetchDecliningPagesWindows(
  segment: GSCSegmentQuery,
  rangeEnd: string
): Promise<SeoDecliningPagesMultiWindowResult> {
  const longestWindowDays = Math.max(...DECLINE_WINDOW_OPTIONS);
  const longestCurrentFrom = subDaysIso(rangeEnd, longestWindowDays - 1);
  const fetchFrom = subDaysIso(longestCurrentFrom, longestWindowDays);

  const rows = await queryAllRowsPaginated(segment.siteUrl, { from: fetchFrom, to: rangeEnd }, ["date", "page"], segment.dimensionFilterGroups);

  const windows = DECLINE_WINDOW_OPTIONS.map((windowDays) => computeDecliningPagesWindow(rows, rangeEnd, windowDays));

  return { windows };
}

// ============================================================================
// "Tipos de Búsqueda" (SEO > Tipos de Búsqueda > Resumen) — a diferencia de
// todo lo anterior, `type` no es una dimensión combinable con otras en la
// misma consulta: es un filtro de nivel superior del request
// (searchanalytics.query({ requestBody: { type, ... } })), así que cada tipo
// necesita su propia llamada (sin `dimensions`, igual criterio que
// querySegmentTotals: sin dimensiones la API devuelve una única fila con el
// total agregado del período para ese siteUrl + filtros + type).
// ============================================================================

export type SeoSearchType = "web" | "image" | "video" | "news" | "discover" | "googleNews";

export const SEO_SEARCH_TYPES: SeoSearchType[] = ["web", "image", "video", "news", "discover", "googleNews"];

export const SEO_SEARCH_TYPE_LABELS: Record<SeoSearchType, string> = {
  web: "Web",
  image: "Imagen",
  video: "Video",
  news: "Noticias",
  discover: "Discover",
  googleNews: "Google News",
};

export interface SeoSearchTypeStat extends SeoPeriodMetrics {
  type: SeoSearchType;
  label: string;
}

export async function fetchSearchTypeStat(
  segment: GSCSegmentQuery,
  range: DateRangeValue,
  searchType: SeoSearchType
): Promise<SeoSearchTypeStat> {
  const client = getGSCClient();

  const response = await client.searchanalytics.query({
    siteUrl: segment.siteUrl,
    requestBody: {
      startDate: range.from,
      endDate: range.to,
      type: searchType,
      dimensionFilterGroups: segment.dimensionFilterGroups,
    },
  });

  const row = response.data.rows?.[0];

  return {
    type: searchType,
    label: SEO_SEARCH_TYPE_LABELS[searchType],
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}
