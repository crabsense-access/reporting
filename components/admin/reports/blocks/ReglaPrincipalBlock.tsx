"use client";

import { Textarea } from "@/components/ui/textarea";

interface ReglaPrincipalBlockProps {
  value: string;
  onChange: (value: string) => void;
}

export function ReglaPrincipalBlock({ value, onChange }: ReglaPrincipalBlockProps) {
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        id="regla-principal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[220px]"
      />
    </div>
  );
}
