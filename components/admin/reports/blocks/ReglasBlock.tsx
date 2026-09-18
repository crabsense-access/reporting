"use client";

import { Textarea } from "@/components/ui/textarea";

interface ReglasBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function ReglasBlock({ value, onChange }: ReglasBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="reglas"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[280px]"
      />
    </div>
  );
}
