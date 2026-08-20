"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { SeoPageSegmentSelector } from "@/components/dashboard/seo/SeoPageSegmentSelector";
import { SeoPageCountBlock } from "@/components/dashboard/seo/SeoPageCountBlock";
import { PageChurnCard } from "@/components/dashboard/seo/PageChurnCard";
import { SeoTopPagesBlock } from "@/components/dashboard/seo/SeoTopPagesBlock";
import { SeoPagesImpressionsParetoBlock } from "@/components/dashboard/seo/SeoPagesImpressionsParetoBlock";
import { SeoPagesClicksParetoBlock } from "@/components/dashboard/seo/SeoPagesClicksParetoBlock";
import { SeoDecliningPagesBlock } from "@/components/dashboard/seo/SeoDecliningPagesBlock";
import { getDefaultGranularity, parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoPaginasDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

function parseSegmentFromSearchParams(searchParams: URLSearchParams): SeoPageSegmentKey {
  const raw = searchParams.get("segment");
  if (raw === "institucional" || raw === "blog-portada" || raw === "blog-notas") return raw;
  return "all";
}

// Página en construcción (mismo espíritu que la hoja Keywords): el segmento
// elegido acá arriba (Todo el sitio / Home / Blog - Portada / Blog - Notas)
// se persiste en la URL junto con el rango de fechas, y se le pasa
// a TODOS los bloques que se vayan agregando, no solo a Resumen.
export function SeoPaginasDashboard({ clientId, breadcrumbSubtitle }: SeoPaginasDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [{ preset, range }, setRangeState] = useState(() => parseRangeFromSearchParams(searchParams));
  const [segment, setSegment] = useState<SeoPageSegmentKey>(() => parseSegmentFromSearchParams(searchParams));

  function updateUrl(nextPreset: DateRangePreset, nextRange: DateRangeValue, nextSegment: SeoPageSegmentKey) {
    const params = new URLSearchParams();
    params.set("range", nextPreset);
    if (nextPreset === "custom") {
      params.set("from", nextRange.from);
      params.set("to", nextRange.to);
    }
    if (nextSegment !== "all") params.set("segment", nextSegment);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setRangeState({ preset: nextPreset, range: nextRange });
    updateUrl(nextPreset, nextRange, segment);
  }

  function handleSegmentChange(nextSegment: SeoPageSegmentKey) {
    setSegment(nextSegment);
    updateUrl(preset, range, nextSegment);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <BreadcrumbTitle subtitle={breadcrumbSubtitle} />
        <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
      </div>
      <SeoPageSegmentSelector clientId={clientId} value={segment} onChange={handleSegmentChange} />
      <SeoPageCountBlock clientId={clientId} range={range} segment={segment} defaultGranularity={getDefaultGranularity(range)} />
      <SeoTopPagesBlock clientId={clientId} range={range} segment={segment} />
      <div className="flex w-full flex-col gap-6">
        <PageChurnCard clientId={clientId} range={range} segment={segment} defaultGranularity={getDefaultGranularity(range)} type="new" />
        <PageChurnCard clientId={clientId} range={range} segment={segment} defaultGranularity={getDefaultGranularity(range)} type="lost" />
      </div>

      <h2 className="text-lg font-semibold text-foreground">Concentración</h2>
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
        <SeoPagesImpressionsParetoBlock clientId={clientId} range={range} segment={segment} defaultGranularity={getDefaultGranularity(range)} />
        <SeoPagesClicksParetoBlock clientId={clientId} range={range} segment={segment} defaultGranularity={getDefaultGranularity(range)} />
      </div>

      <h2 className="text-lg font-semibold text-foreground">Páginas en Declive</h2>
      <SeoDecliningPagesBlock clientId={clientId} range={range} segment={segment} />
    </div>
  );
}
