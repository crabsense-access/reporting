// Datos REALES del Calendario de inversión (ver components/admin/reporting/InvestmentCalendar.tsx,
// InvestmentTrendChart.tsx, LeadsByTypeTrendChart.tsx y AudienceAnalysis.tsx), a partir de la
// Marketing API de Meta — reemplaza a mockDailySpend/mockDailyLeads/mockDailyLeadsByType/
// mockDailySpendByType/demographicMonthlyTotals de lib/reporting/mockInvestmentCalendar.ts para
// esas 4 secciones (resumen del mes, las 2 tendencias diarias y "Quién responde a los anuncios").
// CampaignAnalysis y PlacementAnalysis todavía no están conectados — siguen derivando de los
// totales que le llegan desde acá, así que no hace falta tocarlos para que sigan funcionando.
//
// DOS representaciones del desglose por Objetivo, EN PARALELO:
//   - leadsByType/spendByType/typeLabels (legado, fijo a los primeros 3 Objetivos, indexados por
//     LeadType) — se mantiene tal cual para no romper CampaignAnalysis/AudienceAnalysis, que
//     siguen en mock y asumen exactamente esos 3 slots fijos.
//   - objectiveLeads/objectiveSpend/objectiveLabels (nuevo, dinámico, CUALQUIER cantidad de
//     Objetivos que el cliente tenga cargados, indexado por posición 0..N-1) — es lo que alimenta
//     el resumen y los 2 gráficos de tendencia, así que un Objetivo nuevo que se sume en el Admin
//     aparece ahí sin tocar código (ver InvestmentCalendar.tsx / LeadsByTypeTrendChart.tsx).
// El matching (exacto y luego "contiene") se hace UNA sola vez por fila, contra TODOS los
// Objetivos configurados — no sólo los primeros 3 —, y el resultado se refleja en ambas
// representaciones cuando el índice matcheado es 0, 1 o 2.
//
// audienceSegments: mismo criterio de matching (exacto → "contiene", UNA sola vez por fila, el
// primero que matchea se queda con TODO el gasto y el conteo de esa fila — igual que days más
// abajo) pero pidiendo el desglose por edad+género a nivel CAMPAÑA en vez de por día, para que los
// totales por Objetivo de "Quién responde a los anuncios" sumen exactamente lo mismo que "Leads
// por tipo"/"CPL por tipo" del resumen del mes (mismas filas, mismo criterio de asignación, sólo
// agrupadas por segmento demográfico en vez de por día).
//
// Mapeo de "tipo de lead": hoy el Calendario distingue 3 tipos fijos (chat / formLanding /
// formMeta — ver LeadType en mockInvestmentCalendar.ts). Para no romper esas 3 secciones
// (CampaignAnalysis, AudienceAnalysis) que asumen exactamente esos 3 tipos, se mapean —EN ORDEN—
// a los primeros hasta 3 "Objetivos" que el cliente tenga cargados en su config de Meta Ads (ver
// MetaAdsConfigForm.tsx / MetaAdsObjective en lib/types.ts): el objetivo 1 = chat, el 2 =
// formLanding, el 3 = formMeta. Si el cliente cargó menos de 3, los tipos sin objetivo quedan en
// cero. Esto es una suposición de orden que puede no ser correcta para todos los clientes — Martín
// la confirmó como criterio general ("por el nombre de evento que pusimos en el Admin"), pero el
// ORDEN específico conviene revisarlo con él la primera vez que se usa para un cliente nuevo.
//
// Atribución de spend/leads por tipo: se pide el desglose a nivel CAMPAÑA por día
// (level: "campaign", time_increment: "1") en vez de a nivel cuenta, porque Meta no separa el
// gasto por tipo de conversión — sólo por campaña. Para cada fila (una campaña, un día), se busca
// cuál de los eventos configurados aparece con valor > 0 en su array "actions"; si matchea, TODO
// el gasto y el conteo de ese evento de esa fila se suman al tipo correspondiente. Una campaña que
// no matchea ningún evento configurado no se pierde: su gasto se suma al total del día (spend),
// pero no entra en ningún leadsByType/spendByType — así el total del día siempre es exacto aunque
// el desglose por tipo sea parcial.
//
// El "Evento de Meta" que se carga en el Admin rara vez es igual, letra por letra, al
// action_type real que devuelve la Marketing API: Meta usa nombres internos con prefijo y en
// minúscula (ej. "lead", "onsite_conversion.messaging_conversation_started_7d",
// "offsite_conversion.custom.<id o nombre>"), no el nombre "lindo" que se ve en Events Manager.
// Por eso el match es case-insensitive y también prueba "contiene" en ambos sentidos (el
// action_type real contiene el evento configurado, o viceversa) antes de exacto — así "Lead"
// matchea "lead" u "onsite_conversion.lead_grouped" sin que el cliente tenga que adivinar el
// string interno exacto. Si ningún evento configurado matchea NADA en todo el mes,
// detectedActionTypes devuelve los action_type reales que sí aparecieron (con su conteo total),
// para que se pueda corregir el nombre del evento en el Admin con el valor exacto.

