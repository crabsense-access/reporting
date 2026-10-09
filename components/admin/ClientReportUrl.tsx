"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * URL pública del reporte del cliente (/{slug}/reporting) con botón para copiarla.
 * El origen se resuelve en el navegador para que muestre el dominio real
 * (producción, preview o localhost) sin desajustes de hidratación.
 */
export function ClientReportUrl({ clientSlug }: { clientSlug: string }) {
  const path = `/${clientSlug}/reporting`;
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const reportUrl = `${origin}${path}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin permiso de portapapeles: la URL igual queda visible para copiar a mano.
    }
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-secondary/30 py-1 pl-3 pr-1">
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="min-w-0 flex-1 truncate text-sm text-foreground underline-offset-4 hover:underline"
      >
        {reportUrl}
      </a>
      <Button asChild variant="ghost" size="icon" aria-label="Abrir el reporte en una pestaña nueva">
        <a href={path} target="_blank" rel="noreferrer">
          <ExternalLink className="h-4 w-4" />
        </a>
      </Button>
      <Button type="button" variant="ghost" size="icon" onClick={handleCopy} aria-label="Copiar URL del reporte">
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}
