"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stepper } from "@/components/admin/Stepper";
import { DynamicListField } from "@/components/admin/DynamicListField";
import { SearchConsoleFields } from "@/components/admin/SearchConsoleFields";
import { createClientAction } from "@/app/admin/(dashboard)/clients/actions";
import { buildSearchConsoleConfig, EMPTY_SEARCH_CONSOLE_FORM_VALUES } from "@/lib/gsc/config";
import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";
import { normalizeMetaAdAccountId } from "@/lib/meta-ads/config";
import type { SearchConsoleFormValues } from "@/lib/gsc/config";

const STEPS = ["Datos generales", "Conexión GA4", "Conexión Search Console", "Usuarios autorizados"];

export function NewClientWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [primaryGoals, setPrimaryGoals] = useState<string[]>([""]);
  const [secondaryGoals, setSecondaryGoals] = useState<string[]>([""]);
  const [searchConsole, setSearchConsole] = useState<SearchConsoleFormValues>(
    EMPTY_SEARCH_CONSOLE_FORM_VALUES
  );
  const [googleAdsEnabled, setGoogleAdsEnabled] = useState(false);
  const [googleAdsCustomerId, setGoogleAdsCustomerId] = useState("");
  const [metaAdsEnabled, setMetaAdsEnabled] = useState(false);
  const [metaAdsAccountId, setMetaAdsAccountId] = useState("");
  const [emails, setEmails] = useState<string[]>([""]);
  const scResult = buildSearchConsoleConfig(searchConsole);
  const scHasErrors = searchConsole.enabled && Object.keys(scResult.errors).length > 0;
  const adsHasErrors = googleAdsEnabled && normalizeGoogleAdsCustomerId(googleAdsCustomerId).length === 0;
  const metaAdsHasErrors = metaAdsEnabled && normalizeMetaAdAccountId(metaAdsAccountId).length === 0;

  const canGoNext =
    (step === 0 && name.trim().length > 0) ||
    (step === 1 && propertyId.trim().length > 0) ||
    (step === 2 && !scHasErrors && !adsHasErrors && !metaAdsHasErrors) ||
    step === 3;

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createClientAction({
        name: name.trim(),
        ga4: {
          property_id: propertyId.trim(),
          primary_goals: primaryGoals.map((goal) => goal.trim()).filter(Boolean),
          secondary_goals: secondaryGoals.map((goal) => goal.trim()).filter(Boolean),
        },
        searchConsole: scResult.config,
        googleAds:
          googleAdsEnabled && googleAdsCustomerId.trim()
            ? { customer_id: normalizeGoogleAdsCustomerId(googleAdsCustomerId.trim()) }
            : null,
        metaAds:
          metaAdsEnabled && metaAdsAccountId.trim()
            ? { ad_account_id: normalizeMetaAdAccountId(metaAdsAccountId.trim()) }
            : null,
        userEmails: emails.map((email) => email.trim()).filter(Boolean),
      });

      if (result.error || !result.data) {
        setError(result.error ?? "No se pudo crear el cliente");
        return;
      }

      router.push(`/admin/clients/${result.data.id}`);
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
            {step === 1 && "Property ID de GA4 y los objetivos que querés destacar en su tablero."}
            {step === 2 &&
              "Opcional: la propiedad de Search Console y las conexiones de Google Ads y Meta Ads de este cliente."}
            {step === 3 && "Emails de Google que van a poder ver el tablero de este cliente."}
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
                <Label>Objetivos primarios</Label>
                <DynamicListField
                  values={primaryGoals}
                  onChange={setPrimaryGoals}
                  placeholder="Ej: purchase"
                  addLabel="Agregar objetivo"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Objetivos secundarios</Label>
                <DynamicListField
                  values={secondaryGoals}
                  onChange={setSecondaryGoals}
                  placeholder="Ej: generate_lead"
                  addLabel="Agregar objetivo"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="ads-enabled">¿Este cliente tiene Google Ads conectado?</Label>
                    <p className="text-sm text-muted-foreground">
                      Activalo para guardar el Customer ID de la cuenta vinculada a la MCC de la agencia.
                    </p>
                  </div>
                  <Switch
                    id="ads-enabled"
                    checked={googleAdsEnabled}
                    onCheckedChange={(checked) => setGoogleAdsEnabled(checked)}
                  />
                </div>

                {googleAdsEnabled && (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="ads-customer-id">Customer ID de Google Ads</Label>
                    <Input
                      id="ads-customer-id"
                      value={googleAdsCustomerId}
                      onChange={(event) => setGoogleAdsCustomerId(event.target.value)}
                      placeholder="Ej: 123-456-7890"
                    />
                    <p className="text-xs text-muted-foreground">
                      Ingresá el Customer ID en formato XXX-XXX-XXXX. La cuenta tiene que estar vinculada previamente a la MCC de la agencia (4391931539).
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor="meta-ads-enabled">¿Este cliente tiene Meta Ads conectado?</Label>
                    <p className="text-sm text-muted-foreground">
                      Activalo para guardar el Ad Account ID de la cuenta de Meta (Facebook/Instagram Ads).
                    </p>
                  </div>
                  <Switch
                    id="meta-ads-enabled"
                    checked={metaAdsEnabled}
                    onCheckedChange={(checked) => setMetaAdsEnabled(checked)}
                  />
                </div>

                {metaAdsEnabled && (
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
                )}
              </div>

              <SearchConsoleFields
                value={searchConsole}
                onChange={setSearchConsole}
                errors={searchConsole.enabled ? scResult.errors : undefined}
              />
            </div>
          )}

          {step === 3 && (
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
