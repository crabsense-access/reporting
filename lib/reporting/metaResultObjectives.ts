// Objetivos del Calendario de inversión derivados AUTOMÁTICAMENTE de los tipos de Resultado de
// Meta — a pedido de Martín: los objetivos ya no se cargan a mano en el Admin (la sección
// "Objetivos" de MetaAdsConfigForm se sacó), se toman de lo que cada conjunto de anuncios
// optimiza en Meta, que es exactamente lo que Ads Manager muestra en la columna "Resultados".
//
// Cómo: se piden los conjuntos de anuncios con gasto en el período (insights level "adset") y,
// para cada uno, su optimization_goal + promoted_object. Eso se traduce al action_type que Meta
// cuenta como Resultado (ej. CONVERSATIONS → onsite_conversion.messaging_conversation_started_7d).
// Los action_type resultantes se deduplican y se devuelven como MetaAdsObjective[] — el mismo
// shape que antes salía del Admin — así el resto de metaInvestmentData.ts no cambia.
//
// Orden: por "especificidad" del Resultado (conversiones/leads/mensajes antes que clics o
// interacción). Importa porque findMatchedObjective asigna cada fila (anuncio × día) al PRIMER
// objetivo cuyo evento aparece en sus actions — un anuncio de mensajes también tiene link_click,
// y no queremos que caiga en "Clics en el enlace" si otro conjunto optimiza por clics.

import { fetchMetaGraphApi } from "@/lib/meta-ads/client";
import { resolveResultLabel } from "@/lib/reporting/metaResultLabels";
import type { MetaAdsConfig, MetaAdsObjective } from "@/lib/types";

interface AdsetInsightsResponse {
  data: { adset_id?: string; spend?: string }[];
  paging?: { next?: string };
}

interface AdsetInfo {
  id: string;
  optimization_goal?: string;
  destination_type?: string;
  promoted_object?: {
    custom_event_type?: string;
    custom_conversion_id?: string;
    pixel_id?: string;
  };
}

const PIXEL_EVENT_ACTION_TYPE: Record<string, string> = {
  LEAD: "offsite_conversion.fb_pixel_lead",
  PURCHASE: "offsite_conversion.fb_pixel_purchase",
  COMPLETE_REGISTRATION: "offsite_conversion.fb_pixel_complete_registration",
  ADD_TO_CART: "offsite_conversion.fb_pixel_add_to_cart",
  INITIATED_CHECKOUT: "offsite_conversion.fb_pixel_initiate_checkout",
  ADD_PAYMENT_INFO: "offsite_conversion.fb_pixel_add_payment_info",
  CONTENT_VIEW: "offsite_conversion.fb_pixel_view_content",
  SEARCH: "offsite_conversion.fb_pixel_search",
  CONTACT: "offsite_conversion.fb_pixel_contact",
  SUBMIT_APPLICATION: "offsite_conversion.fb_pixel_submit_application",
  SCHEDULE: "offsite_conversion.fb_pixel_schedule",
};

/** action_type que Meta cuenta como "Resultado" para un conjunto de anuncios, o null si su objetivo no genera una acción contable (alcance, impresiones, etc.). */
export function resultActionTypeForAdset(adset: AdsetInfo): string | null {
  const goal = (adset.optimization_goal ?? "").toUpperCase();
  const promoted = adset.promoted_object ?? {};

  switch (goal) {
    case "CONVERSATIONS":
      return "onsite_conversion.messaging_conversation_started_7d";
    case "LEAD_GENERATION":
    case "QUALITY_LEAD":
      return "onsite_conversion.lead_grouped";
    case "OFFSITE_CONVERSIONS":
    case "VALUE":
    case "QUALITY_CALL": {
      if (promoted.custom_conversion_id) return `offsite_conversion.custom.${promoted.custom_conversion_id}`;
      const eventType = (promoted.custom_event_type ?? "").toUpperCase();
      if (eventType && PIXEL_EVENT_ACTION_TYPE[eventType]) return PIXEL_EVENT_ACTION_TYPE[eventType]!;
      if (eventType) return `offsite_conversion.fb_pixel_${eventType.toLowerCase()}`;
      return goal === "VALUE" ? "offsite_conversion.fb_pixel_purchase" : null;
    }
    case "LINK_CLICKS":
      return "link_click";
    case "LANDING_PAGE_VIEWS":
      return "landing_page_view";
    case "POST_ENGAGEMENT":
    case "ENGAGED_USERS":
      return "post_engagement";
    case "PAGE_LIKES":
      return "like";
    case "THRUPLAY":
    case "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS":
      return "video_view";
    case "APP_INSTALLS":
      return "mobile_app_install";
    case "EVENT_RESPONSES":
      return "rsvp";
    default:
      return null;
  }
}

