import type { GSCConfig } from "@/lib/types";

export interface SearchConsoleFormValues {
  enabled: boolean;
  siteUrl: string;
  homePageRegex: string;
  hasBlog: boolean;
  sameProperty: boolean;
  blogSiteUrl: string;
  homeRegex: string;
  postsRegex: string;
  brandRegex: string;
}

export const EMPTY_SEARCH_CONSOLE_FORM_VALUES: SearchConsoleFormValues = {
  enabled: false,
  siteUrl: "",
  homePageRegex: "",
  hasBlog: false,
  sameProperty: true,
  blogSiteUrl: "",
  homeRegex: "",
  postsRegex: "",
  brandRegex: "",
};

export function searchConsoleConfigToFormValues(config: GSCConfig | null): SearchConsoleFormValues {
  if (!config) {
    return { ...EMPTY_SEARCH_CONSOLE_FORM_VALUES };
  }

  return {
    enabled: true,
    siteUrl: config.site_url,
    homePageRegex: config.home_page_regex ?? "",
    hasBlog: Boolean(config.blog),
    sameProperty: config.blog?.same_property ?? true,
    blogSiteUrl: config.blog?.site_url ?? "",
    homeRegex: config.blog?.home_regex ?? "",
    postsRegex: config.blog?.posts_regex ?? "",
    brandRegex: config.brand_regex ?? "",
  };
}

export function isValidRegex(pattern: string): boolean {
  try {
    const compiled = new RegExp(pattern);
    return Boolean(compiled);
  } catch {
    return false;
  }
}

export interface SearchConsoleFormErrors {
  siteUrl?: string;
  homePageRegex?: string;
  blogSiteUrl?: string;
  homeRegex?: string;
  postsRegex?: string;
  brandRegex?: string;
}

interface BuildSearchConsoleConfigResult {
  config: GSCConfig | null;
  errors: SearchConsoleFormErrors;
}

// Valida el estado del formulario y arma el jsonb que va a data_sources.config.
// Si `enabled` es false, config queda en null (y no hay nada para validar).
export function buildSearchConsoleConfig(values: SearchConsoleFormValues): BuildSearchConsoleConfigResult {
  if (!values.enabled) {
    return { config: null, errors: {} };
  }

  const errors: SearchConsoleFormErrors = {};
  const siteUrl = values.siteUrl.trim();
  if (!siteUrl) {
    errors.siteUrl = "Ingresá la Site URL del sitio.";
  }

  // Opcional: sin ella, el segmento "Home" cae a un fallback que matchea la
  // raíz de site_url (ver resolveHomePageRegex en lib/gsc/segments.ts).
  const homePageRegex = values.homePageRegex.trim();
  if (homePageRegex && !isValidRegex(homePageRegex)) {
    errors.homePageRegex = "Ese regex no es válido.";
  }

  // Opcional: sin ella, las tablas de brand/no-brand keywords simplemente no
  // se muestran (ver Keywords > Resumen) — solo se valida que compile si se
  // cargó algo.
  const brandRegex = values.brandRegex.trim();
  if (brandRegex && !isValidRegex(brandRegex)) {
    errors.brandRegex = "Ese regex no es válido.";
  }

  if (!values.hasBlog) {
    if (Object.keys(errors).length > 0) {
      return { config: null, errors };
    }
    return {
      config: { site_url: siteUrl, blog: null, brand_regex: brandRegex || null, home_page_regex: homePageRegex || null },
      errors: {},
    };
  }

  const homeRegex = values.homeRegex.trim();
  const postsRegex = values.postsRegex.trim();

  if (!homeRegex) {
    errors.homeRegex = "Ingresá el regex de la portada del blog.";
  } else if (!isValidRegex(homeRegex)) {
    errors.homeRegex = "Ese regex no es válido.";
  }

  if (!postsRegex) {
    errors.postsRegex = "Ingresá el regex de las notas/artículos.";
  } else if (!isValidRegex(postsRegex)) {
    errors.postsRegex = "Ese regex no es válido.";
  }

  let blogSiteUrl: string | null = null;
  if (!values.sameProperty) {
    blogSiteUrl = values.blogSiteUrl.trim();
    if (!blogSiteUrl) {
      errors.blogSiteUrl = "Ingresá la Site URL del blog.";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { config: null, errors };
  }

  return {
    config: {
      site_url: siteUrl,
      brand_regex: brandRegex || null,
      home_page_regex: homePageRegex || null,
      blog: {
        same_property: values.sameProperty,
        site_url: values.sameProperty ? null : blogSiteUrl,
        home_regex: homeRegex,
        posts_regex: postsRegex,
      },
    },
    errors: {},
  };
}
