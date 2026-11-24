"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SiGoogleanalytics, SiMeta } from "react-icons/si";
import { FileSpreadsheet, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Stepper } from "@/components/admin/Stepper";
import { DynamicListField } from "@/components/admin/DynamicListField";
import { SearchConsoleFields } from "@/components/admin/SearchConsoleFields";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { createClientAction } from "@/app/admin/(dashboard)/clients/actions";
import { buildSearchConsoleConfig, EMPTY_SEARCH_CONSOLE_FORM_VALUES } from "@/lib/gsc/config";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";
import { GoogleAdsAccountSelect } from "@/components/admin/GoogleAdsAccountSelect";
import { normalizeMetaAdAccountId } from "@/lib/meta-ads/config";
import type { SearchConsoleFormValues } from "@/lib/gsc/config";

const STEPS = ["Datos generales", "Fuentes de datos", "Usuarios autorizados"];

export function NewClientWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ga4Enabled, setGa4Enabled] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [primaryGoal, setPrimaryGoal] = useState("");
  const [secondaryGoal, setSecondaryGoal] = useState("");
  const [searchConsole, setSearchConsole] = useState<SearchConsoleFormValues>(
    EMPTY_SEARCH_CONSOLE_FORM_VALUES
  );
  const [googleAdsEnabled, setGoogleAdsEnabled] = useState(false);
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState("");
  const [googleAdsAccountName, setGoogleAdsAccountName] = useState<string | null>(null);
  const [metaAdsEnabled, setMetaAdsEnabled] = useState(false);
  const [metaAdsAccountId, setMetaAdsAccountId] = useState("");
  // Origen de los datos de Meta Ads: la Marketing API (Ad Account ID) o exports de Excel subidos a
  // mano (ver lib/reporting/metaExcelImport.ts). En modo Excel se elige el archivo acá y se sube
  // apenas se crea el cliente; los meses siguientes se suben desde el detalle del cliente.
  const [metaAdsOrigin, setMetaAdsOrigin] = useState<"api" | "excel">("api");
  const [metaExcelFile, setMetaExcelFile] = useState<File | null>(null);
  const metaExcelInputRef = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState<string[]>([""]);
  const scResult = buildSearchConsoleConfig(searchConsole);
  const ga4HasErrors = ga4Enabled && propertyId.trim().length === 0;
  const scHasErrors = searchConsole.enabled && Object.keys(scResult.errors).length > 0;
  const adsHasErrors = googleAdsEnabled && normalizeGoogleAdsCustomerId(googleAdsCustomerId).length === 0;
  const metaAdsHasErrors =
    metaAdsEnabled &&
    (metaAdsOrigin === "excel" ? !metaExcelFile : normalizeMetaAdAccountId(metaAdsAccountId).length === 0);
  const ga4Valid = ga4Enabled && !ga4HasErrors;

  const canGoNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && !ga4HasErrors && !scHasErrors && !adsHasErrors && !metaAdsHasErrors) ||
    step === 2;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createClientAction({
        name: name.trim(),
        ga4:
          ga4Enabled && propertyId.trim()
            ? {
                property_id: propertyId.trim(),
                primary_goal: primaryGoal.trim(),
                secondary_goal: secondaryGoal.trim(),
              }
            : null,
        searchConsole: scResult.config,
        googleAds:
          googleAdsEnabled && googleAdsCustomerId.trim()
            ? {
                customer_id: normalizeGoogleAdsCustomerId(googleAdsCustomerId.trim()),
                ...(googleAdsAccountName ? { account_name: googleAdsAccountName } : {}),
              }
            : null,
        metaAds: !metaAdsEnabled
          ? null
          : metaAdsOrigin === "excel"
            ? // Sin Ad Account ID = modo Excel. El mes de inicio lo fija la subida del archivo.
              { ad_account_id: "" }
            : metaAdsAccountId.trim()
              ? { ad_account_id: normalizeMetaAdAccountId(metaAdsAccountId.trim()) }
              : null,
        userEmails: emails.map((email) => email.trim()).filter(Boolean),
      });

      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo crear el cliente");
        return;
      }

      const clientId = result.data.id;
      if (metaAdsEnabled && metaAdsOrigin === "excel" && metaExcelFile) {
        const body = new FormData();
        body.append("file", metaExcelFile);
        const res = await fetch(`/api/clients/${clientId}/meta-excel-import`, { method: "POST", body }).catch(() => null);
        if (!res?.ok) {
          // El cliente ya quedó creado: se sigue al detalle, donde se puede volver a subir el archivo.
          const message = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
          router.push(`/admin/clients/${clientId}?excelError=${encodeURIComponent(message ?? "No se pudo subir el Excel de Meta Ads.")}#meta-excel`);
          return;
        }
      }

      router.push(`/admin/clients/${clientId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Stepper steps={STEPS} currentStep={step} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>
            {step === 0 && "Nombre del cliente para identificarlo en el panel."}
            {step === 1 &&
              "Configurá las fuentes de datos de este cliente. Todas son opcionales e independientes entre sí — podés dejarlas todas apagadas y configurarlas más adelante."}
            {step === 2 && "Emails de Google que van a poder ver el tablero de este cliente."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {step === 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="client-name">Nombre del cliente</Label>
              <Input
                id="client-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ej: Acme S.A."
              />
            </div>
          )}

          {step === 1 && (
            <Accordion defaultOpenId="ga4">
              <AccordionItem
                id="ga4"
                icon={
                  <SiGoogleanalytics
                    className={ga4Valid ? undefined : "text-muted-foreground"}
                    color={ga4Valid ? "#E37400" : undefined}
                  />
                }
                title="GA4"
                description="Property ID y objetivos que se van a mostrar en su tablero."
                status={<SourceStatusBadge configured={ga4Valid} />}
                headerRight={
                  <Switch id="ga4-enabled" checked={ga4Enabled} onCheckedChange={(checked) => setGa4Enabled(checked)} />
                }
              >
                {ga4Enabled ? (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="property-id">Property ID de GA4</Label>
                      <Input
                        id="property-id"
                        value={propertyId}
                        onChange={(event) => setPropertyId(event.target.value)}
                        placeholder="Ej: 123456789"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="wizard-ga4-primary-goal">Objetivo principal</Label>
                      <Textarea
                        id="wizard-ga4-primary-goal"
                        value={primaryGoal}
                        onChange={(event) => setPrimaryGoal(event.target.value)}
                        placeholder="Describí el objetivo principal de este cliente en GA4."
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="wizard-ga4-secondary-goal">Objetivo secundario</Label>
                      <Textarea
                        id="wizard-ga4-secondary-goal"
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
              </AccordionItem>

              <AccordionItem
                id="search-console"
                icon={
                  <SourceIcon
                    src="/icons/google-search-console.png"
                    alt="Search Console"
                    connected={searchConsole.enabled && searchConsole.siteUrl.trim().length > 0}
                  />
                }
                title="Search Console"
                description="Site URL y, si tiene, la configuración del blog para separar su tráfico."
                status={
                  <SourceStatusBadge
                    configured={searchConsole.enabled && searchConsole.siteUrl.trim().length > 0}
                  />
                }
                headerRight={
                  <Switch
                    id="sc-enabled"
                    checked={searchConsole.enabled}
                    onCheckedChange={(checked) => setSearchConsole({ ...searchConsole, enabled: checked })}
                  />
                }
              >
                <SearchConsoleFields
                  value={searchConsole}
                  onChange={setSearchConsole}
                  errors={searchConsole.enabled ? scResult.errors : undefined}
                />
              </AccordionItem>

              <AccordionItem
                id="google-ads"
                icon={
                  <SourceIcon
                    src="/icons/google-ads.png"
                    alt="Google Ads"
                    connected={googleAdsEnabled && !adsHasErrors}
                  />
                }
                title="Google Ads"
                description="Cuenta de Google Ads a la que tiene acceso access@crabsense.com."
                status={<SourceStatusBadge configured={googleAdsEnabled && !adsHasErrors} />}
                headerRight={
                  <Switch
                    id="ads-enabled"
                    checked={googleAdsEnabled}
                    onCheckedChange={(checked) => setGoogleAdsEnabled(checked)}
                  />
                }
              >
                {googleAdsEnabled ? (
                  <GoogleAdsAccountSelect
                    id="ads-customer-id"
                    value={normalizeGoogleAdsCustomerId(googleAdsCustomerId)}
                    onChange={(id, name) => {
                      setGoogleAdsCustomerId(id);
                      setGoogleAdsAccountName(name);
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Activá el switch de arriba para conectar Google Ads.
                  </p>
                )}
              </AccordionItem>

              <AccordionItem
                id="meta-ads"
                icon={
                  <SiMeta
                    className={metaAdsEnabled && !metaAdsHasErrors ? undefined : "text-muted-foreground"}
                    color={metaAdsEnabled && !metaAdsHasErrors ? "#0467DF" : undefined}
                  />
                }
                title="Meta Ads"
                description="Ad Account ID de la cuenta de Meta compartida con el Business Manager de la agencia, o exports de Excel."
                status={<SourceStatusBadge configured={metaAdsEnabled && !metaAdsHasErrors} />}
                headerRight={
                  <Switch
                    id="meta-ads-enabled"
                    checked={metaAdsEnabled}
                    onCheckedChange={(checked) => setMetaAdsEnabled(checked)}
                  />
                }
              >
                {metaAdsEnabled ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <Label>Origen de los datos</Label>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Origen de los datos de Meta Ads">
                        {(
                          [
                            { value: "api", label: "API de Meta (Ad Account ID)" },
                            { value: "excel", label: "Excel exportado de Meta" },
                          ] as const
                        ).map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={metaAdsOrigin === option.value}
                            onClick={() => setMetaAdsOrigin(option.value)}
                            className={
                              metaAdsOrigin === option.value
                                ? "rounded-md border border-primary bg-primary/5 px-3 py-2 text-sm font-medium text-primary"
                                : "rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary/40"
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {metaAdsOrigin === "api" ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="meta-ads-account-id">Ad Account ID de Meta</Label>
                        <Input
                          id="meta-ads-account-id"
                          value={metaAdsAccountId}
                          onChange={(event) => setMetaAdsAccountId(event.target.value)}
                          placeholder="Ej: act_1234567890"
                        />
                        <p className="text-xs text-muted-foreground">
                          Ingresá el Ad Account ID en formato act_XXXXXXXXXX. La cuenta tiene que estar
                          compartida previamente con el Business Manager de la agencia.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Label>Export de Meta Ads (.xlsx)</Label>
                        <input
                          ref={metaExcelInputRef}
                          type="file"
                          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          className="hidden"
                          onChange={(event) => setMetaExcelFile(event.target.files?.[0] ?? null)}
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <Button type="button" variant="outline" onClick={() => metaExcelInputRef.current?.click()}>
                            <Upload className="h-4 w-4" />
                            {metaExcelFile ? "Cambiar archivo" : "Elegir archivo"}
                          </Button>
                          {metaExcelFile && (
                            <span className="flex items-center gap-1.5 text-sm text-foreground">
                              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                              {metaExcelFile.name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Un mes por archivo, desglosado por Día (y por Edad y Sexo para el bloque de audiencia). Se sube
                          al crear el cliente; los meses siguientes se cargan desde el detalle del cliente.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Activá el switch de arriba para conectar Meta Ads.
                  </p>
                )}
              </AccordionItem>
            </Accordion>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-2">
              <Label>Usuarios autorizados</Label>
              <DynamicListField
                values={emails}
                onChange={setEmails}
                type="email"
                placeholder="nombre@cliente.com"
                addLabel="Agregar email"
              />
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0 || isPending}
            >
              Atrás
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={!canGoNext}>
                Siguiente
              </Button>
            ) : (
              <Button type="button" onClick={handleSubmit} disabled={isPending}>
                {isPending ? "Creando…" : "Crear cliente"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
