"use client";

import { useMemo } from "react";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatNumber } from "@/lib/format";
import type { DateRangeValue } from "@/lib/date-range";
import type { SeoDailyImpressionPoint } from "@/lib/gsc/reports";

export interface EntityWithDailyImpressions {
  key: string;
  dailyImpressions: SeoDailyImpressionPoint[];
}

interface EntityDailyLineChartProps {
  entities: EntityWithDailyImpressions[];
  range: DateRangeValue;
  /** Color de acento para la línea resaltada al hacer hover de una fila — verde (Nuevas) o rojo (Perdidas). */
  accentColor: string;
}

// Gris claro fijo para las líneas sin resaltar — deliberadamente NO usa
// --muted-foreground (que ya se usa para texto/ejes en todo el tablero) para
// que el contraste con la línea resaltada sea más notorio.
const UNHIGHLIGHTED_COLOR = "hsl(220 9% 82%)";

function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = parseISO(from);
  const end = parseISO(to);
  while (cursor <= end) {
    dates.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

interface WideRow {
  date: string;
  label: string;
  values: Record<string, number>;
}

// Gráfico de líneas de impresiones diarias, una línea por entidad (keyword o
// página) visible en la tabla en ese momento — mismo dataset que la tabla
// (ver churnDrilldown.ts). Compartido entre KeywordChurnCard y
// PageChurnCard, sin datos propios: recibe ya resueltos qué entidades
// mostrar, en qué rango de fechas, y cuál está resaltada por hover en la
// tabla (`hoveredKey`, controlado por el padre).
export function EntityDailyLineChart({ entities, range, accentColor, hoveredKey }: EntityDailyLineChartProps & { hoveredKey: string | null }) {
  const dates = useMemo(() => enumerateDates(range.from, range.to), [range.from, range.to]);

  const dailyMaps = useMemo(
    () => new Map(entities.map((entity) => [entity.key, new Map(entity.dailyImpressions.map((point) => [point.date, point.impressions]))])),
    [entities]
  );

  const data: WideRow[] = useMemo(
    () =>
      dates.map((date) => ({
        date,
        label: format(parseISO(date), "d MMM", { locale: es }),
        values: Object.fromEntries(entities.map((entity) => [entity.key, dailyMaps.get(entity.key)?.get(date) ?? 0])),
      })),
    [dates, entities, dailyMaps]
  );

  // La línea resaltada se dibuja al final — en SVG, lo que se dibuja después
  // queda arriba, así la línea de hover nunca queda tapada por las grises.
  const orderedEntities = useMemo(() => {
    if (!hoveredKey) return entities;
    const hovered = entities.find((entity) => entity.key === hoveredKey);
    if (!hovered) return entities;
    return [...entities.filter((entity) => entity.key !== hoveredKey), hovered];
  }, [entities, hoveredKey]);

  if (entities.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Sin entidades para mostrar.</div>;
  }

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            width={40}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => formatNumber(value)}
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--muted-foreground))", strokeDasharray: "3 3" }}
            content={({ active, payload, label }) => {
              // Solo se arma tooltip cuando hay una fila resaltada por hover
              // — con decenas/cientos de líneas, un tooltip "de todas a la
              // vez" sería ilegible y no es lo que pide el hover cruzado.
              if (!active || !hoveredKey) return null;
              const row = payload?.[0]?.payload as WideRow | undefined;
              const value = row?.values[hoveredKey];
              if (value === undefined) return null;
              return (
                <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
                  <p className="font-medium text-foreground">{label}</p>
                  <p className="text-muted-foreground">Impresiones: {formatNumber(value)}</p>
                </div>
              );
            }}
          />
          {orderedEntities.map((entity) => {
            const isHovered = entity.key === hoveredKey;
            return (
              <Line
                key={entity.key}
                dataKey={(row: WideRow) => row.values[entity.key]}
                stroke={isHovered ? accentColor : UNHIGHLIGHTED_COLOR}
                strokeWidth={isHovered ? 2.5 : 1}
                strokeOpacity={hoveredKey && !isHovered ? 0.35 : 1}
                dot={false}
                isAnimationActive={false}
                type="monotone"
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
