// Traduce el action_type REAL que devuelve la Marketing API de Meta (ver
// lib/reporting/metaInvestmentData.ts — objectiveActionTypes) al nombre que Meta Ads Manager
// muestra para ese tipo de Resultado, en español — a pedido de Martín: quiere que el nombre de
// cada scorecard sea "el real que se ve en la interfaz de Meta", no el label que se tipea a mano
// al cargar el Objetivo en el Admin.
//
// LA MARKETING API NO DEVUELVE ESTE NOMBRE TRADUCIDO: el array "actions" de Insights sólo trae el
// action_type interno (ej. "onsite_conversion.lead_grouped"), nunca el texto que arma el
// frontend de Ads Manager para la columna "Resultados". Esta tabla es la traducción manual de los
// action_type MÁS COMUNES (leads, mensajería, tráfico, interacción, video, compras, apps, eventos)
// según la terminología estándar de Meta — no viene de un endpoint, así que puede haber algún
// action_type que todavía no esté acá.
//
// Fallback: si el action_type no está en esta tabla (o es null porque el Objetivo no matcheó nada
// este mes), se usa el label que se tipeó a mano en el Admin — eso además cubre el caso de las
// conversiones personalizadas ("offsite_conversion.custom.<id o nombre del pixel>"), donde el
// nombre real en Meta es el que el cliente le puso a esa conversión en Events Manager: no hay
// forma de recuperar ESE nombre desde la Marketing API sin pedirle a otro endpoint (Custom
// Conversions) el nombre por ID, así que por ahora se queda con el label del Admin.
//
// Cuando aparezca un action_type nuevo que convenga agregar acá, el diagnóstico
// "detectedActionTypes" (mismo archivo que objectiveActionTypes) ya lo muestra en el Admin con su
// conteo real del mes — de ahí se puede copiar el string exacto.
const META_ACTION_TYPE_LABELS: Record<string, string> = {
  // Clientes potenciales (leads)
  lead: "Clientes potenciales",
  "onsite_conversion.lead_grouped": "Clientes potenciales",
  "offsite_conversion.fb_pixel_lead": "Clientes potenciales",
  "onsite_conversion.lead": "Clientes potenciales",

  // Mensajería (Messenger / Instagram / WhatsApp)
  "onsite_conversion.messaging_conversation_started_7d": "Conversaciones de Messenger iniciadas",
  "onsite_conversion.messaging_first_reply": "Nuevas conversaciones de mensajería",
  "onsite_conversion.messaging_block": "Conversaciones de mensajería bloqueadas",
  "onsite_conversion.total_messaging_connection": "Conexiones de mensajería",
  "onsite_conversion.messaging_user_depth_2_message_send": "Mensajes enviados en la conversación",

  // Tráfico / navegación
  link_click: "Clics en el enlace",
  landing_page_view: "Vistas de la página de destino",
  outbound_click: "Clics salientes",

  // Interacción
  post_engagement: "Interacción con la publicación",
  page_engagement: "Interacción con la página",
  like: "Me gusta de la página",
  "onsite_conversion.post_save": "Publicaciones guardadas",
  comment: "Comentarios",
  post_reaction: "Reacciones a la publicación",

  // Video
  video_view: "Reproducciones de video",
  video_play_actions: "Reproducciones de video",

  // Compras / catálogo
  purchase: "Compras",
  omni_purchase: "Compras",
  "offsite_conversion.fb_pixel_purchase": "Compras",
  add_to_cart: "Artículos agregados al carrito",
  initiate_checkout: "Pagos iniciados",

  // Apps
  app_install: "Instalaciones de la app",
  mobile_app_install: "Instalaciones de la app",

  // Eventos / registros
  rsvp: "Respuestas a eventos",
  complete_registration: "Registros completados",
  "offsite_conversion.fb_pixel_complete_registration": "Registros completados",
};

/**
 * Nombre real del tipo de Resultado, como lo muestra Meta Ads Manager — o `fallbackLabel` (el
 * label cargado a mano en el Admin) si `actionType` es null o no está en META_ACTION_TYPE_LABELS.
 */
export function resolveResultLabel(actionType: string | null, fallbackLabel: string): string {
  if (!actionType) return fallbackLabel;
  const key = actionType.trim().toLowerCase();
  return META_ACTION_TYPE_LABELS[key] ?? fallbackLabel;
}

// Traduce publisher_platform + platform_position (el breakdown de "ubicación" de Meta) al nombre
// en español que se muestra en PlacementAnalysis.tsx ("Dónde se muestran los anuncios") — mismo
// espíritu que META_ACTION_TYPE_LABELS arriba: Meta no devuelve un nombre "lindo" en este
// breakdown, sólo los valores internos (ej. "facebook"/"feed", "instagram"/"story"), así que hay
// que armar el label a mano. Cubre las combinaciones más comunes; una combinación nueva que Meta
// agregue cae al fallback (Plataforma + Posición, en Title Case) en vez de romper.
const PUBLISHER_PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  audience_network: "Audience Network",
  messenger: "Messenger",
};

const PLATFORM_POSITION_LABEL: Record<string, string> = {
  feed: "Feed",
  stream: "Feed",
  profile_feed: "Feed de perfil",
  video_feeds: "Feed de videos",
  right_hand_column: "Columna derecha",
  instant_article: "Artículos instantáneos",
  marketplace: "Marketplace",
  story: "Stories",
  facebook_reels: "Reels",
  facebook_reels_overlay: "Reels (superposición)",
  reels: "Reels",
  instream_video: "Video in-stream",
  search: "Búsqueda",
  explore: "Explorar",
  explore_home: "Explorar",
  ig_search: "Búsqueda",
  shop: "Shop",
  classic: "Clásico",
  rewarded_video: "Video recompensado",
  messenger_home: "Inicio",
  sponsored_messages: "Mensajes patrocinados",
  group_home: "Grupos",
};

function titleCaseFallback(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Nombre en español de una ubicación de publicación, a partir de publisher_platform +
 * platform_position (ver fetchPlacementSegments en metaInvestmentData.ts). Caso especial:
 * Audience Network se muestra sin la posición (salvo "video recompensado", que Martín pidió
 * distinguir porque suele traer clics sin intención real — mismo criterio que tenía el mock
 * PLACEMENTS de lib/reporting/mockInvestmentCalendar.ts).
 */
export function placementLabel(publisherPlatform: string, platformPosition: string): string {
  if (publisherPlatform === "audience_network") {
    return platformPosition === "rewarded_video" ? "Audience Network (video recompensado)" : "Audience Network";
  }
  const platform = PUBLISHER_PLATFORM_LABEL[publisherPlatform] ?? titleCaseFallback(publisherPlatform);
  const position = PLATFORM_POSITION_LABEL[platformPosition] ?? titleCaseFallback(platformPosition);
  return `${platform} ${position}`;
}
