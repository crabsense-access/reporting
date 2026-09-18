"use client";

import { useState, useTransition } from "react";
import { SiGoogleanalytics } from "react-icons/si";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { saveGA4ConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import type { GA4Config } from "@/lib/types";

interface GA4ConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: GA4Config | null;
  configured: boolean;
}

export function GA4ConfigForm({ clientId, dataSourceId, initialConfig, configured }: GA4ConfigFormProps) {
  const [enabled, setEnabled] = useState(Boolean(initialConfig?.property_id));
  const [propertyId, setPropertyId] = useState(initialConfig?.property_id ?? "");
  const [primaryGoal, setPrimaryGoal] = useState(initialConfig?.primary_goal ?? "");
  const [secondaryGoal, setSecondaryGoal] = useState(initialConfig?.secondary_goal ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave() {
    const trimmedPropertyId = propertyId.trim();
    const config =
      enabled && trimmedPropertyId
        ? {
            property_id: trimmedPropertyId,
            primary_goal: primaryGoal.trim(),
            secondary_goal: secondaryGoal.trim(),
          }
        : null;

    setStatus("idle");
    setSaveError(null);
    startTransition(async () => {
      const result = await saveGA4ConfigAction(clientId, dataSourceId, config);
      if (result.error) {
        setStatus("error");
        setSaveError(result.error);
        return;
      }
      setStatus("saved");
    });
  }

  return (
    <AccordionItem
      id="ga4"
      icon={
        <SiGoogleanalytics
          className={configured ? undefined : "text-muted-foreground"}
          color={configured ? "#E37400" : undefined}
        />
      }
      title="GA4"
      description="Property ID y objetivos que se muestran en su tablero."
      status={<SourceStatusBadge configured={configured} />}
      headerRight={
        <Switch id="ga4-enabled" checked={enabled} onCheckedChange={(checked) => setEnabled(checked)} />
      }
    >
      <div className="flex flex-col gap-6">
        {enabled ? (
          <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="property-id">Property ID de GA4</Label>
              <Input
                id="property-id"
                value={propertyId}
                onChange={(event) => setPropertyId(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ga4-primary-goal">Objetivo principal</Label>
              <Textarea
                id="ga4-primary-goal"
                value={primaryGoal}
                onChange={(event) => setPrimaryGoal(event.target.value)}
                placeholder="Describí el objetivo principal de este cliente en GA4."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ga4-secondary-goal">Objetivo secundario</Label>
              <Textarea
                id="ga4-secondary-goal"
                value={secondaryGoal}
                onChange={(event) => setSecondaryGoal(event.target.value)}
                placeholder="Describí el objetivo secundario de este cliente en GA4 (opcional)."
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Activá el switch de arriba para conectar GA4.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || (enabled && propertyId.trim().length === 0)}
          >
            {isPending ? "Guardando…" : "Guardar cambios"}
          </Button>
          {status === "saved" && <span className="text-sm text-emerald-600">Guardado</span>}
          {status === "error" && (
            <span className="text-sm text-destructive">{saveError ?? "No se pudo guardar"}</span>
          )}
        </div>
      </div>
    </AccordionItem>
  );
}
