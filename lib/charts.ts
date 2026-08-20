// Utilidades compartidas por TODOS los gráficos de barras del tablero que
// muestran una métrica de conteo (páginas, keywords, clicks, impresiones,
// etc.) — a nivel base, para no repetir el fix bloque por bloque (Prompt 62).

// Redondea un paso "crudo" al siguiente múltiplo entero "lindo" (1, 2, 5, 10,
// 20, 50, 100...) — nunca menor a 1, así el eje nunca necesita decimales.
function niceIntegerStep(roughStep: number): number {
  const step = Math.max(1, Math.ceil(roughStep));
  const magnitude = 10 ** Math.floor(Math.log10(step));
  const normalized = step / magnitude;
  let niceNormalized: number;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;
  return Math.max(1, Math.round(niceNormalized * magnitude));
}

// Ticks enteros sin duplicados para el eje Y de un gráfico de barras, a
// partir del valor máximo REAL de los datos que se van a graficar — evita el
// bug de ticks enteros repetidos (ej. "2" dos veces, "1" dos veces) que
// aparece cuando recharts reparte un rango chico (ej. 0 a 2) en una cantidad
// FIJA de ticks (ej. 5) y redondea cada uno a entero: 0, 0.5, 1, 1.5, 2 →
// 0, 1, 1, 2, 2. Acá el paso entre ticks se elige según el rango real (1, 2,
// 5, 10, 20...), así la cantidad de ticks varía con los datos en vez de
// forzarse siempre a `targetTickCount`. Se usa junto con `allowDecimals={false}`
// en el <YAxis>.
export function integerYAxisTicks(maxValue: number, targetTickCount = 5): number[] {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return [0, 1];

  const roughStep = maxValue / Math.max(targetTickCount - 1, 1);
  const step = niceIntegerStep(roughStep);
  const niceMax = Math.ceil(maxValue / step) * step;

  const ticks: number[] = [];
  for (let value = 0; value <= niceMax; value += step) {
    ticks.push(value);
  }
  return ticks;
}

// Rango fijo 0-100% en pasos de 25%, para ejes de porcentaje (ej. CTR en
// eje secundario, Prompt 61) que NO deben autoescalar según los datos —
// siempre la escala completa, sin importar cuán bajo sea el valor real. Los
// valores están en fracción (0-1, no 0-100), mismo formato que `formatPercent`
// (lib/format.ts) espera.
export const PERCENT_AXIS_DOMAIN: [number, number] = [0, 1];
export const PERCENT_AXIS_TICKS = [0, 0.25, 0.5, 0.75, 1];
