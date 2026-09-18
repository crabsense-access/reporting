"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";

interface PlataformasBlockProps {
  connectedPlatforms: ReportPlatform[];
  selected: ReportPlatform[];
  onChange: (selected: ReportPlatform[]) => void;
}

export function PlataformasBlock({ connectedPlatforms, selected, onChange }: PlataformasBlockProps) {
  function toggle(platform: ReportPlatform, checked: boolean) {
    onChange(checked ? [...selected, platform] : selected.filter((item) => item !== platform));
  }

  if (connectedPlatforms.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este cliente todavía no tiene ninguna fuente de datos conectada.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {connectedPlatforms.map((platform) => (
        <div key={platform} className="flex items-center gap-3">
          <Checkbox
            id={`platform-${platform}`}
            checked={selected.includes(platform)}
            onCheckedChange={(checked) => toggle(platform, checked)}
          />
          <Label htmlFor={`platform-${platform}`} className="cursor-pointer font-normal">
            {PLATFORM_LABELS[platform]}
          </Label>
        </div>
      ))}
    </div>
  );
}
