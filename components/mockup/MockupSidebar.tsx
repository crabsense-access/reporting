"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface MockupNavItem {
  label: string;
  anchor: string;
}

export interface MockupNavGroup {
  category: string;
  items: MockupNavItem[];
}

interface MockupSidebarProps {
  groups: MockupNavGroup[];
}

export function MockupSidebar({ groups }: MockupSidebarProps) {
  const [active, setActive] = useState<string | null>(groups[0]?.items[0]?.anchor ?? null);

  useEffect(() => {
    const ids = groups.flatMap((group) => group.items.map((item) => item.anchor));
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [groups]);

  function handleClick(anchor: string) {
    setActive(anchor);
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav
      aria-label="Navegación de sección"
      className="fixed bottom-0 left-56 top-10 z-30 flex w-72 flex-col gap-1 overflow-y-auto rounded-l-3xl bg-white p-6 shadow-xl"
    >
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <div key={group.category} className="flex flex-col gap-0.5">
            <div className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              {group.category}
            </div>
            {group.items.map((item) => (
              <button
                key={item.anchor}
                type="button"
                onClick={() => handleClick(item.anchor)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-left text-[11px] uppercase transition-colors",
                  active === item.anchor
                    ? "bg-neutral-100 font-semibold text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
