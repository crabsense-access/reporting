"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformIcon } from "@/components/admin/reports/PlatformIcon";
import { PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";

const PLACEHOLDERS: Partial<Record<ReportPlatform, string>> = {
  google_ads: "Definí qué métricas e insights mostrar para Google Ads",
};

interface MetricasInsightsBlockProps {
  selectedPlatforms: ReportPlatform[];
  values: Partial<Record<ReportPlatform, string>>;
  onChange: (platform: ReportPlatform, value: string) => void;
}

// Mismo criterio que ObjetivosBlock (Bloque 3): un apartado por plataforma tildada en el Bloque
// 2, con el mismo ícono en color real. Acá cada plataforma tiene un solo textarea (qué métricas
// e insights mostrar), en vez de objetivo principal/secundario.
export function MetricasInsightsBlock({ selectedPlatforms, values, onChange }: MetricasInsightsBlockProps) {
  if (selectedPlatforms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Seleccioná al menos una plataforma en el bloque anterior para definir sus métricas e insights.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selectedPlatforms.map((platform) => (
        <Card key={platform}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PlatformIcon platform={platform} />
              {PLATFORM_LABELS[platform]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`metricas-insights-${platform}`}>Qué mostrar</Label>
              <Textarea
                id={`metricas-insights-${platform}`}
                value={values[platform] ?? ""}
                onChange={(event) => onChange(platform, event.target.value)}
                placeholder={PLACEHOLDERS[platform]}
                className="min-h-[180px]"
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
