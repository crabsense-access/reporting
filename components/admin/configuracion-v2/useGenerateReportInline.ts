"use client";

import { useState } from "react";

type StreamEvent =
  | { type: "status"; message: string }
  | { type: "done"; reportId: string }
  | { type: "error"; message: string };

// Variante de useGenerateReport (components/admin/reports/) para Configuración v2: en vez de
// redirigir a /admin/clients/{clientId}/informes/{reportId} al terminar, avisa por callback para
// que el resultado se muestre inline con DiagnosticReportView, sin salir de la página.
export function useGenerateReportInline(clientId: string, onDone: (reportId: string) => void) {
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
            setIsSubmitting(false);
            onDone(event.reportId);
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
