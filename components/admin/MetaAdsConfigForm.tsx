"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveMetaAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import { normalizeMetaAdAccountId } from "@/lib/meta-ads/config";
import type { MetaAdsConfig } from "@/lib/types";

interface MetaAdsConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: MetaAdsConfig | null;
}

export function MetaAdsConfigForm({
  clientId,
  dataSourceId,
  initialConfig,
}: MetaAdsConfigFormProps) {
  const [enabled, setEnabled] = useState(Boolean(initialConfig?.ad_account_id));
  const [adAccountId, setAdAccountId] = useState(initialConfig?.ad_account_id ?? "");
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleSave() {
    const normalizedAccountId = normalizeMetaAdAccountId(adAccountId);
    const config = enabled && normalizedAccountId ? { ad_account_id: normalizedAccountId } : null;

    setStatus("idle");
    setSaveError(null);
    startTransition(async () => {
      const result = await saveMetaAdsConfigAction(clientId, dataSourceId, config);
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
          <Label htmlFor="meta-ads-enabled">¿Este cliente tiene Meta Ads conectado?</Label>
          <p className="text-sm text-muted-foreground">
            Activalo para vincular la cuenta de Meta (Facebook/Instagram Ads) con el Business
            Manager de la agencia.
          </p>
        </div>
        <Switch
          id="meta-ads-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
        />
      </div>

      {enabled && (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
          <Label htmlFor="meta-ads-account-id">Ad Account ID de Meta</Label>
          <Input
            id="meta-ads-account-id"
            value={adAccountId}
            onChange={(event) => setAdAccountId(event.target.value)}
            placeholder="Ej: act_1234567890"
          />
          <p className="text-xs text-muted-foreground">
            Ingresá el Ad Account ID en formato act_XXXXXXXXXX. La cuenta tiene que estar
            compartida previamente con el Business Manager de la agencia.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || (enabled && adAccountId.trim().length === 0)}
        >
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