/** Menor = más específico (va primero en la lista de objetivos, ver comentario de arriba). */
function specificityRank(actionType: string): number {
  if (actionType.startsWith("offsite_conversion.") || actionType.includes("lead") || actionType.includes("purchase")) return 0;
  if (actionType.startsWith("onsite_conversion.messaging")) return 1;
  if (actionType === "mobile_app_install" || actionType === "rsvp") return 2;
  if (actionType === "landing_page_view") return 3;
  if (actionType === "link_click") return 4;
  if (actionType === "video_view") return 5;
  return 6; // post_engagement, like, etc.
}

/**
 * Objetivos (action_type + nombre real en Meta) de los conjuntos de anuncios que tuvieron gasto
 * entre `since` y `until` (yyyy-MM-dd). Vacío si ninguno optimiza por una acción contable.
 */
export async function fetchResultObjectives(
  metaConfig: MetaAdsConfig,
  since: string,
  until: string
): Promise<MetaAdsObjective[]> {
  const insights = await fetchMetaGraphApi<AdsetInsightsResponse>(
    `${metaConfig.ad_account_id}/insights`,
    {
      level: "adset",
      time_range: JSON.stringify({ since, until }),
      fields: "adset_id,spend",
      limit: "500",
    },
    metaConfig.system_user_token
  );

  const spendByAdset = new Map<string, number>();
  for (const row of insights.data ?? []) {
    if (!row.adset_id) continue;
    spendByAdset.set(row.adset_id, (spendByAdset.get(row.adset_id) ?? 0) + Number(row.spend ?? 0));
  }
  if (spendByAdset.size === 0) return [];

  const adsetIds = Array.from(spendByAdset.keys());
  const adsets: AdsetInfo[] = [];
  // /?ids= acepta hasta 50 ids por pedido.
  for (let i = 0; i < adsetIds.length; i += 50) {
    const chunk = adsetIds.slice(i, i + 50);
    const response = await fetchMetaGraphApi<Record<string, AdsetInfo>>(
      "",
      { ids: chunk.join(","), fields: "optimization_goal,destination_type,promoted_object" },
      metaConfig.system_user_token
    );
    adsets.push(...Object.values(response));
  }

  const spendByActionType = new Map<string, number>();
  for (const adset of adsets) {
    const actionType = resultActionTypeForAdset(adset);
    if (!actionType) continue;
    spendByActionType.set(actionType, (spendByActionType.get(actionType) ?? 0) + (spendByAdset.get(adset.id) ?? 0));
  }

  const ordered = Array.from(spendByActionType.keys()).sort(
    (a, b) => specificityRank(a) - specificityRank(b) || (spendByActionType.get(b) ?? 0) - (spendByActionType.get(a) ?? 0)
  );

  return Promise.all(
    ordered.map(async (actionType) => ({ event: actionType, label: await labelForActionType(actionType, metaConfig) }))
  );
}

/** Nombre real del Resultado — para conversiones personalizadas, el nombre que tiene en Events Manager. */
async function labelForActionType(actionType: string, metaConfig: MetaAdsConfig): Promise<string> {
  const customPrefix = "offsite_conversion.custom.";
  if (actionType.startsWith(customPrefix)) {
    const id = actionType.slice(customPrefix.length);
    try {
      const conversion = await fetchMetaGraphApi<{ name?: string }>(id, { fields: "name" }, metaConfig.system_user_token);
      if (conversion.name) return conversion.name;
    } catch {
      // Sin permiso sobre la conversión personalizada: queda el nombre genérico.
    }
    return "Conversión personalizada";
  }
  return resolveResultLabel(actionType, actionType);
}
