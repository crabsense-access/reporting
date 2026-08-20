"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import type { NavItem } from "./nav-items";

const NavItemsContext = React.createContext<NavItem[]>([]);

export function NavItemsProvider({ items, children }: { items: NavItem[]; children: React.ReactNode }) {
  return <NavItemsContext.Provider value={items}>{children}</NavItemsContext.Provider>;
}

export interface BreadcrumbSegment {
  label: string;
  /** Ausente en el último segmento (el actual, no navega) y en grupos sin destino propio ni hijos con href. */
  href?: string;
}

// Primer href navegable dentro del subárbol de `item`, recorriendo en
// profundidad. Como en buildEntityGroup (nav-items.ts) "Resumen" siempre es
// el primer hijo de un grupo con flyout, esto resuelve en la práctica a él.
function firstHref(item: NavItem): string | undefined {
  if (item.href) return item.href;
  for (const child of item.items ?? []) {
    const found = firstHref(child);
    if (found) return found;
  }
  return undefined;
}

function findActivePath(items: NavItem[], pathname: string, trail: NavItem[] = []): NavItem[] | null {
  for (const item of items) {
    const nextTrail = [...trail, item];
    if (item.href === pathname) return nextTrail;
    if (item.items) {
      const found = findActivePath(item.items, pathname, nextTrail);
      if (found) return found;
    }
  }
  return null;
}

// Deriva el path de breadcrumb (categoría › item › sección activa) del mismo
// árbol de navegación que alimenta el sidebar (ver NavItemsProvider), sin
// que cada página tenga que declarar sus propios labels.
export function useBreadcrumbPath(): BreadcrumbSegment[] {
  const items = React.useContext(NavItemsContext);
  const pathname = usePathname();

  return React.useMemo(() => {
    const trail = findActivePath(items, pathname) ?? [];
    return trail.map((item, index) => ({
      label: item.label,
      href: index < trail.length - 1 ? (item.href ?? firstHref(item)) : undefined,
    }));
  }, [items, pathname]);
}
