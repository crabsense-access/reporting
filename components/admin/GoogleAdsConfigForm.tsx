"use client";

import { useState, useTransition } from "react";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { saveGoogleAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import { formatGoogleAdsCustomerId, normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";
import type { GoogleAdsConfig } from "@/lib/types";

interface GoogleAdsConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: GoogleAdsConfig | null;
  configured: boolean;
}

export function GoogleAdsConfigForm({
  clientId,
  dataSourceId,
  initialConfig,
  configured,
}: GoogleAdsConfigFormProps) {
  const [enabled, setEnabled] = useState(Boolean(initialConfig?.customer_id));
  const [customerId, setCustomerId] = useState(() =>
    initialConfig?.customer_id ? normalizeGoogleAdsCustomerId(initialConfig.customer_id) : ""
  );
  const [primaryGoal, setPrimaryGoal] = useState(initialConfig?.primary_goal ?? "");
  const [secondaryGoal, setSecondaryGoal] = useState(initialConfig?.secondary_goal ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave() {
    const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
    const config =
      enabled && normalizedCustomerId
        ? {
            customer_id: normalizedCustomerId,
            primary_goal: primaryGoal.trim(),
            secondary_goal: secondaryGoal.trim(),
          }
        : null;

    setStatus("idle");
    setSaveError(null);
    startTransition(async () => {
      const result = await saveGoogleAdsConfigAction(clientId, dataSourceId, config);
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
      id="google-ads"
      icon={<SourceIcon src="/icons/google-ads.png" alt="Google Ads" connected={configured} />}
      title="Google Ads"
      description="Customer ID de la cuenta de Ads vinculada a la MCC de la agencia."
      status={<SourceStatusBadge configured={configured} />}
      headerRight={
        <Switch
          id="ads-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
        />
      }
    >
      <div className="flex flex-col gap-6">
        {enabled ? (
          <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="ads-customer-id">Customer ID de Google Ads</Label>
              <Input
                id="ads-customer-id"
                value={formatGoogleAdsCustomerId(customerId)}
                onChange={(event) => setCustomerId(normalizeGoogleAdsCustomerId(event.target.value))}
                placeholder="Ej: 123-456-7890"
              />
              <p className="text-xs text-muted-foreground">
                Ingresá el Customer ID de la cuenta de Ads en formato XXX-XXX-XXXX, tal como aparece
                en Google Ads. La cuenta tiene que estar vinculada previamente a la MCC de la agencia
                (4391931539).
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ads-primary-goal">Objetivo principal</Label>
              <Textarea
                id="ads-primary-goal"
                value={primaryGoal}
                onChange={(event) => setPrimaryGoal(event.target.value)}
                placeholder="Describí el objetivo principal de este cliente en Google Ads."
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ads-secondary-goal">Objetivo secundario</Label>
              <Textarea
                id="ads-secondary-goal"
                value={secondaryGoal}
                onChange={(event) => setSecondaryGoal(event.target.value)}
                placeholder="Describí el objetivo secundario de este cliente en Google Ads (opcional)."
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Activá el switch de arriba para conectar Google Ads.
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || (enabled && customerId.length === 0)}
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
