"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDate, getPresetRange } from "@/lib/date-range";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";

const PRESETS: { value: Exclude<DateRangePreset, "custom">; label: string }[] = [
  { value: "7d", label: "Últimos 7 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "90d", label: "Últimos 90 días" },
];

interface DateRangeSelectorProps {
  preset: DateRangePreset;
  range: DateRangeValue;
  onChange: (preset: DateRangePreset, range: DateRangeValue) => void;
}

export function DateRangeSelector({ preset, range, onChange }: DateRangeSelectorProps) {
  const [customFrom, setCustomFrom] = useState(range.from);
  const [customTo, setCustomTo] = useState(range.to);

  useEffect(() => {
    if (preset !== "custom") {
      setCustomFrom(range.from);
      setCustomTo(range.to);
    }
  }, [range, preset]);

  function handlePresetClick(value: Exclude<DateRangePreset, "custom">) {
    onChange(value, getPresetRange(value));
  }

  function handleCustomApply() {
    if (customFrom && customTo && customFrom <= customTo) {
      onChange("custom", { from: customFrom, to: customTo });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((item) => (
        <Button
          key={item.value}
          type="button"
          size="sm"
          variant={preset === item.value ? "default" : "outline"}
          onClick={() => handlePresetClick(item.value)}
        >
          {item.label}
        </Button>
      ))}
      <Button
        type="button"
        size="sm"
        variant={preset === "custom" ? "default" : "outline"}
        onClick={() => {
          if (preset !== "custom") onChange("custom", { from: customFrom, to: customTo });
        }}
      >
        Personalizado
      </Button>
      {preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Desde"
          />
          <span className="text-sm text-muted-foreground">a</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={formatDate(new Date())}
            onChange={(event) => setCustomTo(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Hasta"
          />
          <Button type="button" size="sm" variant="secondary" onClick={handleCustomApply}>
            Aplicar
          </Button>
        </div>
      )}
    </div>
  );
}
