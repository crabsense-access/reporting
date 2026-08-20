// El Ad Account ID de Meta siempre lleva el prefijo "act_" (ej. "act_123456789012345).
// Normalizamos acá para que el alta de cliente tolere que el admin pegue el ID
// con o sin el prefijo, o con "ACT_" en mayúsculas.
export function normalizeMetaAdAccountId(value: string): string {
  const withoutPrefix = value.trim().replace(/^act_/i, "");
  return withoutPrefix ? `act_${withoutPrefix}` : "";
}
