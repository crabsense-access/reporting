// Helper compartido por TODOS los gráficos del Calendario de inversión que tienen combos de
// Campaña y/o Anuncio (InvestmentTrendChart, LeadsByTypeTrendChart, AudienceAnalysis,
// RegionAnalysis, HourlyPerformanceChart, WeekdayPerformanceChart, PlacementAnalysis) — resuelve
// el total efectivo de UN día/segmento para el filtro elegido, a partir de su desglose por
// anuncio (byAd, ver DailyRealTotals.byAd y los equivalentes en lib/reporting/metaInvestmentData.ts,
// todos con el mismo shape: campaignId + spend + objectiveLeads/objectiveSpend). Se extrajo a un
// solo lugar porque el mismo cálculo (sumar por Campaña, o tomar un Anuncio puntual) se repite
// idéntico en 7 componentes — repetirlo a mano en cada uno es la forma más fácil de que alguno
// quede con un bug sutil que los demás no tienen.
//
// VideoRetentionChart.tsx queda afuera: su byAd tiene un shape distinto (videoPlays/p25/p50/p75/
// p100, sin objectiveLeads/objectiveSpend porque no se matchea por Objetivo — ver
// fetchVideoRetentionByAge en metaInvestmentData.ts), así que resuelve su propio filtro inline.

export interface AdBreakdownEntry {
  campaignId: string;
  /** Grupo de anuncios (ad set) del anuncio — para el combo de Grupo de anuncios. */
  adsetId?: string;
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

/**
 * Total efectivo de un día/segmento para el filtro de Campaña/Anuncio elegido, a partir de su
 * byAd. null = ese día/segmento no tiene NINGÚN dato para el filtro pedido (equivalente a "sin
 * datos"). Sin filtro (campaignId y adId null) no hace falta llamar a esto: se usa directo el
 * total ya calculado del día/segmento (spend/objectiveLeads/objectiveSpend a nivel de cuenta
 * completa), que es más preciso que sumar el propio byAd (algunas filas pueden no traer
 * ad_id/campaign_id — ver addRowToByAd en metaInvestmentData.ts).
 */
export function resolveAdFilteredTotals(
  byAd: Record<string, AdBreakdownEntry>,
  campaignId: string | null,
  adId: string | null,
  objectivesCount: number,
  adsetId: string | null = null
): { spend: number; objectiveLeads: number[]; objectiveSpend: number[] } | null {
  if (adId !== null) {
    const entry = byAd[adId];
    return entry ? { spend: entry.spend, objectiveLeads: entry.objectiveLeads, objectiveSpend: entry.objectiveSpend } : null;
  }
  if (campaignId === null && adsetId === null) return null; // sin filtro: el llamador no debería llegar acá, ver el comentario de arriba.

  const matching = Object.values(byAd).filter((entry) => matchesCampaignAndAdset(entry, campaignId, adsetId));
  if (matching.length === 0) return null;

  const spend = matching.reduce((sum, entry) => sum + entry.spend, 0);
  const objectiveLeads = Array.from({ length: objectivesCount }, (_, i) =>
    matching.reduce((sum, entry) => sum + (entry.objectiveLeads[i] ?? 0), 0)
  );
  const objectiveSpend = Array.from({ length: objectivesCount }, (_, i) =>
    matching.reduce((sum, entry) => sum + (entry.objectiveSpend[i] ?? 0), 0)
  );
  return { spend, objectiveLeads, objectiveSpend };
}

/** Anuncios del combo de Anuncio, acotados en cascada a la Campaña elegida (o todos si no hay Campaña elegida) — mismo criterio en todos los charts con filtro. */
export function visibleAdsForCampaign<T extends { campaignId: string }>(ads: T[], campaignId: string | null): T[] {
  return campaignId === null ? ads : ads.filter((ad) => ad.campaignId === campaignId);
}

/** true si la entrada de byAd pertenece a la Campaña y al Grupo de anuncios elegidos (null = cualquiera). */
export function matchesCampaignAndAdset(
  entry: { campaignId: string; adsetId?: string },
  campaignId: string | null,
  adsetId: string | null
): boolean {
  return (campaignId === null || entry.campaignId === campaignId) && (adsetId === null || entry.adsetId === adsetId);
}

/** Grupos de anuncios del combo, acotados en cascada a la Campaña elegida (o todos si no hay Campaña elegida). */
export function visibleAdsetsForCampaign<T extends { campaignId: string }>(adsets: T[], campaignId: string | null): T[] {
  return campaignId === null ? adsets : adsets.filter((adset) => adset.campaignId === campaignId);
}

/** Anuncios del combo, acotados en cascada a la Campaña y al Grupo de anuncios elegidos. */
export function visibleAdsForSelection<T extends { campaignId: string; adsetId?: string }>(
  ads: T[],
  campaignId: string | null,
  adsetId: string | null
): T[] {
  return ads.filter((ad) => matchesCampaignAndAdset(ad, campaignId, adsetId));
}
