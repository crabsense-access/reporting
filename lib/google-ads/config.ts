/**
 * El cliente es ecommerce en Google Ads (switch "Es un ecommerce" del Admin): habilita Facturación,
 * Ticket promedio y ROAS. Las configs guardadas antes de que existiera el switch (sin el campo) se
 * toman como ecommerce, para no cambiarles el reporte; sólo `false` explícito lo apaga.
 */
export function isGoogleAdsEcommerce(config?: { is_ecommerce?: boolean } | null): boolean {
  return config?.is_ecommerce !== false;
}

export function normalizeGoogleAdsCustomerId(value: string): string {
  return value.replace(/\D/g, "");
}

export function formatGoogleAdsCustomerId(value: string): string {
  const digits = normalizeGoogleAdsCustomerId(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}
