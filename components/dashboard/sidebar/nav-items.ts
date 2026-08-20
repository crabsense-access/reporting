import { slugify } from "@/lib/utils";
import type { DashboardType } from "@/lib/dashboard/getAvailableDashboardTypes";

export type InsightSectionKey = "seo" | "analitica" | "ads";

// `buildDashboardNavItems` corre en un Server Component (el layout) y su
// resultado se pasa como prop a <Sidebar>, que es un Client Component — los
// componentes de ícono (funciones) no se pueden serializar en ese cruce, así
// que acá solo viaja una clave string; el ícono real se resuelve del lado
// del cliente (ver NAV_ICONS en sidebar-item.tsx).
export type NavIconKey = "overview" | "seo" | "analitica" | "ads" | "ia";

export interface NavItem {
  iconKey?: NavIconKey;
  label: string;
  /** Ausente = grupo puro: solo despliega/colapsa sus `items`, no navega. */
  href?: string;
  /** Solo presente en las hojas con contenido real, para el pill de insights. */
  insightSection?: InsightSectionKey;
  items?: NavItem[];
  /**
   * Si es true, `items` no se expande inline en el sidebar — al pasar el
   * mouse se muestra en un segundo panel flotante (ver SidebarFlyoutPanel).
   * Reservado para nodos con un árbol de categorías propio (Audiencia,
   * Retención, Conversiones), no para grupos de navegación comunes.
   */
  flyout?: boolean;
}

// Listas "fuente única de verdad": el sidebar y las páginas placeholder
// (app/[clientSlug]/dashboard/.../[seccion]/page.tsx) importan estas mismas
// listas para no duplicar los labels en dos lugares y no desincronizarse.
// Audiencia no está acá porque ya tiene contenido real (ver
// app/[clientSlug]/dashboard/analitica/audiencia/page.tsx) — estos dos
// todavía no.
export const ANALITICA_PLACEHOLDER_SECTIONS = ["Retención", "Conversiones"] as const;

export const ADS_PLACEHOLDER_ITEMS = ["Item A", "Item B", "Item C"] as const;

// Placeholder específico de Meta Ads (Prompt 74) — a diferencia de
// ADS_PLACEHOLDER_ITEMS (genérico, pensado para cualquier canal vía
// ads/[canal]/[seccion]/page.tsx, hoy sin uso), estas hojas son solo para
// Meta Ads: Google Ads no las lleva. "Conversiones" (Prompt 93), "Anuncios"
// (Prompt 95) y "Audiencia" (Prompt 97) ya tienen contenido real y salieron
// de esta lista — vacía por ahora, no hay más placeholders de Meta Ads.
export const META_ADS_PLACEHOLDER_SECTIONS = [] as const;

export const AD_CHANNELS = [
  { slug: "google-ads", label: "Google Ads" },
  { slug: "meta-ads", label: "Meta Ads" },
] as const;

export const IA_SECTIONS = [
  "Visibilidad IA",
  "Presencia en respuestas de IA",
  "Citaciones de IA",
  "Tráfico IA",
  "Sitios referidos de IA",
  "Menciones de marca en IA",
  "Competencia",
  "Contenido más utilizado por IA",
  "Consultas (Prompts) que muestran la marca",
  "GEO (Generative Engine Optimization)",
  "Autoridad de contenido",
  "Calidad del contenido para IA",
  "Entidades reconocidas",
  "Estado técnico para IA",
  "Oportunidades detectadas por IA",
  "Alertas Inteligentes",
] as const;

interface PlaceholderCategory {
  label: string;
  items: string[];
}

// Misma subdivisión por categorías que se armó y validó en
// /mockup/nav-preview (components/mockup/entities/navGroups.ts) — acá viven
// como estructura de navegación real, pero salvo "Resumen" (que sí apunta a
// la página real de cada entidad) todavía no tienen contenido propio: se
// muestran sin link hasta que se construyan.
function buildEntityGroup(
  label: string,
  real: { href?: string; insightSection?: InsightSectionKey },
  categories: PlaceholderCategory[]
): NavItem {
  return {
    label,
    flyout: true,
    items: [
      { label: "Resumen", href: real.href, insightSection: real.insightSection },
      ...categories.map((category) => ({
        label: category.label,
        items: category.items.map((item) => ({ label: item })),
      })),
    ],
  };
}

