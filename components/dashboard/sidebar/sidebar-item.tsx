"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { SidebarBadge } from "./sidebar-badge";
import { SIDEBAR_ITEM_GAP, SIDEBAR_ITEM_GAP_TOP } from "./spacing";
import { useInsightsSections, type SectionCounts } from "@/components/dashboard/insights-context";
import type { InsightSentiment } from "@/lib/insights/generateInsight";
import type { NavItem, NavIconKey } from "./nav-items";

// Orden en el que se muestran los pills cuando hay más de un sentimiento en
// la misma sección — negativo primero (lo más urgente de notar), después
// positivo, neutral al final.
const SENTIMENT_ORDER: InsightSentiment[] = ["negative", "positive", "neutral"];

const NAV_ICONS: Record<NavIconKey, LucideIcon> = {
  overview: LayoutGrid,
  seo: Search,
  analitica: Users,
  ads: TrendingUp,
  ia: Sparkles,
};

export function isOrContainsPath(item: NavItem, pathname: string): boolean {
  if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) return true;
  return item.items?.some((child) => isOrContainsPath(child, pathname)) ?? false;
}

type SectionsState = ReturnType<typeof useInsightsSections>;

export function computeBadgeCounts(item: NavItem, sections: SectionsState): SectionCounts | null {
  if (item.insightSection) {
    return sections[item.insightSection] ?? null;
  }
  if (!item.items?.length) return null;

  const total: SectionCounts = { positive: 0, negative: 0, neutral: 0 };
  let any = false;
  for (const child of item.items) {
    const childCounts = computeBadgeCounts(child, sections);
    if (childCounts) {
      any = true;
      total.positive += childCounts.positive;
      total.negative += childCounts.negative;
      total.neutral += childCounts.neutral;
    }
  }
  return any ? total : null;
}

export function BadgePills({ counts, className }: { counts: SectionCounts; className?: string }) {
  const entries = SENTIMENT_ORDER.map((sentiment) => ({ sentiment, count: counts[sentiment] })).filter(
    (entry) => entry.count > 0
  );
  if (entries.length === 0) return null;

  return (
    <span className={cn("flex shrink-0 items-center gap-0.5", className)}>
      {entries.map(({ sentiment, count }) => (
        <SidebarBadge key={sentiment} count={count} variant={sentiment} />
      ))}
    </span>
  );
}

const rowClasses =
  "relative flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[0.75rem] font-medium uppercase transition-colors";

// Línea horizontal que conecta cada sub-item con el tronco vertical
// (border-l) del contenedor que los agrupa — mismo offset que el pl-4 de
// ese contenedor, para que calcen exactas.
const childConnectorClasses =
  "before:absolute before:-left-4 before:top-1/2 before:h-px before:w-4 before:bg-neutral-300 before:content-['']";

interface SidebarItemProps {
  item: NavItem;
  depth?: number;
  hoveredFlyoutLabel: string | null;
  onFlyoutHover: (item: NavItem | null) => void;
}

// Acordeón recursivo del rail. La única excepción es `item.flyout`: en vez
// de expandirse inline, el hover dispara el segundo panel flotante que
// controla <Sidebar> (ver sidebar-flyout-panel.tsx) — reservado para
// Audiencia/Retención/Conversiones, que tienen su propio árbol de
// categorías en vez de sub-items de navegación comunes.
export function SidebarItem({ item, depth = 0, hoveredFlyoutLabel, onFlyoutHover }: SidebarItemProps) {
  const pathname = usePathname();
  const sections = useInsightsSections();

  const hasChildren = !!item.items?.length;
  const pathActive = (!!item.href && pathname === item.href) || (hasChildren && isOrContainsPath(item, pathname));
  const flyoutActive = !!item.flyout && hoveredFlyoutLabel === item.label;

  const [manualOpen, setManualOpen] = React.useState<boolean | null>(null);
  React.useEffect(() => setManualOpen(null), [pathname]);
  const open = manualOpen ?? (hasChildren && !item.flyout && pathActive);

  const badgeCounts = React.useMemo(() => computeBadgeCounts(item, sections), [item, sections]);
  const Icon = depth === 0 && item.iconKey ? NAV_ICONS[item.iconKey] : undefined;

  const content = (
    <>
      {Icon && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
      )}
      <span className={depth === 0 ? "min-w-0 flex-1 truncate" : "shrink-0 whitespace-nowrap"}>{item.label}</span>
      {depth > 0 && badgeCounts && <BadgePills counts={badgeCounts} />}
      {hasChildren &&
        !item.flyout &&
        (open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        ))}
    </>
  );

  const isActive = pathActive || flyoutActive;
  // Solo el ítem de primer nivel usa el look de "botón seleccionado" (fondo
  // blanco + sombra). A partir del segundo nivel, estar activo se ve solo
  // como negrita — nunca como si fuera otro botón dentro del que ya está
  // seleccionado.
  const stateClasses = cn(
    isActive ? "text-neutral-900" : "text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900",
    isActive && (depth === 0 ? "bg-white font-semibold shadow-sm" : "font-bold"),
    depth > 0 && childConnectorClasses
  );

  let row: React.ReactNode;

  if (item.flyout) {
    row = (
      <div onMouseEnter={() => onFlyoutHover(item)} className={cn(rowClasses, stateClasses, "cursor-default")}>
        {content}
      </div>
    );
  } else if (hasChildren) {
    row = (
      <button
        type="button"
        onClick={() => setManualOpen(!open)}
        onMouseEnter={() => onFlyoutHover(null)}
        aria-expanded={open}
        className={cn(rowClasses, stateClasses)}
      >
        {content}
      </button>
    );
  } else if (item.href) {
    row = (
      <Link href={item.href} onMouseEnter={() => onFlyoutHover(null)} className={cn(rowClasses, stateClasses)}>
        {content}
      </Link>
    );
  } else {
    row = (
      <span
        onMouseEnter={() => onFlyoutHover(null)}
        className={cn(rowClasses, "cursor-default text-neutral-300", depth > 0 && childConnectorClasses)}
      >
        {content}
      </span>
    );
  }

  return (
    <div>
      {row}
      {hasChildren && !item.flyout && open && (
        <div className={cn("ml-7 flex flex-col border-l border-neutral-300 pl-4", SIDEBAR_ITEM_GAP, SIDEBAR_ITEM_GAP_TOP)}>
          {item.items!.map((childItem) => (
            <SidebarItem
              key={childItem.label}
              item={childItem}
              depth={depth + 1}
              hoveredFlyoutLabel={hoveredFlyoutLabel}
              onFlyoutHover={onFlyoutHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}
