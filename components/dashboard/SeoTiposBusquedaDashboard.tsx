"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { DateRangeSelector } from "@/components/dashboard/DateRangeSelector";
import { SeoPageSegmentSelector } from "@/components/dashboard/seo/SeoPageSegmentSelector";
import { SeoSearchTypesBlock } from "@/components/dashboard/seo/SeoSearchTypesBlock";
import { parseRangeFromSearchParams } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";
import type { SeoPageSegmentKey } from "@/lib/gsc/segments";

interface SeoTiposBusquedaDashboardProps {
  clientId: string;
  /** Línea descriptiva mostrada debajo del breadcrumb (ver BreadcrumbTitle). */
  breadcrumbSubtitle?: string;
}

function parseSegmentFromSearchParams(searchParams: URLSearchParams): SeoPageSegmentKey {
  const raw = searchParams.get("segment");
  if (raw === "institucional" || raw === "blog-portada" || raw === "blog-notas") return raw;
  return "all";
}

// Mismo selector transversal de segmento (Todo el sitio / Home / Blog -
// Portada / Blog - Notas) ya armado para la hoja Páginas — se
// persiste en la URL junto con el rango de fechas y se le pasa a TODOS los
// bloques que se vayan agregando a esta hoja, no solo a Resumen.
export function SeoTiposBusquedaDashboard({ clientId, breadcrumbSubtitle }: SeoTiposBusquedaDashboardProps) {
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
      <SeoSearchTypesBlock clientId={clientId} range={range} segment={segment} />
    </div>
  );
}
