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

/** Una fila del editor de presupuesto por mes (ver monthlyBudgets) — amount queda como texto crudo del input hasta el guardado, igual que el resto de los inputs numéricos de este form. */
interface MonthlyBudgetRow {
  month: string; // yyyy-MM
  amount: string;
}

/** Mes actual en formato "yyyy-MM" (mismo formato que usa el Calendario de inversión para las claves de monthly_budgets) — sin date-fns acá para no sumar una dependencia sólo por esto. */
function currentMonthValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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
  // Presupuesto POR MES (antes era un único valor "vigente" que pisaba los meses pasados — ver
  // monthly_budgets en lib/types.ts). Si el cliente todavía no tiene ninguna entrada por mes pero
  // sí tiene el viejo monthly_budget cargado, se precarga como el presupuesto del mes actual para
  // no perder ese dato: Martín sólo tiene que confirmarlo (o ajustarlo) al guardar.
  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudgetRow[]>(() => {
    const stored = initialConfig?.monthly_budgets;
    if (stored && Object.keys(stored).length > 0) {
      return Object.entries(stored)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([month, amount]) => ({ month, amount: String(amount) }));
    }
    if (initialConfig?.monthly_budget !== undefined) {
      return [{ month: currentMonthValue(), amount: String(initialConfig.monthly_budget) }];
    }
    return [];
  });
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

  function updateMonthlyBudgetRow(index: number, field: "month" | "amount", value: string) {
    setMonthlyBudgets((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeMonthlyBudgetRow(index: number) {
    setMonthlyBudgets((prev) => prev.filter((_, i) => i !== index));
  }

  function addMonthlyBudgetRow() {
    setMonthlyBudgets((prev) => [...prev, { month: currentMonthValue(), amount: "" }]);
  }

  function handleSave() {
    const normalizedAccountId = normalizeMetaAdAccountId(adAccountId);
    const cleanObjectives = objectives
      .map((objective) => ({ event: objective.event.trim(), label: objective.label.trim() }))
      .filter((objective) => objective.event.length > 0 || objective.label.length > 0);

    // Sólo entran filas con mes Y monto válidos (>0) — una fila a medio cargar (mes sin monto, o
    // viceversa) se descarta en silencio al guardar, igual que ya hacen los Objetivos vacíos.
    const cleanMonthlyBudgets: Record<string, number> = {};
    for (const row of monthlyBudgets) {
      const month = row.month.trim();
      const amount = Number(row.amount.trim());
      if (month && Number.isFinite(amount) && amount > 0) {
        cleanMonthlyBudgets[month] = amount;
      }
    }
    const hasMonthlyBudgets = Object.keys(cleanMonthlyBudgets).length > 0;

    const config =
      enabled && normalizedAccountId
        ? {
            ad_account_id: normalizedAccountId,
            objectives: cleanObjectives,
            ...(hasMonthlyBudgets ? { monthly_budgets: cleanMonthlyBudgets } : {}),
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

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <Label>Presupuesto mensual</Label>
                <p className="text-xs text-muted-foreground">
                  Presupuesto acordado con el cliente para esta cuenta (en la moneda de la cuenta de
                  Meta Ads), cargado MES A MES: cada mes queda con su propio presupuesto, así que un
                  cambio para el mes en curso no pisa la comparación &quot;gasto vs. presupuesto&quot;
                  de los meses ya pasados en el Calendario de inversión.
                </p>
              </div>

              {monthlyBudgets.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                    <span className="flex-1">Mes</span>
                    <span className="flex-1">Presupuesto</span>
                    <span className="w-9 shrink-0" />
                  </div>
                  {monthlyBudgets.map((row, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <Input
                        aria-label={`Mes del presupuesto ${index + 1}`}
                        type="month"
                        value={row.month}
                        onChange={(event) => updateMonthlyBudgetRow(index, "month", event.target.value)}
                      />
                      <Input
                        aria-label={`Monto del presupuesto ${index + 1}`}
                        type="number"
                        min="0"
                        step="1"
                        value={row.amount}
                        onChange={(event) => updateMonthlyBudgetRow(index, "amount", event.target.value)}
                        placeholder="Ej: 6000"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMonthlyBudgetRow(index)}
                        aria-label="Quitar presupuesto"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Button type="button" variant="outline" size="sm" className="self-start" onClick={addMonthlyBudgetRow}>
                <Plus className="h-4 w-4" />
                Agregar mes
              </Button>
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
