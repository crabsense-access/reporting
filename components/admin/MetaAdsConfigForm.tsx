"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { SiMeta } from "react-icons/si";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveMetaAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import { normalizeMetaAdAccountId } from "@/lib/meta-ads/config";
import type { MetaAdsConfig, MetaAdsObjective } from "@/lib/types";

interface MetaAdsConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: Omit<MetaAdsConfig, "system_user_token"> | null;
  /** Si el cliente ya tiene un System User token propio guardado (el valor nunca se manda al browser). */
  hasStoredToken: boolean;
  configured: boolean;
}

export function MetaAdsConfigForm({
  clientId,
  dataSourceId,
  initialConfig,
  hasStoredToken,
  configured,
}: MetaAdsConfigFormProps) {
  const [enabled, setEnabled] = useState(Boolean(initialConfig?.ad_account_id));
  const [adAccountId, setAdAccountId] = useState(initialConfig?.ad_account_id ?? "");
  const [objectives, setObjectives] = useState<MetaAdsObjective[]>(initialConfig?.objectives ?? []);
  const [monthlyBudget, setMonthlyBudget] = useState(
    initialConfig?.monthly_budget !== undefined ? String(initialConfig.monthly_budget) : ""
  );
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStored, setTokenStored] = useState(hasStoredToken);
  const [clearToken, setClearToken] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateObjective(index: number, field: "event" | "label", value: string) {
    setObjectives((prev) => prev.map((objective, i) => (i === index ? { ...objective, [field]: value } : objective)));
  }

  function removeObjective(index: number) {
    setObjectives((prev) => prev.filter((_, i) => i !== index));
  }

  function addObjective() {
    setObjectives((prev) => [...prev, { event: "", label: "" }]);
  }

  function handleSave() {
    const normalizedAccountId = normalizeMetaAdAccountId(adAccountId);
    const cleanObjectives = objectives
      .map((objective) => ({ event: objective.event.trim(), label: objective.label.trim() }))
      .filter((objective) => objective.event.length > 0 || objective.label.length > 0);

    const trimmedBudget = monthlyBudget.trim();
    const parsedBudget = trimmedBudget ? Number(trimmedBudget) : null;
    const cleanBudget = parsedBudget !== null && Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : undefined;

    const config =
      enabled && normalizedAccountId
        ? {
            ad_account_id: normalizedAccountId,
            objectives: cleanObjectives,
            ...(cleanBudget !== undefined ? { monthly_budget: cleanBudget } : {}),
          }
        : null;

    const trimmedToken = tokenInput.trim();
    const tokenUpdate = trimmedToken
      ? ({ value: trimmedToken } as const)
      : clearToken
        ? ({ clear: true } as const)
        : null;

    setStatus("idle");
    setSaveError(null);
    startTransition(async () => {
      const result = await saveMetaAdsConfigAction(clientId, dataSourceId, config, tokenUpdate);
      if (result.error) {
        setStatus("error");
        setSaveError(result.error);
        return;
      }
      setStatus("saved");
      if (trimmedToken) {
        setTokenStored(true);
        setTokenInput("");
      } else if (clearToken) {
        setTokenStored(false);
      }
      setClearToken(false);
    });
  }

  return (
    <AccordionItem
      id="meta-ads"
      icon={
        <SiMeta
          className={configured ? undefined : "text-muted-foreground"}
          color={configured ? "#0467DF" : undefined}
        />
      }
      title="Meta Ads"
      description="Ad Account ID y System User token de la cuenta de Meta de este cliente."
      status={<SourceStatusBadge configured={configured} />}
      headerRight={
        <Switch
          id="meta-ads-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(checked)}
        />
      }
    >
      <div className="flex flex-col gap-6">
        {enabled ? (
          <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="meta-ads-account-id">Ad Account ID de Meta</Label>
              <Input
                id="meta-ads-account-id"
                value={adAccountId}
                onChange={(event) => setAdAccountId(event.target.value)}
                placeholder="Ej: act_1234567890"
              />
              <p className="text-xs text-muted-foreground">
                Ingresá el Ad Account ID en formato act_XXXXXXXXXX.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="meta-ads-token">System User token (Marketing API)</Label>
              <Input
                id="meta-ads-token"
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={(event) => {
                  setTokenInput(event.target.value);
                  if (event.target.value) setClearToken(false);
                }}
                placeholder={
                  tokenStored
                    ? "•••••••••••• (dejar en blanco para no modificarlo)"
                    : "Pegá acá el token del System User de este cliente"
                }
              />
              <p className="text-xs text-muted-foreground">
                Token propio de este cliente, generado en su Business Manager (Usuarios del
                sistema → Generar token, con permisos ads_read). No se muestra una vez guardado.
                Si se deja vacío y no hay uno guardado, se usa el token de agencia por defecto.
              </p>
              {tokenStored && !clearToken && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-emerald-600">Token guardado para este cliente.</span>
                  <button
                    type="button"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setClearToken(true)}
                  >
                    Quitar token
                  </button>
                </div>
              )}
              {clearToken && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-destructive">
                    Se va a quitar el token al guardar (el cliente volverá a depender del token de agencia).
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setClearToken(false)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Objetivos</Label>
                <p className="text-xs text-muted-foreground">
                  Un objetivo por evento de conversión de Meta: el nombre del evento tal cual figura en Meta
                  Events Manager, y una leyenda breve que es lo que se va a ver como texto en el informe.
                </p>
              </div>

              {objectives.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex-1">Evento de Meta</span>
                    <span className="flex-1">Leyenda en el informe</span>
                    <span className="w-9 shrink-0" />
                  </div>
                  {objectives.map((objective, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Input
                        aria-label={`Evento de Meta del objetivo ${index + 1}`}
                        value={objective.event}
                        onChange={(event) => updateObjective(index, "event", event.target.value)}
                        placeholder="Ej: Lead"
                      />
                      <Input
                        aria-label={`Leyenda del objetivo ${index + 1}`}
                        value={objective.label}
                        onChange={(event) => updateObjective(index, "label", event.target.value)}
                        placeholder="Ej: Contacto por WhatsApp"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeObjective(index)}
                        aria-label="Quitar objetivo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" size="sm" className="self-start" onClick={addObjective}>
                <Plus className="h-4 w-4" />
                Agregar objetivo
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="meta-ads-monthly-budget">Presupuesto mensual</Label>
              <Input
                id="meta-ads-monthly-budget"
                type="number"
                min="0"
                step="1"
                value={monthlyBudget}
                onChange={(event) => setMonthlyBudget(event.target.value)}
                placeholder="Ej: 6000"
              />
              <p className="text-xs text-muted-foreground">
                Presupuesto mensual acordado con el cliente para esta cuenta (en la moneda de la
                cuenta de Meta Ads). Se usa para la comparación &quot;gasto vs. presupuesto&quot; del
                Calendario de inversión — se recarga a mano cada vez que cambie.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Activá el switch de arriba para conectar Meta Ads.
          </p>
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
    </AccordionItem>
  );
}
