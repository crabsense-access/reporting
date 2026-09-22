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
import { placementLabel } from "@/lib/reporting/metaResultLabels";
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
): { index: number; value: number; actionType: string } | null {
  for (let i = 0; i < objectiveEvents.length; i += 1) {
    const eventName = objectiveEvents[i];
    if (!eventName) continue;
    const action = actions.find((a) => exactMatchesEvent(a.action_type, eventName));
    if (action && Number(action.value ?? 0) > 0) {
      return { index: i, value: Number(action.value ?? 0), actionType: action.action_type };
    }
  }
  for (let i = 0; i < objectiveEvents.length; i += 1) {
    const eventName = objectiveEvents[i];
    if (!eventName) continue;
    const action = actions.find((a) => looseMatchesEvent(a.action_type, eventName));
    if (action && Number(action.value ?? 0) > 0) {
      return { index: i, value: Number(action.value ?? 0), actionType: action.action_type };
    }
  }
  return null;
}

/**
 * Suma la contribución de UNA fila (spend + Objetivo matcheado, si lo hay) al desglose por
 * anuncio (byAd) de un segmento — crea la entrada si hace falta. Compartido por
 * fetchAudienceSegments/fetchRegionSegments/fetchHourlyTotals/fetchPlacementSegments: las 4
 * comparten el mismo shape de byAd (campaignId + spend + objectiveLeads/objectiveSpend), a
 * diferencia de fetchVideoRetentionByAge (que no matchea por Objetivo — ver ahí).
 */
function addRowToByAd(
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>,
  adId: string | undefined,
  campaignId: string | undefined,
  spend: number,
  matched: { index: number; value: number } | null,
  objectivesCount: number
): void {
  if (!adId || !campaignId) return; // fila sin anuncio/campaña identificados: no entra al desglose (no debería pasar, pero no tiene que romper el resto).
  let entry = byAd[adId];
  if (!entry) {
    entry = { campaignId, spend: 0, objectiveLeads: Array.from({ length: objectivesCount }, () => 0), objectiveSpend: Array.from({ length: objectivesCount }, () => 0) };
    byAd[adId] = entry;
  }
  entry.spend += spend;
  if (matched) {
    entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
    entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
  }
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
  /** Interacciones (post_engagement) y Clics en el enlace (link_click) de TODAS las filas del día, matcheen o no algún Objetivo — para el bloque "Performance de Resultados" sin ningún tipo seleccionado. */
  interactions: number;
  clicks: number;
  /** Mismo desglose que objectiveLeads/objectiveSpend, pero de Interacciones/Clics — para cuando se selecciona un tipo de Resultado puntual. */
  objectiveInteractions: number[];
  objectiveClicks: number[];
  /**
   * Desglose de ESTE día por anuncio (clave = ad_id) — para los combos de Campaña/Anuncio de los
   * gráficos con filtro (InvestmentTrendChart.tsx, LeadsByTypeTrendChart.tsx,
   * WeekdayPerformanceChart.tsx). Cada entrada lleva su campaignId para poder sumar por campaña
   * sin desglosar por anuncio (combo de Campaña solo, sin Anuncio elegido). Sólo entran acá los
   * anuncios que tuvieron alguna fila ese día; un anuncio ausente ese día se interpreta como "sin
   * datos" (no simplemente 0), igual que ya hace `days` a nivel de cuenta completa.
   */
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>;
}

export interface RealInvestmentCalendarData {
  currency: string;
  /** Presupuesto DEL MES consultado (ver resolveMonthlyBudget) — null si ese mes no tiene ni una entrada propia en monthly_budgets ni un monthly_budget legado cargado. */
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
  /** Alcance real y deduplicado del mes (o del tramo, si es un tramo "estable"/"fresco" — ver mergeRealInvestmentCalendarData), a nivel de TODA la cuenta — ver fetchMonthlyReach. No se puede filtrar por tipo de Resultado (ver comentario ahí). */
  monthlyReach: number;
  /** Campañas con al menos 1 fila de gasto este mes, ordenadas por gasto descendente — para el combo de Campaña de los gráficos con filtro (ver DailyRealTotals.byAd). */
  campaigns: { id: string; name: string }[];
  /** Anuncios con al menos 1 fila de gasto este mes, ordenados por gasto descendente, cada uno con el id de SU campaña — para el combo de Anuncio, que se acota en cascada a los anuncios de la Campaña elegida (ver DailyRealTotals.byAd). */
  ads: { id: string; name: string; campaignId: string }[];
  /**
   * El action_type REAL de Meta que más matcheó este mes para cada Objetivo (mismo índice que
   * objectiveLabels), o null si ese Objetivo no matcheó nada. Se usa para mostrar el nombre real
   * del tipo de Resultado como lo llama Meta (ver lib/reporting/metaResultLabels.ts) en vez del
   * label que se tipeó a mano en el Admin — ese label queda como fallback cuando el action_type
   * no está en la tabla de traducción (ej. una conversión personalizada, que Meta nombra con el
   * nombre que le pusieron en Events Manager, no recuperable desde acá).
   */
  objectiveActionTypes: (string | null)[];
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
  /** Un elemento por ubicación de publicación (Feed, Stories, Reels, etc.) con datos este mes (ver PlacementAnalysis.tsx) — objectiveLeads/objectiveSpend con el mismo índice que objectiveLabels, mismo criterio de matching que audienceSegments/regionSegments. */
  placementSegments: PlacementSegmentTotals[];
}

export interface HourlyTotals {
  /** Hora del día en el huso horario de la cuenta publicitaria, 0-23. */
  hour: number;
  /** Inversión TOTAL de esa hora (todas las filas, matcheen o no algún Objetivo) — usado para "Todos los Resultados"; con un Objetivo puntual elegido se usa objectiveSpend[i] en su lugar (ver HourlyPerformanceChart.tsx). */
  spend: number;
  /** Objetivos configurados, mismo criterio de matching e índice que audienceSegments/regionSegments — a pedido de Martín, HourlyPerformanceChart ahora también filtra por Tipo de Resultado (antes combinaba todos los Objetivos en un único total). */
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de ESTA hora por anuncio (clave = ad_id), mismo criterio que DailyRealTotals.byAd — para los combos de Campaña/Anuncio. */
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>;
}

/**
 * Desglose por anuncio de AudienceSegmentTotals — igual al shared AdBreakdownEntry (ver
 * lib/reporting/adFilter.ts) más reach/impressions, que ningún otro segmento salvo Region tenía
 * hasta ahora (a diferencia de RegionAdBreakdownEntry, sin clicks: no lo pidió Martín acá).
 */
export interface AudienceAdBreakdownEntry {
  campaignId: string;
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  reach: number;
  impressions: number;
}

