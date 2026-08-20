"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { useBreadcrumbPath, type BreadcrumbSegment } from "@/components/dashboard/sidebar/nav-items-context";

interface BreadcrumbTitleProps {
  /** Línea descriptiva de la página, sin cambios respecto al header anterior. */
  subtitle?: string;
}

// A cuántos segmentos visibles se colapsa el path cuando hay 4 o más niveles
// (primero + "…" + actual) — ver MAX_VISIBLE_SEGMENTS.
const MAX_VISIBLE_SEGMENTS = 3;

// Estilos por posición relativa al ÚLTIMO segmento (el actual), no por
// profundidad absoluta: sin importar cuántos niveles haya antes, el actual
// siempre es el más grande/bold y el resto crece hacia él.
function segmentClassName(distanceFromEnd: number): string {
  if (distanceFromEnd === 0) return "text-2xl md:text-3xl font-bold text-gray-900";
  if (distanceFromEnd === 1) return "text-base md:text-lg font-medium text-gray-500";
  return "text-sm md:text-base font-normal text-gray-400";
}

type VisibleEntry =
  | { kind: "segment"; segment: BreadcrumbSegment }
  | { kind: "ellipsis"; hidden: BreadcrumbSegment[] };

function toVisibleEntries(segments: BreadcrumbSegment[]): VisibleEntry[] {
  if (segments.length <= MAX_VISIBLE_SEGMENTS) {
    return segments.map((segment) => ({ kind: "segment", segment }));
  }
  return [
    { kind: "segment", segment: segments[0]! },
    { kind: "ellipsis", hidden: segments.slice(1, -1) },
    { kind: "segment", segment: segments[segments.length - 1]! },
  ];
}

export function BreadcrumbTitle({ subtitle }: BreadcrumbTitleProps) {
  const segments = useBreadcrumbPath();
  const [hiddenOpen, setHiddenOpen] = React.useState(false);

  if (segments.length === 0) return null;

  const entries = toVisibleEntries(segments);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;
          const distanceFromEnd = entries.length - 1 - index;
          const className = segmentClassName(distanceFromEnd);

          return (
            <React.Fragment key={index}>
              {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 self-center text-gray-300" />}

              {entry.kind === "ellipsis" ? (
                <span className="relative">
                  <button
                    type="button"
                    onClick={() => setHiddenOpen((open) => !open)}
                    title={entry.hidden.map((segment) => segment.label).join(" › ")}
                    className={cn(className, "text-gray-400 hover:text-gray-600")}
                  >
                    …
                  </button>
                  {hiddenOpen && (
                    <div className="absolute left-0 top-full z-10 mt-1 flex flex-col gap-0.5 whitespace-nowrap rounded-lg border border-gray-200 bg-white p-2 text-left shadow-md">
                      {entry.hidden.map((hiddenSegment) =>
                        hiddenSegment.href ? (
                          <Link
                            key={hiddenSegment.label}
                            href={hiddenSegment.href}
                            onClick={() => setHiddenOpen(false)}
                            className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                          >
                            {hiddenSegment.label}
                          </Link>
                        ) : (
                          <span key={hiddenSegment.label} className="px-2 py-1 text-sm text-gray-400">
                            {hiddenSegment.label}
                          </span>
                        )
                      )}
                    </div>
                  )}
                </span>
              ) : isLast ? (
                <span className={className}>{entry.segment.label}</span>
              ) : entry.segment.href ? (
                <Link href={entry.segment.href} className={cn(className, "hover:text-gray-600")}>
                  {entry.segment.label}
                </Link>
              ) : (
                <span className={className}>{entry.segment.label}</span>
              )}
            </React.Fragment>
          );
        })}
      </div>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
