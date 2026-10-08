"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { SiMeta } from "react-icons/si";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { previewSheetChartAction, saveMetaAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
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
  const [isEcommerce, setIsEcommerce] = useState(Boolean(initialConfig?.is_ecommerce));
  // La sección "Objetivos" se sacó del admin (a pedido de Martín), pero el Calendario de inversión
  // sigue armando resultados/leads a partir de estos eventos (ver lib/reporting/metaInvestmentData.ts),
  // así que al guardar se conservan tal cual estaban en vez de borrarlos.
  const objectives: MetaAdsObjective[] = initialConfig?.objectives ?? [];
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
  // Gráfico opcional desde un Google Sheet público (sheet_chart en lib/types.ts). Apagado = no se
  // guarda nada y el informe no muestra el bloque.
  const [sheetEnabled, setSheetEnabled] = useState(Boolean(initialConfig?.sheet_chart?.url));
  const [sheetUrl, setSheetUrl] = useState(initialConfig?.sheet_chart?.url ?? "");
  const [sheetTitle, setSheetTitle] = useState(initialConfig?.sheet_chart?.title ?? "");
  const [sheetSubtitle, setSheetSubtitle] = useState(initialConfig?.sheet_chart?.subtitle ?? "");
  const [sheetPreview, setSheetPreview] = useState<
    { ok: true; text: string } | { ok: false; text: string } | null
  >(null);
  const [isTestingSheet, startSheetTest] = useTransition();
  const [tokenInput, setTokenInput] = useState("");
  const [tokenStored, setTokenStored] = useState(hasStoredToken);
  const [clearToken, setClearToken] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  function updateMonthlyBudgetRow(index: number, field: "month" | "amount", value: string) {
    setMonthlyBudgets((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function removeMonthlyBudgetRow(index: number) {
    setMonthlyBudgets((prev) => prev.filter((_, i) => i !== index));
  }

  function addMonthlyBudgetRow() {
    setMonthlyBudgets((prev) => [...prev, { month: currentMonthValue(), amount: "" }]);
  }

  function handleTestSheet() {
    setSheetPreview(null);
    startSheetTest(async () => {
      const result = await previewSheetChartAction(sheetUrl);
      if (result.error || !result.data) {
        setSheetPreview({ ok: false, text: result.error ?? "No se pudo leer el Google Sheet." });
        return;
      }
      const { rows, series, kind, xLabel } = result.data;
      setSheetPreview({
        ok: true,
        text: `OK — ${rows} filas. Eje X: "${xLabel}". Series: ${series.join(", ")}. Gráfico de ${kind === "line" ? "líneas" : "barras"}.`,
      });
    });
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
            ...(isEcommerce ? { is_ecommerce: true } : {}),
            ...(hasMonthlyBudgets ? { monthly_budgets: cleanMonthlyBudgets } : {}),
            ...(sheetEnabled && sheetUrl.trim()
              ? {
                  sheet_chart: {
                    url: sheetUrl.trim(),
                    ...(sheetTitle.trim() ? { title: sheetTitle.trim() } : {}),
                    ...(sheetSubtitle.trim() ? { subtitle: sheetSubtitle.trim() } : {}),
                  },
                }
              : {}),
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

            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="meta-ads-ecommerce">Es un ecommerce</Label>
                <p className="text-xs text-muted-foreground">
                  Suma al informe el bloque Ecommerce con Facturación, Ticket promedio y ROAS (a partir de las compras que reporta Meta).
                </p>
              </div>
              <Switch id="meta-ads-ecommerce" checked={isEcommerce} onCheckedChange={setIsEcommerce} />
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

            <div className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="meta-ads-sheet-enabled">Gráfico desde Google Sheet (opcional)</Label>
                  <p className="text-xs text-muted-foreground">
                    Suma al informe un gráfico con los datos de un Google Sheet compartido como
                    &quot;Cualquier persona con el enlace&quot;. Fila 1 = encabezados, columna A = eje X
                    (fechas o categorías), y cada columna numérica siguiente = una serie. Con fechas se
                    dibuja en líneas; con categorías, en barras. Se actualiza solo (cada 5 minutos).
                  </p>
                </div>
                <Switch id="meta-ads-sheet-enabled" checked={sheetEnabled} onCheckedChange={setSheetEnabled} />
              </div>

              {sheetEnabled && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="meta-ads-sheet-url">Link del Google Sheet</Label>
                    <div className="flex items-start gap-2">
                      <Input
                        id="meta-ads-sheet-url"
                        value={sheetUrl}
                        onChange={(event) => {
                          setSheetUrl(event.target.value);
                          setSheetPreview(null);
                        }}
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestSheet}
                        disabled={isTestingSheet || sheetUrl.trim().length === 0}
                      >
                        {isTestingSheet ? "Probando…" : "Probar"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Se usa la pestaña del link (el #gid=… de la URL); si no tiene, la primera.
                    </p>
                    {sheetPreview && (
                      <p className={sheetPreview.ok ? "text-xs text-emerald-600" : "text-xs text-destructive"}>
                        {sheetPreview.text}
                      </p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="meta-ads-sheet-title">Título del bloque</Label>
                      <Input
                        id="meta-ads-sheet-title"
                        value={sheetTitle}
                        onChange={(event) => setSheetTitle(event.target.value)}
                        placeholder="Ej: Whatsapp"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="meta-ads-sheet-subtitle">Subtítulo (opcional)</Label>
                      <Input
                        id="meta-ads-sheet-subtitle"
                        value={sheetSubtitle}
                        onChange={(event) => setSheetSubtitle(event.target.value)}
                        placeholder="Ej: Ventas por Whatsapp"
                      />
                    </div>
                  </div>
                </div>
              )}
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
            disabled={
              isPending ||
              (enabled && adAccountId.trim().length === 0) ||
              (enabled && sheetEnabled && sheetUrl.trim().length === 0)
            }
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