export interface AudienceSegmentTotals {
  gender: "mujeres" | "hombres";
  /** Rango etario tal cual lo devuelve Meta ("18-24", "25-34", ..., "65+"). */
  ageRange: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Alcance/impresiones TOTALES de este segmento — a diferencia de objectiveLeads/objectiveSpend,
   *  no varían según el Tipo de Resultado elegido, sólo según el filtro de Campaña/Anuncio (ver
   *  byAd) — a pedido de Martín, para los recuadros de AudienceAnalysis.tsx, mismo criterio que
   *  RegionSegmentTotals.reach/impressions. */
  reach: number;
  impressions: number;
  /** Desglose de ESTE segmento por anuncio (clave = ad_id), mismo criterio que DailyRealTotals.byAd — para los combos de Campaña/Anuncio de AudienceAnalysis.tsx. */
  byAd: Record<string, AudienceAdBreakdownEntry>;
}

/**
 * Desglose por anuncio de RegionSegmentTotals — igual al shared AdBreakdownEntry (ver
 * lib/reporting/adFilter.ts) más reach/impressions/clicks, que ningún otro segmento (audience/
 * hourly/placement) tiene todavía, así que se define acá en vez de sumarlo al tipo compartido.
 */
export interface RegionAdBreakdownEntry {
  campaignId: string;
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  reach: number;
  impressions: number;
  clicks: number;
}

export interface RegionSegmentTotals {
  /** Nombre de provincia/región tal cual lo devuelve Meta (ej. "Buenos Aires", "Cordoba"). */
  region: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Alcance/impresiones/clics TOTALES de esta región en el período — a diferencia de
   *  objectiveLeads/objectiveSpend, no varían según el Tipo de Resultado elegido (ver comentario
   *  de MetaRegionRow), sólo según el filtro de Campaña/Anuncio (ver byAd). */
  reach: number;
  impressions: number;
  clicks: number;
  /**
   * Desglose de ESTE segmento por anuncio (clave = ad_id), mismo criterio que
   * DailyRealTotals.byAd — para los combos de Campaña/Anuncio de RegionAnalysis.tsx. Limitación
   * conocida (mismo espíritu que el bucket "Sin provincia asignada" — ver
   * withUnassignedRegionBucket más abajo): el pseudo-segmento "Sin provincia asignada" siempre
   * queda con byAd vacío, así que al filtrar por Campaña/Anuncio esos leads sin provincia no
   * aparecen (en vez de reconciliarse, como sí se reconcilian en el total SIN filtro) — mismo
   * criterio para reach/impressions/clicks, que tampoco se reconcilian ahí (ver
   * withUnassignedRegionBucket: no hay un total diario de alcance/impresiones para diferenciar
   * contra lo asignado, a diferencia de leads/spend que sí salen de `days`).
   */
  byAd: Record<string, RegionAdBreakdownEntry>;
}

export interface PlacementSegmentTotals {
  /** Nombre de la ubicación en español, ya traducido desde publisher_platform+platform_position (ver placementLabel en lib/reporting/metaResultLabels.ts). */
  placement: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de ESTA ubicación por anuncio (clave = ad_id), mismo criterio que DailyRealTotals.byAd — para los combos de Campaña/Anuncio de PlacementAnalysis.tsx. */
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>;
}

interface MetaCampaignDayRow {
  date_start?: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
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
  campaign_id?: string;
  ad_id?: string;
  /** Alcance/impresiones de ESTA fila (edad+género+anuncio) para el período pedido — a pedido de
   *  Martín, para los recuadros de "Quién responde a los anuncios" (AudienceAnalysis.tsx). Mismo
   *  criterio que MetaRegionRow.reach/impressions: no se matchean por Objetivo, quedan como
   *  totales del segmento (y del anuncio, en byAd) — ver AudienceSegmentTotals. */
  reach?: string;
  impressions?: string;
}

interface MetaAudienceInsightsResponse {
  data: MetaAudienceRow[];
  paging?: { next?: string };
}

interface MetaRegionRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  region?: string;
  campaign_id?: string;
  ad_id?: string;
  /** Alcance/impresiones/clics de ESTA fila (región+anuncio) para el período pedido — a pedido de
   *  Martín, para sumar estas 3 columnas a la tabla de "De dónde son los leads" (RegionAnalysis.tsx).
   *  A diferencia de objectiveLeads/objectiveSpend, no se matchean por Objetivo: una impresión o un
   *  clic no "es" de un tipo de Resultado puntual, así que quedan como totales de la región (y del
   *  anuncio, en byAd), sin desglose por índice de Objetivo — ver RegionSegmentTotals. */
  reach?: string;
  impressions?: string;
  clicks?: string;
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
      // level "ad" (antes "campaign") para poder taggear cada fila con campaign_id/ad_id y armar
      // byAd — a pedido de Martín, para los combos de Campaña/Anuncio (ver addRowToByAd arriba).
      // limit alto porque a nivel anuncio el volumen de filas crece mucho (anuncios × 14
      // combinaciones de edad+género) — fetchMetaGraphApi no sigue `paging.next`, así que una
      // cuenta con muchísimos anuncios activos igual podría truncarse (limitación conocida).
      // reach/impressions sumados a pedido de Martín — ver MetaAudienceRow.
      level: "ad",
      breakdowns: "age,gender",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions,campaign_id,ad_id,reach,impressions",
      limit: "5000",
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
      entry = {
        gender,
        ageRange,
        objectiveLeads: objectives.map(() => 0),
        objectiveSpend: objectives.map(() => 0),
        reach: 0,
        impressions: 0,
        byAd: {},
      };
      bySegment.set(key, entry);
    }

    const spend = Number(row.spend ?? 0);
    const reach = Number(row.reach ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
    entry.reach += reach;
    entry.impressions += impressions;

    // No se usa el addRowToByAd compartido acá: su byAd no tiene reach/impressions (lo comparten
    // fetchRegionSegments — que además suma clicks —, fetchHourlyTotals/fetchPlacementSegments,
    // que no piden esos campos), así que se arma la entrada completa acá mismo con el shape de
    // AudienceAdBreakdownEntry — mismo criterio que fetchRegionSegments.
    if (row.ad_id && row.campaign_id) {
      let adEntry = entry.byAd[row.ad_id];
      if (!adEntry) {
        adEntry = {
          campaignId: row.campaign_id,
          spend: 0,
          objectiveLeads: Array.from({ length: objectives.length }, () => 0),
          objectiveSpend: Array.from({ length: objectives.length }, () => 0),
          reach: 0,
          impressions: 0,
        };
        entry.byAd[row.ad_id] = adEntry;
      }
      adEntry.spend += spend;
      if (matched) {
        adEntry.objectiveLeads[matched.index] = (adEntry.objectiveLeads[matched.index] ?? 0) + matched.value;
        adEntry.objectiveSpend[matched.index] = (adEntry.objectiveSpend[matched.index] ?? 0) + spend;
      }
      adEntry.reach += reach;
      adEntry.impressions += impressions;
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
      // Ver comentario de fetchAudienceSegments (mismo criterio: level "ad" + limit alto para
      // poder armar byAd, con la misma limitación conocida de paginación). reach/impressions/clicks
      // sumados a pedido de Martín — ver MetaRegionRow.
      level: "ad",
      breakdowns: "region",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions,campaign_id,ad_id,reach,impressions,clicks",
      limit: "5000",
    },
    metaConfig.system_user_token
  );

  const byRegion = new Map<string, RegionSegmentTotals>();

  for (const row of insights.data) {
    const region = row.region;
    if (!region) continue;

    let entry = byRegion.get(region);
    if (!entry) {
      entry = {
        region,
        objectiveLeads: objectives.map(() => 0),
        objectiveSpend: objectives.map(() => 0),
        reach: 0,
        impressions: 0,
        clicks: 0,
        byAd: {},
      };
      byRegion.set(region, entry);
    }

    const spend = Number(row.spend ?? 0);
    const reach = Number(row.reach ?? 0);
    const impressions = Number(row.impressions ?? 0);
    const clicks = Number(row.clicks ?? 0);
    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
    entry.reach += reach;
    entry.impressions += impressions;
    entry.clicks += clicks;

    // No se usa el addRowToByAd compartido acá: su byAd no tiene reach/impressions/clicks (lo
    // comparten fetchAudienceSegments/fetchHourlyTotals/fetchPlacementSegments, que no piden esos
    // campos), así que se arma la entrada completa acá mismo con el shape de RegionAdBreakdownEntry.
    if (row.ad_id && row.campaign_id) {
      let adEntry = entry.byAd[row.ad_id];
      if (!adEntry) {
        adEntry = {
          campaignId: row.campaign_id,
          spend: 0,
          objectiveLeads: Array.from({ length: objectives.length }, () => 0),
          objectiveSpend: Array.from({ length: objectives.length }, () => 0),
          reach: 0,
          impressions: 0,
          clicks: 0,
        };
        entry.byAd[row.ad_id] = adEntry;
      }
      adEntry.spend += spend;
      if (matched) {
        adEntry.objectiveLeads[matched.index] = (adEntry.objectiveLeads[matched.index] ?? 0) + matched.value;
        adEntry.objectiveSpend[matched.index] = (adEntry.objectiveSpend[matched.index] ?? 0) + spend;
      }
      adEntry.reach += reach;
      adEntry.impressions += impressions;
      adEntry.clicks += clicks;
    }
  }

  return Array.from(byRegion.values());
}

