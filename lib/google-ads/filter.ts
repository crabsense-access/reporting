// Filtro por Campaña / Grupo de anuncios / Anuncio de los bloques Resultados y Facturación del
// reporte de Google Ads — mismo comportamiento que los combos del reporte de Meta Ads (ver
// lib/reporting/adFilter.ts): los combos van en cascada (el Grupo se acota a la Campaña elegida y el
// Anuncio a la Campaña + Grupo) y el nivel más específico elegido es el que manda.
//
// Sin dependencias de servidor: lo usan los componentes de cliente.

export interface GoogleAdsBreakdownRow {
  level: "campaign" | "adGroup" | "ad";
  id: string;
  /** yyyy-MM-dd */
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

/** Totales del mes de una entidad (campaña / grupo / anuncio) en una red de Google Ads. */
export interface GoogleAdsNetworkRow {
  level: GoogleAdsBreakdownRow["level"];
  id: string;
  /** Nombre de la red en español (ver networkLabel en lib/google-ads/monthlySummary.ts). */
  network: string;
  spend: number;
  purchases: number;
}

/** Totales del mes de un grupo de anuncios en un segmento demográfico (Google lo informa por grupo, no por anuncio). */
export interface GoogleAdsDemographicRow {
  dimension: "edad" | "genero";
  /** "18-24" … "65+", "Sin determinar" / "Mujeres", "Hombres", "Sin determinar". */
  segment: string;
  campaignId: string;
  adGroupId: string;
  spend: number;
  impressions: number;
  purchases: number;
}

/** Totales del mes de una campaña o grupo de anuncios en una provincia/región (Google no la informa por anuncio). */
export interface GoogleAdsRegionRow {
  level: "campaign" | "adGroup";
  id: string;
  /** Nombre de la provincia/región (geo_target_constant.name), o "Sin región asignada". */
  region: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
}

export interface GoogleAdsBreakdown {
  campaigns: { id: string; name: string; status?: "activa" | "pausada" | "eliminada" }[];
  adGroups: { id: string; name: string; campaignId: string }[];
  ads: { id: string; name: string; campaignId: string; adGroupId: string }[];
  rows: GoogleAdsBreakdownRow[];
  /** Desglose del mes por red (Búsqueda, Display, YouTube…), para "Ubicación de los anuncios". */
  networks?: GoogleAdsNetworkRow[];
  /** Demografía del mes (edad y género por separado), para "Quién responde a los anuncios". */
  demographics?: GoogleAdsDemographicRow[];
  /** Desglose del mes por provincia/región, para "Ubicación geográfica". */
  regions?: GoogleAdsRegionRow[];
}

export interface GoogleAdsFilter {
  campaignId: string | null;
  adGroupId: string | null;
  adId: string | null;
}

export const EMPTY_GOOGLE_ADS_FILTER: GoogleAdsFilter = { campaignId: null, adGroupId: null, adId: null };

export interface GoogleAdsTotals {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
}

export interface GoogleAdsFilteredData extends GoogleAdsTotals {
  /** Por fecha (yyyy-MM-dd), sólo días con datos. */
  daily: Map<string, { spend: number; purchases: number; revenue: number }>;
}

const zero = (): GoogleAdsTotals => ({ spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });

export function isFilterActive(filter: GoogleAdsFilter): boolean {
  return filter.campaignId !== null || filter.adGroupId !== null || filter.adId !== null;
}

/** Nivel e id que manda para el filtro elegido (el más específico), o null si no hay filtro. */
function filterTarget(filter: GoogleAdsFilter): { level: GoogleAdsBreakdownRow["level"]; id: string } | null {
  if (filter.adId !== null) return { level: "ad", id: filter.adId };
  if (filter.adGroupId !== null) return { level: "adGroup", id: filter.adGroupId };
  if (filter.campaignId !== null) return { level: "campaign", id: filter.campaignId };
  return null;
}

/**
 * Totales y evolución diaria para el filtro elegido. Sin filtro devuelve los totales de la cuenta
 * (los mismos de siempre, más precisos que sumar el desglose).
 */
export function applyGoogleAdsFilter(
  account: GoogleAdsTotals & { daily: { date: string; spend: number; purchases: number; revenue: number }[] },
  breakdown: GoogleAdsBreakdown,
  filter: GoogleAdsFilter
): GoogleAdsFilteredData {
  const target = filterTarget(filter);
  if (!target) {
    return {
      spend: account.spend,
      impressions: account.impressions,
      clicks: account.clicks,
      purchases: account.purchases,
      revenue: account.revenue,
      daily: new Map(account.daily.map((d) => [d.date, { spend: d.spend, purchases: d.purchases, revenue: d.revenue }])),
    };
  }

  const totals = zero();
  const daily = new Map<string, { spend: number; purchases: number; revenue: number }>();
  for (const r of breakdown.rows) {
    if (r.level !== target.level || r.id !== target.id) continue;
    totals.spend += r.spend;
    totals.impressions += r.impressions;
    totals.clicks += r.clicks;
    totals.purchases += r.purchases;
    totals.revenue += r.revenue;
    const day = daily.get(r.date) ?? { spend: 0, purchases: 0, revenue: 0 };
    day.spend += r.spend;
    day.purchases += r.purchases;
    day.revenue += r.revenue;
    daily.set(r.date, day);
  }
  return { ...totals, daily };
}

/** Grupos de anuncios del combo, en cascada con la Campaña elegida. */
export function visibleAdGroups(breakdown: GoogleAdsBreakdown, filter: GoogleAdsFilter) {
  return filter.campaignId === null ? breakdown.adGroups : breakdown.adGroups.filter((g) => g.campaignId === filter.campaignId);
}

/** Anuncios del combo, en cascada con la Campaña y el Grupo elegidos. */
export function visibleAds(breakdown: GoogleAdsBreakdown, filter: GoogleAdsFilter) {
  return breakdown.ads.filter(
    (a) =>
      (filter.campaignId === null || a.campaignId === filter.campaignId) &&
      (filter.adGroupId === null || a.adGroupId === filter.adGroupId)
  );
}

/** Texto del filtro elegido (para el insight de IA), o null sin filtro. */
export function describeGoogleAdsFilter(breakdown: GoogleAdsBreakdown, filter: GoogleAdsFilter): string | null {
  const parts: string[] = [];
  if (filter.campaignId !== null) parts.push(`Campaña: ${breakdown.campaigns.find((c) => c.id === filter.campaignId)?.name ?? filter.campaignId}`);
  if (filter.adGroupId !== null) parts.push(`Grupo de anuncios: ${breakdown.adGroups.find((g) => g.id === filter.adGroupId)?.name ?? filter.adGroupId}`);
  if (filter.adId !== null) parts.push(`Anuncio: ${breakdown.ads.find((a) => a.id === filter.adId)?.name ?? filter.adId}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Desglose por entidad del nivel siguiente al filtro elegido, para el insight de IA: sin filtro →
 * campañas; con Campaña → sus grupos de anuncios (o la propia campaña si no tiene grupos, ej.
 * Performance Max); con Grupo → sus anuncios; con Anuncio → ese anuncio. Ordenado por inversión.
 */
export function entityTotalsForFilter(
  breakdown: GoogleAdsBreakdown,
  filter: GoogleAdsFilter
): { dimension: "campañas" | "grupos de anuncios" | "anuncios"; items: ({ name: string } & GoogleAdsTotals)[] } {
  const sum = (level: GoogleAdsBreakdownRow["level"], ids: { id: string; name: string }[]) => {
    const byId = new Map(ids.map((e) => [e.id, { name: e.name, ...zero() }]));
    for (const r of breakdown.rows) {
      if (r.level !== level) continue;
      const t = byId.get(r.id);
      if (!t) continue;
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.purchases += r.purchases;
      t.revenue += r.revenue;
    }
    return [...byId.values()].sort((a, b) => b.spend - a.spend);
  };

  if (filter.adId !== null) {
    return { dimension: "anuncios", items: sum("ad", breakdown.ads.filter((a) => a.id === filter.adId)) };
  }
  if (filter.adGroupId !== null) {
    return { dimension: "anuncios", items: sum("ad", visibleAds(breakdown, filter)) };
  }
  if (filter.campaignId !== null) {
    const groups = visibleAdGroups(breakdown, filter);
    if (groups.length > 0) return { dimension: "grupos de anuncios", items: sum("adGroup", groups) };
    return { dimension: "campañas", items: sum("campaign", breakdown.campaigns.filter((c) => c.id === filter.campaignId)) };
  }
  return { dimension: "campañas", items: sum("campaign", breakdown.campaigns) };
}
