"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { DiagnosticPromptDef } from "@/lib/reports/diagnosticPrompts";

interface DiagnosticPromptBlockProps {
  def: DiagnosticPromptDef;
  active: boolean;
  included: boolean;
  text: string;
  configSummary: string | null;
  onToggle: (included: boolean) => void;
  onTextChange: (text: string) => void;
}

export function DiagnosticPromptBlock({
  def,
  active,
  included,
  text,
  configSummary,
  onToggle,
  onTextChange,
}: DiagnosticPromptBlockProps) {
  const checked = active && included;

  return (
    <Card className={active ? undefined : "opacity-60"}>
      <CardHeader className="flex flex-row items-start gap-3 space-y-0">
        <Checkbox
          id={`diag-${def.id}`}
          checked={checked}
          disabled={!active}
          onCheckedChange={onToggle}
        />
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={`diag-${def.id}`} className="cursor-pointer text-base font-semibold text-foreground">
            {def.titulo}
          </Label>
          <p className="text-xs text-muted-foreground">{def.subtitulo}</p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!active && <p className="text-xs italic text-muted-foreground">{def.requisitoLabel}</p>}
        {active && configSummary && (
          <p className="rounded-md bg-secondary/50 px-3 py-2 text-xs text-muted-foreground">{configSummary}</p>
        )}
        <Textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          disabled={!active}
          className="min-h-[180px]"
        />
      </CardContent>
    </Card>
  );
}