interface MetaHourlyRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  campaign_id?: string;
  ad_id?: string;
}

interface MetaHourlyInsightsResponse {
  data: MetaHourlyRow[];
  paging?: { next?: string };
}

/**
 * Desglose por hora del día del mes completo [since, until], a nivel ANUNCIO — mismo criterio de
 * matching por Objetivo que fetchRegionSegments/fetchAudienceSegments (findMatchedObjective:
 * exacto → "contiene", primero que matchea se queda con la fila). A pedido de Martín ahora SÍ
 * queda el desglose por Objetivo (objectiveLeads/objectiveSpend, antes un único total combinado
 * "leads") además del desglose por anuncio (byAd), para los 3 combos de HourlyPerformanceChart.tsx
 * (Tipo de Resultado + Campaña + Anuncio). Usa el breakdown
 * "hourly_stats_aggregated_by_advertiser_time_zone" de Meta, que devuelve un string tipo
 * "14:00:00 - 14:59:59" por fila — se toma la hora de inicio de ese rango.
 */
async function fetchHourlyTotals(
  metaConfig: MetaAdsConfig,
  objectives: { event: string; label: string }[],
  objectiveEvents: string[],
  since: string,
  until: string
): Promise<HourlyTotals[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaHourlyInsightsResponse>(
    `${accountId}/insights`,
    {
      // Ver comentario de fetchAudienceSegments (level "ad" + limit alto, misma limitación de
      // paginación: acá son 24 horas × anuncios, no 14 segmentos × anuncios).
      level: "ad",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions,campaign_id,ad_id",
      limit: "5000",
    },
    metaConfig.system_user_token
  );

  const byHour = new Map<number, HourlyTotals>();
  for (let h = 0; h < 24; h += 1) {
    byHour.set(h, { hour: h, spend: 0, objectiveLeads: objectives.map(() => 0), objectiveSpend: objectives.map(() => 0), byAd: {} });
  }

  for (const row of insights.data) {
    const rangeLabel = row.hourly_stats_aggregated_by_advertiser_time_zone;
    const hour = rangeLabel ? Number(rangeLabel.slice(0, 2)) : NaN;
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const entry = byHour.get(hour)!;
    const spend = Number(row.spend ?? 0);
    entry.spend += spend;

    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
    addRowToByAd(entry.byAd, row.ad_id, row.campaign_id, spend, matched, objectives.length);
  }

  return Array.from(byHour.values()).sort((a, b) => a.hour - b.hour);
}

/**
 * Desglose por ubicación de publicación (Feed, Stories, Reels, Audience Network, etc.) del mes
 * completo [since, until], a nivel ANUNCIO — mismo criterio de matching por Objetivo que
 * fetchAudienceSegments/fetchRegionSegments/fetchHourlyTotals. Antes "Dónde se muestran los
 * anuncios" (PlacementAnalysis.tsx) usaba datos de prueba (placementMonthlyTotals, derivados del
 * total del mes); esta función lo conecta a Meta real por primera vez.
 *
 * Se piden dos breakdowns juntos, "publisher_platform,platform_position" — el combo que arma el
 * nombre final de la ubicación (ver placementLabel en lib/reporting/metaResultLabels.ts, ej.
 * "facebook"+"feed" → "Facebook Feed"). Ubicaciones sin alguno de los dos valores (rarísimo, pero
 * Meta a veces devuelve filas "unknown") se descartan, igual que "unknown" en
 * fetchAudienceSegments.
 */
async function fetchPlacementSegments(
  metaConfig: MetaAdsConfig,
  objectives: { event: string; label: string }[],
  objectiveEvents: string[],
  since: string,
  until: string
): Promise<PlacementSegmentTotals[]> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaPlacementInsightsResponse>(
    `${accountId}/insights`,
    {
      // Ver comentario de fetchAudienceSegments (level "ad" + limit alto, misma limitación de
      // paginación).
      level: "ad",
      breakdowns: "publisher_platform,platform_position",
      time_range: JSON.stringify({ since, until }),
      fields: "spend,actions,campaign_id,ad_id",
      limit: "5000",
    },
    metaConfig.system_user_token
  );

  const byPlacement = new Map<string, PlacementSegmentTotals>();

  for (const row of insights.data) {
    const publisherPlatform = row.publisher_platform;
    const platformPosition = row.platform_position;
    if (!publisherPlatform || !platformPosition) continue;

    const placement = placementLabel(publisherPlatform, platformPosition);
    let entry = byPlacement.get(placement);
    if (!entry) {
      entry = { placement, objectiveLeads: objectives.map(() => 0), objectiveSpend: objectives.map(() => 0), byAd: {} };
      byPlacement.set(placement, entry);
    }

    const spend = Number(row.spend ?? 0);
    const matched = findMatchedObjective(row.actions ?? [], objectiveEvents);
    if (matched) {
      entry.objectiveLeads[matched.index] = (entry.objectiveLeads[matched.index] ?? 0) + matched.value;
      entry.objectiveSpend[matched.index] = (entry.objectiveSpend[matched.index] ?? 0) + spend;
    }
    addRowToByAd(entry.byAd, row.ad_id, row.campaign_id, spend, matched, objectives.length);
  }

  return Array.from(byPlacement.values());
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
  /** Desglose de ESTE rango etario por anuncio (clave = ad_id) — para los combos de Campaña/Anuncio de VideoRetentionChart.tsx (sin Tipo de Resultado: la retención de video no se matchea por Objetivo, ver fetchVideoRetentionByAge). */
  byAd: Record<string, { campaignId: string; videoPlays: number; p25: number; p50: number; p75: number; p100: number }>;
}

