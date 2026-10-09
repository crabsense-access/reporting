"use client";

import { useState, useTransition } from "react";
import { SiMeta } from "react-icons/si";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { previewSheetChartAction, saveMetaAdsConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import { StartMonthSelect } from "@/components/admin/StartMonthSelect";
import { resolveStartMonth } from "@/lib/reporting/reportWindow";
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
  const [isEcommerce, setIsEcommerce] = useState(Boolean(initialConfig?.is_ecommerce));
  const [startMonth, setStartMonth] = useState(() => resolveStartMonth(initialConfig));
  // La sección "Objetivos" se sacó del admin (a pedido de Martín), pero el Calendario de inversión
  // sigue armando resultados/leads a partir de estos eventos (ver lib/reporting/metaInvestmentData.ts),
  // así que al guardar se conservan tal cual estaban en vez de borrarlos.
  const objectives: MetaAdsObjective[] = initialConfig?.objectives ?? [];
  // La sección "Presupuesto mensual" se sacó del admin (a pedido de Martín): al guardar se conservan
  // los presupuestos ya cargados (monthly_budgets / monthly_budget legado) tal cual estaban.
  const storedMonthlyBudgets = initialConfig?.monthly_budgets;
  const storedLegacyBudget = initialConfig?.monthly_budget;
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


    const config =
      enabled && normalizedAccountId
        ? {
            ad_account_id: normalizedAccountId,
            start_month: startMonth,
            objectives: cleanObjectives,
            ...(isEcommerce ? { is_ecommerce: true } : {}),
            ...(storedMonthlyBudgets && Object.keys(storedMonthlyBudgets).length > 0 ? { monthly_budgets: storedMonthlyBudgets } : {}),
            ...(storedLegacyBudget !== undefined ? { monthly_budget: storedLegacyBudget } : {}),
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

            <StartMonthSelect id="meta-ads-start-month" value={startMonth} onChange={setStartMonth} />

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
