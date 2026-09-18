"use client";

import { Textarea } from "@/components/ui/textarea";

interface PrincipioFinalBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function PrincipioFinalBlock({ value, onChange }: PrincipioFinalBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="principio-final"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[280px]"
      />
    </div>
  );
}