interface MetaVideoRetentionRow {
  age?: string;
  video_play_actions?: { action_type: string; value: string }[];
  video_p25_watched_actions?: { action_type: string; value: string }[];
  video_p50_watched_actions?: { action_type: string; value: string }[];
  video_p75_watched_actions?: { action_type: string; value: string }[];
  video_p100_watched_actions?: { action_type: string; value: string }[];
  campaign_id?: string;
  ad_id?: string;
}

interface MetaVideoRetentionInsightsResponse {
  data: MetaVideoRetentionRow[];
  paging?: { next?: string };
}

interface MetaPlacementRow {
  spend?: string;
  actions?: { action_type: string; value: string }[];
  publisher_platform?: string;
  platform_position?: string;
  campaign_id?: string;
  ad_id?: string;
}

interface MetaPlacementInsightsResponse {
  data: MetaPlacementRow[];
  paging?: { next?: string };
}

function sumActionValues(actions?: { action_type: string; value: string }[]): number {
  if (!actions) return 0;
  return actions.reduce((sum, action) => sum + Number(action.value ?? 0), 0);
}

/** Valor de UN action_type puntual dentro del array `actions` de una fila de Insights (0 si no aparece) — a diferencia de sumActionValues, que suma TODO un array ya filtrado a una sola métrica (ej. video_play_actions), acá `actions` trae mezclados leads/clicks/interacciones/etc. y hay que buscar el que corresponde. */
function findActionValue(actions: { action_type: string; value: string }[], actionType: string): number {
  const action = actions.find((a) => a.action_type === actionType);
  return action ? Number(action.value ?? 0) : 0;
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
      // level "ad" (antes "campaign") para poder armar byAd — a pedido de Martín, para los combos
      // de Campaña/Anuncio de VideoRetentionChart.tsx (sin Tipo de Resultado: esto no se matchea
      // por Objetivo, ver comentario grande de la función). Misma limitación de paginación que el
      // resto (fetchMetaGraphApi no sigue paging.next).
      level: "ad",
      breakdowns: "age",
      time_range: JSON.stringify({ since, until }),
      fields:
        "video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,campaign_id,ad_id",
      limit: "5000",
    },
    metaConfig.system_user_token
  );

  const byAge = new Map<string, VideoRetentionByAge>();

  for (const row of insights.data) {
    const ageRange = row.age;
    if (!ageRange) continue;

    let entry = byAge.get(ageRange);
    if (!entry) {
      entry = { ageRange, videoPlays: 0, p25: 0, p50: 0, p75: 0, p100: 0, byAd: {} };
      byAge.set(ageRange, entry);
    }

    const videoPlays = sumActionValues(row.video_play_actions);
    const p25 = sumActionValues(row.video_p25_watched_actions);
    const p50 = sumActionValues(row.video_p50_watched_actions);
    const p75 = sumActionValues(row.video_p75_watched_actions);
    const p100 = sumActionValues(row.video_p100_watched_actions);

    entry.videoPlays += videoPlays;
    entry.p25 += p25;
    entry.p50 += p50;
    entry.p75 += p75;
    entry.p100 += p100;

    const adId = row.ad_id;
    const campaignId = row.campaign_id;
    if (adId && campaignId) {
      let adEntry = entry.byAd[adId];
      if (!adEntry) {
        adEntry = { campaignId, videoPlays: 0, p25: 0, p50: 0, p75: 0, p100: 0 };
        entry.byAd[adId] = adEntry;
      }
      adEntry.videoPlays += videoPlays;
      adEntry.p25 += p25;
      adEntry.p50 += p50;
      adEntry.p75 += p75;
      adEntry.p100 += p100;
    }
  }

  return Array.from(byAge.values());
}

interface MetaAccountReachRow {
  reach?: string;
}

interface MetaAccountReachInsightsResponse {
  data: MetaAccountReachRow[];
}

/**
 * Alcance REAL y deduplicado del rango [since, until] a nivel de CUENTA completa, en una sola fila
 * (sin time_increment, sin desglose por campaña ni por día) — a diferencia del resto de las
 * métricas de este archivo, el alcance no es una suma: si se pidiera por día o por campaña y se
 * sumaran los resultados, a la misma persona alcanzada más de una vez se la contaría de nuevo cada
 * vez. Por eso se pide UNA sola vez para todo el rango, tal como lo calcula Meta Ads Manager para
 * el total del mes.
 *
 * Limitación conocida (aceptada con Martín): no se puede partir por tipo de Resultado sin perder
 * esta deduplicación, así que el Alcance del Calendario de inversión SIEMPRE muestra este total de
 * cuenta, no cambia según el tipo de Resultado seleccionado (ver InvestmentCalendar.tsx, bloque
 * "Performance de Resultados").
 */
async function fetchMonthlyReach(metaConfig: MetaAdsConfig, since: string, until: string): Promise<number> {
  const accountId = metaConfig.ad_account_id;
  const insights = await fetchMetaGraphApi<MetaAccountReachInsightsResponse>(
    `${accountId}/insights`,
    {
      time_range: JSON.stringify({ since, until }),
      fields: "reach",
    },
    metaConfig.system_user_token
  );
  return Number(insights.data[0]?.reach ?? 0);
}

const FALLBACK_TYPE_LABEL: Record<LeadType, string> = {
  chat: "Objetivo 1 (sin configurar)",
  formLanding: "Objetivo 2 (sin configurar)",
  formMeta: "Objetivo 3 (sin configurar)",
};

/**
 * Presupuesto configurado para el mes de `monthStart` (clave "yyyy-MM" en monthly_budgets) — si
 * ese mes puntual no tiene su propia entrada, cae al viejo monthly_budget único (legado, sin
 * historial), y si tampoco hay eso, no hay presupuesto cargado para ese mes.
 */
