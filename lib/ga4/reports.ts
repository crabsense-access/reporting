import { getGA4Client } from "@/lib/ga4/client";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { BasicMetrics, GA4BreakdownRow, GA4TimeSeriesPoint, TrendPoint } from "@/lib/ga4/types";

export type { GA4BreakdownRow, GA4TimeSeriesPoint } from "@/lib/ga4/types";

const GRANULARITY_DIMENSION: Record<Granularity, string> = {
  day: "date",
  week: "yearWeek",
  month: "yearMonth",
};

function formatBucket(raw: string, granularity: Granularity): string {
  if (granularity === "day") {
    // yyyyMMdd -> yyyy-MM-dd
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (granularity === "month") {
    // yyyyMM -> yyyy-MM
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}`;
  }
  // yearWeek: yyyyWW -> yyyy-Www
  return `${raw.slice(0, 4)}-W${raw.slice(4, 6)}`;
}

export interface BasicMetricsWithPrevious {
  current: BasicMetrics;
  previous: BasicMetrics;
}

const EMPTY_BASIC_METRICS: BasicMetrics = {
  activeUsers: 0,
  sessions: 0,
  engagementRate: 0,
  averageSessionDuration: 0,
};

export async function fetchBasicMetrics(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<BasicMetricsWithPrevious> {
  const client = getGA4Client();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: range.from, endDate: range.to, name: "current" },
      { startDate: previousRange.from, endDate: previousRange.to, name: "previous" },
    ],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
  });

  let current = EMPTY_BASIC_METRICS;
  let previous = EMPTY_BASIC_METRICS;

  for (const row of response.rows ?? []) {
    // Igual que en fetchGoalReport: sin ninguna dimensión propia pedida, el
    // único dimensionValue de la fila es el rango ("current"/"previous")
    // que la API agrega solo al haber múltiples dateRanges.
    const rangeName = row.dimensionValues?.[0]?.value;
    const values = row.metricValues ?? [];
    const metrics: BasicMetrics = {
      activeUsers: Number(values[0]?.value ?? 0),
      sessions: Number(values[1]?.value ?? 0),
      engagementRate: Number(values[2]?.value ?? 0),
      averageSessionDuration: Number(values[3]?.value ?? 0),
    };

    if (rangeName === "current") current = metrics;
    else if (rangeName === "previous") previous = metrics;
  }

  return { current, previous };
}

interface GoalReportResult {
  total: number;
  previousTotal: number;
  variationPct: number;
  trend: TrendPoint[];
}

export async function fetchGoalReport(
  propertyId: string,
  eventName: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<GoalReportResult> {
  const client = getGA4Client();
  const dimension = GRANULARITY_DIMENSION[granularity];

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: range.from, endDate: range.to, name: "current" },
      { startDate: previousRange.from, endDate: previousRange.to, name: "previous" },
    ],
    dimensions: [{ name: dimension }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        stringFilter: { matchType: "EXACT", value: eventName },
      },
    },
  });

  let total = 0;
  let previousTotal = 0;
  const trend: TrendPoint[] = [];

  for (const row of response.rows ?? []) {
    // Con múltiples dateRanges, la API agrega automáticamente el valor del
    // rango ("current" / "previous", por el `name` de cada dateRange) al
    // final de dimensionValues — no hay que declarar "dateRange" en
    // `dimensions` (eso tira INVALID_ARGUMENT).
    const bucketRaw = row.dimensionValues?.[0]?.value ?? "";
    const rangeName = row.dimensionValues?.[1]?.value;
    const value = Number(row.metricValues?.[0]?.value ?? 0);

    if (rangeName === "current") {
      total += value;
      trend.push({ bucket: formatBucket(bucketRaw, granularity), value });
    } else if (rangeName === "previous") {
      previousTotal += value;
    }
  }

  trend.sort((a, b) => (a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0));

  const variationPct =
    previousTotal === 0 ? (total === 0 ? 0 : 100) : ((total - previousTotal) / previousTotal) * 100;

  return { total, previousTotal, variationPct, trend };
}

// Mismo mecanismo que fetchGoalReport (una sola consulta con 2 dateRanges,
// la API agrega el nombre del rango como último dimensionValue) pero con
// las 4 métricas básicas en vez de eventCount — sirve de mini-gráfico para
// cada scorecard y de gráfico de tendencia comparativo (ver GA4TrendChart).
export async function fetchBasicMetricsTimeSeries(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  granularity: Granularity
): Promise<{ current: GA4TimeSeriesPoint[]; previous: GA4TimeSeriesPoint[] }> {
  const client = getGA4Client();
  const dimension = GRANULARITY_DIMENSION[granularity];

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: range.from, endDate: range.to, name: "current" },
      { startDate: previousRange.from, endDate: previousRange.to, name: "previous" },
    ],
    dimensions: [{ name: dimension }],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
  });

  const current: GA4TimeSeriesPoint[] = [];
  const previous: GA4TimeSeriesPoint[] = [];

  for (const row of response.rows ?? []) {
    const bucketRaw = row.dimensionValues?.[0]?.value ?? "";
    const rangeName = row.dimensionValues?.[1]?.value;
    const values = row.metricValues ?? [];
    const point: GA4TimeSeriesPoint = {
      date: formatBucket(bucketRaw, granularity),
      activeUsers: Number(values[0]?.value ?? 0),
      sessions: Number(values[1]?.value ?? 0),
      engagementRate: Number(values[2]?.value ?? 0),
      averageSessionDuration: Number(values[3]?.value ?? 0),
    };
    if (rangeName === "current") current.push(point);
    else if (rangeName === "previous") previous.push(point);
  }

  const byDate = (a: GA4TimeSeriesPoint, b: GA4TimeSeriesPoint) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  current.sort(byDate);
  previous.sort(byDate);

  return { current, previous };
}

// ============================================================================
// Desgloses (dispositivo, sistema operativo, canal, país, página de destino,
// nuevo/recurrente, hora, día de la semana) — misma forma uniforme
// {key, current, previous} que Meta Ads / Google Ads, necesaria para que el
// motor de insights LLM pueda hablar de concentración real por segmento.
// A diferencia de Ads (2 llamadas separadas por rango), la GA4 Data API sí
// soporta 2 dateRanges nombrados en una sola consulta con dimensión —
// verificado contra la cuenta real — así que cada desglose es UNA sola
// llamada.
// ============================================================================

// "(not set)"/"(none)" son cajones de sastre sin señal real (tráfico sin
// atribuir, sesiones sin país resuelto, etc.) — se filtran igual que Meta
// filtra "unknown" en plataforma/dispositivo.
const EXCLUDED_DIMENSION_VALUES = new Set(["(not set)", "(none)", ""]);

function parseBasicMetricsFromRow(values: { value?: string | null }[] | null | undefined): BasicMetrics {
  return {
    activeUsers: Number(values?.[0]?.value ?? 0),
    sessions: Number(values?.[1]?.value ?? 0),
    engagementRate: Number(values?.[2]?.value ?? 0),
    averageSessionDuration: Number(values?.[3]?.value ?? 0),
  };
}

async function fetchBasicBreakdown(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  dimensionName: string,
  options: { limit?: number; sortDesc?: boolean } = {}
): Promise<GA4BreakdownRow[]> {
  const client = getGA4Client();

  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: range.from, endDate: range.to, name: "current" },
      { startDate: previousRange.from, endDate: previousRange.to, name: "previous" },
    ],
    dimensions: [{ name: dimensionName }],
    metrics: [
      { name: "activeUsers" },
      { name: "sessions" },
      { name: "engagementRate" },
      { name: "averageSessionDuration" },
    ],
  });

  const byKey = new Map<string, { current?: BasicMetrics; previous?: BasicMetrics }>();
  for (const row of response.rows ?? []) {
    const key = row.dimensionValues?.[0]?.value;
    const rangeName = row.dimensionValues?.[1]?.value;
    if (!key || EXCLUDED_DIMENSION_VALUES.has(key)) continue;

    const entry = byKey.get(key) ?? {};
    const metrics = parseBasicMetricsFromRow(row.metricValues);
    if (rangeName === "current") entry.current = metrics;
    else if (rangeName === "previous") entry.previous = metrics;
    byKey.set(key, entry);
  }

  let result: GA4BreakdownRow[] = [...byKey.entries()]
    .filter((entry): entry is [string, { current: BasicMetrics; previous?: BasicMetrics }] => !!entry[1].current)
    .map(([key, value]) => ({ key, current: value.current, previous: value.previous ?? null }));

  if (options.sortDesc !== false) {
    result = result.sort((a, b) => b.current.sessions - a.current.sessions);
  }
  if (options.limit) {
    result = result.slice(0, options.limit);
  }
  return result;
}

const MAX_BREAKDOWN_ROWS = 8;

export function fetchGA4DeviceBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "deviceCategory", { limit: MAX_BREAKDOWN_ROWS });
}

export function fetchGA4OperatingSystemBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "operatingSystem", { limit: MAX_BREAKDOWN_ROWS });
}

export function fetchGA4ChannelBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "sessionDefaultChannelGroup", { limit: MAX_BREAKDOWN_ROWS });
}

export function fetchGA4CountryBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "country", { limit: MAX_BREAKDOWN_ROWS });
}

export function fetchGA4LandingPageBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "landingPagePlusQueryString", {
    limit: MAX_BREAKDOWN_ROWS,
  });
}

export function fetchGA4NewVsReturningBreakdown(propertyId: string, range: DateRangeValue, previousRange: DateRangeValue) {
  return fetchBasicBreakdown(propertyId, range, previousRange, "newVsReturning", { limit: MAX_BREAKDOWN_ROWS });
}

// El valor de "hour" viene sin cero a la izquierda ("6", "11") — se reordena
// numéricamente (no por sesiones) para leer las 24 barras en fila, igual
// criterio que el desglose horario de Meta/Google Ads.
export async function fetchGA4HourlyBreakdown(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GA4BreakdownRow[]> {
  const rows = await fetchBasicBreakdown(propertyId, range, previousRange, "hour", { sortDesc: false });
  return rows.sort((a, b) => Number(a.key) - Number(b.key));
}

const DAY_LABELS: Record<string, string> = {
  Monday: "Lunes",
  Tuesday: "Martes",
  Wednesday: "Miércoles",
  Thursday: "Jueves",
  Friday: "Viernes",
  Saturday: "Sábado",
  Sunday: "Domingo",
};
const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function fetchGA4DayOfWeekBreakdown(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue
): Promise<GA4BreakdownRow[]> {
  const rows = await fetchBasicBreakdown(propertyId, range, previousRange, "dayOfWeekName", { sortDesc: false });
  return rows
    .sort((a, b) => DAY_ORDER.indexOf(a.key) - DAY_ORDER.indexOf(b.key))
    .map((row) => ({ ...row, key: DAY_LABELS[row.key] ?? row.key }));
}

// ============================================================================
// Desgloses de objetivos (goals) — a diferencia de las métricas básicas, un
// objetivo es un conteo de un evento puntual (eventCount filtrado por
// eventName), no un bundle de 4 métricas. Se piden TODOS los objetivos
// pedidos de una vez por dimensión (eventName como dimensión extra +
// inListFilter) en vez de una consulta por objetivo — verificado contra la
// cuenta real, evita N llamadas por dimensión cuando hay N objetivos.
// ============================================================================

export interface GA4GoalBreakdownRow {
  key: string;
  current: number;
  previous: number | null;
}

async function fetchGoalBreakdownForDimension(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  dimensionName: string,
  goalNames: string[]
): Promise<Map<string, GA4GoalBreakdownRow[]>> {
  if (goalNames.length === 0) return new Map();

  const client = getGA4Client();
  const [response] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [
      { startDate: range.from, endDate: range.to, name: "current" },
      { startDate: previousRange.from, endDate: previousRange.to, name: "previous" },
    ],
    dimensions: [{ name: dimensionName }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: { fieldName: "eventName", inListFilter: { values: goalNames } },
    },
  });

  const byGoal = new Map<string, Map<string, { current?: number; previous?: number }>>();
  for (const row of response.rows ?? []) {
    const key = row.dimensionValues?.[0]?.value;
    const eventName = row.dimensionValues?.[1]?.value;
    const rangeName = row.dimensionValues?.[2]?.value;
    if (!key || !eventName || EXCLUDED_DIMENSION_VALUES.has(key)) continue;

    const forGoal = byGoal.get(eventName) ?? new Map();
    const entry = forGoal.get(key) ?? {};
    const value = Number(row.metricValues?.[0]?.value ?? 0);
    if (rangeName === "current") entry.current = value;
    else if (rangeName === "previous") entry.previous = value;
    forGoal.set(key, entry);
    byGoal.set(eventName, forGoal);
  }

  const result = new Map<string, GA4GoalBreakdownRow[]>();
  for (const [goalName, keyMap] of byGoal) {
    const rows: GA4GoalBreakdownRow[] = [...keyMap.entries()]
      .filter((entry): entry is [string, { current: number; previous?: number }] => entry[1].current !== undefined)
      .map(([key, value]) => ({ key, current: value.current, previous: value.previous ?? null }))
      .sort((a, b) => b.current - a.current)
      .slice(0, MAX_BREAKDOWN_ROWS);
    result.set(goalName, rows);
  }
  return result;
}

export interface GA4GoalBreakdowns {
  device: GA4GoalBreakdownRow[];
  operatingSystem: GA4GoalBreakdownRow[];
  channel: GA4GoalBreakdownRow[];
  country: GA4GoalBreakdownRow[];
  landingPage: GA4GoalBreakdownRow[];
  newVsReturning: GA4GoalBreakdownRow[];
  hourly: GA4GoalBreakdownRow[];
  dayOfWeek: GA4GoalBreakdownRow[];
}

const EMPTY_GOAL_ROWS: GA4GoalBreakdownRow[] = [];

// Una sola llamada por dimensión (8 en total) para TODOS los objetivos
// pedidos a la vez — devuelve, por objetivo, sus 8 desgloses ya armados.
export async function fetchGA4GoalBreakdowns(
  propertyId: string,
  range: DateRangeValue,
  previousRange: DateRangeValue,
  goalNames: string[]
): Promise<Record<string, GA4GoalBreakdowns>> {
  const [device, operatingSystem, channel, country, landingPage, newVsReturning, hourlyRaw, dayOfWeekRaw] =
    await Promise.all([
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "deviceCategory", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "operatingSystem", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "sessionDefaultChannelGroup", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "country", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "landingPagePlusQueryString", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "newVsReturning", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "hour", goalNames),
      fetchGoalBreakdownForDimension(propertyId, range, previousRange, "dayOfWeekName", goalNames),
    ]);

  const sortHourly = (rows: GA4GoalBreakdownRow[]) => [...rows].sort((a, b) => Number(a.key) - Number(b.key));
  const sortDayOfWeek = (rows: GA4GoalBreakdownRow[]) =>
    [...rows]
      .sort((a, b) => DAY_ORDER.indexOf(a.key) - DAY_ORDER.indexOf(b.key))
      .map((row) => ({ ...row, key: DAY_LABELS[row.key] ?? row.key }));

  const result: Record<string, GA4GoalBreakdowns> = {};
  for (const goalName of goalNames) {
    result[goalName] = {
      device: device.get(goalName) ?? EMPTY_GOAL_ROWS,
      operatingSystem: operatingSystem.get(goalName) ?? EMPTY_GOAL_ROWS,
      channel: channel.get(goalName) ?? EMPTY_GOAL_ROWS,
      country: country.get(goalName) ?? EMPTY_GOAL_ROWS,
      landingPage: landingPage.get(goalName) ?? EMPTY_GOAL_ROWS,
      newVsReturning: newVsReturning.get(goalName) ?? EMPTY_GOAL_ROWS,
      hourly: sortHourly(hourlyRaw.get(goalName) ?? EMPTY_GOAL_ROWS),
      dayOfWeek: sortDayOfWeek(dayOfWeekRaw.get(goalName) ?? EMPTY_GOAL_ROWS),
    };
  }
  return result;
}
