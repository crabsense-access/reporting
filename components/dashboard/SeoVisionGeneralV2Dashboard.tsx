"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { SeoKeywordCountBlock } from "@/components/dashboard/SeoKeywordCountBlock";
import { KeywordChurnCard } from "@/components/dashboard/seo/KeywordChurnCard";
import { SeoClicksBlock } from "@/components/dashboard/seo/SeoClicksBlock";
import { SeoBrandVsNonBrandBlock } from "@/components/dashboard/seo/SeoBrandVsNonBrandBlock";
import { SeoImpressionsBlock } from "@/components/dashboard/seo/SeoImpressionsBlock";
import { SeoPositionDistributionBlock } from "@/components/dashboard/seo/SeoPositionDistributionBlock";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";

interface SeoVisionGeneralV2DashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

// Página en construcción: los gráficos se van agregando acá a medida que se
// definen, uno por uno — todos comparten este mismo selector de rango.
export function SeoVisionGeneralV2Dashboard({ clientId, breadcrumbSubtitle }: SeoVisionGeneralV2DashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });

    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>
      <SeoKeywordCountBlock clientId={clientId} range={range} defaultGranularity={getDefaultGranularity(range)} />
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-6">
        <KeywordChurnCard clientId={clientId} range={range} defaultGranularity={getDefaultGranularity(range)} type="new" />
        <KeywordChurnCard clientId={clientId} range={range} defaultGranularity={getDefaultGranularity(range)} type="lost" />
      </div>
      <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(420px,1fr))] gap-6">
        <SeoImpressionsBlock clientId={clientId} range={range} defaultGranularity={getDefaultGranularity(range)} />
        <SeoClicksBlock clientId={clientId} range={range} defaultGranularity={getDefaultGranularity(range)} />
      </div>
      <SeoBrandVsNonBrandBlock clientId={clientId} range={range} />
      <SeoPositionDistributionBlock clientId={clientId} range={range} />
    </div>
  );
}