function resolveMonthlyBudget(metaConfig: MetaAdsConfig, monthStart: Date): number | null {
  const monthKey = format(monthStart, "yyyy-MM");
  const forMonth = metaConfig.monthly_budgets?.[monthKey];
  if (typeof forMonth === "number") return forMonth;
  return typeof metaConfig.monthly_budget === "number" ? metaConfig.monthly_budget : null;
}

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

  const [insights, accountInfo, audienceSegments, regionSegments, hourlyTotals, videoRetentionByAge, placementSegments, monthlyReach] =
    await Promise.all([
      fetchMetaGraphApi<MetaCampaignInsightsResponse>(
        `${accountId}/insights`,
        {
          // level "ad" (antes "campaign") para poder armar `ads`/byAd por día — a pedido de
          // Martín, para el combo de Anuncio (ver comentario de fetchAudienceSegments arriba,
          // misma limitación de paginación: acá son días × anuncios, no segmentos × anuncios).
          level: "ad",
          time_increment: "1",
          time_range: JSON.stringify({ since, until }),
          fields: "spend,actions,campaign_id,campaign_name,ad_id,ad_name",
          limit: "5000",
        },
        metaConfig.system_user_token
      ),
      fetchMetaGraphApi<{ currency?: string }>(accountId, { fields: "currency" }, metaConfig.system_user_token),
      fetchAudienceSegments(metaConfig, objectives, objectiveEvents, since, until),
      fetchRegionSegments(metaConfig, objectives, objectiveEvents, since, until),
      fetchHourlyTotals(metaConfig, objectives, objectiveEvents, since, until),
      fetchVideoRetentionByAge(metaConfig, since, until),
      fetchPlacementSegments(metaConfig, objectives, objectiveEvents, since, until),
      fetchMonthlyReach(metaConfig, since, until),
    ]);

  const byDate = new Map<string, DailyRealTotals>();
  const rawActionTypeTotals = new Map<string, number>();
  const matchedObjectiveIndexes = new Set<number>();
  // Por Objetivo, cuánto valor total aportó cada action_type real que matcheó este mes — para
  // quedarnos, al final, con el action_type "dominante" de cada Objetivo (ver objectiveActionTypes
  // más abajo). Normalmente es uno solo, pero si el evento configurado matchea de forma laxa más
  // de un action_type real distinto en el mes, nos quedamos con el que más aportó.
  const objectiveActionTypeTotals = new Map<number, Map<string, number>>();
  // Nombre y gasto total del mes de cada campaña/anuncio visto — para armar `campaigns`/`ads`
  // (los combos de los gráficos con filtro) ordenados por relevancia (gasto) al final, sin tener
  // que recorrer `byDate` de nuevo. adCampaignIds guarda a qué campaña pertenece cada anuncio,
  // para que el combo de Anuncio se pueda acotar en cascada a la Campaña elegida.
  const campaignNames = new Map<string, string>();
  const campaignSpendTotals = new Map<string, number>();
  const adNames = new Map<string, string>();
  const adCampaignIds = new Map<string, string>();
  const adSpendTotals = new Map<string, number>();

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
        interactions: 0,
        clicks: 0,
        objectiveInteractions: objectives.map(() => 0),
        objectiveClicks: objectives.map(() => 0),
        byAd: {},
      };
      byDate.set(dateKey, entry);
    }

    const spend = Number(row.spend ?? 0);
    entry.spend += spend;

    // Desglose por anuncio de ESTA fila (spend siempre; objectiveLeads/objectiveSpend recién más
    // abajo, sólo si la fila matchea algún Objetivo) — se arma para TODAS las filas con
    // campaign_id/ad_id, aunque no matcheen ningún Objetivo, porque los combos de Campaña/Anuncio
    // filtran también las barras de Inversión (gasto), no sólo la línea de Resultados.
    const campaignId = row.campaign_id;
    const adId = row.ad_id;
    let adEntry: { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] } | undefined;
    if (campaignId) {
      campaignNames.set(campaignId, row.campaign_name?.trim() || campaignNames.get(campaignId) || campaignId);
      campaignSpendTotals.set(campaignId, (campaignSpendTotals.get(campaignId) ?? 0) + spend);
    }
    if (adId && campaignId) {
      adNames.set(adId, row.ad_name?.trim() || adNames.get(adId) || adId);
      adCampaignIds.set(adId, campaignId);
      adSpendTotals.set(adId, (adSpendTotals.get(adId) ?? 0) + spend);
      adEntry = entry.byAd[adId];
      if (!adEntry) {
        adEntry = { campaignId, spend: 0, objectiveLeads: objectives.map(() => 0), objectiveSpend: objectives.map(() => 0) };
        entry.byAd[adId] = adEntry;
      }
      adEntry.spend += spend;
    }

    const actions = row.actions ?? [];
    for (const action of actions) {
      const value = Number(action.value ?? 0);
      if (value > 0 && action.action_type) {
        rawActionTypeTotals.set(action.action_type, (rawActionTypeTotals.get(action.action_type) ?? 0) + value);
      }
    }

    // Interacciones/Clicks de ESTA fila, matchee o no algún Objetivo — alimentan el total "de toda
    // la cuenta" del bloque Performance de Resultados cuando no hay ningún tipo seleccionado (ver
    // InvestmentCalendar.tsx). Es la única parte de Performance que SÍ es una suma directa de Meta
    // (a diferencia del Alcance — ver fetchMonthlyReach), porque interacciones y clics sí son
    // acumulables fila a fila sin duplicar personas.
    const interactionsValue = findActionValue(actions, "post_engagement");
    const clicksValue = findActionValue(actions, "link_click");
    entry.interactions += interactionsValue;
    entry.clicks += clicksValue;

    // Ver findMatchedObjective arriba: exacto primero, "contiene" después, el primero que
    // matchea en orden se queda con la fila entera.
    const matched = findMatchedObjective(actions, objectiveEvents);
    if (matched) {
      const { index: matchedIndex, value, actionType } = matched;
      entry.objectiveLeads[matchedIndex] = (entry.objectiveLeads[matchedIndex] ?? 0) + value;
      entry.objectiveSpend[matchedIndex] = (entry.objectiveSpend[matchedIndex] ?? 0) + spend;
      entry.objectiveInteractions[matchedIndex] = (entry.objectiveInteractions[matchedIndex] ?? 0) + interactionsValue;
      entry.objectiveClicks[matchedIndex] = (entry.objectiveClicks[matchedIndex] ?? 0) + clicksValue;
      if (adEntry) {
        adEntry.objectiveLeads[matchedIndex] = (adEntry.objectiveLeads[matchedIndex] ?? 0) + value;
        adEntry.objectiveSpend[matchedIndex] = (adEntry.objectiveSpend[matchedIndex] ?? 0) + spend;
      }
      matchedObjectiveIndexes.add(matchedIndex);

      const actionTypeTotals = objectiveActionTypeTotals.get(matchedIndex) ?? new Map<string, number>();
      actionTypeTotals.set(actionType, (actionTypeTotals.get(actionType) ?? 0) + value);
      objectiveActionTypeTotals.set(matchedIndex, actionTypeTotals);

      // Espejo legado: sólo si el Objetivo matcheado es uno de los primeros 3.
      if (matchedIndex < LEAD_TYPES.length) {
        const type = LEAD_TYPES[matchedIndex]!;
        entry.leadsByType[type] += value;
        entry.spendByType[type] += spend;
      }
    }
  }

  const days = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Campañas y anuncios de los combos de Campaña/Anuncio, ordenados por gasto total del mes
  // descendente (los más relevantes primero) — ver el comentario de `campaigns`/`ads` en la
  // interfaz de arriba. `ads` lleva el campaignId de cada anuncio para que el combo de Anuncio se
  // acote en cascada a la Campaña elegida (ver InvestmentTrendChart.tsx y el resto de los charts
  // con filtro).
  const campaigns = Array.from(campaignNames.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => (campaignSpendTotals.get(b.id) ?? 0) - (campaignSpendTotals.get(a.id) ?? 0));
  const ads = Array.from(adNames.entries())
    .map(([id, name]) => ({ id, name, campaignId: adCampaignIds.get(id) ?? "" }))
    .sort((a, b) => (adSpendTotals.get(b.id) ?? 0) - (adSpendTotals.get(a.id) ?? 0));

  // El action_type real dominante de cada Objetivo este mes (mayor valor total acumulado) — ver
  // el comentario de objectiveActionTypes en la interfaz de arriba.
  const objectiveActionTypes: (string | null)[] = objectives.map((_, index) => {
    const totals = objectiveActionTypeTotals.get(index);
    if (!totals || totals.size === 0) return null;
    let bestActionType: string | null = null;
    let bestValue = -1;
    for (const [actionType, value] of totals.entries()) {
      if (value > bestValue) {
        bestActionType = actionType;
        bestValue = value;
      }
    }
    return bestActionType;
  });

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
    monthlyBudget: resolveMonthlyBudget(metaConfig, monthStart),
    typeLabels,
    configuredTypeCount,
    objectiveLabels,
    objectiveActionTypes,
    monthlyReach,
    campaigns,
    ads,
    detectedActionTypes,
    days,
    audienceSegments,
    regionSegments: regionSegmentsComplete,
    hourlyTotals,
    videoRetentionByAge,
    placementSegments,
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
    // byAd vacío a propósito: ver el comentario de RegionSegmentTotals.byAd más arriba (limitación
    // conocida, mismo espíritu que ya tenía este bucket antes del combo de Campaña/Anuncio).
    // reach/impressions/clicks en 0: a diferencia de leads/spend, `days` no trae un total diario de
    // alcance/impresiones contra el cual reconciliar lo no asignado a ninguna provincia, así que
    // este bucket sencillamente no las suma (mismo espíritu que byAd vacío).
    {
      region: UNASSIGNED_REGION_LABEL,
      objectiveLeads: unassignedLeads,
      objectiveSpend: unassignedSpend,
      reach: 0,
      impressions: 0,
      clicks: 0,
      byAd: {},
    },
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
/** Suma dos byAd (mismo shape: campaignId + spend + objectiveLeads/objectiveSpend) entrada por entrada — compartido por los merge de Audience/Region/Hourly/Placement de abajo. Un anuncio que sólo aparece en uno de los dos tramos se conserva tal cual. */
function mergeByAd(
  a: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>,
  b: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>
): Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }> {
  const result: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }> = {};
  for (const [adId, adEntry] of [...Object.entries(a), ...Object.entries(b)]) {
    let existing = result[adId];
    if (!existing) {
      existing = {
        campaignId: adEntry.campaignId,
        spend: 0,
        objectiveLeads: Array.from({ length: adEntry.objectiveLeads.length }, () => 0),
        objectiveSpend: Array.from({ length: adEntry.objectiveSpend.length }, () => 0),
      };
      result[adId] = existing;
    }
    existing.spend += adEntry.spend;
    adEntry.objectiveLeads.forEach((value, i) => {
      existing!.objectiveLeads[i] = (existing!.objectiveLeads[i] ?? 0) + value;
    });
    adEntry.objectiveSpend.forEach((value, i) => {
      existing!.objectiveSpend[i] = (existing!.objectiveSpend[i] ?? 0) + value;
    });
  }
  return result;
}

