"use client";

// Combos de Campaña / Grupo de anuncios / Anuncio de los bloques del reporte de Google Ads — mismo
// look y cascada que los del reporte de Meta Ads (ver InvestmentTrendChart.tsx): cambiar de Campaña
// limpia Grupo y Anuncio; cambiar de Grupo limpia el Anuncio.

import {
  visibleAdGroups,
  visibleAds,
  type GoogleAdsBreakdown,
  type GoogleAdsFilter,
} from "@/lib/google-ads/filter";

const SELECT_CLASS =
  "h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function GoogleAdsFilterSelects({
  breakdown,
  value,
  onChange,
}: {
  breakdown: GoogleAdsBreakdown | null;
  value: GoogleAdsFilter;
  onChange: (filter: GoogleAdsFilter) => void;
}) {
  const campaigns = breakdown?.campaigns ?? [];
  const adGroups = breakdown ? visibleAdGroups(breakdown, value) : [];
  const ads = breakdown ? visibleAds(breakdown, value) : [];

  return (
    <div className="flex flex-col items-stretch gap-2">
      <select
        aria-label="Campaña"
        value={value.campaignId ?? "all"}
        disabled={!breakdown}
        onChange={(event) =>
          onChange({ campaignId: event.target.value === "all" ? null : event.target.value, adGroupId: null, adId: null })
        }
        className={SELECT_CLASS}
      >
        <option value="all">Todas las campañas</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Grupo de anuncios"
        value={value.adGroupId ?? "all"}
        disabled={!breakdown}
        onChange={(event) =>
          onChange({ ...value, adGroupId: event.target.value === "all" ? null : event.target.value, adId: null })
        }
        className={SELECT_CLASS}
      >
        <option value="all">Todos los grupos de anuncios</option>
        {adGroups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Anuncio"
        value={value.adId ?? "all"}
        disabled={!breakdown}
        onChange={(event) => onChange({ ...value, adId: event.target.value === "all" ? null : event.target.value })}
        className={SELECT_CLASS}
      >
        <option value="all">Todos los anuncios</option>
        {ads.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
