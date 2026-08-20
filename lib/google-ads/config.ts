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
