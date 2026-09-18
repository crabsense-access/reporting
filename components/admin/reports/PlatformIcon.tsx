import { SiGoogleanalytics, SiMeta } from "react-icons/si";

import type { ReportPlatform } from "@/lib/reports/platforms";

// Mismos íconos que el acordeón de fuentes de datos del admin (/admin/clients/[id]) — acá
// siempre en color real, sin el filtro de gris de "no conectado": este bloque solo muestra
// plataformas ya tildadas (conectadas) en el Bloque 2.
export function PlatformIcon({ platform }: { platform: ReportPlatform }) {
  switch (platform) {
    case "ga4":
      return <SiGoogleanalytics className="h-5 w-5 shrink-0" color="#E37400" />;
    case "meta_ads":
      return <SiMeta className="h-5 w-5 shrink-0" color="#0467DF" />;
    case "search_console":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- asset local en public/, sin dominio remoto que configurar
        <img src="/icons/google-search-console.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
      );
    case "google_ads":
      return (
        // eslint-disable-next-line @next/next/no-img-element -- asset local en public/, sin dominio remoto que configurar
        <img src="/icons/google-ads.png" alt="" width={20} height={20} className="h-5 w-5 shrink-0" />
      );
    default:
      return null;
  }
}
