"use client";

import { Textarea } from "@/components/ui/textarea";

interface FormatoEntregableBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function FormatoEntregableBlock({ value, onChange }: FormatoEntregableBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="formato-entregable"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[220px]"
      />
    </div>
  );
}
