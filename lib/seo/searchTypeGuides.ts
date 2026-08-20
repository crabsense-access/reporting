// Contenido fijo (no generado por LLM) usado por la hoja SEO > Tipos de
// Búsqueda para armar una tarjeta de insight "cómo implementarlo" por cada
// tipo con 0 impresiones en el período — ver SeoSearchTypesBlock.tsx.
// `import type` a propósito: este módulo lo consume un componente cliente y
// lib/gsc/reports.ts arrastra googleapis (server-only).
import type { SeoSearchType } from "@/lib/gsc/reports";

export interface SearchTypeGuide {
  type: SeoSearchType;
  label: string;
  blurb: string;
  docUrl: string;
}

export const SEARCH_TYPE_GUIDES: Record<SeoSearchType, SearchTypeGuide> = {
  web: {
    type: "web",
    label: "Web",
    blurb: "Tu sitio no registra impresiones en búsqueda web para este período — revisá primero que esté indexado en Google.",
    docUrl: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide",
  },
  image: {
    type: "image",
    label: "Imagen",
    blurb:
      "Tus imágenes no aparecen en Google Imágenes. Sumá texto alternativo descriptivo, nombres de archivo claros y un sitemap de imágenes.",
    docUrl: "https://developers.google.com/search/docs/appearance/google-images",
  },
  video: {
    type: "video",
    label: "Video",
    blurb:
      "Tu sitio no aparece en resultados de Video. Si tenés contenido audiovisual, marcalo con datos estructurados de video para que Google lo pueda mostrar.",
    docUrl: "https://developers.google.com/search/docs/appearance/video",
  },
  news: {
    type: "news",
    label: "Noticias",
    blurb:
      "Tu sitio no aparece en la pestaña de Noticias. Para ser elegible necesitás un sitemap de noticias, contenido original y reciente, y que Googlebot pueda rastrear los artículos sin bloqueos.",
    docUrl: "https://developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap",
  },
  discover: {
    type: "discover",
    label: "Discover",
    blurb:
      "Tu sitio no genera impresiones en Discover. Priorizá contenido de calidad, imágenes grandes y de buena resolución, y evitá titulares clickbait.",
    docUrl: "https://developers.google.com/search/docs/appearance/google-discover",
  },
  googleNews: {
    type: "googleNews",
    label: "Google News",
    blurb:
      "Tu sitio no está dado de alta en la app de Google News. Hay que registrarlo en Google Publisher Center y cumplir sus políticas de contenido para ser considerado.",
    docUrl: "https://support.google.com/news/publisher-center/answer/9607025",
  },
};
