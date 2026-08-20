export type DataSourceType =
  | "ga4"
  | "search_console"
  | "google_ads"
  | "meta_ads"
  | "linkedin_ads";

export type ConnectionType = "service_account" | "oauth_agency" | "oauth_client";

export interface GA4Config {
  property_id: string;
  primary_goals: string[];
  secondary_goals: string[];
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
}

export interface GoogleAdsConfig {
  customer_id: string;
}

export interface MetaAdsConfig {
  ad_account_id: string;
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

export type InsightSentimentValue = "positive" | "negative" | "neutral";

export interface DashboardInsight {
  id: string;
  client_id: string;
  dashboard: string;
  metric_key: string;
  range_from: string;
  range_to: string;
  conversion_event: string;
  insight_text: string;
  sentiment: InsightSentimentValue;
  model: string;
  generated_at: string;
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
      dashboard_insights: {
        Row: DashboardInsight;
        Insert: Partial<DashboardInsight> & {
          client_id: string;
          dashboard: string;
          metric_key: string;
          range_from: string;
          range_to: string;
          insight_text: string;
          sentiment: InsightSentimentValue;
          model: string;
        };
        Update: Partial<DashboardInsight>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      data_source_type: DataSourceType;
      connection_type: ConnectionType;
    };
    CompositeTypes: Record<string, never>;
  };
}
