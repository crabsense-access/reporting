"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/admin/reports/PlatformIcon";
import { PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";

export interface PlatformObjectiveValue {
  principal: string;
  secundario: string;
}

interface ObjetivosBlockProps {
  selectedPlatforms: ReportPlatform[];
  objectives: Partial<Record<ReportPlatform, PlatformObjectiveValue>>;
  /** Si esa fuente tiene objetivo secundario cargado en el admin del cliente — si no, no se muestra el campo acá. */
  hasSecondaryGoal: Partial<Record<ReportPlatform, boolean>>;
  onChange: (platform: ReportPlatform, field: "principal" | "secundario", value: string) => void;
}

// Los cambios acá son un override puntual para este informe — no tocan la config del admin del
// cliente (ese guardado vive en GA4ConfigForm/SearchConsoleFields/GoogleAdsConfigForm/MetaAdsConfigForm).
export function ObjetivosBlock({
  selectedPlatforms,
  objectives,
  hasSecondaryGoal,
  onChange,
}: ObjetivosBlockProps) {
  if (selectedPlatforms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Seleccioná al menos una plataforma en el bloque anterior para definir sus objetivos.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedPlatforms.map((platform) => {
        const objective = objectives[platform] ?? { principal: "", secundario: "" };
        // Search Console guarda un párrafo largo (default del Prompt F) como objetivo
        // principal — el resto son nombres cortos de objetivo/conversión (ej. "Leads").
        const principalIsLongText = platform === "search_console";

        return (
          <Card key={platform}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <PlatformIcon platform={platform} />
                {PLATFORM_LABELS[platform]}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`objetivo-principal-${platform}`}>Objetivo principal</Label>
                {principalIsLongText ? (
                  <Textarea
                    id={`objetivo-principal-${platform}`}
                    value={objective.principal}
                    onChange={(event) => onChange(platform, "principal", event.target.value)}
                  />
                ) : (
                  <Input
                    id={`objetivo-principal-${platform}`}
                    value={objective.principal}
                    onChange={(event) => onChange(platform, "principal", event.target.value)}
                  />
                )}
              </div>
              {hasSecondaryGoal[platform] && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`objetivo-secundario-${platform}`}>Objetivo secundario</Label>
                  <Input
                    id={`objetivo-secundario-${platform}`}
                    value={objective.secundario}
                    onChange={(event) => onChange(platform, "secundario", event.target.value)}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
