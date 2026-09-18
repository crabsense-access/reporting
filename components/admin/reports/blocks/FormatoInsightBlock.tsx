"use client";

import { Textarea } from "@/components/ui/textarea";

interface FormatoInsightBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function FormatoInsightBlock({ value, onChange }: FormatoInsightBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="formato-insight"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[220px]"
      />
    </div>
  );
}
