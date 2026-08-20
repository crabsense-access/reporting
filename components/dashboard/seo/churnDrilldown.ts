// Lógica de drill-down compartida entre KeywordChurnCard y PageChurnCard
// (Keywords/Páginas Nuevas y Perdidas) — click en una barra del gráfico de
// tendencia filtra la tabla (y el gráfico de líneas) a las entidades activas
// en ese rango de fechas puntual. No es un componente, solo funciones puras,
// para poder testear/reusar sin acoplarse a la UI de ninguna de las 2
// tarjetas.
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type { DateRangeValue } from "@/lib/date-range";
import type { SeoDailyImpressionPoint } from "@/lib/gsc/reports";

export interface ChurnTrendBucketLike {
  key: string;
  startDate: string;
  endDate: string;
}

// El gráfico de tendencia SIEMPRE bucketiza currentWindow, sea cual sea el
// tipo de tarjeta (así está construido fetchKeywordChurn/fetchPageChurn) —
// pero las entidades de una tarjeta "Perdidas" solo tienen datos en
// previousWindow. Si se seleccionó un bucket en una tarjeta "Perdidas", se
// mapea la posición relativa de ese bucket dentro de currentWindow a la
// misma posición dentro de previousWindow (mismo largo por construcción),
// para poder filtrar por fecha entidades que en realidad viven en la
// ventana anterior.
export function resolveActiveDateRange(
  type: "new" | "lost",
  currentWindow: DateRangeValue,
  previousWindow: DateRangeValue,
  selectedBucket: ChurnTrendBucketLike | null
): DateRangeValue {
  const baseWindow = type === "new" ? currentWindow : previousWindow;
  if (!selectedBucket) return baseWindow;
  if (type === "new") return { from: selectedBucket.startDate, to: selectedBucket.endDate };

  const offsetStart = differenceInCalendarDays(parseISO(selectedBucket.startDate), parseISO(currentWindow.from));
  const offsetEnd = differenceInCalendarDays(parseISO(selectedBucket.endDate), parseISO(currentWindow.from));
  return {
    from: format(addDays(parseISO(previousWindow.from), offsetStart), "yyyy-MM-dd"),
    to: format(addDays(parseISO(previousWindow.from), offsetEnd), "yyyy-MM-dd"),
  };
}

// Filtra por actividad real (impresiones > 0 algún día) dentro de
// `activeRange`, usando la serie diaria propia de cada entidad — no por
// pertenencia a un set de "ganadas/perdidas" calculado aparte, que para
// tarjetas "Perdidas" casi nunca coincidiría con la lista maestra (por
// construcción son ventanas de comparación distintas). Sin filtro (rango
// activo == ventana completa) devuelve todas, sin recorrer nada.
export function filterEntitiesByDateRange<T extends { dailyImpressions: SeoDailyImpressionPoint[] }>(
  entities: T[],
  activeRange: DateRangeValue,
  fullWindow: DateRangeValue
): T[] {
  if (activeRange.from === fullWindow.from && activeRange.to === fullWindow.to) return entities;
  return entities.filter((entity) =>
    entity.dailyImpressions.some((point) => point.date >= activeRange.from && point.date <= activeRange.to && point.impressions > 0)
  );
}