import { endOfMonth, format, isBefore, subDays } from "date-fns";

import { withCache, THREE_HOURS_SECONDS } from "@/lib/cache/withCache";
import { fetchMetaGraphApi } from "@/lib/meta-ads/client";
import { LEAD_TYPES, type LeadType } from "@/lib/reporting/mockInvestmentCalendar";
import type { MetaAdsConfig } from "@/lib/types";

function zeroByType(): Record<LeadType, number> {
  return LEAD_TYPES.reduce((acc, type) => ({ ...acc, [type]: 0 }), {} as Record<LeadType, number>);
}

/** true si `eventName` y `actionType` son literalmente el mismo string, case-insensitive. */
function exactMatchesEvent(actionType: string, eventName: string): boolean {
  const a = actionType.trim().toLowerCase();
  const e = eventName.trim().toLowerCase();
  return Boolean(a) && Boolean(e) && a === e;
}

/**
 * true si uno "contiene" al otro (case-insensitive) — heurística de respaldo para cuando el
 * action_type real de Meta no es idéntico al nombre configurado (ver comentario de arriba). Se
 * usa SÓLO como fallback, nunca antes que un match exacto: eventos genéricos y cortos como
 * "Lead" son substring de action_types como "onsite_conversion.lead_grouped" y, si se probaran
 * primero, "ganarían" por orden en filas que en realidad matchean exacto con otro Objetivo más
 * específico (ej. "Contact_form_submit"), dejando ese otro tipo siempre en cero.
 */
function looseMatchesEvent(actionType: string, eventName: string): boolean {
  const a = actionType.trim().toLowerCase();
  const e = eventName.trim().toLowerCase();
  if (!a || !e) return false;
  return a.includes(e) || e.includes(a);
}

/**
 * Le busca a UNA fila (actions de Meta) cuál de los Objetivos configurados matchea — exacto
 * primero, "contiene" después, el primero que matchea en orden se queda con la fila entera (ver
 * comentario grande arriba del archivo) — y devuelve su índice + el valor (cantidad de eventos)
 * de esa fila para ese Objetivo. null si ninguno matcheó. Compartido entre el desglose diario
 * (days) y el desglose por edad+género (audienceSegments) para que ambos sumen exactamente lo
 * mismo por Objetivo.
 */
function findMatchedObjective(
  actions: { action_type: string; value: string }[],
  objectiveEvents: string[]
): { index: number; value: number } | null {
  for (let i = 0; i < objectiveEvents.length; i += 1) {
    const eventName = objectiveEvents[i];
    if (!eventName) continue;
    const action = actions.find((a) => exactMatchesEvent(a.action_type, eventName));
    if (action && Number(action.value ?? 0) > 0) {
      return { index: i, value: Number(action.value ?? 0) };
    }
  }
  for (let i = 0; i < objectiveEvents.length; i += 1) {
    const eventName = objectiveEvents[i];
    if (!eventName) continue;
    const action = actions.find((a) => looseMatchesEvent(a.action_type, eventName));
    if (action && Number(action.value ?? 0) > 0) {
      return { index: i, value: Number(action.value ?? 0) };
    }
  }
  return null;
}

/** "male"/"female" (lo único que devuelve Meta que nos interesa acá) → "hombres"/"mujeres". Cualquier otro valor ("unknown", u otro género que Meta agregue) se descarta — ver fetchAudienceSegments. */
const META_GENDER_TO_LABEL: Record<string, "mujeres" | "hombres"> = {
  female: "mujeres",
  male: "hombres",
};

export interface DailyRealTotals {
  date: string; // yyyy-MM-dd
  spend: number;
  leadsByType: Record<LeadType, number>;
  spendByType: Record<LeadType, number>;
  /** Leads/gasto por Objetivo, TODOS los que estén cargados (índice alineado con MetaAdsConfig.objectives) — ver comentario arriba del archivo. */
  objectiveLeads: number[];
  objectiveSpend: number[];
}

