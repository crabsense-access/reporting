import { getGoogleAdsClient } from "@/lib/google-ads/client";
import type {
  GoogleAdsBreakdown,
  GoogleAdsBreakdownRow,
  GoogleAdsDemographicRow,
  GoogleAdsNetworkRow,
} from "@/lib/google-ads/filter";

// Datos del mes del reporte de Google Ads (ver components/admin/reporting/GoogleAdsReport.tsx):
// totales de la cuenta + compras/facturación + gasto de las campañas de WhatsApp (para el ROAS
// WhatsApp, que se calcula contra la facturación de WhatsApp cargada a mano en el Google Sheet) +
// evolución diaria + el desglose diario por Campaña / Grupo de anuncios / Anuncio que usan los
// filtros de los bloques Resultados y Facturación (ver lib/google-ads/filter.ts).
//
// Cada nivel del desglose sale de su propio recurso de Google Ads (campaign / ad_group /
// ad_group_ad) y NO se deriva sumando el nivel de abajo: hay campañas sin grupos de anuncios ni
// anuncios (Performance Max usa asset groups), así que filtrar por Campaña con los datos de
// `campaign` es lo único que da el total real de esa campaña.

export interface GoogleAdsMonthlySummary {
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
  /** Conversiones de categoría PURCHASE (columna "Conversiones" de Google Ads, sólo acciones primarias). */
  purchases: number;
  /** Valor de esas conversiones de compra. */
  revenue: number;
  /** Gasto de las campañas de WhatsApp / Conversaciones (ver WHATSAPP_CAMPAIGN_PATTERN). */
  whatsappSpend: number;
  whatsappCampaigns: string[];
  /** Por día del período (yyyy-MM-dd), toda la cuenta. Sólo días con datos. */
  daily: { date: string; spend: number; purchases: number; revenue: number }[];
  /** Totales por campaña (con inversión o compras en el período), ordenados por inversión. */
  campaigns: { name: string; spend: number; impressions: number; clicks: number; purchases: number; revenue: number }[];
  /** Desglose diario por Campaña / Grupo de anuncios / Anuncio, para los filtros. */
  breakdown: GoogleAdsBreakdown;
  /** true si las consultas del desglose fallaron (breakdown vacío): el route NO lo cachea. */
  breakdownFailed: boolean;
}

/**
 * Completa con defaults vacíos los campos que pueden faltar en una entrada cacheada con una forma
 * vieja del resumen — misma red de seguridad que withSegmentDefaults en metaInvestmentData.ts. La
 * cache no se invalida sola cuando cambia la forma de los datos: lo que lo evita es bumpear la
 * versión de la clave ("monthlySummary:vN" en el route), esto es el respaldo para no romper con
 * "x is not iterable" si alguna vez se olvida.
 */
export function withGoogleAdsSummaryDefaults(data: Partial<GoogleAdsMonthlySummary>): GoogleAdsMonthlySummary {
  return {
    currency: data.currency ?? "ARS",
    spend: data.spend ?? 0,
    impressions: data.impressions ?? 0,
    clicks: data.clicks ?? 0,
    purchases: data.purchases ?? 0,
    revenue: data.revenue ?? 0,
    whatsappSpend: data.whatsappSpend ?? 0,
    whatsappCampaigns: data.whatsappCampaigns ?? [],
    daily: data.daily ?? [],
    campaigns: data.campaigns ?? [],
    breakdown: {
      campaigns: data.breakdown?.campaigns ?? [],
      adGroups: data.breakdown?.adGroups ?? [],
      ads: data.breakdown?.ads ?? [],
      rows: data.breakdown?.rows ?? [],
      networks: data.breakdown?.networks ?? [],
      demographics: data.breakdown?.demographics ?? [],
    },
    breakdownFailed: data.breakdownFailed ?? false,
  };
}

/**
 * Cómo se reconoce una campaña de WhatsApp/Conversaciones: por el NOMBRE de la campaña (Google Ads
 * no tiene un "objetivo WhatsApp" que se pueda filtrar como en Meta). Hoy: whatsapp, wsp, wpp, wa
 * suelto, o "conversacion(es)".
 */
