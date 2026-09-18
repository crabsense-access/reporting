"use client";

import { Textarea } from "@/components/ui/textarea";

interface Top10AccionesBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function Top10AccionesBlock({ value, onChange }: Top10AccionesBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="top10-acciones"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[220px]"
      />
    </div>
  );
}
