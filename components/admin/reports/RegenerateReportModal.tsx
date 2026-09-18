"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DateRangeSelector } from "@/components/DateRangeSelector";
import { GeneratingOverlay } from "@/components/admin/reports/GeneratingOverlay";
import { useGenerateReport } from "@/components/admin/reports/useGenerateReport";
import type { DateRangePreset, DateRangeValue } from "@/lib/date-range";

interface RegenerateReportModalProps {
  clientId: string;
  clientName: string;
  initialPromptText: string;
  initialRange: DateRangeValue;
}

// Mismo endpoint de generación que NewReportForm (Prompt A) — no duplica la lógica de
// generación, solo arma otra request con los valores (editados o no) precargados de este
// informe. El resultado siempre es una fila nueva en `reports`, nunca modifica la actual.
export function RegenerateReportModal({
  clientId,
  clientName,
  initialPromptText,
  initialRange,
}: RegenerateReportModalProps) {
  const [promptText, setPromptText] = useState(initialPromptText);
  const [preset, setPreset] = useState<DateRangePreset>("custom");
  const [range, setRange] = useState<DateRangeValue>(initialRange);
  const { steps, isSubmitting, error, generate } = useGenerateReport(clientId);

  function handleRangeChange(nextPreset: DateRangePreset, nextRange: DateRangeValue) {
    setPreset(nextPreset);
    setRange(nextRange);
  }

  const canSubmit = promptText.trim().length > 0 && !isSubmitting;

  return (
    <>
      {isSubmitting && <GeneratingOverlay clientName={clientName} steps={steps} />}
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Regenerar informe
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Regenerar informe</DialogTitle>
            <DialogDescription>
              Genera un informe nuevo e independiente para {clientName} — este no se modifica ni
              se borra.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label>Rango de fechas</Label>
            <DateRangeSelector preset={preset} range={range} onChange={handleRangeChange} />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="regenerate-prompt">Prompt</Label>
            <Textarea
              id="regenerate-prompt"
              value={promptText}
              onChange={(event) => setPromptText(event.target.value)}
              className="min-h-[160px]"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              onClick={() =>
                generate({ promptText: promptText.trim(), dateRangeStart: range.from, dateRangeEnd: range.to })
              }
              disabled={!canSubmit}
            >
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