export const WHATSAPP_CAMPAIGN_PATTERN = /whats\s*app|\bwsp\b|\bwpp\b|\bwa\b|conversaci[oó]n/i;

/**
 * Nombre en español de cada red de Google Ads (segments.ad_network_type) — el equivalente a la
 * "ubicación" de Meta Ads. La librería devuelve el enum como número o como texto; se aceptan ambos.
 */
const NETWORK_LABELS: Record<string, string> = {
  SEARCH: "Búsqueda de Google",
  SEARCH_PARTNERS: "Socios de búsqueda",
  CONTENT: "Red de Display",
  MIXED: "Varias redes (Performance Max)",
  YOUTUBE: "YouTube",
  GOOGLE_TV: "Google TV",
  GOOGLE_OWNED_CHANNELS: "Canales de Google",
  GMAIL: "Gmail",
  DISCOVER: "Discover",
  MAPS: "Google Maps",
};
const NETWORK_BY_NUMBER: Record<number, string> = {
  2: "SEARCH",
  3: "SEARCH_PARTNERS",
  4: "CONTENT",
  7: "MIXED",
  8: "YOUTUBE",
  9: "GOOGLE_TV",
  10: "GOOGLE_OWNED_CHANNELS",
  11: "GMAIL",
  12: "DISCOVER",
  13: "MAPS",
};
function networkLabel(v: unknown): string {
  const key = typeof v === "number" ? NETWORK_BY_NUMBER[v] : typeof v === "string" ? v : undefined;
  return (key && NETWORK_LABELS[key]) || "Otras redes";
}

/** Rangos etarios y géneros de Google Ads (enum como número o texto según la librería). */
const AGE_LABELS: Record<string, string> = {
  AGE_RANGE_18_24: "18-24",
  AGE_RANGE_25_34: "25-34",
  AGE_RANGE_35_44: "35-44",
  AGE_RANGE_45_54: "45-54",
  AGE_RANGE_55_64: "55-64",
  AGE_RANGE_65_UP: "65+",
  AGE_RANGE_UNDETERMINED: "Sin determinar",
};
const AGE_BY_NUMBER: Record<number, string> = {
  503001: "AGE_RANGE_18_24",
  503002: "AGE_RANGE_25_34",
  503003: "AGE_RANGE_35_44",
  503004: "AGE_RANGE_45_54",
  503005: "AGE_RANGE_55_64",
  503006: "AGE_RANGE_65_UP",
  503999: "AGE_RANGE_UNDETERMINED",
};
const GENDER_LABELS: Record<string, string> = { FEMALE: "Mujeres", MALE: "Hombres", UNDETERMINED: "Sin determinar" };
const GENDER_BY_NUMBER: Record<number, string> = { 10: "MALE", 11: "FEMALE", 20: "UNDETERMINED" };
function enumLabel(v: unknown, byNumber: Record<number, string>, labels: Record<string, string>): string | null {
  const key = typeof v === "number" ? byNumber[v] : typeof v === "string" ? v : undefined;
  return (key && labels[key]) || null;
}

