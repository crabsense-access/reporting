"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";

interface PeriodoBlockProps {
  preset: DateRangePreset;
  range: DateRangeValue;
  onRangeChange: (preset: DateRangePreset, range: DateRangeValue) => void;
  instrucciones: string;
  onInstruccionesChange: (value: string) => void;
}

// Agrupa el selector de rango de fechas ya existente (sin tocarlo) con un textarea nuevo de
// instrucciones sobre cómo analizar ese período.
export function PeriodoBlock({
  preset,
  range,
  onRangeChange,
  instrucciones,
  onInstruccionesChange,
}: PeriodoBlockProps) {
  return (
    <div className="flex flex-col gap-4">
      <DateRangeSelector preset={preset} range={range} onChange={onRangeChange} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="periodo-instrucciones">Instrucciones sobre el período</Label>
        <Textarea
          id="periodo-instrucciones"
          value={instrucciones}
          onChange={(event) => onInstruccionesChange(event.target.value)}
          className="min-h-[140px]"
        />
      </div>
    </div>
  );
}