/** Une las campañas/anuncios de los dos tramos por id — se queda con el orden de `stable` (ya viene ordenado por gasto de la mayor parte del mes) y agrega al final los que sólo aparecieron en `fresh` (hoy), si hay alguna campaña/anuncio nuevo que arrancó justo hoy. Compartido por mergeCampaigns/mergeAds más abajo. */
function mergeNamedEntities<T extends { id: string }>(stable: T[], fresh: T[]): T[] {
  const seen = new Set(stable.map((entity) => entity.id));
  const onlyInFresh = fresh.filter((entity) => !seen.has(entity.id));
  return [...stable, ...onlyInFresh];
}

/** Igual que mergeByAd (ver arriba) pero para AudienceAdBreakdownEntry — reach/impressions no
 *  las tiene el shape compartido, así que AudienceAnalysis.tsx necesita su propio merge (mismo
 *  criterio que mergeRegionByAd, sin clicks). */
function mergeAudienceByAd(
  a: Record<string, AudienceAdBreakdownEntry>,
  b: Record<string, AudienceAdBreakdownEntry>
): Record<string, AudienceAdBreakdownEntry> {
  const result: Record<string, AudienceAdBreakdownEntry> = {};
  for (const [adId, adEntry] of [...Object.entries(a), ...Object.entries(b)]) {
    let existing = result[adId];
    if (!existing) {
      existing = {
        campaignId: adEntry.campaignId,
        spend: 0,
        objectiveLeads: Array.from({ length: adEntry.objectiveLeads.length }, () => 0),
        objectiveSpend: Array.from({ length: adEntry.objectiveSpend.length }, () => 0),
        reach: 0,
        impressions: 0,
      };
      result[adId] = existing;
    }
    existing.spend += adEntry.spend;
    existing.reach += adEntry.reach;
    existing.impressions += adEntry.impressions;
    adEntry.objectiveLeads.forEach((value, i) => {
      existing!.objectiveLeads[i] = (existing!.objectiveLeads[i] ?? 0) + value;
    });
    adEntry.objectiveSpend.forEach((value, i) => {
      existing!.objectiveSpend[i] = (existing!.objectiveSpend[i] ?? 0) + value;
    });
  }
  return result;
}

