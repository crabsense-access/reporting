"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; reportId: string }
  | { type: "error"; message: string };

// Compartido por NewReportForm (Prompt B) y RegenerateReportModal (Prompt C) — arma la request
// al endpoint de generación (Prompt A, ahora streaming NDJSON) y traduce cada línea a un paso
// del checklist visual. `generate` recibe el body ya armado (cada formulario tiene su propio
// shape de payload) en vez de parámetros posicionales, para no atar el hook a un formulario
// puntual. La lectura del stream y el redirect (a /admin/clients/{clientId}/informes/{reportId})
// quedan igual que antes.
export function useGenerateReport(clientId: string) {
  const router = useRouter();
  const [steps, setSteps] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(body: Record<string, unknown>) {
    setError(null);
    setSteps([]);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/clients/${clientId}/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok || !response.body) {
        const responseBody = await response.json().catch(() => null);
        setError(responseBody?.error ?? `No se pudo generar el informe (HTTP ${response.status}).`);
        setIsSubmitting(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          if (!line) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === "status") {
            setSteps((prev) => [...prev, event.message]);
          } else if (event.type === "done") {
            router.push(`/admin/clients/${clientId}/informes/${event.reportId}`);
            return;
          } else if (event.type === "error") {
            setError(event.message);
            setIsSubmitting(false);
            return;
          }
        }
      }
    } catch {
      setError("No se pudo conectar con el servidor. Probá de nuevo.");
      setIsSubmitting(false);
    }
  }

  return { steps, isSubmitting, error, generate };
}
