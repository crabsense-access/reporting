import { format, subDays } from "date-fns";

import type { TrendPoint } from "@/lib/ga4/types";

export interface MockScorecardValue {
  current: number;
  previous: number;
  variationPct: number;
}

export interface MockShareItem {
  label: string;
  value: number;
  pct: number;
}

// Hash de string -> entero, para derivar una semilla numérica estable a
// partir de una clave legible (ej. "usuarios:activos").
function hashSeed(seedKey: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    hash ^= seedKey.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// PRNG determinístico (mulberry32) — misma seedKey siempre produce la misma
// secuencia, así los datos ficticios no "saltan" entre renders.
export function createSeededRandom(seedKey: string): () => number {
  let a = hashSeed(seedKey);
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTrend(
  seedKey: string,
  { days = 30, base, volatility = 0.22 }: { days?: number; base: number; volatility?: number }
): TrendPoint[] {
  const rng = createSeededRandom(seedKey);
  const points: TrendPoint[] = [];
  let level = base;
  const today = new Date();

  for (let i = days - 1; i >= 0; i -= 1) {
    const drift = (rng() - 0.5) * volatility * 0.5;
    level = Math.max(base * 0.25, level * (1 + drift));
    const noise = 1 + (rng() - 0.5) * volatility;
    const value = Math.max(0, Math.round(level * noise));
    points.push({ bucket: format(subDays(today, i), "dd/MM"), value });
  }

  return points;
}

export function generateScorecard(seedKey: string, base: number, variance = 0.18): MockScorecardValue {
  const rng = createSeededRandom(seedKey);
  const previous = Math.max(1, Math.round(base * (1 + (rng() - 0.5) * variance)));
  const current = Math.max(1, Math.round(base * (1 + (rng() - 0.5) * variance)));
  const variationPct = ((current - previous) / previous) * 100;
  return { current, previous, variationPct };
}

// Reparte `total` entre `labels` con pesos aleatorios sesgados (algunos
// items se llevan más que otros, nunca todos iguales). `sort: false`
// preserva el orden recibido — útil para distribuciones con orden propio
// (ej. buckets de duración) en vez de rankings tipo "top N".
export function generateShares(
  seedKey: string,
  labels: string[],
  total: number,
  { sort = true, skew = 1.4 }: { sort?: boolean; skew?: number } = {}
): MockShareItem[] {
  const rng = createSeededRandom(seedKey);
  const weights = labels.map(() => rng() ** skew + 0.05);
  const sumWeights = weights.reduce((a, b) => a + b, 0);

  const rounded = weights.map((weight) => Math.round((weight / sumWeights) * total));
  const diff = total - rounded.reduce((a, b) => a + b, 0);
  if (rounded.length > 0) rounded[0] = (rounded[0] ?? 0) + diff;

  let items: MockShareItem[] = labels.map((label, i) => {
    const value = rounded[i] ?? 0;
    return { label, value, pct: total > 0 ? value / total : 0 };
  });

  if (sort) items = items.sort((a, b) => b.value - a.value);

  return items;
}

// Matriz de retención por cohorte: cada fila arranca en 100% y decae semana
// a semana con un factor propio por cohorte + ruido, sin subir nunca.
export function generateCohortMatrix(seedKey: string, cohortCount: number, weekCount: number): number[][] {
  const rng = createSeededRandom(seedKey);
  const matrix: number[][] = [];

  for (let c = 0; c < cohortCount; c += 1) {
    const row: number[] = [100];
    const decay = 0.5 + rng() * 0.25;

    for (let w = 1; w < weekCount; w += 1) {
      const previous = row[w - 1] ?? 0;
      const noise = 1 + (rng() - 0.5) * 0.2;
      const next = Math.min(previous, previous * decay * noise);
      row.push(Math.max(1, Math.round(next * 10) / 10));
    }

    matrix.push(row);
  }

  return matrix;
}
