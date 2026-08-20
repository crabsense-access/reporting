export function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-AR").format(Math.round(value));
}

// Para los valores mostrados EN las barras de los gráficos de barras (no
// para ejes ni tooltips, que siguen mostrando el número completo con
// formatNumber): miles con "K", millones con "M", máximo 1 decimal (sin
// forzar ".0" en los que caen justos, ej. 700000 → "700K", 700456 → "700,5K").
// No se usa Intl `notation: "compact"` porque en es-AR da salidas
// inconsistentes ("k" vs "K", con espacio) — en vez de eso arma el sufijo a
// mano sobre formatDecimal, que ya respeta el tope de 1 decimal.
export function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${formatDecimal(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${formatDecimal(value / 1_000)}K`;
  return formatNumber(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

// Máximo 1 decimal en todo el proyecto (sin forzar ".0" en enteros, ya que
// no se pasa `minimumFractionDigits`) — el cap con Math.min blinda esto
// aunque algún caller pida más.
export function formatDecimal(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: Math.min(maximumFractionDigits, 1) }).format(value);
}

export function formatCurrency(value: number, currencyCode: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits,
  }).format(value);
}

// Solo el símbolo de moneda (ej. "US$", "$"), sin formatear ningún número —
// para anteponerlo a mano al valor compactado de formatCompactCurrency.
export function getCurrencySymbol(currencyCode: string): string {
  const parts = new Intl.NumberFormat("es-AR", { style: "currency", currency: currencyCode, maximumFractionDigits: 0 }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? currencyCode;
}

// Para ejes de gráficos de barras con valores monetarios (Prompt 83): miles
// con "K", millones con "M", SIN decimales (más estricto que
// formatCompactNumber, que permite hasta 1) — con muchas barras/ticks un
// decimal de más no aporta y el eje se corta más fácil. Mismo motivo que
// formatCompactNumber para no usar Intl `notation: "compact"`: salidas
// inconsistentes en es-AR.
export function formatCompactCurrency(value: number, currencyCode: string): string {
  const abs = Math.abs(value);
  const symbol = getCurrencySymbol(currencyCode);
  if (abs >= 1_000_000) return `${symbol} ${formatNumber(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${symbol} ${formatNumber(value / 1_000)}K`;
  return `${symbol} ${formatNumber(value)}`;
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}
