import { addDays, eachDayOfInterval, format, getDay, parseISO } from "date-fns";

import { fetchMetaGraphApi } from "@/lib/meta-ads/client";
import type { DateRangeValue, Granularity } from "@/lib/date-range";

export interface MetaAdsPeriodMetrics {
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  linkClicks: number;
  linkClickCtr: number;
  conversions: number;
  conversionValue: number;
  conversionRate: number;
  cpa: number;
  roas: number;
}

export interface MetaAdsMetrics extends MetaAdsPeriodMetrics {
  currencyCode: string;
  previous: MetaAdsPeriodMetrics;
}

// A diferencia de Google Ads (metrics.conversions ya viene resuelto según
// las conversion actions marcadas "primary" en la cuenta), Meta no tiene un
// único evento de "conversión" a nivel cuenta — depende del objetivo de cada
// cliente (compras para e-commerce, leads para generación de leads, etc.).
// En vez de fijarlo en la config del cliente, se elige desde el tablero
// (ver MetaAdsDashboard) contra la lista real de action_types que devuelve
// la cuenta — este es solo el default inicial antes de que el usuario elija.
export const DEFAULT_CONVERSION_ACTION_TYPE = "omni_purchase";

export interface MetaAdsConversionEventOption {
  actionType: string;
  /** Valor de ese action_type en el período actual, para mostrar junto a la opción y ayudar a elegir. */
  count: number;
}

interface MetaInsightsAction {
  action_type: string;
  value: string;
}

interface MetaInsightsRow {
  date_start?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  inline_link_clicks?: string;
  inline_link_click_ctr?: string;
  actions?: MetaInsightsAction[];
  action_values?: MetaInsightsAction[];
  publisher_platform?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  region?: string;
  country?: string;
  device_platform?: string;
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  age?: string;
  gender?: string;
}

interface MetaInsightsResponse {
  data: MetaInsightsRow[];
}

// Mismo set de campos en toda consulta a /insights (fila única, serie de
// tiempo, o desglosada por plataforma/campaña/región) — así
// parsePeriodMetrics funciona igual sin importar de dónde vino la fila.
const INSIGHTS_FIELDS =
  "spend,impressions,reach,frequency,clicks,ctr,cpc,inline_link_clicks,inline_link_click_ctr,actions,action_values";

function sumActionValue(actions: MetaInsightsAction[] | undefined, actionType: string): number {
  const match = actions?.find((action) => action.action_type === actionType);
  return match ? Number(match.value) : 0;
}

// Sin dimensiones en `fields` más allá de las métricas, la API agrega todo
// el time_range en una única fila (mismo comportamiento que queryTotals de
// Google Ads) — si no hubo actividad en el rango, `data` viene vacío. Trae
// TODOS los actions/action_values de la cuenta (no filtrados por ningún
// action_type en particular), así una sola llamada alcanza tanto para
// calcular las métricas con el evento elegido como para listar qué otros
// eventos hay disponibles para elegir.
async function queryInsightsRow(adAccountId: string, range: DateRangeValue): Promise<MetaInsightsRow | undefined> {
  const response = await fetchMetaGraphApi<MetaInsightsResponse>(`${adAccountId}/insights`, {
    fields: INSIGHTS_FIELDS,
    time_range: JSON.stringify({ since: range.from, until: range.to }),
  });

  return response.data[0];
}

