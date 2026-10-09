"use client";

// Cuerpo del reporte de UNA plataforma (cada una tiene su propia página — ver ReportPage.tsx). El
// contenedor [data-report-platform] es el que lee el menú lateral para armar sus ítems.
//
// El mes elegido se refleja en la URL (?month=yyyy-MM, con replaceState para no ensuciar el
// historial) para que al pasar de Meta Ads a Google Ads desde el menú se mantenga el mismo mes.

import { useCallback, useMemo, useState } from "react";
import { format } from "date-fns";

import { InvestmentCalendar } from "@/components/admin/reporting/InvestmentCalendar";
import { GoogleAdsReport } from "@/components/admin/reporting/GoogleAdsReport";
import { SummaryReport } from "@/components/admin/reporting/SummaryReport";
import { isMonthFromStart, recentMonthOptions } from "@/lib/reporting/reportWindow";
import type { AdPlatform, ReportPlatform } from "@/components/admin/reporting/ReportSidebar";

function syncMonthToUrl(month: string) {
  const url = new URL(window.location.href);
  if (url.searchParams.get("month") === month) return;
  url.searchParams.set("month", month);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function ReportBody({
  clientId,
  platform,
  initialMonth,
  showRecommendations,
  platforms,
  startMonths,
  hrefs,
}: {
  clientId: string;
  platform: ReportPlatform;
  initialMonth?: string;
  showRecommendations: boolean;
  /** Plataformas configuradas (para el Resumen general). */
  platforms: AdPlatform[];
  /** Mes (yyyy-MM) desde el cual se toman los datos de cada fuente (elegido en el Admin). */
  startMonths: Record<AdPlatform, string>;
  hrefs: Record<ReportPlatform, string>;
}) {
  // Mes de inicio de esta página: el de la plataforma, o en el Resumen general el más viejo de las
  // plataformas configuradas (cada bloque después deja afuera la que todavía no empezó).
  const startMonth = useMemo(() => {
    if (platform === "summary") return platforms.map((p) => startMonths[p]).sort()[0] ?? startMonths.meta_ads;
    return startMonths[platform];
  }, [platform, platforms, startMonths]);
  const monthOptions = useMemo(
    () => recentMonthOptions(startMonth).filter((o) => isMonthFromStart(o.value, startMonth)),
    [startMonth]
  );
  const [month, setMonth] = useState(() =>
    initialMonth && monthOptions.some((o) => o.value === initialMonth) ? initialMonth : monthOptions[0]?.value ?? format(new Date(), "yyyy-MM")
  );
  const handleMonthChange = useCallback((m: string) => {
    setMonth(m);
    syncMonthToUrl(m);
  }, []);

  if (platform === "meta_ads") {
    return (
      <div data-report-platform="meta_ads" className="min-w-0">
        <InvestmentCalendar
          clientId={clientId}
          startMonth={startMonths.meta_ads}
          initialMonth={initialMonth}
          showRecommendations={showRecommendations}
          onMonthChange={handleMonthChange}
        />
      </div>
    );
  }

  const monthSelect = (label: string) => (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <select
        aria-label="Mes"
        value={month}
        onChange={(e) => handleMonthChange(e.target.value)}
        className="h-9 w-fit rounded-md border border-input bg-background px-3 text-sm font-semibold"
      >
        {monthOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );

  if (platform === "summary") {
    return (
      <div data-report-platform="summary" className="flex min-w-0 flex-col gap-4">
        {monthSelect("Resumen general")}
        <SummaryReport
          clientId={clientId}
          month={month}
          platforms={platforms.filter((p) => isMonthFromStart(month, startMonths[p]))}
          startMonths={Object.fromEntries(platforms.map((p) => [p, startMonths[p]]))}
          hrefs={{ meta_ads: hrefs.meta_ads, google_ads: hrefs.google_ads }}
        />
      </div>
    );
  }

  return (
    <div data-report-platform="google_ads" className="flex min-w-0 flex-col gap-4">
      {monthSelect("Reporte de Google Ads")}
      <GoogleAdsReport clientId={clientId} month={month} showRecommendations={showRecommendations} />
    </div>
  );
}
