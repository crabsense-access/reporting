import type { MockupNavGroup } from "@/components/mockup/MockupSidebar";

// Fuente única de verdad para la estructura de nav de cada entidad — usada
// tanto por el sidebar de cada página de mockup como por el preview del
// flyout de navegación (components/mockup/nav-preview).
export const USUARIOS_NAV_GROUPS: MockupNavGroup[] = [
  { category: "Resumen", items: [{ label: "Scorecards", anchor: "resumen" }] },
  {
    category: "Composición",
    items: [
      { label: "Nuevos vs. Recurrentes", anchor: "nuevos-vs-recurrentes" },
      { label: "Canal de Adquisición", anchor: "canal-adquisicion" },
      { label: "Geografía", anchor: "geografia" },
    ],
  },
  {
    category: "Comportamiento y Retención",
    items: [
      { label: "Frecuencia de Sesiones", anchor: "frecuencia-sesiones" },
      { label: "Antigüedad / Lifecycle", anchor: "lifecycle" },
      { label: "Retención por Cohorte", anchor: "retencion-cohorte" },
      { label: "Recurrencia por Canal", anchor: "recurrencia-canal" },
    ],
  },
  {
    category: "Perfil (Google Signals)",
    items: [
      { label: "Demografía", anchor: "demografia" },
      { label: "Intereses", anchor: "intereses" },
    ],
  },
  {
    category: "Dispositivo y Tecnología",
    items: [
      { label: "Dispositivo", anchor: "dispositivo" },
      { label: "Idioma", anchor: "idioma" },
      { label: "Browser / OS", anchor: "browser-os" },
    ],
  },
];

export const CONVERSIONES_NAV_GROUPS: MockupNavGroup[] = [
  { category: "Resumen", items: [{ label: "Scorecards", anchor: "resumen" }] },
  {
    category: "Composición",
    items: [
      { label: "Por Evento / Objetivo", anchor: "por-evento" },
      { label: "Por Canal", anchor: "por-canal" },
      { label: "Por Dispositivo", anchor: "por-dispositivo" },
    ],
  },
  {
    category: "Comportamiento y Calidad",
    items: [
      { label: "Tiempo hasta Conversión", anchor: "tiempo-conversion" },
      { label: "Assisted vs. Last-click", anchor: "assisted-vs-lastclick" },
    ],
  },
  {
    category: "Dispositivo y Tecnología",
    items: [
      { label: "Dispositivo", anchor: "dispositivo" },
      { label: "Idioma", anchor: "idioma" },
      { label: "Browser / OS", anchor: "browser-os" },
    ],
  },
];

// Sub-item "Retención" del preview de navegación (components/mockup/nav-preview)
// — no corresponde a ninguna página de mockup propia todavía, es una
// subdivisión propia enfocada en retención para diferenciarla de Audiencia.
export const RETENCION_NAV_GROUPS: MockupNavGroup[] = [
  { category: "Resumen", items: [{ label: "Scorecards", anchor: "resumen" }] },
  {
    category: "Cohortes y Frecuencia",
    items: [
      { label: "Retención por Cohorte", anchor: "retencion-cohorte" },
      { label: "Frecuencia de Sesiones", anchor: "frecuencia-sesiones" },
    ],
  },
  {
    category: "Lifecycle y Recurrencia",
    items: [
      { label: "Antigüedad / Lifecycle", anchor: "lifecycle" },
      { label: "Recurrencia por Canal", anchor: "recurrencia-canal" },
    ],
  },
];

export const SESIONES_NAV_GROUPS: MockupNavGroup[] = [
  { category: "Resumen", items: [{ label: "Scorecards", anchor: "resumen" }] },
  {
    category: "Composición",
    items: [
      { label: "Por Canal", anchor: "por-canal" },
      { label: "Landing Pages", anchor: "landing-pages" },
      { label: "Tipo de Tráfico", anchor: "tipo-trafico" },
    ],
  },
  {
    category: "Comportamiento y Calidad",
    items: [
      { label: "Engagement", anchor: "engagement" },
      { label: "Eventos por Sesión", anchor: "eventos-sesion" },
      { label: "Duración de Sesión", anchor: "duracion-sesion" },
    ],
  },
  {
    category: "Dispositivo y Tecnología",
    items: [
      { label: "Dispositivo", anchor: "dispositivo" },
      { label: "Idioma", anchor: "idioma" },
      { label: "Browser / OS", anchor: "browser-os" },
    ],
  },
];