function parsePeriodMetrics(row: MetaInsightsRow | undefined, conversionActionType: string): MetaAdsPeriodMetrics {
  const spend = row?.spend ? Number(row.spend) : 0;
  const impressions = row?.impressions ? Number(row.impressions) : 0;
  const reach = row?.reach ? Number(row.reach) : 0;
  // A diferencia de ctr/inline_link_click_ctr, `frequency` (impresiones por
  // persona alcanzada) es un ratio directo, no un porcentaje — no hace falta
  // normalizarlo.
  const frequency = row?.frequency ? Number(row.frequency) : 0;
  const clicks = row?.clicks ? Number(row.clicks) : 0;
  // A diferencia de Google Ads (metrics.ctr viene como fracción 0-1), la
  // Marketing API de Meta devuelve `ctr`/`inline_link_click_ctr` ya
  // multiplicados por 100 (ej. "2.37" = 2.37%) — los normalizamos a fracción
  // acá porque formatPercent (lib/format.ts) espera 0-1 y vuelve a
  // multiplicar por 100 al mostrar.
  const ctr = row?.ctr ? Number(row.ctr) / 100 : 0;
  const cpc = row?.cpc ? Number(row.cpc) : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  // "Link Clicks" (inline_link_clicks) son los clics que llevan fuera de
  // Meta (al sitio/landing), a diferencia de `clicks` que suma cualquier
  // clic en la pieza (reacciones, comentarios, "ver más", etc.).
  const linkClicks = row?.inline_link_clicks ? Number(row.inline_link_clicks) : 0;
  const linkClickCtr = row?.inline_link_click_ctr ? Number(row.inline_link_click_ctr) / 100 : 0;
  const conversions = sumActionValue(row?.actions, conversionActionType);
  const conversionValue = sumActionValue(row?.action_values, conversionActionType);
  const conversionRate = linkClicks > 0 ? conversions / linkClicks : 0;
  const cpa = conversions > 0 ? spend / conversions : 0;
  const roas = spend > 0 ? conversionValue / spend : 0;

  return {
    spend,
    impressions,
    reach,
    frequency,
    clicks,
    ctr,
    cpc,
    cpm,
    linkClicks,
    linkClickCtr,
    conversions,
    conversionValue,
    conversionRate,
    cpa,
    roas,
  };
}

// Todos los action_types que devolvió la cuenta en el período actual, con su
// valor, para poblar el selector de "evento de conversión" del tablero — sin
// filtrar ni adivinar cuáles "son" conversiones reales, esa decisión la toma
// quien mira el tablero (ver MetaAdsDashboard).
function extractAvailableConversionEvents(row: MetaInsightsRow | undefined): MetaAdsConversionEventOption[] {
  return (row?.actions ?? [])
    .map((action) => ({ actionType: action.action_type, count: Number(action.value) }))
    .sort((a, b) => b.count - a.count);
}

