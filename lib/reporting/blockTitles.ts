// Título principal + subtítulo de cada bloque del reporte (Calendario de inversión), en UN solo
// lugar para poder cambiarlos sin tocar cada componente. El título principal es el que se muestra
// grande en el bloque y el que usa el menú lateral (ver ReportSidebar.tsx, que lee los h3); el
// subtítulo va debajo, más chico. subtitle opcional: si no hay, no se muestra nada.

export interface BlockTitle {
  title: string;
  subtitle?: string;
}

export const REPORT_BLOCK_TITLES = {
  /** Tarjeta de arriba. El subtítulo depende del mes (en curso / cerrado), así que hay dos entradas. */
  inversionMesEnCurso: { title: "Inversión", subtitle: "Inversión acumulada en lo que va del mes" },
  inversionMesCerrado: { title: "Inversión", subtitle: "Inversión total del mes" },
  /** Tarjeta de Resultados del reporte de Meta Ads (debajo del bloque de Inversión). */
  resultados: { title: "Resultados" },
  facturacion: { title: "Facturación" },
  /**
   * Gráfico desde Google Sheet: título y subtítulo se cargan en el Admin (config de Meta Ads, ver
   * sheet_chart en lib/types.ts) porque cambian según el Sheet de cada cliente. Éste es el fallback.
   */
  googleSheet: { title: "Datos adicionales" },
  inversionPorDia: { title: "Inversión y rendimiento por día" },
  resultadosPorTipo: { title: "Resultados por campaña", subtitle: "Resultados y costos por resultados por tipo de campaña" },
  analisisCampanas: { title: "Análisis de campañas" },
  ubicaciones: { title: "Ubicación de los anuncios", subtitle: "Dónde se muestran los anuncios" },
  audiencia: { title: "Quién responde a los anuncios", subtitle: "Resultados por género y rango etario" },
  retencionVideo: { title: "Porcentaje de visualización", subtitle: "Cuánto se mira el contenido según la edad" },
  regiones: { title: "Ubicación geográfica", subtitle: "De dónde son los leads" },
  horario: { title: "Resultados por Horario", subtitle: "En qué momento del día se consiguen los resultados" },
  diaSemana: { title: "Resultados por día de la semana", subtitle: "Qué día de la semana rinde mejor" },
  recomendaciones: { title: "Recomendaciones" },
  // ─── Google Ads ───
  googleAdsResultados: { title: "Resultados" },
  /** Bloque de Ventas por WhatsApp (carga manual) + Resumen ejecutivo del reporte de Google Ads. */
  googleAdsResumen: { title: "Ventas por WhatsApp" },
} satisfies Record<string, BlockTitle>;

export type ReportBlockKey = keyof typeof REPORT_BLOCK_TITLES;
