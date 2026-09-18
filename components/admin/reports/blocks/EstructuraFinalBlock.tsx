"use client";

import { Textarea } from "@/components/ui/textarea";

interface EstructuraFinalBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function EstructuraFinalBlock({ value, onChange }: EstructuraFinalBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="estructura-final"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[220px]"
      />
    </div>
  );
}
