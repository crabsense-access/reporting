export interface MarketingSkill {
  id: string;
  nombre: string;
  descripcion: string;
}

// Lista hardcodeada de skills de marketing, usada solo como lookup por rolLines() en
// diagnosticPrompts.ts para embeber un resumen corto de expertise dentro de cada prompt de
// diagnóstico fijo (sin UI de selección para el admin).
export const MARKETING_SKILLS: MarketingSkill[] = [
  {
    id: "ads",
    nombre: "Ads (Paid Media)",
    descripcion: "Estrategia de campañas pagas: Google Ads, Meta Ads, LinkedIn Ads, targeting, bidding y optimización.",
  },
  {
    id: "ai-seo",
    nombre: "AI SEO (AEO/GEO)",
    descripcion: "Optimización de contenido para ser citado por IA (ChatGPT, Perplexity, AI Overviews).",
  },
  {
    id: "analytics",
    nombre: "Analytics",
    descripcion: "Tracking y medición: GA4, conversion tracking, UTMs, tag manager, atribución.",
  },
  {
    id: "aso",
    nombre: "ASO",
    descripcion: "Optimización de listados en App Store y Google Play.",
  },
  {
    id: "churn-prevention",
    nombre: "Prevención de churn",
    descripcion: "Flujos de cancelación, save offers, recuperación de pagos fallidos, retención.",
  },
  {
    id: "co-marketing",
    nombre: "Co-marketing",
    descripcion: "Partnerships y campañas conjuntas con otras marcas.",
  },
  {
    id: "competitor-profiling",
    nombre: "Perfilado de competidores",
    descripcion: "Investigación y análisis estructurado de competidores.",
  },
  {
    id: "competitors",
    nombre: "Páginas de competidores",
    descripcion: 'Comparativas y páginas "vs" / "alternativa a" para SEO y ventas.',
  },
  {
    id: "content-strategy",
    nombre: "Estrategia de contenido",
    descripcion: "Planificación de qué contenido crear y por qué.",
  },
  {
    id: "copywriting",
    nombre: "Copywriting",
    descripcion: "Redacción y mejora de copy de marketing (landing, pricing, CTAs).",
  },
  {
    id: "lead-magnets",
    nombre: "Lead magnets",
    descripcion: "Creación y optimización de contenido descargable para captar leads.",
  },
  {
    id: "marketing-plan",
    nombre: "Plan de marketing",
    descripcion: "Planes de crecimiento / go-to-market integrales (modelo AARRR).",
  },
  {
    id: "schema",
    nombre: "Schema markup",
    descripcion: "Datos estructurados para rich snippets en Google.",
  },
  {
    id: "seo",
    nombre: "SEO",
    descripcion: "Auditoría y optimización SEO general (técnico, contenido, Core Web Vitals).",
  },
  {
    id: "seo-audit",
    nombre: "Auditoría SEO",
    descripcion: "Auditoría completa de sitio con scoring de salud.",
  },
  {
    id: "seo-content",
    nombre: "Calidad de contenido SEO",
    descripcion: "Análisis E-E-A-T y preparación de contenido para citación por IA.",
  },
  {
    id: "wordpress-elementor",
    nombre: "WordPress / Elementor",
    descripcion: "Implementación de páginas y SEO en sitios WordPress + Elementor.",
  },
];
