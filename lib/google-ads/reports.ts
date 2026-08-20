import { enums } from "google-ads-api";

import { getGoogleAdsClient } from "@/lib/google-ads/client";
import type { DateRangeValue, Granularity } from "@/lib/date-range";

export interface GoogleAdsPeriodMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  conversionRate: number;
  cpa: number;
  roas: number;
}

export interface GoogleAdsMetrics extends GoogleAdsPeriodMetrics {
  currencyCode: string;
  previous: GoogleAdsPeriodMetrics;
}

interface GoogleAdsRow {
  customer?: { currency_code?: string | null };
  metrics?: {
    clicks?: number | null;
    impressions?: number | null;
    cost_micros?: number | null;
    conversions?: number | null;
    conversions_value?: number | null;
  };
  segments?: {
    date?: string | null;
    device?: number | null;
    ad_network_type?: number | null;
    hour?: number | null;
    day_of_week?: number | null;
  };
  campaign?: { id?: number | null; name?: string | null };
  ad_group?: { id?: number | null; name?: string | null };
  ad_group_ad?: { ad?: { id?: number | null; name?: string | null } | null };
  ad_group_criterion?: { keyword?: { text?: string | null } | null };
}

// Mismo set de 5 métricas base en toda consulta (agregada, serie de tiempo o
// desglosada): a partir de clics/impresiones/costo/conversiones/valor de
// conversión se derivan el resto (ctr, cpc, cpm, tasa de conversión, cpa,
// roas) — verificado contra la cuenta real que metrics.ctr ya viene como
// fracción 0-1 (a diferencia de Meta, que lo da *100), así que derivarlo
// nosotros mismos (clicks/impressions) da el mismo resultado sin depender de
// qué campos extra tolera cada recurso (customer/campaign/ad_group/
// ad_group_ad/keyword_view) — estos 5 sí funcionan en todos.
const GAQL_METRIC_FIELDS =
  "metrics.clicks, metrics.impressions, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

interface GoogleAdsBaseCounts {
  clicks: number;
  impressions: number;
  spend: number;
  conversions: number;
  conversionValue: number;
}

function parseBaseCounts(row: GoogleAdsRow | undefined): GoogleAdsBaseCounts {
  return {
    clicks: row?.metrics?.clicks ?? 0,
    impressions: row?.metrics?.impressions ?? 0,
    spend: (row?.metrics?.cost_micros ?? 0) / 1_000_000,
    conversions: row?.metrics?.conversions ?? 0,
    conversionValue: row?.metrics?.conversions_value ?? 0,
  };
}

function deriveMetrics(base: GoogleAdsBaseCounts): GoogleAdsPeriodMetrics {
  const { clicks, impressions, spend, conversions, conversionValue } = base;
  return {
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    conversions,
    conversionValue,
    conversionRate: clicks > 0 ? conversions / clicks : 0,
    cpa: conversions > 0 ? spend / conversions : 0,
    roas: spend > 0 ? conversionValue / spend : 0,
  };
}

function sumBaseCounts(rows: GoogleAdsRow[]): GoogleAdsBaseCounts {
  return rows.reduce<GoogleAdsBaseCounts>(
    (acc, row) => {
      const base = parseBaseCounts(row);
      return {
        clicks: acc.clicks + base.clicks,
        impressions: acc.impressions + base.impressions,
        spend: acc.spend + base.spend,
        conversions: acc.conversions + base.conversions,
        conversionValue: acc.conversionValue + base.conversionValue,
      };
    },
    { clicks: 0, impressions: 0, spend: 0, conversions: 0, conversionValue: 0 }
  );
}

async function runQuery(customerId: string, gaql: string): Promise<GoogleAdsRow[]> {
  const customer = getGoogleAdsClient(customerId);
  return (await customer.query(gaql)) as GoogleAdsRow[];
}

// Sin dimensiones en el SELECT, GAQL agrega todo el rango en una única fila
// (si no hubo actividad, `rows` viene vacío).
async function queryTotals(
  customerId: string,
  range: DateRangeValue
): Promise<{ currencyCode: string } & GoogleAdsPeriodMetrics> {
  const rows = await runQuery(
    customerId,
    `SELECT customer.currency_code, ${GAQL_METRIC_FIELDS} FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}'`
  );
  const row = rows[0];
  return { currencyCode: row?.customer?.currency_code ?? "USD", ...deriveMetrics(parseBaseCounts(row)) };
}

