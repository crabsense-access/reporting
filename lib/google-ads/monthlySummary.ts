import { getGoogleAdsClient } from "@/lib/google-ads/client";
import type { GoogleAdsBreakdown, GoogleAdsBreakdownRow } from "@/lib/google-ads/filter";

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

interface Row {
  customer?: { currency_code?: string };
  segments?: { date?: string; conversion_action_category?: string | number };
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
  ]).catch((error) => {
    console.error("[google-ads] No se pudo traer el desglose por campaña/grupo/anuncio:", error?.errors ?? error);
    breakdownFailed = true;
    return [[], [], [], [], [], []] as Row[][];
  });

  const [
    [totals, conversions, currencyRows, dailyRows, dailyConversions],
    [campaignPerf, campaignConv, adGroupPerf, adGroupConv, adPerf, adConv],
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