export interface RealInvestmentCalendarData {
  currency: string;
  monthlyBudget: number | null;
  /** Leyenda a mostrar por tipo — el label del objetivo configurado, o un fallback genérico si ese slot no tiene objetivo. */
  typeLabels: Record<LeadType, string>;
  /** Cuántos de los 3 slots (chat/formLanding/formMeta) tienen un objetivo configurado con nombre de evento. */
  configuredTypeCount: number;
  /**
   * Diagnóstico: los action_type reales que devolvió Meta este mes (con su conteo total sumado),
   * ordenados de mayor a menor — se completa cuando hay al menos un Objetivo configurado que NO
   * matcheó ningún action_type real en todo el mes (aunque otros sí hayan matcheado), para poder
   * chequear a simple vista si ese evento realmente no se generó este mes o si el nombre cargado
   * en el Admin no coincide con el real.
   */
  /** Leyenda de CADA Objetivo cargado, en orden (índice alineado con objectiveLeads/objectiveSpend de cada día) — a diferencia de typeLabels, no está limitado a 3. */
  objectiveLabels: string[];
  detectedActionTypes: { actionType: string; count: number }[];
  days: DailyRealTotals[];
  /** Un elemento por cada combinación género+rango etario con datos este mes (ver AudienceAnalysis.tsx) — objectiveLeads/objectiveSpend con el mismo índice que objectiveLabels. */
  audienceSegments: AudienceSegmentTotals[];
  /** Un elemento por provincia/región con datos este mes (ver RegionAnalysis.tsx) — objectiveLeads/objectiveSpend con el mismo índice que objectiveLabels. */
  regionSegments: RegionSegmentTotals[];
  /** Un elemento por hora del día (0-23) con datos este mes (ver HourlyPerformanceChart.tsx) — spend/leads combinan TODOS los Objetivos configurados (a diferencia de audienceSegments/regionSegments, acá no hay desglose por Objetivo: "leads" es la suma de lo que matcheó cualquier Objetivo en esa hora). */
  hourlyTotals: HourlyTotals[];
  /** Un elemento por rango etario con reproducciones de video este mes (ver VideoRetentionChart.tsx) — a diferencia de audienceSegments/regionSegments, esto no se desglosa por Objetivo: la retención de video es una métrica de la campaña de video en sí, no de un evento de conversión puntual. */
  videoRetentionByAge: VideoRetentionByAge[];
}

export interface HourlyTotals {
  /** Hora del día en el huso horario de la cuenta publicitaria, 0-23. */
  hour: number;
  spend: number;
  /** Contactos combinados: suma de TODOS los Objetivos que matchearon algo en esta hora (no un desglose por Objetivo, a diferencia del resto de las secciones — acá el punto es "a qué hora" no "de qué tipo"). */
  leads: number;
}

export interface AudienceSegmentTotals {
  gender: "mujeres" | "hombres";
  /** Rango etario tal cual lo devuelve Meta ("18-24", "25-34", ..., "65+"). */
  ageRange: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

export interface RegionSegmentTotals {
  /** Nombre de provincia/región tal cual lo devuelve Meta (ej. "Buenos Aires", "Cordoba"). */
  region: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

interface MetaCampaignDayRow {
  date_start?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
}

interface MetaCampaignInsightsResponse {
  data: MetaCampaignDayRow[];
  paging?: { next?: string };
}

interface MetaAudienceRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  age?: string;
  gender?: string;
}

interface MetaAudienceInsightsResponse {
  data: MetaAudienceRow[];
  paging?: { next?: string };
}

interface MetaRegionRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  region?: string;
}

interface MetaRegionInsightsResponse {
  data: MetaRegionRow[];
  paging?: { next?: string };
}

/**
 * Desglose por edad+género del mes completo [since, until], a nivel CAMPAÑA (mismo nivel que el
 * desglose diario) para poder aplicar el mismo criterio de matching por Objetivo — ver
 * findMatchedObjective y el comentario grande arriba del archivo. "unknown"/otros géneros que
 * Meta pueda devolver se descartan (META_GENDER_TO_LABEL sólo mapea male/female).
 */
async function fetchAudienceSegments(
  metaConfig: MetaAdsConfig,
  objectives: { event: string; label: string }[],
  objectiveEvents: string[],
  since: string,
  until: string
): Promise<AudienceSegmentTotals[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaAudienceInsightsResponse>(
    `${accountId}/insights`,
    {
      level: "campaign",
      breakdowns: "age,gender",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions",
      limit: "500",
    },
    metaConfig.system_user_token
  );

  const bySegment = new Map<string, AudienceSegmentTotals>();

  for (const row of insights.data) {
    const gender = row.gender ? META_GENDER_TO_LABEL[row.gender] : undefined;
    const ageRange = row.age;
    if (!gender || !ageRange) continue; // "unknown" u otro valor sin mapear: se descarta.

    const key = `${gender}|${ageRange}`;
    let entry = bySegment.get(key);
    if (!entry) {
      entry = { gender, ageRange, objectiveLeads: objectives.map(() => 0), objectiveSpend: objectives.map(() => 0) };
      bySegment.set(key, entry);
    }

    const spend = Number(row.spend ?? 0);
    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
  }

  return Array.from(bySegment.values());
}

/**
 * Desglose por provincia/región del mes completo [since, until], a nivel CAMPAÑA — mismo criterio
 * de matching por Objetivo que fetchAudienceSegments (ver findMatchedObjective arriba). Se pide el
 * breakdown "region" de Meta, que es el que ya usa query_meta_ads en lib/reports/tools.ts.
 */
