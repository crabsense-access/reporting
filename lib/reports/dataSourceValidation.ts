import type { DataSourceType } from "@/lib/types";

interface ConfigurableSource {
  source_type: DataSourceType;
  config: Record<string, unknown>;
}

function hasNonEmptyString(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  return typeof value === "string" && value.trim().length > 0;
}

// Campo obligatorio por tipo de fuente que indica que ya se cargó la config real del cliente
// (no alcanza con que exista la fila en data_sources) — usado para activar/desactivar los
// bloques de prompts de diagnóstico en Configuración v2.
const REQUIRED_CONFIG_FIELD: Record<DataSourceType, string | null> = {
  ga4: "property_id",
  search_console: "site_url",
  google_ads: "customer_id",
  meta_ads: "ad_account_id",
  linkedin_ads: null,
};

export function isSourceConfigured(source: ConfigurableSource): boolean {
  const field = REQUIRED_CONFIG_FIELD[source.source_type];
  if (!field) return false;
  return hasNonEmptyString(source.config, field);
}
