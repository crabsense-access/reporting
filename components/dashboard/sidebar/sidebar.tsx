"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import { CrbLogo } from "./CrbLogo";
import { SidebarFlyoutPanel } from "./sidebar-flyout-panel";
import { SidebarItem } from "./sidebar-item";
import { SIDEBAR_ITEM_GAP } from "./spacing";
import type { NavItem } from "./nav-items";

export function Sidebar({ items, className }: { items: NavItem[]; className?: string }) {
  const [hoveredItem, setHoveredItem] = useState<NavItem | null>(null);

  return (
    <nav
      role="navigation"
      aria-label="Main"
      onMouseLeave={() => setHoveredItem(null)}
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col overflow-y-auto rounded-r-3xl bg-neutral-100 px-5 py-8 shadow-md",
        SIDEBAR_ITEM_GAP,
        className
      )}
    >
      <div className="mb-4 flex justify-start px-3">
        <CrbLogo className="h-12 w-12" />
      </div>

      {items.map((item) => (
        <SidebarItem
          key={item.label}
          item={item}
          hoveredFlyoutLabel={hoveredItem?.label ?? null}
          onFlyoutHover={setHoveredItem}
        />
      ))}

      {hoveredItem && <SidebarFlyoutPanel group={hoveredItem} />}
    </nav>
  );
}
