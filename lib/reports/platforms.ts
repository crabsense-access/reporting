import type { DataSourceType } from "@/lib/types";

// Las 4 fuentes que tienen tool de Claude implementado (ver lib/reports/tools.ts) — DataSourceType
// también incluye "linkedin_ads", que todavía no tiene conector, por eso no es parte de esta lista.
export const REPORT_PLATFORMS = ["search_console", "ga4", "meta_ads", "google_ads"] as const;

export type ReportPlatform = (typeof REPORT_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<ReportPlatform, string> = {
  search_console: "Search Console",
  ga4: "Google Analytics 4",
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
};

export function isReportPlatform(value: string): value is ReportPlatform {
  return (REPORT_PLATFORMS as readonly string[]).includes(value);
}

export function toReportPlatform(sourceType: DataSourceType): ReportPlatform | null {
  return isReportPlatform(sourceType) ? sourceType : null;
}

// Orden en que las fuentes aparecen en el step "Fuentes de datos" del wizard de alta
// (components/admin/NewClientWizard.tsx) — usado para listar bloques por fuente (ej. Rol en
// Configuración v3) en ese mismo orden reconocible para el admin, en vez del orden de
// REPORT_PLATFORMS (que no coincide y se usa para otros fines).
export const DATA_SOURCE_DISPLAY_ORDER: ReportPlatform[] = ["ga4", "search_console", "google_ads", "meta_ads"];
