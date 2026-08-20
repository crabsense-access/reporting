"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DynamicListField } from "@/components/admin/DynamicListField";
import { updateGA4ConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import type { GA4Config } from "@/lib/types";

interface GA4ConfigFormProps {
  clientId: string;
  dataSourceId: string;
  initialConfig: GA4Config;
}

export function GA4ConfigForm({ clientId, dataSourceId, initialConfig }: GA4ConfigFormProps) {
  const [propertyId, setPropertyId] = useState(initialConfig.property_id);
  const [primaryGoals, setPrimaryGoals] = useState<string[]>(
    initialConfig.primary_goals.length > 0 ? initialConfig.primary_goals : [""]
  );
  const [secondaryGoals, setSecondaryGoals] = useState<string[]>(
    initialConfig.secondary_goals.length > 0 ? initialConfig.secondary_goals : [""]
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  function handleSave() {
    setStatus("idle");
    startTransition(async () => {
      const result = await updateGA4ConfigAction(dataSourceId, clientId, {
        property_id: propertyId.trim(),
        primary_goals: primaryGoals.map((goal) => goal.trim()).filter(Boolean),
        secondary_goals: secondaryGoals.map((goal) => goal.trim()).filter(Boolean),
      });
      setStatus(result.error ? "error" : "saved");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="property-id">Property ID de GA4</Label>
        <Input
          id="property-id"
          value={propertyId}
          onChange={(event) => setPropertyId(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Objetivos primarios</Label>
        <DynamicListField values={primaryGoals} onChange={setPrimaryGoals} addLabel="Agregar objetivo" />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Objetivos secundarios</Label>
        <DynamicListField values={secondaryGoals} onChange={setSecondaryGoals} addLabel="Agregar objetivo" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {status === "saved" && <span className="text-sm text-emerald-600">Guardado</span>}
        {status === "error" && <span className="text-sm text-destructive">No se pudo guardar</span>}
      </div>
    </div>
  );
}
