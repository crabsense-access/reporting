"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { SeoPageSegmentKey, SeoPageSegmentOption } from "@/lib/gsc/segments";

interface SeoSegmentsResponse {
  connected: boolean;
  segments: SeoPageSegmentOption[];
}

interface SeoPageSegmentSelectorProps {
  clientId: string;
  value: SeoPageSegmentKey;
  onChange: (key: SeoPageSegmentKey) => void;
}

const DEFAULT_OPTIONS: SeoPageSegmentOption[] = [{ key: "all", label: "Todo el sitio" }];

// Selector transversal de segmento (SEO > Páginas) — se pide una sola vez
// (no depende del rango de fechas, solo de si el cliente tiene blog
// configurado, ver buildPageSegmentOptions en lib/gsc/segments.ts). Sin
// blog, solo devuelve "Todo el sitio" — el selector igual se muestra, con
// esa única opción.
export function SeoPageSegmentSelector({ clientId, value, onChange }: SeoPageSegmentSelectorProps) {
  const [options, setOptions] = useState<SeoPageSegmentOption[]>(DEFAULT_OPTIONS);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/dashboard/${clientId}/seo/segments`)
      .then((response) => (response.ok ? (response.json() as Promise<SeoSegmentsResponse>) : null))
      .then((json) => {
        if (!cancelled && json?.segments && json.segments.length > 0) setOptions(json.segments);
      })
      .catch(() => {
        // Best effort: si falla, se queda con "Todo el sitio" únicamente.
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <Button
          key={option.key}
          type="button"
          size="sm"
          variant={value === option.key ? "default" : "outline"}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
