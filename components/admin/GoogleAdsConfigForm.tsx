"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveGoogleAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import { formatGoogleAdsCustomerId, normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";
import type { GoogleAdsConfig } from "@/lib/types";

interface GoogleAdsConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: GoogleAdsConfig | null;
}

export function GoogleAdsConfigForm({
  clientId,
  dataSourceId,
  initialConfig,
}: GoogleAdsConfigFormProps) {
  const [enabled, setEnabled] = useState(Boolean(initialConfig?.customer_id));
  const [customerId, setCustomerId] = useState(() =>
    initialConfig?.customer_id ? normalizeGoogleAdsCustomerId(initialConfig.customer_id) : ""
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave() {
    const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
    const config = enabled && normalizedCustomerId ? { customer_id: normalizedCustomerId } : null;

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
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="ads-enabled">¿Este cliente tiene Google Ads conectado?</Label>
          <p className="text-sm text-muted-foreground">
            Activalo para vincular la cuenta de Ads con la MCC de la agencia a través de OAuth.
          </p>
        </div>
        <Switch
          id="ads-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
        />
      </div>

      {enabled && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
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
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={isPending || (enabled && customerId.length === 0)}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {status === "saved" && <span className="text-sm text-emerald-600">Guardado</span>}
        {status === "error" && (
          <span className="text-sm text-destructive">{saveError ?? "No se pudo guardar"}</span>
        )}
      </div>
    </div>
  );
}
