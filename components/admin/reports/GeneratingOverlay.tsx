import { Check, Loader2 } from "lucide-react";

interface GeneratingOverlayProps {
  clientName: string;
  steps: string[];
}

// Pantalla de carga a pantalla completa, reusada por NewReportForm (Prompt B) y
// RegenerateReportModal (Prompt C) — un z-index alto para que tape también un modal abierto.
// Los pasos vienen del stream NDJSON del endpoint de generación: cada uno queda marcado como
// completado (check) salvo el último, que muestra el spinner "en curso".
export function GeneratingOverlay({ clientName, steps }: GeneratingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-lg font-medium text-foreground">Generando tu informe…</p>
        <p className="text-sm text-muted-foreground">
          Puede tardar un minuto: Claude está consultando las fuentes de datos conectadas de{" "}
          {clientName}.
        </p>
      </div>

      <ul className="flex w-full max-w-md flex-col gap-2">
        {steps.length === 0 && (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            Iniciando…
          </li>
        )}
        {steps.map((step, index) => {
          const isCurrent = index === steps.length - 1;
          return (
            <li key={index} className="flex items-center gap-2 text-sm">
              {isCurrent ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
              )}
              <span className={isCurrent ? "text-foreground" : "text-muted-foreground"}>{step}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
