"use client";

import { useState, useTransition } from "react";

import { AccordionItem, SourceStatusBadge } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SearchConsoleFields } from "@/components/admin/SearchConsoleFields";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { saveSearchConsoleConfigAction } from "@/app/admin/(dashboard)/clients/actions";
import {
  buildSearchConsoleConfig,
  searchConsoleConfigToFormValues,
  type SearchConsoleFormValues,
} from "@/lib/gsc/config";
import type { GSCConfig } from "@/lib/types";

interface SearchConsoleConfigFormProps {
  clientId: string;
  dataSourceId: string | null;
  initialConfig: GSCConfig | null;
  configured: boolean;
}

export function SearchConsoleConfigForm({
  clientId,
  dataSourceId,
  initialConfig,
  configured,
}: SearchConsoleConfigFormProps) {
  const [values, setValues] = useState<SearchConsoleFormValues>(() =>
    searchConsoleConfigToFormValues(initialConfig)
  );
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { config, errors } = buildSearchConsoleConfig(values);
  const hasErrors = values.enabled && Object.keys(errors).length > 0;

  function handleSave() {
    if (hasErrors) return;
    setStatus("idle");
    setSaveError(null);
    startTransition(async () => {
      const result = await saveSearchConsoleConfigAction(clientId, dataSourceId, config);
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
      id="search-console"
      icon={
        <SourceIcon src="/icons/google-search-console.png" alt="Search Console" connected={configured} />
      }
      title="Search Console"
      description="Site URL y, si tiene, la configuración del blog para separar su tráfico."
      status={<SourceStatusBadge configured={configured} />}
      headerRight={
        <Switch
          id="sc-enabled"
          checked={values.enabled}
          onCheckedChange={(checked) => setValues({ ...values, enabled: checked })}
        />
      }
    >
      <div className="flex flex-col gap-6">
        <SearchConsoleFields
          value={values}
          onChange={setValues}
          errors={values.enabled ? errors : undefined}
        />
        <div className="flex items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={isPending || hasErrors}>
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