/** Suma objectiveLeads/objectiveSpend/reach/impressions (y byAd) por segmento (gender+ageRange) entre el tramo estable y el fresco — un segmento que sólo aparece en uno de los dos se conserva tal cual. */
function mergeAudienceSegments(a: AudienceSegmentTotals[], b: AudienceSegmentTotals[]): AudienceSegmentTotals[] {
  const bySegment = new Map<string, AudienceSegmentTotals>();
  for (const segment of [...a, ...b]) {
    const key = `${segment.gender}|${segment.ageRange}`;
    let entry = bySegment.get(key);
    if (!entry) {
      entry = {
        gender: segment.gender,
        ageRange: segment.ageRange,
        objectiveLeads: [...segment.objectiveLeads],
        objectiveSpend: [...segment.objectiveSpend],
        reach: segment.reach,
        impressions: segment.impressions,
        byAd: segment.byAd,
      };
      bySegment.set(key, entry);
    } else {
      segment.objectiveLeads.forEach((value, i) => {
        entry!.objectiveLeads[i] = (entry!.objectiveLeads[i] ?? 0) + value;
      });
      segment.objectiveSpend.forEach((value, i) => {
        entry!.objectiveSpend[i] = (entry!.objectiveSpend[i] ?? 0) + value;
      });
      entry.reach += segment.reach;
      entry.impressions += segment.impressions;
      entry.byAd = mergeAudienceByAd(entry.byAd, segment.byAd);
    }
  }
  return Array.from(bySegment.values());
}

/** Igual que mergeByAd (ver arriba) pero para RegionAdBreakdownEntry — reach/impressions/clicks
 *  no las tiene el shape compartido, así que RegionAnalysis.tsx necesita su propio merge. */
function mergeRegionByAd(
  a: Record<string, RegionAdBreakdownEntry>,
  b: Record<string, RegionAdBreakdownEntry>
): Record<string, RegionAdBreakdownEntry> {
  const result: Record<string, RegionAdBreakdownEntry> = {};
  for (const [adId, adEntry] of [...Object.entries(a), ...Object.entries(b)]) {
    let existing = result[adId];
    if (!existing) {
      existing = {
        campaignId: adEntry.campaignId,
        spend: 0,
        objectiveLeads: Array.from({ length: adEntry.objectiveLeads.length }, () => 0),
        objectiveSpend: Array.from({ length: adEntry.objectiveSpend.length }, () => 0),
        reach: 0,
        impressions: 0,
        clicks: 0,
      };
      result[adId] = existing;
    }
    existing.spend += adEntry.spend;
    existing.reach += adEntry.reach;
    existing.impressions += adEntry.impressions;
    existing.clicks += adEntry.clicks;
    adEntry.objectiveLeads.forEach((value, i) => {
      existing!.objectiveLeads[i] = (existing!.objectiveLeads[i] ?? 0) + value;
    });
    adEntry.objectiveSpend.forEach((value, i) => {
      existing!.objectiveSpend[i] = (existing!.objectiveSpend[i] ?? 0) + value;
    });
  }
  return result;
}

/** Igual que mergeAudienceSegments pero por provincia/región. */
function mergeRegionSegments(a: RegionSegmentTotals[], b: RegionSegmentTotals[]): RegionSegmentTotals[] {
  const byRegion = new Map<string, RegionSegmentTotals>();
  for (const segment of [...a, ...b]) {
    let entry = byRegion.get(segment.region);
    if (!entry) {
      entry = {
        region: segment.region,
        objectiveLeads: [...segment.objectiveLeads],
        objectiveSpend: [...segment.objectiveSpend],
        reach: segment.reach,
        impressions: segment.impressions,
        clicks: segment.clicks,
        byAd: segment.byAd,
      };
      byRegion.set(segment.region, entry);
    } else {
      segment.objectiveLeads.forEach((value, i) => {
        entry!.objectiveLeads[i] = (entry!.objectiveLeads[i] ?? 0) + value;
      });
      segment.objectiveSpend.forEach((value, i) => {
        entry!.objectiveSpend[i] = (entry!.objectiveSpend[i] ?? 0) + value;
      });
      entry.reach += segment.reach;
      entry.impressions += segment.impressions;
      entry.clicks += segment.clicks;
      entry.byAd = mergeRegionByAd(entry.byAd, segment.byAd);
    }
  }
  return Array.from(byRegion.values());
}

/** Igual que mergeRegionSegments pero por ubicación de publicación (placement). */
function mergePlacementSegments(a: PlacementSegmentTotals[], b: PlacementSegmentTotals[]): PlacementSegmentTotals[] {
  const byPlacement = new Map<string, PlacementSegmentTotals>();
  for (const segment of [...a, ...b]) {
    let entry = byPlacement.get(segment.placement);
    if (!entry) {
      entry = {
        placement: segment.placement,
        objectiveLeads: [...segment.objectiveLeads],
        objectiveSpend: [...segment.objectiveSpend],
        byAd: segment.byAd,
      };
      byPlacement.set(segment.placement, entry);
    } else {
      segment.objectiveLeads.forEach((value, i) => {
        entry!.objectiveLeads[i] = (entry!.objectiveLeads[i] ?? 0) + value;
      });
      segment.objectiveSpend.forEach((value, i) => {
        entry!.objectiveSpend[i] = (entry!.objectiveSpend[i] ?? 0) + value;
      });
      entry.byAd = mergeByAd(entry.byAd, segment.byAd);
    }
  }
  return Array.from(byPlacement.values());
}

