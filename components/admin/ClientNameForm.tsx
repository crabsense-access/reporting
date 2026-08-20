"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateClientNameAction } from "@/app/admin/(dashboard)/clients/actions";

export function ClientNameForm({ clientId, initialName }: { clientId: string; initialName: string }) {
  const [name, setName] = useState(initialName);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function handleSave() {
    setStatus("idle");
    startTransition(async () => {
      const result = await updateClientNameAction(clientId, name.trim());
      setStatus(result.error ? "error" : "saved");
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="client-name">Nombre</Label>
        <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending || name.trim().length === 0}>
          {isPending ? "Guardando…" : "Guardar"}
        </Button>
        {status === "saved" && <span className="text-sm text-emerald-600">Guardado</span>}
        {status === "error" && <span className="text-sm text-destructive">Error al guardar</span>}
      </div>
    </div>
  );
}