async function fetchRegionSegments(
  metaConfig: MetaAdsConfig,
  objectives: { event: string; label: string }[],
  objectiveEvents: string[],
  since: string,
  until: string
): Promise<RegionSegmentTotals[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaRegionInsightsResponse>(
    `${accountId}/insights`,
    {
      level: "campaign",
      breakdowns: "region",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions",
      limit: "500",
    },
    metaConfig.system_user_token
  );

  const byRegion = new Map<string, RegionSegmentTotals>();

  for (const row of insights.data) {
    const region = row.region;
    if (!region) continue;

    let entry = byRegion.get(region);
    if (!entry) {
      entry = { region, objectiveLeads: objectives.map(() => 0), objectiveSpend: objectives.map(() => 0) };
      byRegion.set(region, entry);
    }

    const spend = Number(row.spend ?? 0);
    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
  }

  return Array.from(byRegion.values());
}

interface MetaHourlyRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
}

interface MetaHourlyInsightsResponse {
  data: MetaHourlyRow[];
  paging?: { next?: string };
}

/**
 * Desglose por hora del día del mes completo [since, until], a nivel CAMPAÑA — mismo criterio de
 * matching por Objetivo que fetchRegionSegments/fetchAudienceSegments (findMatchedObjective:
 * exacto → "contiene", primero que matchea se queda con la fila), pero acá no interesa DE QUÉ
 * Objetivo es cada lead (eso ya se ve en el resto de la página) sino A QUÉ HORA pasó, así que se
 * suma directo al total combinado de esa hora en vez de mantener el desglose por índice. Usa el
 * breakdown "hourly_stats_aggregated_by_advertiser_time_zone" de Meta, que devuelve un string tipo
 * "14:00:00 - 14:59:59" por fila — se toma la hora de inicio de ese rango.
 */
async function fetchHourlyTotals(
  metaConfig: MetaAdsConfig,
  objectiveEvents: string[],
  since: string,
  until: string
): Promise<HourlyTotals[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaHourlyInsightsResponse>(
    `${accountId}/insights`,
    {
      level: "campaign",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions",
      limit: "500",
    },
    metaConfig.system_user_token
  );

  const byHour = new Map<number, HourlyTotals>();
  for (let h = 0; h < 24; h += 1) {
    byHour.set(h, { hour: h, spend: 0, leads: 0 });
  }

  for (const row of insights.data) {
    const rangeLabel = row.hourly_stats_aggregated_by_advertiser_time_zone;
    const hour = rangeLabel ? Number(rangeLabel.slice(0, 2)) : NaN;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const entry = byHour.get(hour)!;
    entry.spend += Number(row.spend ?? 0);

    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.leads += matched.value;
    }
  }

  return Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
}