export async function fetchMetaAdsInsights(
  adAccountId: string,
  range: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsPeriodMetrics> {
  const row = await queryInsightsRow(adAccountId, range);
  return parsePeriodMetrics(row, conversionActionType);
}

async function fetchAdAccountCurrency(adAccountId: string): Promise<string> {
  const response = await fetchMetaGraphApi<{ currency?: string }>(adAccountId, { fields: "currency" });
  return response.currency ?? "USD";
}

// La Marketing API de Meta no soporta comparar dos date_ranges en la misma
// llamada, así que el período anterior sale de una segunda consulta en
// paralelo (mismo enfoque que fetchAdsMetrics de Google Ads y
// fetchSegmentMetrics de Search Console).
export async function fetchMetaAdsMetrics(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<{ metrics: MetaAdsMetrics; availableConversionEvents: MetaAdsConversionEventOption[] }> {
  const [currentRow, previousRow, currencyCode] = await Promise.all([
    queryInsightsRow(adAccountId, range),
    queryInsightsRow(adAccountId, previousRange),
    fetchAdAccountCurrency(adAccountId),
  ]);

  const current = parsePeriodMetrics(currentRow, conversionActionType);
  const previous = parsePeriodMetrics(previousRow, conversionActionType);

  return {
    metrics: { ...current, currencyCode, previous },
    availableConversionEvents: extractAvailableConversionEvents(currentRow),
  };
}

export interface MetaAdsTimeSeriesPoint extends MetaAdsPeriodMetrics {
  /** date_start del bucket (YYYY-MM-DD) — para granularidad semanal es el primer día de esa ventana de 7 días. */
  date: string;
}

// La Marketing API bucketiza con `time_increment`: "1" = un punto por día,
// "7" = ventanas fijas de 7 días arrancando en `since` (no alineadas a
// semana calendario, pero consistente entre el período actual y el
// anterior porque ambos arrancan del mismo offset), "monthly" = un punto
// por mes calendario. Verificado contra la cuenta real: cada fila trae su
// propio date_start/date_stop ya acotado a esa ventana, no hace falta
// recalcular nada.
async function queryInsightsSeries(
  adAccountId: string,
  range: DateRangeValue,
  timeIncrement: "1" | "7" | "monthly"
): Promise<MetaInsightsRow[]> {
  const response = await fetchMetaGraphApi<MetaInsightsResponse>(`${adAccountId}/insights`, {
    fields: INSIGHTS_FIELDS,
    time_range: JSON.stringify({ since: range.from, until: range.to }),
    time_increment: timeIncrement,
  });

  return response.data;
}

// Meta NO devuelve fila para un bucket sin actividad (0 impresiones/spend) —
// ni siquiera en 0, directamente omite esa fecha. Sin este relleno, un rango
// de 30 días con 5 días sin delivery volvía del API con solo 25 filas, y el
// gráfico de Evolución mostraba 25 barras en vez de 30 (reportado en
// producción). `expectedDates` son TODAS las fechas de inicio de bucket que
// debería tener el rango pedido — cualquiera sin fila real se completa en 0
// vía parsePeriodMetrics(undefined, ...), que ya está preparado para eso.
function densifyTimeSeries(
  points: MetaAdsTimeSeriesPoint[],
  expectedDates: string[],
  conversionActionType: string
): MetaAdsTimeSeriesPoint[] {
  const byDate = new Map(points.map((point) => [point.date, point]));
  return expectedDates.map((date) => byDate.get(date) ?? { date, ...parsePeriodMetrics(undefined, conversionActionType) });
}

// Una fecha por día del rango (inclusive) — bucket de time_increment="1".
function dailyBucketDates(range: DateRangeValue): string[] {
  return eachDayOfInterval({ start: parseISO(range.from), end: parseISO(range.to) }).map((date) => format(date, "yyyy-MM-dd"));
}

// Ventanas fijas de 7 días arrancando en range.from (no alineadas a semana
// calendario) — mismo criterio que usa Meta para time_increment="7", ver
// comentario de queryInsightsSeries.
function weeklyBucketDates(range: DateRangeValue): string[] {
  const dates: string[] = [];
  const end = parseISO(range.to);
  for (let cursor = parseISO(range.from); cursor <= end; cursor = addDays(cursor, 7)) {
    dates.push(format(cursor, "yyyy-MM-dd"));
  }
  return dates;
}

// Serie de tiempo para el gráfico "actual vs período anterior" del tablero
// (ver MetaAdsDashboard) — misma granularidad y misma cantidad de días en
// ambos rangos (previousRange ya viene con el mismo largo que range, ver
// getPreviousPeriod), así que current[i] y previous[i] son comparables
// punto a punto aunque caigan en fechas de calendario distintas.
export async function fetchMetaAdsTimeSeries(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<{ current: MetaAdsTimeSeriesPoint[]; previous: MetaAdsTimeSeriesPoint[] }> {
  // "monthly" es un valor soportado nativamente por la Marketing API
  // (además de un número de días como "1"/"7") — Meta agrega cada fila por
  // mes calendario y calcula reach/frequency ya deduplicados dentro de ese
  // bucket, así que no hace falta (ni sería correcto) sumar reach diario del
  // lado del cliente para aproximar un bucket más grande. No se rellenan
  // huecos acá (a diferencia de "1"/"7" más abajo): un mes calendario sin
  // ninguna actividad es raro dado el largo máximo de rango del tablero (90
  // días ≈ 3 meses), y el date_start exacto que Meta usa para un primer mes
  // parcial no está verificado, así que rellenar mal generaría un bucket
  // duplicado en vez de arreglar el hueco.
  const timeIncrement = granularity === "week" ? "7" : granularity === "month" ? "monthly" : "1";

  const [currentRows, previousRows] = await Promise.all([
    queryInsightsSeries(adAccountId, range, timeIncrement),
    queryInsightsSeries(adAccountId, previousRange, timeIncrement),
  ]);

  const toPoints = (rows: MetaInsightsRow[]): MetaAdsTimeSeriesPoint[] =>
    rows.map((row) => ({ date: row.date_start ?? "", ...parsePeriodMetrics(row, conversionActionType) }));

  if (timeIncrement === "monthly") {
    return { current: toPoints(currentRows), previous: toPoints(previousRows) };
  }

  const bucketDates = timeIncrement === "7" ? weeklyBucketDates : dailyBucketDates;
  return {
    current: densifyTimeSeries(toPoints(currentRows), bucketDates(range), conversionActionType),
    previous: densifyTimeSeries(toPoints(previousRows), bucketDates(previousRange), conversionActionType),
  };
}

// Forma uniforme para TODO desglose (plataforma/dispositivo/campaña/
// conjunto/anuncio/horario/región): además del valor actual, el período
// anterior del mismo segmento — necesario para que el motor de insights
// (ver lib/insights/meta-ads-llm-insight.ts) pueda afirmar cosas del tipo
// "la caída está concentrada en X" con datos reales, no solo con el total
// agregado. `previous` es null si ese segmento no tuvo actividad en el
// período anterior (nada con qué comparar, no se inventa un 0 encubierto).
export interface MetaAdsBreakdownRow {
  key: string;
  current: MetaAdsPeriodMetrics;
  previous: MetaAdsPeriodMetrics | null;
}

export interface MetaAdsAgeGenderBreakdownRow {
  age: string;
  gender: string;
  current: MetaAdsPeriodMetrics;
  previous: MetaAdsPeriodMetrics | null;
}

// Toda consulta desglosada (breakdowns=... o level=...) comparte el mismo
// set base de campos — solo cambia qué dimensión(es) se pide y, para
// level=campaign/adset/ad, qué campo de nombre hay que sumar. Verificado
// contra la cuenta real que actions/action_values conviven bien con cada
// una de estas combinaciones (platform_position es la única dimensión que
// no las tolera, por eso no está acá).
async function queryBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  params: Record<string, string>,
  extraField?: string
): Promise<MetaInsightsRow[]> {
  const response = await fetchMetaGraphApi<MetaInsightsResponse>(`${adAccountId}/insights`, {
    fields: extraField ? `${INSIGHTS_FIELDS},${extraField}` : INSIGHTS_FIELDS,
    time_range: JSON.stringify({ since: range.from, until: range.to }),
    ...params,
  });
  return response.data;
}

// Top 8 (o 15 para el detalle de anuncios) por spend del período actual —
// suficiente para un gráfico o tabla legible sin que se vuelva una lista
// interminable en cuentas con muchas campañas/conjuntos/anuncios activos.
const MAX_BREAKDOWN_ROWS = 8;
const MAX_AD_BREAKDOWN_ROWS = 15;

// Pide la dimensión en ambos períodos y matchea por clave — cada período
// puede traer un set de claves distinto (un segmento sin actividad en el
// período anterior simplemente no aparece en esa respuesta), por eso se
// matchea por nombre en vez de por posición y `previous` puede ser null.
async function fetchBreakdownWithPrevious(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  params: Record<string, string>,
  getKey: (row: MetaInsightsRow) => string | undefined,
  conversionActionType: string,
  options: { sortDescBySpend?: boolean; limit?: number; extraField?: string } = {}
): Promise<MetaAdsBreakdownRow[]> {
  const [currentRows, previousRows] = await Promise.all([
    queryBreakdown(adAccountId, range, params, options.extraField),
    queryBreakdown(adAccountId, previousRange, params, options.extraField),
  ]);

  const previousByKey = new Map<string, MetaInsightsRow>();
  for (const row of previousRows) {
    const key = getKey(row);
    if (key) previousByKey.set(key, row);
  }

  let result: MetaAdsBreakdownRow[] = currentRows
    .map((row) => ({ key: getKey(row), row }))
    .filter((item): item is { key: string; row: MetaInsightsRow } => !!item.key)
    .map(({ key, row }) => ({
      key,
      current: parsePeriodMetrics(row, conversionActionType),
      previous: previousByKey.has(key) ? parsePeriodMetrics(previousByKey.get(key), conversionActionType) : null,
    }));

  if (options.sortDescBySpend !== false) {
    result = result.sort((a, b) => b.current.spend - a.current.spend);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }
  return result;
}

// "unknown" es un cajón de sastre de placements/dispositivos no
// clasificados — ínfimo en la práctica (en la cuenta de prueba, centavos de
// $6200) y no aporta nada al desglose, así que se filtra en plataforma y
// dispositivo.
export async function fetchMetaAdsPlatformBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "publisher_platform" },
    (row) => (row.publisher_platform && row.publisher_platform !== "unknown" ? row.publisher_platform : undefined),
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

export async function fetchMetaAdsDeviceBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "device_platform" },
    (row) => (row.device_platform && row.device_platform !== "unknown" ? row.device_platform : undefined),
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

export async function fetchMetaAdsCampaignBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { level: "campaign" },
    (row) => row.campaign_name,
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS, extraField: "campaign_name" }
  );
}

export async function fetchMetaAdsAdSetBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { level: "adset" },
    (row) => row.adset_name,
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS, extraField: "adset_name" }
  );
}

// Cantidad de anuncios con actividad en el período — a diferencia de
// fetchMetaAdsAdBreakdown (recortado a los primeros MAX_AD_BREAKDOWN_ROWS
// por spend, para mostrar en tabla), esto cuenta TODOS los anuncios con
// actividad, sin truncar. Usado por el insight dinámico de CTR en Meta Ads >
// Visión General (Prompt 72) — no se muestra ninguna tabla, solo el número.
export async function fetchMetaAdsActiveAdCount(adAccountId: string, range: DateRangeValue): Promise<number> {
  const response = await fetchMetaGraphApi<{ data: { ad_name?: string }[] }>(`${adAccountId}/insights`, {
    fields: "ad_name",
    level: "ad",
    time_range: JSON.stringify({ since: range.from, until: range.to }),
  });
  return response.data.filter((row) => row.ad_name).length;
}

// A nivel anuncio individual puede haber muchas más filas que campañas o
// conjuntos — se muestra como tabla (no gráfico de barras) en el tablero,
// por eso el límite es más alto.
export async function fetchMetaAdsAdBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { level: "ad" },
    (row) => row.ad_name,
    conversionActionType,
    { limit: MAX_AD_BREAKDOWN_ROWS, extraField: "ad_name" }
  );
}