// La Google Ads API no soporta múltiples dateRanges en una sola consulta
// GAQL, así que el período anterior sale de una segunda llamada en paralelo
// (mismo enfoque que fetchMetaAdsMetrics).
export async function fetchGoogleAdsMetrics(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsMetrics> {
  const [current, previous] = await Promise.all([queryTotals(customerId, range), queryTotals(customerId, previousRange)]);

  return {
    ...current,
    previous: {
      spend: previous.spend,
      impressions: previous.impressions,
      clicks: previous.clicks,
      ctr: previous.ctr,
      cpc: previous.cpc,
      cpm: previous.cpm,
      conversions: previous.conversions,
      conversionValue: previous.conversionValue,
      conversionRate: previous.conversionRate,
      cpa: previous.cpa,
      roas: previous.roas,
    },
  };
}

export interface GoogleAdsTimeSeriesPoint extends GoogleAdsPeriodMetrics {
  /** Primer día del bucket (YYYY-MM-DD) — un día por punto, o el primer día de una ventana de 7 en granularidad semanal. */
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

// A diferencia de la Marketing API de Meta (que devuelve una fila por día
// aunque no haya actividad), GAQL omite los días sin ninguna métrica —
// verificado contra la cuenta real. Se rellenan los huecos con 0 para que el
// gráfico tenga un eje de fechas continuo.
async function queryDailySeries(customerId: string, range: DateRangeValue): Promise<GoogleAdsTimeSeriesPoint[]> {
  const rows = await runQuery(
    customerId,
    `SELECT segments.date, ${GAQL_METRIC_FIELDS} FROM customer WHERE segments.date BETWEEN '${range.from}' AND '${range.to}' ORDER BY segments.date`
  );
  const byDate = new Map<string, GoogleAdsRow>();
  for (const row of rows) {
    if (row.segments?.date) byDate.set(row.segments.date, row);
  }
  return enumerateDates(range).map((date) => ({ date, ...deriveMetrics(parseBaseCounts(byDate.get(date))) }));
}

// Igual que el time_increment="7" de Meta: ventanas fijas de 7 días
// arrancando en range.from (no alineadas a semana calendario), para que el
// período actual y el anterior tengan la misma cantidad de puntos y sean
// comparables punto a punto. Se recalculan las métricas derivadas (ctr, cpc,
// etc.) sobre la suma de cada ventana, no promediando los ratios diarios.
function bucketWeekly(daily: GoogleAdsTimeSeriesPoint[]): GoogleAdsTimeSeriesPoint[] {
  const buckets: GoogleAdsTimeSeriesPoint[] = [];
  for (let i = 0; i < daily.length; i += 7) {
    const window = daily.slice(i, i + 7);
    const summed = sumBaseCounts(
      window.map((point) => ({
        metrics: {
          clicks: point.clicks,
          impressions: point.impressions,
          cost_micros: point.spend * 1_000_000,
          conversions: point.conversions,
          conversions_value: point.conversionValue,
        },
      }))
    );
    buckets.push({ date: window[0]!.date, ...deriveMetrics(summed) });
  }
  return buckets;
}

export async function fetchGoogleAdsTimeSeries(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<{ current: GoogleAdsTimeSeriesPoint[]; previous: GoogleAdsTimeSeriesPoint[] }> {
  const [currentDaily, previousDaily] = await Promise.all([
    queryDailySeries(customerId, range),
    queryDailySeries(customerId, previousRange),
  ]);

  if (granularity === "week") {
    return { current: bucketWeekly(currentDaily), previous: bucketWeekly(previousDaily) };
  }
  return { current: currentDaily, previous: previousDaily };
}

// Forma uniforme para los 8 desgloses (dispositivo/red/hora/día de la
// semana/campaña/grupo de anuncios/anuncio/palabra clave) — igual criterio
// que MetaAdsBreakdownRow: además del valor actual, el período anterior del
// mismo segmento (null si ese segmento no tuvo actividad antes), necesario
// para que el motor de insights pueda hablar de concentración real.
export interface GoogleAdsBreakdownRow {
  key: string;
  current: GoogleAdsPeriodMetrics;
  previous: GoogleAdsPeriodMetrics | null;
}

const MAX_BREAKDOWN_ROWS = 8;
const MAX_AD_BREAKDOWN_ROWS = 15;

async function fetchBreakdownWithPrevious(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  resource: { select: string; from: string },
  getKey: (row: GoogleAdsRow) => string | undefined,
  options: { sortDescBySpend?: boolean; limit?: number } = {}
): Promise<GoogleAdsBreakdownRow[]> {
  const buildQuery = (r: DateRangeValue) =>
    `SELECT ${resource.select}, ${GAQL_METRIC_FIELDS} FROM ${resource.from} WHERE segments.date BETWEEN '${r.from}' AND '${r.to}'`;

  const [currentRows, previousRows] = await Promise.all([
    runQuery(customerId, buildQuery(range)),
    runQuery(customerId, buildQuery(previousRange)),
  ]);

  const previousByKey = new Map<string, GoogleAdsRow>();
  for (const row of previousRows) {
    const key = getKey(row);
    if (key) previousByKey.set(key, row);
  }

  let result: GoogleAdsBreakdownRow[] = currentRows
    .map((row) => ({ key: getKey(row), row }))
    .filter((item): item is { key: string; row: GoogleAdsRow } => !!item.key)
    .map(({ key, row }) => ({
      key,
      current: deriveMetrics(parseBaseCounts(row)),
      previous: previousByKey.has(key) ? deriveMetrics(parseBaseCounts(previousByKey.get(key))) : null,
    }));

  if (options.sortDescBySpend !== false) {
    result = result.sort((a, b) => b.current.spend - a.current.spend);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }
  return result;
}

// Español, a partir del enum real de la librería (enums.Device) — evita
// mantener un mapa numérico propio que se desincronice si Google agrega
// valores. UNSPECIFIED/UNKNOWN (0/1) se filtran, igual que Meta filtra
// "unknown" en plataforma/dispositivo.
const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "Móvil",
  TABLET: "Tablet",
  DESKTOP: "Escritorio",
  CONNECTED_TV: "Smart TV",
  OTHER: "Otro",
};

const NETWORK_LABELS: Record<string, string> = {
  SEARCH: "Red de Búsqueda",
  SEARCH_PARTNERS: "Socios de Búsqueda",
  CONTENT: "Red de Display",
  MIXED: "Mixta",
  YOUTUBE: "YouTube",
  GOOGLE_TV: "Google TV",
  GOOGLE_OWNED_CHANNELS: "Canales de Google",
  GMAIL: "Gmail",
  DISCOVER: "Discover",
  MAPS: "Maps",
};

const DAY_OF_WEEK_LABELS: Record<string, string> = {
  MONDAY: "Lunes",
  TUESDAY: "Martes",
  WEDNESDAY: "Miércoles",
  THURSDAY: "Jueves",
  FRIDAY: "Viernes",
  SATURDAY: "Sábado",
  SUNDAY: "Domingo",
};

// Orden cronológico fijo (no alfabético) para mostrar la semana en el orden
// natural — mismo criterio que el desglose por horario de Meta.
const DAY_OF_WEEK_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];

export async function fetchGoogleAdsDeviceBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  const rows = await fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "segments.device", from: "customer" },
    (row) => {
      const name = row.segments?.device != null ? enums.Device[row.segments.device] : undefined;
      return name && DEVICE_LABELS[name] ? DEVICE_LABELS[name] : undefined;
    },
    { limit: MAX_BREAKDOWN_ROWS }
  );
  return rows;
}

export async function fetchGoogleAdsNetworkBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "segments.ad_network_type", from: "customer" },
    (row) => {
      const name = row.segments?.ad_network_type != null ? enums.AdNetworkType[row.segments.ad_network_type] : undefined;
      return name && NETWORK_LABELS[name] ? NETWORK_LABELS[name] : undefined;
    },
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

// Los buckets se muestran como "00", "01", ... "23" — el orden lexicográfico
// ya coincide con el cronológico, así que se reordena por hora (no por
// spend) igual que el desglose horario de Meta.
export async function fetchGoogleAdsHourlyBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  const rows = await fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "segments.hour", from: "customer" },
    (row) => (row.segments?.hour != null ? String(row.segments.hour).padStart(2, "0") : undefined),
    { sortDescBySpend: false }
  );
  return rows.sort((a, b) => a.key.localeCompare(b.key));
}

export async function fetchGoogleAdsDayOfWeekBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  const rows = await fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "segments.day_of_week", from: "customer" },
    (row) => {
      const name = row.segments?.day_of_week != null ? enums.DayOfWeek[row.segments.day_of_week] : undefined;
      return name && DAY_OF_WEEK_LABELS[name] ? name : undefined;
    },
    { sortDescBySpend: false }
  );
  return rows
    .sort((a, b) => DAY_OF_WEEK_ORDER.indexOf(a.key) - DAY_OF_WEEK_ORDER.indexOf(b.key))
    .map((row) => ({ ...row, key: DAY_OF_WEEK_LABELS[row.key]! }));
}

export async function fetchGoogleAdsCampaignBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "campaign.name", from: "campaign" },
    (row) => row.campaign?.name ?? undefined,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

export async function fetchGoogleAdsAdGroupBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "ad_group.name", from: "ad_group" },
    (row) => row.ad_group?.name ?? undefined,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}

// A diferencia de Meta (donde todo anuncio tiene un nombre de creativo), los
// Responsive Search Ads — el formato dominante en Search hoy — no tienen un
// campo "nombre" propio (verificado contra la cuenta real: ad_group_ad.ad.name
// viene vacío para ellos). Se muestra el id como fallback en vez de dejar la
// fila sin etiqueta.
export async function fetchGoogleAdsAdBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "ad_group_ad.ad.id, ad_group_ad.ad.name", from: "ad_group_ad" },
    (row) => {
      const ad = row.ad_group_ad?.ad;
      if (!ad?.id) return undefined;
      return ad.name && ad.name.trim() ? ad.name : `Anuncio ${ad.id}`;
    },
    { limit: MAX_AD_BREAKDOWN_ROWS }
  );
}

export async function fetchGoogleAdsKeywordBreakdown(
  customerId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GoogleAdsBreakdownRow[]> {
  return fetchBreakdownWithPrevious(
    customerId,
    range,
    previousRange,
    { select: "ad_group_criterion.keyword.text", from: "keyword_view" },
    (row) => row.ad_group_criterion?.keyword?.text ?? undefined,
    { limit: MAX_BREAKDOWN_ROWS }
  );
}