export interface VideoRetentionByAge {
  /** Rango etario tal cual lo devuelve Meta ("18-24", "25-34", ..., "65+"). */
  ageRange: string;
  /** Inicios de reproducción de video ("video_play_actions" de Meta) — el 100% de referencia contra el que se miden p25/p50/p75/p100. */
  videoPlays: number;
  /** Reproducciones que llegaron al 25%/50%/75%/100% de la duración del video ("video_pXX_watched_actions" de Meta). */
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

interface MetaVideoRetentionRow {
  age?: string;
  video_play_actions?: { action_type: string; value: string }[];
  video_p25_watched_actions?: { action_type: string; value: string }[];
  video_p50_watched_actions?: { action_type: string; value: string }[];
  video_p75_watched_actions?: { action_type: string; value: string }[];
  video_p100_watched_actions?: { action_type: string; value: string }[];
}

interface MetaVideoRetentionInsightsResponse {
  data: MetaVideoRetentionRow[];
  paging?: { next?: string };
}

function sumActionValues(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  return actions.reduce((sum, action) => sum + Number(action.value ?? 0), 0);
}

/**
 * Desglose por edad de la retención de video del mes completo [since, until], a nivel CAMPAÑA.
 * A diferencia de fetchAudienceSegments/fetchRegionSegments/fetchHourlyTotals, esto NO se matchea
 * contra los Objetivos configurados (findMatchedObjective): la retención de video es una métrica
 * propia de la reproducción del video en sí (cuántos avanzaron hasta el 25/50/75/100% de la
 * duración), no un evento de conversión, así que no tiene sentido asignarla a "Fomulario Meta" o
 * "Iniciaron Chat" — se suma directo por rango etario, para TODA la cuenta.
 */
async function fetchVideoRetentionByAge(metaConfig: MetaAdsConfig, since: string, until: string): Promise<VideoRetentionByAge[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaVideoRetentionInsightsResponse>(
    `${accountId}/insights`,
    {
      level: "campaign",
      breakdowns: "age",
      time_range: JSON.stringify({ since, until }),
      fields: "video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions",
      limit: "500",
    },
    metaConfig.system_user_token
  );

  const byAge = new Map<string, VideoRetentionByAge>();

  for (const row of insights.data) {
    const ageRange = row.age;
    if (!ageRange) continue;

    let entry = byAge.get(ageRange);
    if (!entry) {
      entry = { ageRange, videoPlays: 0, p25: 0, p50: 0, p75: 0, p100: 0 };
      byAge.set(ageRange, entry);
    }

    entry.videoPlays += sumActionValues(row.video_play_actions);
    entry.p25 += sumActionValues(row.video_p25_watched_actions);
    entry.p50 += sumActionValues(row.video_p50_watched_actions);
    entry.p75 += sumActionValues(row.video_p75_watched_actions);
    entry.p100 += sumActionValues(row.video_p100_watched_actions);
  }

  return Array.from(byAge.values());
}

const FALLBACK_TYPE_LABEL: Record<LeadType, string> = {
  chat: "Objetivo 1 (sin configurar)",
  formLanding: "Objetivo 2 (sin configurar)",
  formMeta: "Objetivo 3 (sin configurar)",
};

export async function fetchRealInvestmentCalendarData(
  metaConfig: MetaAdsConfig,
  monthStart: Date,
  /** Último día con datos a pedir (normalmente "hoy", nunca en el futuro — Meta no tiene nada que devolver para días que no pasaron). */
  lastDataDate: Date
): Promise<RealInvestmentCalendarData> {
  const objectives = metaConfig.objectives ?? [];
  const objectiveEvents = objectives.map((o) => o.event.trim());
  const objectiveLabels = objectives.map((o, index) => o.label.trim() || o.event.trim() || `Objetivo ${index + 1}`);
  const configuredTypeCount = objectiveEvents.filter((event) => event).length;

  // Legado: espejo de los primeros 3 Objetivos, fijo por LeadType — sólo para
  // CampaignAnalysis/AudienceAnalysis (ver comentario arriba del archivo).
  const typeLabels: Record<LeadType, string> = { ...FALLBACK_TYPE_LABEL };
  LEAD_TYPES.forEach((type, index) => {
    const objective = objectives[index];
    if (objective && objective.event.trim()) {
      typeLabels[type] = objective.label.trim() || objective.event.trim();
    }
  });

  const accountId = metaConfig.ad_account_id;
  const since = format(monthStart, "yyyy-MM-dd");
  const until = format(lastDataDate, "yyyy-MM-dd");

  const [insights, accountInfo, audienceSegments, regionSegments, hourlyTotals, videoRetentionByAge] = await Promise.all([
    fetchMetaGraphApi<MetaCampaignInsightsResponse>(
      `${accountId}/insights`,
      {
        level: "campaign",
        time_increment: "1",
        time_range: JSON.stringify({ since, until }),
        fields: "spend,actions",
        limit: "500",
      },
      metaConfig.system_user_token
    ),
    fetchMetaGraphApi<{ currency?: string }>(accountId, { fields: "currency" }, metaConfig.system_user_token),
    fetchAudienceSegments(metaConfig, objectives, objectiveEvents, since, until),
    fetchRegionSegments(metaConfig, objectives, objectiveEvents, since, until),
    fetchHourlyTotals(metaConfig, objectiveEvents, since, until),
    fetchVideoRetentionByAge(metaConfig, since, until),
  ]);

  const byDate = new Map<string, DailyRealTotals>();
  const rawActionTypeTotals = new Map<string, number>();
  const matchedObjectiveIndexes = new Set<number>();

  for (const row of insights.data) {
    const dateKey = row.date_start;
    if (!dateKey) continue;

    let entry = byDate.get(dateKey);
    if (!entry) {
      entry = {
        date: dateKey,
        spend: 0,
        leadsByType: zeroByType(),
        spendByType: zeroByType(),
        objectiveLeads: objectives.map(() => 0),
        objectiveSpend: objectives.map(() => 0),
      };
      byDate.set(dateKey, entry);
    }

    const spend = Number(row.spend ?? 0);
    entry.spend += spend;

    const actions = row.actions ?? [];
    for (const action of actions) {
      const value = Number(action.value ?? 0);
      if (value > 0 && action.action_type) {
        rawActionTypeTotals.set(action.action_type, (rawActionTypeTotals.get(action.action_type) ?? 0) + value);
      }
    }

    // Ver findMatchedObjective arriba: exacto primero, "contiene" después, el primero que
    // matchea en orden se queda con la fila entera.
    const matched = findMatchedObjective(actions, objectiveEvents);
    if (matched) {
      const { index: matchedIndex, value } = matched;
      entry.objectiveLeads[matchedIndex] = (entry.objectiveLeads[matchedIndex] ?? 0) + value;
      entry.objectiveSpend[matchedIndex] = (entry.objectiveSpend[matchedIndex] ?? 0) + spend;
      matchedObjectiveIndexes.add(matchedIndex);

      // Espejo legado: sólo si el Objetivo matcheado es uno de los primeros 3.
      if (matchedIndex < LEAD_TYPES.length) {
        const type = LEAD_TYPES[matchedIndex]!;
        entry.leadsByType[type] += value;
        entry.spendByType[type] += spend;
      }
    }
  }

  const days = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const detectedActionTypes =
    configuredTypeCount > 0 && matchedObjectiveIndexes.size < configuredTypeCount
      ? Array.from(rawActionTypeTotals.entries())
          .map(([actionType, count]) => ({ actionType, count }))
          .sort((a, b) => b.count - a.count)
      : [];

  // El breakdown "region" de Meta no le asigna provincia a TODOS los eventos — en particular, los
  // de mensajería (chat/WhatsApp) suelen quedar afuera (misma limitación que ya advertía la tabla
  // de referencia de Martin: "la plataforma no informa las conversaciones por mensaje cuando se
  // segmenta por provincia"). En vez de perder esos leads en silencio (quedarían invisibles en
  // RegionAnalysis.tsx aunque tengan volumen real), se completa la diferencia entre el total
  // confiable por Objetivo (el de `days`, que sí reconcilia con el resto de la página) y lo que
  // el breakdown de región efectivamente pudo asignar, y esa diferencia se agrupa en un
  // pseudo-región "Sin provincia asignada" — así el total por Objetivo en RegionAnalysis siempre
  // suma exactamente lo mismo que en el resto del Calendario, y ningún Objetivo desaparece del
  // todo del toggle sólo porque Meta no le puso provincia a sus conversiones.
  const regionSegmentsComplete = withUnassignedRegionBucket(days, regionSegments, objectives.length);

  return {
    currency: accountInfo.currency ?? "USD",
    monthlyBudget: typeof metaConfig.monthly_budget === "number" ? metaConfig.monthly_budget : null,
    typeLabels,
    configuredTypeCount,
    objectiveLabels,
    detectedActionTypes,
    days,
    audienceSegments,
    regionSegments: regionSegmentsComplete,
    hourlyTotals,
    videoRetentionByAge,
  };
}

const UNASSIGNED_REGION_LABEL = "Sin provincia asignada";

/** Ver el comentario grande donde se llama, arriba. */
function withUnassignedRegionBucket(
  days: DailyRealTotals[],
  regionSegments: RegionSegmentTotals[],
  objectiveCount: number
): RegionSegmentTotals[] {
  const totalLeads = Array.from({ length: objectiveCount }, () => 0);
  const totalSpend = Array.from({ length: objectiveCount }, () => 0);
  for (const day of days) {
    day.objectiveLeads.forEach((value, i) => {
      totalLeads[i] = (totalLeads[i] ?? 0) + value;
    });
    day.objectiveSpend.forEach((value, i) => {
      totalSpend[i] = (totalSpend[i] ?? 0) + value;
    });
  }

  const assignedLeads = Array.from({ length: objectiveCount }, () => 0);
  const assignedSpend = Array.from({ length: objectiveCount }, () => 0);
  for (const segment of regionSegments) {
    segment.objectiveLeads.forEach((value, i) => {
      assignedLeads[i] = (assignedLeads[i] ?? 0) + value;
    });
    segment.objectiveSpend.forEach((value, i) => {
      assignedSpend[i] = (assignedSpend[i] ?? 0) + value;
    });
  }

  const unassignedLeads = totalLeads.map((total, i) => Math.max(0, total - (assignedLeads[i] ?? 0)));
  const unassignedSpend = totalSpend.map((total, i) => Math.max(0, total - (assignedSpend[i] ?? 0)));
  const hasUnassigned = unassignedLeads.some((v) => v > 0) || unassignedSpend.some((v) => v > 0);
  if (!hasUnassigned) return regionSegments;

  return [
    ...regionSegments,
    { region: UNASSIGNED_REGION_LABEL, objectiveLeads: unassignedLeads, objectiveSpend: unassignedSpend },
  ];
}

/** Suma por actionType las dos listas de diagnóstico (ver detectedActionTypes arriba) y devuelve el resultado ordenado de mayor a menor — usado para combinar el tramo "estable" (cacheado) con el día de hoy (siempre fresco) sin perder ninguno de los dos diagnósticos. */
function mergeDetectedActionTypes(
  a: { actionType: string; count: number }[],
  b: { actionType: string; count: number }[]
): { actionType: string; count: number }[] {
  if (a.length === 0 && b.length === 0) return [];
  const totals = new Map<string, number>();
  for (const { actionType, count } of [...a, ...b]) {
    totals.set(actionType, (totals.get(actionType) ?? 0) + count);
  }
  return Array.from(totals.entries())
    .map(([actionType, count]) => ({ actionType, count }))
    .sort((x, y) => y.count - x.count);
}

/** Junta el tramo "estable" (cacheado, puede venir de la cache o recién pedido) con el día de hoy (siempre recién pedido) en un único RealInvestmentCalendarData — currency/monthlyBudget/typeLabels/configuredTypeCount/objectiveLabels son idénticos en ambos tramos (salen de metaConfig, no de Meta), así que se toman del tramo fresco sin más. */
/** Suma objectiveLeads/objectiveSpend por segmento (gender+ageRange) entre el tramo estable y el fresco — un segmento que sólo aparece en uno de los dos se conserva tal cual. */
function mergeAudienceSegments(a: AudienceSegmentTotals[], b: AudienceSegmentTotals[]): AudienceSegmentTotals[] {
  const bySegment = new Map<string, AudienceSegmentTotals>();
  for (const segment of [...a, ...b]) {
    const key = `${segment.gender}|${segment.ageRange}`;
    let entry = bySegment.get(key);
    if (!entry) {
      entry = { gender: segment.gender, ageRange: segment.ageRange, objectiveLeads: [...segment.objectiveLeads], objectiveSpend: [...segment.objectiveSpend] };
      bySegment.set(key, entry);
    } else {
      segment.objectiveLeads.forEach((value, i) => {
        entry!.objectiveLeads[i] = (entry!.objectiveLeads[i] ?? 0) + value;
      });
      segment.objectiveSpend.forEach((value, i) => {
        entry!.objectiveSpend[i] = (entry!.objectiveSpend[i] ?? 0) + value;
      });
    }
  }
  return Array.from(bySegment.values());
}

/** Igual que mergeAudienceSegments pero por provincia/región. */
function mergeRegionSegments(a: RegionSegmentTotals[], b: RegionSegmentTotals[]): RegionSegmentTotals[] {
  const byRegion = new Map<string, RegionSegmentTotals>();
  for (const segment of [...a, ...b]) {
    let entry = byRegion.get(segment.region);
    if (!entry) {
      entry = { region: segment.region, objectiveLeads: [...segment.objectiveLeads], objectiveSpend: [...segment.objectiveSpend] };
      byRegion.set(segment.region, entry);
    } else {
      segment.objectiveLeads.forEach((value, i) => {
        entry!.objectiveLeads[i] = (entry!.objectiveLeads[i] ?? 0) + value;
      });
      segment.objectiveSpend.forEach((value, i) => {
        entry!.objectiveSpend[i] = (entry!.objectiveSpend[i] ?? 0) + value;
      });
    }
  }
  return Array.from(byRegion.values());
}

/** Suma spend/leads por hora entre el tramo estable y el fresco. */
function mergeHourlyTotals(a: HourlyTotals[], b: HourlyTotals[]): HourlyTotals[] {
  const byHour = new Map<number, HourlyTotals>();
  for (const entry of [...a, ...b]) {
    const existing = byHour.get(entry.hour);
    if (!existing) {
      byHour.set(entry.hour, { hour: entry.hour, spend: entry.spend, leads: entry.leads });
    } else {
      existing.spend += entry.spend;
      existing.leads += entry.leads;
    }
  }
  return Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
}

/** Suma videoPlays/p25/p50/p75/p100 por rango etario entre el tramo estable y el fresco. */
function mergeVideoRetentionByAge(a: VideoRetentionByAge[], b: VideoRetentionByAge[]): VideoRetentionByAge[] {
  const byAge = new Map<string, VideoRetentionByAge>();
  for (const entry of [...a, ...b]) {
    const existing = byAge.get(entry.ageRange);
    if (!existing) {
      byAge.set(entry.ageRange, { ...entry });
    } else {
      existing.videoPlays += entry.videoPlays;
      existing.p25 += entry.p25;
      existing.p50 += entry.p50;
      existing.p75 += entry.p75;
      existing.p100 += entry.p100;
    }
  }
  return Array.from(byAge.values());
}

// Una entrada cacheada por withCache puede venir de ANTES de que se agregara un campo nuevo acá
// (ej. audienceSegments/regionSegments/hourlyTotals no existían hace unas horas) — la cache no se
// invalida sola cuando cambia la forma de los datos, así que hay que asumir que puede faltar
// cualquier campo agregado después del primer deploy que empezó a cachearlo, y completarlo con un
// default vacío en vez de romper con "x is not iterable".
function withSegmentDefaults(data: RealInvestmentCalendarData): RealInvestmentCalendarData {
  return {
    ...data,
    audienceSegments: data.audienceSegments ?? [],
    regionSegments: data.regionSegments ?? [],
    hourlyTotals: data.hourlyTotals ?? [],
    videoRetentionByAge: data.videoRetentionByAge ?? [],
  };
}

function mergeRealInvestmentCalendarData(
  stableRaw: RealInvestmentCalendarData,
  freshRaw: RealInvestmentCalendarData
): RealInvestmentCalendarData {
  const stable = withSegmentDefaults(stableRaw);
  const fresh = withSegmentDefaults(freshRaw);
  return {
    ...fresh,
    detectedActionTypes: mergeDetectedActionTypes(stable.detectedActionTypes, fresh.detectedActionTypes),
    days: [...stable.days, ...fresh.days].sort((a, b) => a.date.localeCompare(b.date)),
    audienceSegments: mergeAudienceSegments(stable.audienceSegments, fresh.audienceSegments),
    regionSegments: mergeRegionSegments(stable.regionSegments, fresh.regionSegments),
    hourlyTotals: mergeHourlyTotals(stable.hourlyTotals, fresh.hourlyTotals),
    videoRetentionByAge: mergeVideoRetentionByAge(stable.videoRetentionByAge, fresh.videoRetentionByAge),
  };
}

/**
 * Igual que fetchRealInvestmentCalendarData, pero SIEMPRE cachea (ver lib/cache/withCache.ts,
 * mismo mecanismo que ya usan GA4/Search Console) para no volver a pegarle a la Marketing API de
 * Meta en cada visita al Calendario de inversión.
 *
 * - Si el mes consultado ya terminó (lastDataDate cae justo en el último día del mes — ver
 *   resolveMonthStart/lastDataDate en el route), Meta no le va a sumar nada más a ningún día: se
 *   cachea el mes ENTERO de una, con el TTL normal de withCache (heurística por antigüedad de
 *   `to` — larga, porque un mes cerrado no cambia más).
 * - Si el mes está en curso (lastDataDate = hoy), el día de hoy todavía puede seguir sumando
 *   leads a medida que pasan las horas, así que antes NUNCA se cacheaba ese tramo — se le pedía
 *   siempre fresco a Meta en cada carga de página. Martín pidió cambiar eso: ahora se cachea
 *   IGUAL que el resto, con un TTL FIJO de 3 horas (THREE_HOURS_SECONDS) en vez de la heurística
 *   normal, tanto para el tramo "hoy" como para el resto del mes en curso (antes hasta ayer sí
 *   usaba la heurística normal de withCache — 30 min/24h —, pero como todo el tramo "mes en
 *   curso" ahora comparte una sola política, se simplifica a un TTL fijo para las dos).
 * - Caso límite: si hoy es el día 1 del mes no hay ningún tramo "hasta ayer" separado — se pide
 *   el mes entero (o sea, sólo hoy) con el mismo TTL fijo de 3 horas.
 *
 * El query key lleva un sufijo de versión ("investmentCalendar:v5") — bumpearlo cada vez que
 * cambie la FORMA del objeto que se cachea (se agregue/saque un campo de RealInvestmentCalendarData)
 * fuerza a que las entradas ya cacheadas con la forma vieja se traten como un miss en vez de
 * devolverse tal cual (withSegmentDefaults cubre el crash si igual quedara alguna sin bumpear,
 * pero bumpear es lo que evita mostrar datos faltantes silenciosamente durante el resto del TTL).
 */
export async function fetchRealInvestmentCalendarDataCached(
  metaConfig: MetaAdsConfig,
  clientId: string,
  monthStart: Date,
  lastDataDate: Date
): Promise<RealInvestmentCalendarData> {
  const accountId = metaConfig.ad_account_id;
  const monthIsComplete = format(lastDataDate, "yyyy-MM-dd") === format(endOfMonth(monthStart), "yyyy-MM-dd");

  if (monthIsComplete) {
    const cached = await withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v5",
        params: { accountId, from: format(monthStart, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
      },
      () => fetchRealInvestmentCalendarData(metaConfig, monthStart, lastDataDate)
    );
    return withSegmentDefaults(cached);
  }

  const stableUntil = subDays(lastDataDate, 1);
  if (isBefore(stableUntil, monthStart)) {
    // Día 1 del mes: no hay tramo "hasta ayer" separado, pero se cachea igual (mes en curso: TTL
    // fijo de 3 horas) en vez de pedirle a Meta en cada carga de página.
    const cached = await withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v5",
        params: { accountId, from: format(monthStart, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () => fetchRealInvestmentCalendarData(metaConfig, monthStart, lastDataDate)
    );
    return withSegmentDefaults(cached);
  }

  const [stable, fresh] = await Promise.all([
    withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v5",
        params: { accountId, from: format(monthStart, "yyyy-MM-dd"), to: format(stableUntil, "yyyy-MM-dd") },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () => fetchRealInvestmentCalendarData(metaConfig, monthStart, stableUntil)
    ),
    // Antes se pedía directo, sin pasar por withCache ("nunca se cachea"). Ahora se cachea igual
    // que el resto del mes en curso, mismo TTL fijo de 3 horas.
    withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v5",
        params: { accountId, from: format(lastDataDate, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () => fetchRealInvestmentCalendarData(metaConfig, lastDataDate, lastDataDate)
    ),
  ]);

  return mergeRealInvestmentCalendarData(stable, fresh);
}
