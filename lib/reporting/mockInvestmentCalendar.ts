// Datos de prueba para el calendario de inversión (ver
// components/admin/reporting/InvestmentCalendar.tsx). Los valores por día
// son determinísticos (mismo día → siempre el mismo valor, sin
// Math.random sin seed) para que no haya mismatches de hidratación entre
// server y cliente. Cuando se conecte a datos reales, estas funciones se
// reemplazan por un fetch a la Marketing API / la fuente de leads que
// corresponda (mismo patrón que lib/meta-ads/insights.ts) y el componente
// de UI no cambia.

// PRNG determinístico simple (mulberry32), sembrado con año+mes+día (+ un
// offset para no correlacionar 1:1 el ruido de leads con el de spend), para
// que cada día tenga un valor estable entre renders y recargas de página.
function seededRandom(seed: number): number {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function daySeed(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** Gasto diario de prueba: base + ruido determinístico + un empujón los viernes/sábados (simula más actividad de campaña el fin de semana). */
export function mockDailySpend(date: Date): number {
  const base = 80;
  const noise = seededRandom(daySeed(date)) * 140;
  const weekday = date.getDay(); // 0 = domingo
  const weekendBoost = weekday === 5 || weekday === 6 ? 40 : 0;
  return Math.round(base + noise + weekendBoost);
}

// Leads diarios de prueba: derivados del gasto del día contra un CPL
// objetivo, con su propio ruido (offset de seed distinto al de spend) para
// que el costo por lead varíe día a día de forma realista en vez de quedar
// perfectamente constante.
const TARGET_CPL = 8;

export function mockDailyLeads(date: Date): number {
  const spend = mockDailySpend(date);
  const noise = 0.7 + seededRandom(daySeed(date) + 500_000) * 0.6; // entre 0.7x y 1.3x
  return Math.max(0, Math.round((spend / TARGET_CPL) * noise));
}

// Los leads llegan por tres campañas separadas (cada una con su propia
// landing y su propio presupuesto): una que apunta a iniciar un chat, una
// que apunta a enviar un formulario alojado en la landing propia, y una
// tercera que apunta a un formulario nativo de Meta (lead ads). Por ahora
// se simula con una proporción fija — al conectar datos reales,
// mockDailyLeadsByType/mockDailySpendByType se reemplazan por el desglose
// real por campaña (misma cantidad total que mockDailyLeads/mockDailySpend,
// pero repartida como corresponda día a día) y el resto del componente no
// cambia.
export type LeadType = "chat" | "formLanding" | "formMeta";

export const LEAD_TYPES: LeadType[] = ["chat", "formLanding", "formMeta"];

export const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  chat: "Iniciaron chat",
  formLanding: "Formulario Landing",
  formMeta: "Formulario Meta",
};

export const LEAD_TYPE_COLOR: Record<LeadType, string> = {
  chat: "#0284c7", // sky-600 — misma familia que la métrica de Leads existente
  formLanding: "#7c3aed", // violet-600
  formMeta: "#f97316", // orange-500
};

/**
 * Paleta de colores para los Objetivos DINÁMICOS del Calendario de inversión — ver
 * components/admin/reporting/InvestmentCalendar.tsx y LeadsByTypeTrendChart.tsx. A diferencia de
 * LEAD_TYPE_COLOR (fijo a 3 slots, usado sólo por CampaignAnalysis/PlacementAnalysis/AudienceAnalysis,
 * que siguen en mock), esta paleta cubre CUALQUIER cantidad de Objetivos que el cliente tenga
 * cargados en el Admin (MetaAdsConfig.objectives no tiene límite). Los primeros 3 colores son los
 * mismos que LEAD_TYPE_COLOR para que un cliente con exactamente 3 Objetivos vea siempre el mismo
 * color en todos lados; de ahí en más se cicla la paleta (objectiveColor hace el módulo).
 */
export const OBJECTIVE_COLOR_PALETTE: string[] = [
  "#0284c7", // sky-600
  "#7c3aed", // violet-600
  "#f97316", // orange-500
  "#e11d48", // rose-600
  "#059669", // emerald-600
  "#ca8a04", // yellow-600
  "#db2777", // pink-600
  "#4f46e5", // indigo-600
];

export function objectiveColor(index: number): string {
  return OBJECTIVE_COLOR_PALETTE[index % OBJECTIVE_COLOR_PALETTE.length]!;
}

const LEAD_TYPE_SHARE: Record<LeadType, number> = { chat: 0.5, formLanding: 0.25, formMeta: 0.25 };

function splitByShare(total: number): Record<LeadType, number> {
  const chat = Math.round(total * LEAD_TYPE_SHARE.chat);
  const formLanding = Math.round(total * LEAD_TYPE_SHARE.formLanding);
  return { chat, formLanding, formMeta: total - chat - formLanding };
}

export function mockDailyLeadsByType(date: Date): Record<LeadType, number> {
  return splitByShare(mockDailyLeads(date));
}

export function mockDailySpendByType(date: Date): Record<LeadType, number> {
  return splitByShare(mockDailySpend(date));
}

export const MOCK_MONTHLY_BUDGET = 6000;
export const MOCK_CURRENCY = "USD";

// Análisis de campañas (ver components/admin/reporting/CampaignAnalysis.tsx): cada tipo de
// campaña se abre en 2 campañas individuales con nombre propio. Por ahora se simula repartiendo
// el total mensual de leads/inversión de cada tipo entre sus campañas con una proporción fija —
// leadShare y spendShare son DISTINTOS a propósito (una campaña puede traer más leads pero no ser
// la más barata) para que el ranking y el CPL varíen de forma realista entre campañas de un mismo
// tipo. Al conectar Meta Ads real, esto se reemplaza por el desglose real por campaña (mismo id
// que el de la Marketing API) y el resto del componente no cambia.
export type CampaignState = "activa" | "pausada";

export interface Campaign {
  id: string;
  name: string;
  type: LeadType;
  /** Share del total mensual de LEADS del tipo que le corresponde a esta campaña (suma 1 por tipo). */
  leadShare: number;
  /** Share del total mensual de INVERSIÓN del tipo que le corresponde a esta campaña (suma 1 por tipo). */
  spendShare: number;
  state: CampaignState;
}

export const CAMPAIGNS: Campaign[] = [
  { id: "chat-prospeccion", name: "Chat · Prospección Búsqueda", type: "chat", leadShare: 0.62, spendShare: 0.54, state: "activa" },
  { id: "chat-remarketing", name: "Chat · Remarketing", type: "chat", leadShare: 0.38, spendShare: 0.46, state: "pausada" },
  { id: "landing-marca", name: "Landing · Búsqueda Marca", type: "formLanding", leadShare: 0.57, spendShare: 0.46, state: "activa" },
  { id: "landing-generica", name: "Landing · Búsqueda Genérica", type: "formLanding", leadShare: 0.43, spendShare: 0.54, state: "pausada" },
  { id: "meta-feed", name: "Meta · Conversión Feed", type: "formMeta", leadShare: 0.53, spendShare: 0.47, state: "pausada" },
  { id: "meta-stories", name: "Meta · Stories Retargeting", type: "formMeta", leadShare: 0.47, spendShare: 0.53, state: "pausada" },
];

export interface CampaignTotals {
  id: string;
  name: string;
  type: LeadType;
  state: CampaignState;
  leads: number;
  spend: number;
  cpl: number | null;
}

/** Deriva los totales mensuales por campaña a partir de los totales ya calculados por tipo (mismos números que se ven en el resto de la página — nunca se recalculan desde cero). */
export function campaignMonthlyTotals(
  monthLeadsByType: Record<LeadType, number>,
  monthSpendByType: Record<LeadType, number>
): CampaignTotals[] {
  return CAMPAIGNS.map((campaign) => {
    const leads = Math.round(monthLeadsByType[campaign.type] * campaign.leadShare);
    const spend = Math.round(monthSpendByType[campaign.type] * campaign.spendShare);
    return {
      id: campaign.id,
      name: campaign.name,
      type: campaign.type,
      state: campaign.state,
      leads,
      spend,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
}

// Análisis de "dónde se muestran los anuncios" (ver components/admin/reporting/
// PlacementAnalysis.tsx): desglose del mismo total mensual (monthLeads/monthTotal, sin distinguir
// tipo ni campaña) por ubicación de publicación — Feed, Stories, Reels, video in-stream y Audience
// Network. leadShare reparte los leads del mes entre ubicaciones (suma 1); relativeCpl es un
// multiplicador de qué tan cara es esa ubicación relativo a las demás (>1 = más cara), usado para
// repartir la inversión de forma proporcional (ver placementMonthlyTotals) — así Audience Network
// (sobre todo el formato de video recompensado, que trae clics sin intención real) termina con el
// CPL más alto, como en una cuenta real. Al conectar Meta Ads real, se reemplaza por el desglose
// real por "publisher_platform" + "platform_position" de la Marketing API y el resto no cambia.
export interface Placement {
  id: string;
  name: string;
  /** Share del total mensual de LEADS que le corresponde a esta ubicación (suma 1 entre todas). */
  leadShare: number;
  /** Qué tan cara es esta ubicación relativo a las demás (1 = precio "típico"; a mayor valor, mayor CPL resultante). */
  relativeCpl: number;
  /** Clics promedio que le toma a esta ubicación generar 1 lead — a mayor valor, más "ruido" de clics sin intención real (típico de Audience Network, sobre todo el formato de video recompensado). */
  clicksPerLead: number;
}

export const PLACEMENTS: Placement[] = [
  { id: "fb-reels", name: "Facebook Reels", leadShare: 0.16, relativeCpl: 0.62, clicksPerLead: 3.2 },
  { id: "fb-feed", name: "Facebook Feed", leadShare: 0.15, relativeCpl: 0.74, clicksPerLead: 3.6 },
  { id: "ig-feed", name: "Instagram Feed", leadShare: 0.14, relativeCpl: 0.82, clicksPerLead: 3.9 },
  { id: "fb-stories", name: "Facebook Stories", leadShare: 0.12, relativeCpl: 0.88, clicksPerLead: 4.1 },
  { id: "ig-reels", name: "Instagram Reels", leadShare: 0.13, relativeCpl: 1.02, clicksPerLead: 4.5 },
  { id: "ig-stories", name: "Instagram Stories", leadShare: 0.11, relativeCpl: 1.15, clicksPerLead: 5.0 },
  { id: "video-instream", name: "Video in-stream", leadShare: 0.09, relativeCpl: 1.9, clicksPerLead: 7.5 },
  { id: "audience-network", name: "Audience Network", leadShare: 0.07, relativeCpl: 2.6, clicksPerLead: 14 },
  {
    id: "audience-network-rewarded",
    name: "Audience Network (video recompensado)",
    leadShare: 0.03,
    relativeCpl: 4.3,
    clicksPerLead: 45,
  },
];

export interface PlacementTotals {
  id: string;
  name: string;
  leads: number;
  clicks: number;
  spend: number;
  cpl: number | null;
}

/** Deriva los totales mensuales por ubicación a partir del total mensual de leads e inversión (los mismos números que se ven en el resto de la página) — leadShare reparte los leads, clicksPerLead deriva los clics a partir de esos leads, y junto con relativeCpl se reparte la inversión de forma que el CPL resultante de cada ubicación sea proporcional a relativeCpl. */
export function placementMonthlyTotals(monthLeads: number, monthTotal: number): PlacementTotals[] {
  const weights = PLACEMENTS.map((p) => p.leadShare * p.relativeCpl);
  const sumWeights = weights.reduce((sum, w) => sum + w, 0) || 1;

  return PLACEMENTS.map((placement, index) => {
    const leads = Math.round(monthLeads * placement.leadShare);
    const spendShare = (weights[index] ?? 0) / sumWeights;
    const spend = Math.round(monthTotal * spendShare);
    return {
      id: placement.id,
      name: placement.name,
      leads,
      clicks: Math.round(leads * placement.clicksPerLead),
      spend,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
}


// Desglose demográfico ("Quién responde a los anuncios", ver components/admin/reporting/
// AudienceAnalysis.tsx): leads, inversión y CPL del mes por género y rango etario, filtrable por
// tipo de campaña (mismo LeadType que el resto del calendario) — cada tipo tiene su propia mezcla
// demográfica: "Iniciaron chat" perfila más joven y parejo entre géneros (alguien navegando que
// arranca una conversación), "Formulario Landing" concentra volumen en mujeres de 45-64 (alta
// intención, como en una cuenta real), y "Formulario Meta" (lead ads nativos) es algo más joven y
// parejo que Landing, típico de un formato que alcanza feed en vez de búsqueda directa. relativeCpl
// es intrínseco al segmento (edad/género) y se mantiene igual entre los 3 tipos — sólo cambia cómo
// se reparten los leads. Se deriva del mismo monthLeadsByType/monthSpendByType que el resto de la
// página (nunca se recalcula desde cero). Al conectar datos reales, se reemplaza por el desglose
// real de "age" + "gender" de la Marketing API / Insights API y el resto no cambia.
export type Gender = "mujeres" | "hombres";

export const AGE_RANGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export interface DemographicSegment {
  id: string;
  gender: Gender;
  ageRange: AgeRange;
  /** Qué tan cara es esta franja relativo a las demás (1 = precio "típico"), intrínseco al segmento — igual entre los 3 tipos de campaña, sólo cambia cómo se reparten los leads (ver DEMOGRAPHIC_LEAD_SHARE). */
  relativeCpl: number;
}

export const DEMOGRAPHIC_SEGMENTS: DemographicSegment[] = [
  { id: "mujeres-18-24", gender: "mujeres", ageRange: "18-24", relativeCpl: 3.2 },
  { id: "hombres-18-24", gender: "hombres", ageRange: "18-24", relativeCpl: 3.6 },
  { id: "mujeres-25-34", gender: "mujeres", ageRange: "25-34", relativeCpl: 1.9 },
  { id: "hombres-25-34", gender: "hombres", ageRange: "25-34", relativeCpl: 2.1 },
  { id: "mujeres-35-44", gender: "mujeres", ageRange: "35-44", relativeCpl: 1.45 },
  { id: "hombres-35-44", gender: "hombres", ageRange: "35-44", relativeCpl: 2.3 },
  { id: "mujeres-45-54", gender: "mujeres", ageRange: "45-54", relativeCpl: 1.0 },
  { id: "hombres-45-54", gender: "hombres", ageRange: "45-54", relativeCpl: 1.5 },
  { id: "mujeres-55-64", gender: "mujeres", ageRange: "55-64", relativeCpl: 0.95 },
  { id: "hombres-55-64", gender: "hombres", ageRange: "55-64", relativeCpl: 1.48 },
  { id: "mujeres-65+", gender: "mujeres", ageRange: "65+", relativeCpl: 1.25 },
  { id: "hombres-65+", gender: "hombres", ageRange: "65+", relativeCpl: 2.35 },
];

// Share del total mensual de LEADS de cada tipo que le corresponde a cada segmento (suma 1 por
// tipo, entre los 12 segmentos).
const DEMOGRAPHIC_LEAD_SHARE: Record<LeadType, Record<string, number>> = {
  chat: {
    "mujeres-18-24": 0.02,
    "hombres-18-24": 0.02,
    "mujeres-25-34": 0.07,
    "hombres-25-34": 0.06,
    "mujeres-35-44": 0.14,
    "hombres-35-44": 0.1,
    "mujeres-45-54": 0.16,
    "hombres-45-54": 0.12,
    "mujeres-55-64": 0.13,
    "hombres-55-64": 0.11,
    "mujeres-65+": 0.04,
    "hombres-65+": 0.03,
  },
  formLanding: {
    "mujeres-18-24": 0.005,
    "hombres-18-24": 0.005,
    "mujeres-25-34": 0.045,
    "hombres-25-34": 0.04,
    "mujeres-35-44": 0.15,
    "hombres-35-44": 0.075,
    "mujeres-45-54": 0.21,
    "hombres-45-54": 0.1,
    "mujeres-55-64": 0.165,
    "hombres-55-64": 0.125,
    "mujeres-65+": 0.05,
    "hombres-65+": 0.03,
  },
  formMeta: {
    "mujeres-18-24": 0.015,
    "hombres-18-24": 0.02,
    "mujeres-25-34": 0.08,
    "hombres-25-34": 0.075,
    "mujeres-35-44": 0.13,
    "hombres-35-44": 0.11,
    "mujeres-45-54": 0.15,
    "hombres-45-54": 0.13,
    "mujeres-55-64": 0.1,
    "hombres-55-64": 0.09,
    "mujeres-65+": 0.055,
    "hombres-65+": 0.045,
  },
};

export interface DemographicTotals {
  id: string;
  gender: Gender;
  ageRange: AgeRange;
  leads: number;
  spend: number;
  cpl: number | null;
}

/** Deriva los totales mensuales por género+rango etario para UN tipo de campaña, a partir de los totales ya calculados por tipo (monthLeadsByType[type]/monthSpendByType[type] — los mismos números que se ven en el resto de la página). */
export function demographicMonthlyTotals(type: LeadType, typeLeads: number, typeSpend: number): DemographicTotals[] {
  const share = DEMOGRAPHIC_LEAD_SHARE[type];
  const weights = DEMOGRAPHIC_SEGMENTS.map((segment) => (share[segment.id] ?? 0) * segment.relativeCpl);
  const sumWeights = weights.reduce((sum, w) => sum + w, 0) || 1;

  return DEMOGRAPHIC_SEGMENTS.map((segment, index) => {
    const leads = Math.round(typeLeads * (share[segment.id] ?? 0));
    const spendShare = (weights[index] ?? 0) / sumWeights;
    const spend = Math.round(typeSpend * spendShare);
    return {
      id: segment.id,
      gender: segment.gender,
      ageRange: segment.ageRange,
      leads,
      spend,
      cpl: leads > 0 ? spend / leads : null,
    };
  });
}