export interface MetaAdsAdDailyStat {
  date: string;
  spend: number;
  conversions: number;
  /** Para contar anuncios activos por bucket (>0 impresiones ese día) en el mini-gráfico del scorecard "Anuncios activos". */
  impressions: number;
}

export interface MetaAdsAdRankingRow {
  key: string;
  campaignName: string;
  current: MetaAdsPeriodMetrics;
  daily: MetaAdsAdDailyStat[];
}

// Nivel anuncio con nombre de campaña + serie diaria embebida (Prompt 95) —
// variante de fetchBreakdownWithPrevious con un campo extra (campaign_name)
// que ese helper no soporta hoy (MetaAdsBreakdownRow no tiene lugar para
// datos adicionales por fila), y con el desglose por día ya incluido en
// cada fila para alimentar el gráfico de evolución del anuncio seleccionado
// sin pedir de nuevo al cambiar de fila o de agregación Día/Semana/Mes (se
// bucketiza del lado del cliente, mismo criterio que SeoPageCountBlock.tsx).
// Reach/Frecuencia del período NO salen de sumar los días — mismo problema
// de doble conteo ya resuelto en otros lados de este archivo eligiendo
// time_increment=monthly en vez de sumar reach diario — por eso la
// consulta de totales va SIN time_increment (Meta deduplica reach en todo
// el rango de una sola vez) y la serie diaria solo trae spend/conversiones,
// que sí son sumables día a día sin ese problema.
export async function fetchMetaAdsAdRanking(
  adAccountId: string,
  range: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsAdRankingRow[]> {
  const [totalsRows, dailyRows] = await Promise.all([
    queryBreakdown(adAccountId, range, { level: "ad" }, "ad_name,campaign_name"),
    queryBreakdown(adAccountId, range, { level: "ad", time_increment: "1" }, "ad_name"),
  ]);

  const dailyByAd = new Map<string, MetaAdsAdDailyStat[]>();
  for (const row of dailyRows) {
    if (!row.ad_name || !row.date_start) continue;
    const list = dailyByAd.get(row.ad_name) ?? [];
    list.push({
      date: row.date_start,
      spend: row.spend ? Number(row.spend) : 0,
      conversions: sumActionValue(row.actions, conversionActionType),
      impressions: row.impressions ? Number(row.impressions) : 0,
    });
    dailyByAd.set(row.ad_name, list);
  }

  return totalsRows
    .filter((row): row is MetaInsightsRow & { ad_name: string } => !!row.ad_name)
    .map((row) => ({
      key: row.ad_name,
      campaignName: row.campaign_name ?? "—",
      current: parsePeriodMetrics(row, conversionActionType),
      daily: dailyByAd.get(row.ad_name) ?? [],
    }))
    .sort((a, b) => b.current.spend - a.current.spend);
}

// Los buckets vienen como "00:00:00 - 00:59:59", "01:00:00 - 01:59:59", ...
// — el orden lexicográfico ya coincide con el cronológico (están
// zero-padded), así que se reordena por hora en vez de por spend como las
// demás dimensiones (acá importa la hora, no cuánto se gastó en cada una).
export async function fetchMetaAdsHourlyBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  const rows = await fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone" },
    (row) => row.hourly_stats_aggregated_by_advertiser_time_zone,
    conversionActionType,
    { sortDescBySpend: false }
  );
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchMetaAdsAgeGenderBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsAgeGenderBreakdownRow[]> {
  const rows = await fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "age,gender" },
    (row) => (row.age && row.gender && row.gender !== "unknown" ? `${row.age}::${row.gender}` : undefined),
    conversionActionType,
    { sortDescBySpend: false }
  );
  return rows.map((row) => {
    const [age, gender] = row.key.split("::");
    return { age: age!, gender: gender!, current: row.current, previous: row.previous };
  });
}

export async function fetchMetaAdsRegionBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "region" },
    (row) => row.region,
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

// Mismo patrón que fetchMetaAdsRegionBreakdown (Prompt 80) — `country` viene
// como código ISO 3166-1 alpha-2 (ej. "AR", "US"), no hay mapeo a nombre
// completo en el proyecto todavía, se muestra el código tal cual.
export async function fetchMetaAdsCountryBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    adAccountId,
    range,
    previousRange,
    { breakdowns: "country" },
    (row) => row.country,
    conversionActionType,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

export interface MetaAdsSimpleStat {
  key: string;
  spend: number;
  cpa: number;
}

// getDay() de date-fns devuelve 0=domingo..6=sábado — se remapea al orden
// habitual de semana laboral (0=lunes..6=domingo).
const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function weekdayKeyFromDate(dateIso: string): string {
  const jsDay = getDay(parseISO(dateIso));
  const mondayFirstIndex = (jsDay + 6) % 7;
  return WEEKDAY_KEYS[mondayFirstIndex]!;
}

// Costo y CPA por día de la semana (Prompt 81) — Meta no tiene un breakdown
// nativo de "día de la semana" (solo por hora, ver fetchMetaAdsHourlyBreakdown),
// así que se arma pidiendo el período día por día (time_increment=1) y
// agrupando cada fila según qué día de la semana cayó. CPA se recalcula del
// spend/conversions ya sumados de cada grupo, nunca promediando el CPA
// diario ya calculado — promediar una tasa está mal (mismo criterio que el
// resto del proyecto). Sin período anterior: esta dimensión es solo para
// comparar días de la semana ENTRE SÍ dentro del mismo período, no contra
// el período anterior.
export async function fetchMetaAdsDayOfWeekBreakdown(
  adAccountId: string,
  range: DateRangeValue,
  conversionActionType: string = DEFAULT_CONVERSION_ACTION_TYPE
): Promise<MetaAdsSimpleStat[]> {
  const rows = await queryInsightsSeries(adAccountId, range, "1");

  const totals = new Map<string, { spend: number; conversions: number }>();
  for (const row of rows) {
    if (!row.date_start) continue;
    const key = weekdayKeyFromDate(row.date_start);
    const metrics = parsePeriodMetrics(row, conversionActionType);
    const bucket = totals.get(key) ?? { spend: 0, conversions: 0 };
    bucket.spend += metrics.spend;
    bucket.conversions += metrics.conversions;
    totals.set(key, bucket);
  }

  return WEEKDAY_KEYS.map((key) => {
    const bucket = totals.get(key) ?? { spend: 0, conversions: 0 };
    return { key, spend: bucket.spend, cpa: bucket.conversions > 0 ? bucket.spend / bucket.conversions : 0 };
  });
}
