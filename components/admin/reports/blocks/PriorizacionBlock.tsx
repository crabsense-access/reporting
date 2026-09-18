"use client";

import { Textarea } from "@/components/ui/textarea";

interface PriorizacionBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function PriorizacionBlock({ value, onChange }: PriorizacionBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="priorizacion"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[280px]"
      />
    </div>
  );
}