interface Row {
  customer?: { currency_code?: string };
  ad_group_criterion?: { age_range?: { type?: number | string }; gender?: { type?: number | string } };
  segments?: { date?: string; conversion_action_category?: string | number; ad_network_type?: string | number };
  campaign?: { id?: number | string; name?: string; status?: number | string };
  ad_group?: { id?: number | string; name?: string };
  ad_group_ad?: {
    ad?: {
      id?: number | string;
      name?: string;
      responsive_search_ad?: { headlines?: { text?: string }[] };
    };
  };
  metrics?: {
    cost_micros?: number;
    impressions?: number;
    clicks?: number;
    conversions?: number;
    conversions_value?: number;
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const id = (v: unknown) => (v === undefined || v === null ? "" : String(v));
// La librería devuelve el enum como número (ConversionActionCategory.PURCHASE = 4) o, según
// versión/opciones, como texto ("PURCHASE"); se aceptan ambos.
const isPurchase = (r: Row) => {
  const category = r.segments?.conversion_action_category;
  return category === "PURCHASE" || category === 4;
};

const PERF = "metrics.cost_micros, metrics.impressions, metrics.clicks";
const CONV = "segments.conversion_action_category, metrics.conversions, metrics.conversions_value";

export async function fetchGoogleAdsMonthlySummary(customerId: string, from: string, to: string): Promise<GoogleAdsMonthlySummary> {
  const customer = getGoogleAdsClient(customerId);
  const range = `segments.date BETWEEN '${from}' AND '${to}'`;
  const q = (gaql: string) => customer.query(gaql) as Promise<Row[]>;

  // Desglose para los filtros: si alguna de estas consultas falla, el reporte sigue funcionando
  // con los totales de la cuenta y los combos quedan vacíos (se loguea el error y se marca
  // breakdownFailed para que el route no cachee ese resultado incompleto).
  let breakdownFailed = false;
  const breakdownQueries = Promise.all([
    q(`SELECT segments.date, campaign.id, campaign.name, campaign.status, ${PERF} FROM campaign WHERE ${range}`),
    q(`SELECT segments.date, campaign.id, campaign.name, ${CONV} FROM campaign WHERE ${range}`),
    q(`SELECT segments.date, campaign.id, ad_group.id, ad_group.name, ${PERF} FROM ad_group WHERE ${range}`),
    q(`SELECT segments.date, campaign.id, ad_group.id, ad_group.name, ${CONV} FROM ad_group WHERE ${range}`),
    q(
      `SELECT segments.date, campaign.id, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ` +
        `ad_group_ad.ad.responsive_search_ad.headlines, ${PERF} FROM ad_group_ad WHERE ${range}`
    ),
    q(`SELECT segments.date, campaign.id, ad_group.id, ad_group_ad.ad.id, ${CONV} FROM ad_group_ad WHERE ${range}`),
    // Desglose por red (sin fecha) para "Ubicación de los anuncios", en los 3 niveles del filtro.
    q(`SELECT campaign.id, segments.ad_network_type, metrics.cost_micros FROM campaign WHERE ${range}`),
    q(`SELECT campaign.id, segments.ad_network_type, ${CONV} FROM campaign WHERE ${range}`),
    q(`SELECT ad_group.id, segments.ad_network_type, metrics.cost_micros FROM ad_group WHERE ${range}`),
    q(`SELECT ad_group.id, segments.ad_network_type, ${CONV} FROM ad_group WHERE ${range}`),
    q(`SELECT ad_group_ad.ad.id, segments.ad_network_type, metrics.cost_micros FROM ad_group_ad WHERE ${range}`),
    q(`SELECT ad_group_ad.ad.id, segments.ad_network_type, ${CONV} FROM ad_group_ad WHERE ${range}`),
    // Demografía (por grupo de anuncios: Google no la informa por anuncio, y Performance Max no la informa).
    q(`SELECT campaign.id, ad_group.id, ad_group_criterion.age_range.type, ${PERF} FROM age_range_view WHERE ${range}`),
    q(`SELECT campaign.id, ad_group.id, ad_group_criterion.age_range.type, ${CONV} FROM age_range_view WHERE ${range}`),
    q(`SELECT campaign.id, ad_group.id, ad_group_criterion.gender.type, ${PERF} FROM gender_view WHERE ${range}`),
    q(`SELECT campaign.id, ad_group.id, ad_group_criterion.gender.type, ${CONV} FROM gender_view WHERE ${range}`),
  ]).catch((error) => {
    console.error("[google-ads] No se pudo traer el desglose por campaña/grupo/anuncio:", error?.errors ?? error);
    breakdownFailed = true;
    return Array.from({ length: 16 }, () => [] as Row[]);
  });

  const [
    [totals, conversions, currencyRows, dailyRows, dailyConversions],
    [
      campaignPerf,
      campaignConv,
      adGroupPerf,
      adGroupConv,
      adPerf,
      adConv,
      campaignNetPerf,
      campaignNetConv,
      adGroupNetPerf,
      adGroupNetConv,
      adNetPerf,
      adNetConv,
      agePerf,
      ageConv,
      genderPerf,
      genderConv,
    ],
  ] = await Promise.all([
    Promise.all([
      q(`SELECT ${PERF} FROM customer WHERE ${range}`),
      q(`SELECT ${CONV} FROM customer WHERE ${range}`),
      q(`SELECT customer.currency_code FROM customer LIMIT 1`),
      q(`SELECT segments.date, metrics.cost_micros FROM customer WHERE ${range}`),
      q(`SELECT segments.date, ${CONV} FROM customer WHERE ${range}`),
    ]),
    breakdownQueries,
  ]);

  // ── Totales de la cuenta
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  for (const r of totals) {
    spend += num(r.metrics?.cost_micros) / 1e6;
    impressions += num(r.metrics?.impressions);
    clicks += num(r.metrics?.clicks);
  }
  let purchases = 0;
  let revenue = 0;
  for (const r of conversions) {
    if (!isPurchase(r)) continue;
    purchases += num(r.metrics?.conversions);
    revenue += num(r.metrics?.conversions_value);
  }

  // ── Evolución diaria de la cuenta
  const dailyByDate = new Map<string, { spend: number; purchases: number; revenue: number }>();
  const dayEntry = (date: string) => {
    let entry = dailyByDate.get(date);
    if (!entry) {
      entry = { spend: 0, purchases: 0, revenue: 0 };
      dailyByDate.set(date, entry);
    }
    return entry;
  };
  for (const r of dailyRows) {
    const date = r.segments?.date;
    if (date) dayEntry(date).spend += num(r.metrics?.cost_micros) / 1e6;
  }
  for (const r of dailyConversions) {
    const date = r.segments?.date;
    if (!date || !isPurchase(r)) continue;
    const entry = dayEntry(date);
    entry.purchases += num(r.metrics?.conversions);
    entry.revenue += num(r.metrics?.conversions_value);
  }

  // ── Desglose diario por Campaña / Grupo de anuncios / Anuncio
  const campaignNames = new Map<string, string>();
  const campaignStatus = new Map<string, "activa" | "pausada" | "eliminada">();
  // CampaignStatus de Google Ads: ENABLED = 2, PAUSED = 3, REMOVED = 4 (número o texto según la librería).
  const toStatus = (v: unknown) =>
    v === 2 || v === "ENABLED" ? "activa" : v === 3 || v === "PAUSED" ? "pausada" : v === 4 || v === "REMOVED" ? "eliminada" : undefined;
  const adGroups = new Map<string, { name: string; campaignId: string }>();
  const ads = new Map<string, { name: string; campaignId: string; adGroupId: string }>();
  const rows = new Map<string, GoogleAdsBreakdownRow>();
  const rowEntry = (level: GoogleAdsBreakdownRow["level"], entityId: string, date: string) => {
    const key = `${level}|${entityId}|${date}`;
    let entry = rows.get(key);
    if (!entry) {
      entry = { level, id: entityId, date, spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
      rows.set(key, entry);
    }
    return entry;
  };
  const addPerf = (entry: GoogleAdsBreakdownRow, r: Row) => {
    entry.spend += num(r.metrics?.cost_micros) / 1e6;
    entry.impressions += num(r.metrics?.impressions);
    entry.clicks += num(r.metrics?.clicks);
  };
  const addConv = (entry: GoogleAdsBreakdownRow, r: Row) => {
    entry.purchases += num(r.metrics?.conversions);
    entry.revenue += num(r.metrics?.conversions_value);
  };
  const adName = (r: Row, adId: string) => {
    const ad = r.ad_group_ad?.ad;
    const headline = ad?.responsive_search_ad?.headlines?.find((h) => h.text)?.text;
    return ad?.name || headline || `Anuncio ${adId}${r.ad_group?.name ? ` · ${r.ad_group.name}` : ""}`;
  };

  for (const r of campaignPerf) {
    const cId = id(r.campaign?.id);
    const date = r.segments?.date;
    if (!cId || !date) continue;
    campaignNames.set(cId, r.campaign?.name || `Campaña ${cId}`);
    const status = toStatus(r.campaign?.status);
    if (status) campaignStatus.set(cId, status);
    addPerf(rowEntry("campaign", cId, date), r);
  }
  for (const r of campaignConv) {
    const cId = id(r.campaign?.id);
    const date = r.segments?.date;
    if (!cId || !date || !isPurchase(r)) continue;
    if (!campaignNames.has(cId)) campaignNames.set(cId, r.campaign?.name || `Campaña ${cId}`);
    addConv(rowEntry("campaign", cId, date), r);
  }
  for (const r of adGroupPerf) {
    const gId = id(r.ad_group?.id);
    const date = r.segments?.date;
    if (!gId || !date) continue;
    adGroups.set(gId, { name: r.ad_group?.name || `Grupo ${gId}`, campaignId: id(r.campaign?.id) });
    addPerf(rowEntry("adGroup", gId, date), r);
  }
  for (const r of adGroupConv) {
    const gId = id(r.ad_group?.id);
    const date = r.segments?.date;
    if (!gId || !date || !isPurchase(r)) continue;
    if (!adGroups.has(gId)) adGroups.set(gId, { name: r.ad_group?.name || `Grupo ${gId}`, campaignId: id(r.campaign?.id) });
    addConv(rowEntry("adGroup", gId, date), r);
  }
  for (const r of adPerf) {
    const aId = id(r.ad_group_ad?.ad?.id);
    const date = r.segments?.date;
    if (!aId || !date) continue;
    ads.set(aId, { name: adName(r, aId), campaignId: id(r.campaign?.id), adGroupId: id(r.ad_group?.id) });
    addPerf(rowEntry("ad", aId, date), r);
  }
  for (const r of adConv) {
    const aId = id(r.ad_group_ad?.ad?.id);
    const date = r.segments?.date;
    if (!aId || !date || !isPurchase(r)) continue;
    if (!ads.has(aId)) ads.set(aId, { name: `Anuncio ${aId}`, campaignId: id(r.campaign?.id), adGroupId: id(r.ad_group?.id) });
    addConv(rowEntry("ad", aId, date), r);
  }

  // ── Desglose por red (sin fecha), mismos 3 niveles.
  const networkRows = new Map<string, GoogleAdsNetworkRow>();
  const addNetwork = (level: GoogleAdsNetworkRow["level"], entityId: string, r: Row, kind: "perf" | "conv") => {
    if (!entityId) return;
    if (kind === "conv" && !isPurchase(r)) return;
    const network = networkLabel(r.segments?.ad_network_type);
    const key = `${level}|${entityId}|${network}`;
    const entry = networkRows.get(key) ?? { level, id: entityId, network, spend: 0, purchases: 0 };
    if (kind === "perf") entry.spend += num(r.metrics?.cost_micros) / 1e6;
    else entry.purchases += num(r.metrics?.conversions);
    networkRows.set(key, entry);
  };
  for (const r of campaignNetPerf) addNetwork("campaign", id(r.campaign?.id), r, "perf");
  for (const r of campaignNetConv) addNetwork("campaign", id(r.campaign?.id), r, "conv");
  for (const r of adGroupNetPerf) addNetwork("adGroup", id(r.ad_group?.id), r, "perf");
  for (const r of adGroupNetConv) addNetwork("adGroup", id(r.ad_group?.id), r, "conv");
  for (const r of adNetPerf) addNetwork("ad", id(r.ad_group_ad?.ad?.id), r, "perf");
  for (const r of adNetConv) addNetwork("ad", id(r.ad_group_ad?.ad?.id), r, "conv");

  // ── Demografía (edad y género por separado), por grupo de anuncios.
  const demoRows = new Map<string, GoogleAdsDemographicRow>();
  const addDemo = (dimension: GoogleAdsDemographicRow["dimension"], segment: string | null, r: Row, kind: "perf" | "conv") => {
    const adGroupId = id(r.ad_group?.id);
    if (!segment || !adGroupId) return;
    if (kind === "conv" && !isPurchase(r)) return;
    const key = `${dimension}|${segment}|${adGroupId}`;
    const entry = demoRows.get(key) ?? {
      dimension,
      segment,
      campaignId: id(r.campaign?.id),
      adGroupId,
      spend: 0,
      impressions: 0,
      purchases: 0,
    };
    if (kind === "perf") {
      entry.spend += num(r.metrics?.cost_micros) / 1e6;
      entry.impressions += num(r.metrics?.impressions);
    } else {
      entry.purchases += num(r.metrics?.conversions);
    }
    demoRows.set(key, entry);
  };
  const ageOf = (r: Row) => enumLabel(r.ad_group_criterion?.age_range?.type, AGE_BY_NUMBER, AGE_LABELS);
  const genderOf = (r: Row) => enumLabel(r.ad_group_criterion?.gender?.type, GENDER_BY_NUMBER, GENDER_LABELS);
  for (const r of agePerf) addDemo("edad", ageOf(r), r, "perf");
  for (const r of ageConv) addDemo("edad", ageOf(r), r, "conv");
  for (const r of genderPerf) addDemo("genero", genderOf(r), r, "perf");
  for (const r of genderConv) addDemo("genero", genderOf(r), r, "conv");

  const breakdownRows = [...rows.values()];
  // Totales por entidad, para ordenar los combos por inversión y descartar las que no tuvieron
  // ni inversión ni compras en el período.
  const totalsByEntity = new Map<string, { spend: number; impressions: number; clicks: number; purchases: number; revenue: number }>();
  for (const r of breakdownRows) {
    const key = `${r.level}|${r.id}`;
    const t = totalsByEntity.get(key) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 };
    t.spend += r.spend;
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.purchases += r.purchases;
    t.revenue += r.revenue;
    totalsByEntity.set(key, t);
  }
  const active = (level: string, entityId: string) => {
    const t = totalsByEntity.get(`${level}|${entityId}`);
    return t !== undefined && (t.spend > 0 || t.purchases > 0);
  };
  const spendOf = (level: string, entityId: string) => totalsByEntity.get(`${level}|${entityId}`)?.spend ?? 0;

  const breakdown: GoogleAdsBreakdown = {
    campaigns: [...campaignNames.entries()]
      .filter(([cId]) => active("campaign", cId))
      .map(([cId, name]) => ({ id: cId, name, status: campaignStatus.get(cId) }))
      .sort((a, b) => spendOf("campaign", b.id) - spendOf("campaign", a.id)),
    adGroups: [...adGroups.entries()]
      .filter(([gId]) => active("adGroup", gId))
      .map(([gId, g]) => ({ id: gId, ...g }))
      .sort((a, b) => spendOf("adGroup", b.id) - spendOf("adGroup", a.id)),
    ads: [...ads.entries()]
      .filter(([aId]) => active("ad", aId))
      .map(([aId, a]) => ({ id: aId, ...a }))
      .sort((a, b) => spendOf("ad", b.id) - spendOf("ad", a.id)),
    rows: breakdownRows.filter((r) => active(r.level, r.id)),
    networks: [...networkRows.values()].filter((n) => n.spend > 0 || n.purchases > 0),
    demographics: [...demoRows.values()].filter((d) => d.spend > 0 || d.purchases > 0 || d.impressions > 0),
  };

  // ── Totales por campaña (insight) y campañas de WhatsApp (ROAS WhatsApp)
  const campaignTotals = breakdown.campaigns.map((c) => ({
    name: c.name,
    ...(totalsByEntity.get(`campaign|${c.id}`) ?? { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }),
  }));
  const whatsapp = campaignTotals.filter((c) => c.spend > 0 && WHATSAPP_CAMPAIGN_PATTERN.test(c.name));

  return {
    currency: currencyRows[0]?.customer?.currency_code ?? "ARS",
    spend,
    impressions,
    clicks,
    purchases,
    revenue,
    whatsappSpend: whatsapp.reduce((sum, c) => sum + c.spend, 0),
    whatsappCampaigns: whatsapp.map((c) => c.name),
    campaigns: campaignTotals,
    daily: [...dailyByDate.entries()].map(([date, d]) => ({ date, ...d })).sort((a, b) => a.date.localeCompare(b.date)),
    breakdown,
    breakdownFailed,
  };
}
