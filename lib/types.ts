import type { ReportContent } from "@/lib/reports/types";

export type DataSourceType =
  | "ga4"
  | "search_console"
  | "google_ads"
  | "meta_ads"
  | "linkedin_ads";

export type ConnectionType = "service_account" | "oauth_agency" | "oauth_client";

export interface GA4Config {
  property_id: string;
  /** Objetivo principal de este cliente en GA4, texto libre — guía qué mirar al generar informes. */
  primary_goal: string;
  /** Objetivo secundario, opcional (texto libre, puede quedar vacío). */
  secondary_goal: string;
}

export interface GSCBlogConfig {
  same_property: boolean;
  site_url: string | null;
  home_regex: string;
  posts_regex: string;
}

export interface GSCConfig {
  site_url: string;
  blog: GSCBlogConfig | null;
  /** Regex sobre el término de búsqueda para clasificar keywords de marca vs. no-marca (ver Keywords > Resumen). Opcional: sin configurar, esas tablas no se muestran. */
  brand_regex?: string | null;
  /** Regex sobre `page` que matchea SOLO la home del sitio (segmento "Home", Prompt 69) — opcional: sin configurar, se usa un fallback que matchea la raíz de `site_url` (ver resolveHomePageRegex en lib/gsc/segments.ts). */
  home_page_regex?: string | null;
  /** Objetivo principal de este cliente en Search Console, texto libre. Si queda vacío al guardar, el form precarga un texto por defecto (ver lib/gsc/config.ts). */
  primary_goal?: string;
  /** Objetivo secundario, opcional (texto libre, arranca vacío). */
  secondary_goal?: string;
}

export interface GoogleAdsConfig {
  customer_id: string;
  /** Objetivo principal de este cliente en Google Ads, texto libre (arranca vacío). */
  primary_goal?: string;
  /** Objetivo secundario, opcional (texto libre, arranca vacío). */
  secondary_goal?: string;
}

/** Un objetivo (evento de conversión) configurado para Meta Ads: el nombre del evento tal cual
 * figura en Meta Events Manager, y una leyenda breve en español que es lo que se muestra como
 * texto en el informe. Reemplaza al viejo par fijo primary_goal/secondary_goal — ahora se cargan
 * de a uno por vez, sin límite. */
export interface MetaAdsObjective {
  event: string;
  label: string;
}

export interface MetaAdsConfig {
  ad_account_id: string;
  /** Objetivos configurados para este cliente en Meta Ads (arranca vacío — se cargan de a uno por vez, ver MetaAdsConfigForm). */
  objectives?: MetaAdsObjective[];
  /**
   * Presupuesto mensual de este cliente en Meta Ads, cargado a mano (no hay ningún campo
   * equivalente en la Marketing API — el "monthly budget" de una cuenta o campaña ahí es otra
   * cosa, y cambia si se pausan/reactivan campañas). Se usa en el Calendario de inversión (ver
   * components/admin/reporting/InvestmentCalendar.tsx) para la comparación "gasto vs.
   * presupuesto" — si no está cargado, esa comparación no se muestra.
   */
  monthly_budget?: number;
  /**
   * System User token de Meta Ads propio de este cliente (Marketing API).
   * Si no está seteado, fetchMetaGraphApi cae al token de agencia compartido
   * (env var META_ADS_SYSTEM_USER_TOKEN) para no romper clientes que todavía
   * usan ese esquema. Nunca se manda al cliente en initialConfig (ver
   * page.tsx) — el form solo sabe si hay uno guardado (hasStoredToken).
   */
  system_user_token?: string;
}

export interface Admin {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface ClientUser {
  id: string;
  client_id: string;
  email: string;
  created_at: string;
}

export interface DataSource {
  id: string;
  client_id: string;
  source_type: DataSourceType;
  connection_type: ConnectionType;
  config: Record<string, unknown>;
  created_at: string;
}

export type ReportStatus = "pending" | "generating" | "completed" | "failed";

export interface Report {
  id: string;
  client_id: string;
  prompt_text: string;
  date_range_start: string;
  date_range_end: string;
  status: ReportStatus;
  structured_content: ReportContent | null;
  error_message: string | null;
  created_at: string;
  created_by: string;
}

// Subconjunto de columnas que necesita el historial de informes (InformesPopup) — evita traer
// `structured_content` (puede ser un JSON grande) cuando solo hace falta listar filas.
export interface ReportSummary {
  id: string;
  created_at: string;
  prompt_text: string;
  date_range_start: string;
  date_range_end: string;
  status: ReportStatus;
}

export interface Database {
  public: {
    Tables: {
      admins: {
        Row: Admin;
        Insert: Partial<Admin> & { email: string };
        Update: Partial<Admin>;
        Relationships: [];
      };
      clients: {
        Row: Client;
        Insert: Partial<Client> & { name: string; slug: string };
        Update: Partial<Client>;
        Relationships: [];
      };
      client_users: {
        Row: ClientUser;
        Insert: Partial<ClientUser> & { client_id: string; email: string };
        Update: Partial<ClientUser>;
        Relationships: [];
      };
      data_sources: {
        Row: DataSource;
        Insert: Partial<DataSource> & {
          client_id: string;
          source_type: DataSourceType;
          connection_type: ConnectionType;
          config: Record<string, unknown>;
        };
        Update: Partial<DataSource>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Partial<Report> & {
          client_id: string;
          prompt_text: string;
          date_range_start: string;
          date_range_end: string;
          created_by: string;
        };
        Update: Partial<Report>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      data_source_type: DataSourceType;
      connection_type: ConnectionType;
      report_status: ReportStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
