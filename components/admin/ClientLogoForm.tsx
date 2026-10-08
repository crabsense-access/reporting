"use client";

import { useRef, useState, useTransition } from "react";
import { ImageIcon, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { removeClientLogoAction, uploadClientLogoAction } from "@/app/admin/(dashboard)/clients/actions";

/** Logo del cliente (se muestra arriba del reporte, al lado del nombre). Ver lib/reporting/clientLogo.ts. */
export function ClientLogoForm({ clientId, initialLogoUrl }: { clientId: string; initialLogoUrl: string | null }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const result = await uploadClientLogoAction(clientId, formData);
      if (result.error || !result.data) setError(result.error ?? "No se pudo subir el logo.");
      else setLogoUrl(result.data);
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeClientLogoAction(clientId);
      if (result.error) setError(result.error);
      else setLogoUrl(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label>Logo</Label>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center rounded-md border border-border bg-background p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo del cliente" className="max-h-full max-w-full object-contain" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={isPending}>
          <Upload className="h-4 w-4" />
          {isPending ? "Guardando…" : logoUrl ? "Cambiar logo" : "Subir logo"}
        </Button>
        {logoUrl && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Quitar
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPG, WEBP o SVG, hasta 2 MB. Ideal: fondo transparente.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
