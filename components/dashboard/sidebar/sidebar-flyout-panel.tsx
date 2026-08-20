"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useInsightsSections } from "@/components/dashboard/insights-context";
import { computeBadgeCounts, BadgePills } from "./sidebar-item";
import { SIDEBAR_GROUP_GAP, SIDEBAR_PANEL_ITEM_GAP } from "./spacing";
import type { NavItem } from "./nav-items";

const leafClasses =
  "relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] font-medium uppercase transition-colors";

// El panel siempre representa UN solo grupo (Audiencia, Retención, etc.),
// cuyo nombre ya se muestra como título propio en <SidebarFlyoutPanel> — acá
// solo hay un nivel de jerarquía visual: categoría (gris chico, ej.
// "Composición") y sus items (leafClasses), sin indentación escalonada.
// Dentro de una categoría, el header y sus items usan SIDEBAR_PANEL_ITEM_GAP
// (más ajustado, para que se lean como parte de un mismo grupo) — el
// espacio ENTRE categorías distintas lo controla el contenedor de
// <SidebarFlyoutPanel> con SIDEBAR_GROUP_GAP, sin tocar este espaciado
// interno.
function FlyoutNode({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const sections = useInsightsSections();
  const hasChildren = !!item.items?.length;

  if (hasChildren) {
    return (
      <div className={cn("flex flex-col", SIDEBAR_PANEL_ITEM_GAP)}>
        <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{item.label}</div>
        {item.items!.map((child) => (
          <FlyoutNode key={child.label} item={child} />
        ))}
      </div>
    );
  }

  if (!item.href) {
    return <span className={cn(leafClasses, "cursor-default text-neutral-300")}>{item.label}</span>;
  }

  const active = pathname === item.href;
  const badgeCounts = computeBadgeCounts(item, sections);

  return (
    <Link
      href={item.href}
      className={cn(
        leafClasses,
        active
          ? "bg-neutral-100 font-semibold text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
      )}
    >
      <span className="flex-1">{item.label}</span>
      {badgeCounts && <BadgePills counts={badgeCounts} />}
    </Link>
  );
}

// Segundo sidebar flotante: aparece a la derecha del rail mientras se hace
// hover sobre un grupo de primer nivel (Analítica/SEO/ADS/IA), mostrando su
// árbol real de sub-items. Sigue montado mientras el mouse está sobre él
// porque es hijo del <nav> que controla el hover (ver sidebar.tsx).
export function SidebarFlyoutPanel({ group }: { group: NavItem }) {
  return (
    <div className="fixed inset-y-0 left-72 z-30 flex w-72 flex-col gap-1 overflow-y-auto rounded-l-3xl bg-white p-6 shadow-xl">
      <div className="mb-3 px-1 text-sm font-semibold uppercase text-neutral-900">{group.label}</div>
      <div className={cn("flex flex-col", SIDEBAR_GROUP_GAP)}>
        {group.items!.map((item) => (
          <FlyoutNode key={item.label} item={item} />
        ))}
      </div>
    </div>
  );
}
