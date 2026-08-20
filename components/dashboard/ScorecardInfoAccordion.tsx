"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

interface ScorecardInfoAccordionProps {
  text: string;
}

// Acordeón "Info" unificado para scorecards (Prompt 73) — mismo ícono base
// (Info) que ya usaban OverviewScorecard/PerformanceScorecard/
// MetaAdsOverviewScorecard, sumándole un chevron que alterna ChevronDown/
// ChevronUp al expandir/colapsar (mismo criterio de swap de ícono, no
// rotación CSS, que ya usa el acordeón del sidebar — ver sidebar-item.tsx).
// Envuelto en un div con stopPropagation porque casi siempre vive dentro de
// una Card clickeable (selección tipo radio) — abrir/cerrar el acordeón
// nunca debe disparar esa selección.
export function ScorecardInfoAccordion({ text }: ScorecardInfoAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Info className="h-3 w-3" />
        Info
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && <p className="mt-1.5 text-xs text-muted-foreground">{text}</p>}
    </div>
  );
}
