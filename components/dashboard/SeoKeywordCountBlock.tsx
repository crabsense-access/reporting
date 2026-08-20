"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MetricScorecardGroup, type MetricScorecardConfig } from "@/components/dashboard/MetricScorecardGroup";
import type { ScorecardTrendPoint } from "@/components/dashboard/ScorecardTrendLineChart";
import { formatNumber } from "@/lib/format";
import type { DateRangeValue, Granularity } from "@/lib/date-range";
import type { SeoKeywordCountBucket, SeoKeywordCountResult } from "@/lib/gsc/reports";

interface SeoKeywordCountResponse {
  connected: boolean;
  result: SeoKeywordCountResult | null;
}

interface SeoKeywordCountBlockProps {
  clientId: string;
  range: DateRangeValue;
  defaultGranularity: Granularity;
}

// Label corto para el eje X ("9 ago", "3-9 ago", "Ago 2026").
function formatBucketLabel(bucket: SeoKeywordCountBucket, granularity: Granularity): string {
  const start = parseISO(bucket.startDate);
  const end = parseISO(bucket.endDate);
  if (granularity === "day") return format(start, "d MMM", { locale: es });
  if (granularity === "month") return format(start, "MMM yyyy", { locale: es });
  const sameMonth = format(start, "MMM", { locale: es }) === format(end, "MMM", { locale: es });
  return sameMonth
    ? `${format(start, "d")}-${format(end, "d")} ${format(start, "MMM", { locale: es })}`
    : `${format(start, "d MMM", { locale: es })} - ${format(end, "d MMM", { locale: es })}`;
}

const KEYWORD_COUNT_INFO_TEXT =
  "Cantidad de keywords (búsquedas) distintas que mostraron tu sitio en los resultados de Google, con al menos 1 impresión, en el período seleccionado.";

// current/previous del resultado NO dependen de la granularidad pedida
// (solo bucketiza `series` distinto) — ver fetchKeywordCount en
// lib/gsc/reports.ts. Se reutiliza esta misma consulta tanto para la carga
// inicial (con defaultGranularity) como para fetchTrend de la tarjeta
// (con la granularidad que el usuario elija ahí).
async function fetchKeywordCount(clientId: string, range: DateRangeValue, granularity: Granularity): Promise<SeoKeywordCountResult | null> {
  const params = new URLSearchParams({ from: range.from, to: range.to, granularity });
  const response = await fetch(`/api/dashboard/${clientId}/seo/keyword-count?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "No se pudo cargar la cantidad de keywords.");
  }
  const json = (await response.json()) as SeoKeywordCountResponse;
  return json.result;
}

// Scorecard "Cantidad de Keywords" — grupo de 1 sola tarjeta con
// MetricScorecardGroup (Prompt 92, refactor de Prompts 20-21/73).
export function SeoKeywordCountBlock({ clientId, range, defaultGranularity }: SeoKeywordCountBlockProps) {
  const [result, setResult] = useState<SeoKeywordCountResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchKeywordCount(clientId, range, defaultGranularity)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, range, defaultGranularity]);

  const fetchTrend = useCallback(
    (granularity: Granularity): Promise<ScorecardTrendPoint[]> =>
      fetchKeywordCount(clientId, range, granularity).then((res) =>
        (res?.series ?? []).map((bucket) => ({ label: formatBucketLabel(bucket, granularity), value: bucket.count }))
      ),
    [clientId, range]
  );

  if (error) {
    return (
      <Card className="w-full min-w-0">
        <CardContent className="flex h-32 flex-col items-center justify-center gap-2 pt-6 text-sm text-muted-foreground">
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (loading || !result) {
    return <Skeleton className="h-64 w-full" />;
  }

  const metrics: MetricScorecardConfig[] = [
    {
      key: "totalKeywords",
      label: "Keywords Totales",
      currentValue: result.current,
      previousValue: result.previous,
      format: "number",
      higherIsBetter: true,
      infoText: KEYWORD_COUNT_INFO_TEXT,
      fetchTrend,
      formatChartValue: (value) => `${formatNumber(value)} keywords`,
    },
  ];

  return <MetricScorecardGroup metrics={metrics} gridClassName="grid grid-cols-1" />;
}
