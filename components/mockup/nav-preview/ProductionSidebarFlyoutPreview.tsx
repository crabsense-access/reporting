"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronUp, LayoutGrid, Search, Sparkles, TrendingUp, Users, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { CrbLogo } from "@/components/mockup/CrbLogo";
import { CONVERSIONES_NAV_GROUPS, RETENCION_NAV_GROUPS, USUARIOS_NAV_GROUPS } from "@/components/mockup/entities/navGroups";
import type { MockupNavGroup } from "@/components/mockup/MockupSidebar";

interface AnaliticaSubitem {
  key: string;
  label: string;
  groups: MockupNavGroup[];
}

// Cada sub-item tiene su propia subdivisión — Audiencia reusa la de Usuarios,
// Conversiones reusa la ya construida para /mockup/conversiones, y Retención
// tiene una propia enfocada en cohortes/lifecycle — para que el cambio de
// contenido al pasar de un sub-item a otro sea visible, no solo el label.
const ANALITICA_SUBITEMS: AnaliticaSubitem[] = [
  { key: "audiencia", label: "Audiencia", groups: USUARIOS_NAV_GROUPS },
  { key: "retencion", label: "Retención", groups: RETENCION_NAV_GROUPS },
  { key: "conversiones", label: "Conversiones", groups: CONVERSIONES_NAV_GROUPS },
];

// Resto de los grupos del rail: acordeón colapsado por defecto, con sub-items
// de ejemplo (no disparan el segundo sidebar, eso es exclusivo de Analítica
// en este preview) — solo para mostrar la estructura de dos niveles pareja
// en los 5 ítems.
const RESUMEN_GENERAL_GROUP = {
  key: "resumen-general",
  label: "Resumen General",
  icon: LayoutGrid,
  subitems: ["Visión General", "Comparativa de Períodos"],
};

const AFTER_ANALITICA_GROUPS: { key: string; label: string; icon: LucideIcon; subitems: string[] }[] = [
  { key: "seo", label: "SEO", icon: Search, subitems: ["Visión General", "Palabras Clave"] },
  { key: "ads", label: "ADS", icon: TrendingUp, subitems: ["Google Ads", "Meta Ads"] },
  { key: "ia", label: "IA", icon: Sparkles, subitems: ["Visibilidad IA", "Oportunidades Detectadas"] },
];

const groupRowClasses =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[0.75rem] font-semibold uppercase text-neutral-900 transition-colors hover:bg-neutral-200/60";

const subitemRowClasses =
  "relative rounded-lg px-3 py-1.5 text-left text-[0.75rem] font-medium uppercase transition-colors before:absolute before:-left-4 before:top-1/2 before:h-px before:w-4 before:bg-neutral-300 before:content-['']";

function AccordionShell({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          key="children"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="ml-7 overflow-hidden border-l border-neutral-300 pl-4"
        >
          <div className="mt-1 flex flex-col gap-0.5 pb-0.5">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GroupHeader({ icon: Icon, label, open, onClick }: { icon: LucideIcon; label: string; open: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={open} className={groupRowClasses}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <span className="flex-1">{label}</span>
      {open ? (
        <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" />
      ) : (
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
      )}
    </button>
  );
}

function StaticAccordionGroup({
  icon,
  label,
  subitems,
  open,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  subitems: string[];
  open: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <GroupHeader icon={icon} label={label} open={open} onClick={onClick} />
      <AccordionShell open={open}>
        {subitems.map((sub) => (
          <span key={sub} className={cn(subitemRowClasses, "cursor-default text-neutral-500")}>
            {sub}
          </span>
        ))}
      </AccordionShell>
    </div>
  );
}

export function ProductionSidebarFlyoutPreview() {
  const [hoveredSubitem, setHoveredSubitem] = useState<string | null>(null);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(["analitica"]));
  const activeSubitem = ANALITICA_SUBITEMS.find((sub) => sub.key === hoveredSubitem) ?? null;

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <nav
      aria-label="Preview de navegación"
      onMouseLeave={() => setHoveredSubitem(null)}
      className="fixed bottom-0 left-0 top-10 z-40 flex w-56 flex-col gap-4 overflow-y-auto px-5 py-8"
    >
      <div className="flex justify-start px-3">
        <CrbLogo className="h-12 w-12" />
      </div>

      <div onMouseEnter={() => setHoveredSubitem(null)}>
        <StaticAccordionGroup
          icon={RESUMEN_GENERAL_GROUP.icon}
          label={RESUMEN_GENERAL_GROUP.label}
          subitems={RESUMEN_GENERAL_GROUP.subitems}
          open={openKeys.has(RESUMEN_GENERAL_GROUP.key)}
          onClick={() => toggle(RESUMEN_GENERAL_GROUP.key)}
        />
      </div>

      <div onMouseEnter={() => setHoveredSubitem(null)}>
        <GroupHeader icon={Users} label="Analítica" open={openKeys.has("analitica")} onClick={() => toggle("analitica")} />
        <AccordionShell open={openKeys.has("analitica")}>
          {ANALITICA_SUBITEMS.map((sub) => (
            <button
              key={sub.key}
              type="button"
              onMouseEnter={() => setHoveredSubitem(sub.key)}
              className={cn(
                subitemRowClasses,
                "text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900",
                hoveredSubitem === sub.key && "bg-white font-semibold text-neutral-900 shadow-sm hover:bg-white"
              )}
            >
              {sub.label}
            </button>
          ))}
        </AccordionShell>
      </div>

      {AFTER_ANALITICA_GROUPS.map((group) => (
        <div key={group.key} onMouseEnter={() => setHoveredSubitem(null)}>
          <StaticAccordionGroup
            icon={group.icon}
            label={group.label}
            subitems={group.subitems}
            open={openKeys.has(group.key)}
            onClick={() => toggle(group.key)}
          />
        </div>
      ))}

      {activeSubitem && (
        <div className="fixed bottom-0 left-56 top-10 z-30 flex w-72 flex-col gap-1 overflow-y-auto rounded-l-3xl bg-white p-6 shadow-xl">
          <div className="mb-3 px-1 text-sm font-semibold uppercase text-neutral-900">{activeSubitem.label}</div>
          <div className="flex flex-col gap-6">
            {activeSubitem.groups.map((group) => (
              <div key={group.category} className="flex flex-col gap-0.5">
                <div className="mt-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                  {group.category}
                </div>
                {group.items.map((item) => (
                  <button
                    key={item.anchor}
                    type="button"
                    className="rounded-md px-2 py-1 text-left text-[11px] uppercase text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