export function buildDashboardNavItems({
  clientSlug,
  availableTypes,
}: {
  clientSlug: string;
  availableTypes: DashboardType[];
}): NavItem[] {
  const path = (segment: string) => `/${clientSlug}/dashboard/${segment}`;

  const items: NavItem[] = [{ iconKey: "overview", label: "Resumen General", href: path("overview") }];

  if (availableTypes.includes("seo")) {
    items.push({
      iconKey: "seo",
      label: "SEO",
      items: [
        { label: "Visión General", href: path("seo/vision-general"), insightSection: "seo" },
        { label: "Keywords", href: path("seo/keywords") },
        { label: "Páginas", href: path("seo/paginas") },
        { label: "Tipos de Búsqueda", href: path("seo/tipos-busqueda") },
      ],
    });
  }

  if (availableTypes.includes("analitica")) {
    items.push({
      iconKey: "analitica",
      label: "Analítica",
      items: [
        buildEntityGroup(
          "Audiencia",
          { href: path("analitica/audiencia"), insightSection: "analitica" },
          [
            { label: "Composición", items: ["Nuevos vs. Recurrentes", "Canal de Adquisición", "Geografía"] },
            { label: "Perfil (Google Signals)", items: ["Demografía", "Intereses"] },
            { label: "Dispositivo y Tecnología", items: ["Dispositivo", "Idioma", "Browser / OS"] },
          ]
        ),
        buildEntityGroup(
          "Retención",
          { href: path(`analitica/${slugify(ANALITICA_PLACEHOLDER_SECTIONS[0])}`) },
          [
            {
              label: "Comportamiento y Retención",
              items: ["Frecuencia de Sesiones", "Antigüedad / Lifecycle", "Retención por Cohorte", "Recurrencia por Canal"],
            },
          ]
        ),
        buildEntityGroup(
          "Conversiones",
          { href: path(`analitica/${slugify(ANALITICA_PLACEHOLDER_SECTIONS[1])}`) },
          [
            { label: "Composición", items: ["Por Evento / Objetivo", "Por Canal", "Por Dispositivo"] },
            { label: "Comportamiento y Calidad", items: ["Tiempo hasta Conversión", "Assisted vs. Last-click"] },
            { label: "Dispositivo y Tecnología", items: ["Dispositivo", "Idioma", "Browser / OS"] },
          ]
        ),
      ],
    });
  }

  if (availableTypes.includes("ads")) {
    items.push({
      iconKey: "ads",
      label: "ADS",
      // Google Ads y Meta Ads ya tienen contenido real más allá de "Visión
      // General" (ver costos/page.tsx de cada uno) — ninguno de los dos
      // lleva los placeholders genéricos (Item A/B/C). Meta Ads suma además
      // "Audiencia" (real, Prompt 97 — 2da posición, justo después de
      // "Visión General"), "Conversiones" (real, Prompt 93) y "Anuncios"
      // (real, Prompt 95) — solo ese canal, Google Ads no las lleva.
      items: AD_CHANNELS.map((channel) => ({
        label: channel.label,
        items: [
          { label: "Visión General", href: path(`ads/${channel.slug}/vision-general`), insightSection: "ads" },
          ...(channel.slug === "meta-ads" ? [{ label: "Audiencia", href: path(`ads/${channel.slug}/audiencia`) }] : []),
          { label: "Costos", href: path(`ads/${channel.slug}/costos`) },
          ...(channel.slug === "meta-ads"
            ? [
                { label: "Conversiones", href: path(`ads/${channel.slug}/conversiones`) },
                { label: "Anuncios", href: path(`ads/${channel.slug}/anuncios`) },
              ]
            : []),
          ...(channel.slug === "meta-ads"
            ? META_ADS_PLACEHOLDER_SECTIONS.map((label) => ({ label, href: path(`ads/${channel.slug}/${slugify(label)}`) }))
            : []),
        ],
      })),
    });
  }

  items.push({
    iconKey: "ia",
    label: "IA",
    items: IA_SECTIONS.map((label) => ({ label, href: path(`ia/${slugify(label)}`) })),
  });

  return items;
}