/** Suma spend/leads por hora entre el tramo estable y el fresco. */
function mergeHourlyTotals(a: HourlyTotals[], b: HourlyTotals[]): HourlyTotals[] {
  const byHour = new Map<number, HourlyTotals>();
  for (const entry of [...a, ...b]) {
    const existing = byHour.get(entry.hour);
    if (!existing) {
      byHour.set(entry.hour, {
        hour: entry.hour,
        spend: entry.spend,
        objectiveLeads: [...entry.objectiveLeads],
        objectiveSpend: [...entry.objectiveSpend],
        byAd: entry.byAd,
      });
    } else {
      existing.spend += entry.spend;
      entry.objectiveLeads.forEach((value, i) => {
        existing.objectiveLeads[i] = (existing.objectiveLeads[i] ?? 0) + value;
      });
      entry.objectiveSpend.forEach((value, i) => {
        existing.objectiveSpend[i] = (existing.objectiveSpend[i] ?? 0) + value;
      });
      existing.byAd = mergeByAd(existing.byAd, entry.byAd);
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
      // byAd propio (no comparte shape con mergeByAd: sin objectiveLeads/objectiveSpend, ver
      // VideoRetentionByAge.byAd) — se suma acá mismo en vez de un helper aparte, sólo lo usa este merge.
      for (const [adId, adEntry] of Object.entries(entry.byAd)) {
        const existingAd = existing.byAd[adId];
        if (!existingAd) {
          existing.byAd[adId] = { ...adEntry };
        } else {
          existingAd.videoPlays += adEntry.videoPlays;
          existingAd.p25 += adEntry.p25;
          existingAd.p50 += adEntry.p50;
          existingAd.p75 += adEntry.p75;
          existingAd.p100 += adEntry.p100;
        }
      }
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
    objectiveActionTypes: data.objectiveActionTypes ?? [],
    monthlyReach: data.monthlyReach ?? 0,
    campaigns: data.campaigns ?? [],
    ads: data.ads ?? [],
    placementSegments: data.placementSegments ?? [],
  };
}

/**
 * Devuelve sólo las campañas/anuncios que tuvieron al menos 1 Resultado (de cualquier Objetivo)
 * en el rango pedido — a pedido de Martín, para que los combos de Campaña/Anuncio no listen
 * campañas/anuncios que gastaron pero no generaron ningún Resultado. Se calcula sobre
 * `days[].byAd`, que ya viene sumado por anuncio para todo el rango (mergeado entre los tramos
 * estable/fresco cuando corresponde) — por eso este filtro se aplica como último paso, después de
 * cualquier merge, y no importa en qué tramo cayeron los leads.
 */
function withResultsOnlyEntities(data: RealInvestmentCalendarData): RealInvestmentCalendarData {
  const adLeadsTotal = new Map<string, number>();
  const campaignLeadsTotal = new Map<string, number>();
  for (const day of data.days) {
    for (const [adId, entry] of Object.entries(day.byAd)) {
      const leads = entry.objectiveLeads.reduce((sum, v) => sum + v, 0);
      if (leads <= 0) continue;
      adLeadsTotal.set(adId, (adLeadsTotal.get(adId) ?? 0) + leads);
      campaignLeadsTotal.set(entry.campaignId, (campaignLeadsTotal.get(entry.campaignId) ?? 0) + leads);
    }
  }
  return {
    ...data,
    campaigns: data.campaigns.filter((c) => (campaignLeadsTotal.get(c.id) ?? 0) > 0),
    ads: data.ads.filter((a) => (adLeadsTotal.get(a.id) ?? 0) > 0),
  };
}

/** Junta objectiveActionTypes de un tramo "estable" (más días, prioridad) con uno "fresco" (hoy) — se queda con el de `stable` cuando lo tiene, y sólo cae a `fresh` para un Objetivo que todavía no había matcheado nada en el tramo estable. */
function mergeObjectiveActionTypes(
  stable: (string | null)[],
  fresh: (string | null)[]
): (string | null)[] {
  const length = Math.max(stable.length, fresh.length);
  return Array.from({ length }, (_, i) => stable[i] ?? fresh[i] ?? null);
}

// mergeCampaigns/mergeAds: ver mergeNamedEntities más arriba (junto a mergeByAd) — ambas listas
// comparten el mismo criterio de unión (orden de `stable` + lo nuevo de `fresh` al final).

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
    placementSegments: mergePlacementSegments(stable.placementSegments, fresh.placementSegments),
    objectiveActionTypes: mergeObjectiveActionTypes(stable.objectiveActionTypes, fresh.objectiveActionTypes),
    // Suma de los dos tramos (ver fetchMonthlyReach) — aproximación aceptada: dentro de cada
    // tramo el alcance está bien deduplicado, pero a alguien alcanzado tanto en el tramo estable
    // (hasta ayer) como hoy se lo cuenta en los dos. El error queda acotado a ese único límite de
    // día en vez de acumularse día a día como pasaría sumando el alcance diario de todo el mes.
    monthlyReach: stable.monthlyReach + fresh.monthlyReach,
    campaigns: mergeNamedEntities(stable.campaigns, fresh.campaigns),
    ads: mergeNamedEntities(stable.ads, fresh.ads),
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
 * El query key lleva un sufijo de versión ("investmentCalendar:v13") — bumpearlo cada vez que
 * cambie la FORMA del objeto que se cachea (se agregue/saque un campo de RealInvestmentCalendarData)
 * fuerza a que las entradas ya cacheadas con la forma vieja se traten como un miss en vez de
 * devolverse tal cual (withSegmentDefaults cubre el crash si igual quedara alguna sin bumpear,
 * pero bumpear es lo que evita mostrar datos faltantes silenciosamente durante el resto del TTL).
 * También conviene bumpearlo cuando cambia DE QUÉ depende el valor de un campo que ya existía
 * (no sólo cuando se agrega uno nuevo) — ej. resolveMonthlyBudget: monthlyBudget pasó a salir de
 * monthly_budgets en vez de monthly_budget, mismo campo, mismo tipo, pero la fuente cambió, así
 * que una entrada ya cacheada con el valor viejo quedaría sirviendo un presupuesto desactualizado
 * en silencio hasta que venza el TTL (hasta 24hs para un mes cerrado) si no se bumpea acá.
 *
 * v9→v10: varios fetch pasaron de level "campaign" a level "ad" (audienceSegments, regionSegments,
 * hourlyTotals, videoRetentionByAge, el desglose diario) para poder armar los combos de Campaña y
 * Anuncio — una entrada vieja en v9 no tiene byAd/ads en ningún lado, así que bumpear evita que
 * esos combos aparezcan vacíos en silencio hasta que venza el TTL. Se agregó placementSegments
 * (antes en mock) y hourlyTotals ahora desglosa por Objetivo (antes un único total combinado).
 *
 * v10→v11: `campaigns`/`ads` ahora se filtran a sólo los que tuvieron al menos 1 Resultado (ver
 * withResultsOnlyEntities) — mismo campo, mismo tipo, pero el criterio de qué entra cambió, así
 * que una entrada vieja en v10 seguiría listando campañas/anuncios sin Resultados en los combos
 * hasta que venza el TTL si no se bumpea acá.
 *
 * v11→v12: RegionSegmentTotals (y su byAd) suman reach/impressions/clicks (ver fetchRegionSegments
 * y RegionAdBreakdownEntry) — campos nuevos, una entrada vieja en v11 no los tiene, así que
 * RegionAnalysis.tsx los mostraría en 0/undefined hasta que venza el TTL si no se bumpea acá.
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
        query: "investmentCalendar:v13",
        params: { accountId, from: format(monthStart, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
      },
      () => fetchRealInvestmentCalendarData(metaConfig, monthStart, lastDataDate)
    );
    return withResultsOnlyEntities(withSegmentDefaults(cached));
  }

  const stableUntil = subDays(lastDataDate, 1);
  if (isBefore(stableUntil, monthStart)) {
    // Día 1 del mes: no hay tramo "hasta ayer" separado, pero se cachea igual (mes en curso: TTL
    // fijo de 3 horas) en vez de pedirle a Meta en cada carga de página.
    const cached = await withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v13",
        params: { accountId, from: format(monthStart, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () => fetchRealInvestmentCalendarData(metaConfig, monthStart, lastDataDate)
    );
    return withResultsOnlyEntities(withSegmentDefaults(cached));
  }

  const [stable, fresh] = await Promise.all([
    withCache(
      {
        clientId,
        source: "meta_ads",
        query: "investmentCalendar:v13",
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
        query: "investmentCalendar:v13",
        params: { accountId, from: format(lastDataDate, "yyyy-MM-dd"), to: format(lastDataDate, "yyyy-MM-dd") },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () => fetchRealInvestmentCalendarData(metaConfig, lastDataDate, lastDataDate)
    ),
  ]);

  return withResultsOnlyEntities(mergeRealInvestmentCalendarData(stable, fresh));
}
