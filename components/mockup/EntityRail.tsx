"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
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
import { CrbLogo } from "@/components/mockup/CrbLogo";

export type EntityRailSubitemKey = "audiencia" | "conversiones" | null;

interface RailSubitem {
  key: string;
  label: string;
  href?: string;
}

interface RailGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  subitems: RailSubitem[];
}

// Todos los ítems del rail son acordeones — Analítica arranca abierto (es la
// sección relevante para estas páginas), el resto arranca colapsado. Analítica
// tiene sus 3 sub-items reales (Audiencia/Conversiones navegan, Retención
// todavía no tiene página propia); Resumen General/SEO/ADS/IA llevan sub-items
// de ejemplo — son placeholders, no contenido real todavía.
const RAIL_GROUPS: RailGroup[] = [
  {
    key: "resumen-general",
    label: "Resumen General",
    icon: LayoutGrid,
    subitems: [
      { key: "vision-general", label: "Visión General" },
      { key: "comparativa-periodos", label: "Comparativa de Períodos" },
    ],
  },
  {
    key: "analitica",
    label: "Analítica",
    icon: Users,
    subitems: [
      { key: "audiencia", label: "Audiencia", href: "/mockup/usuarios" },
      { key: "conversiones", label: "Conversiones", href: "/mockup/conversiones" },
      { key: "retencion", label: "Retención" },
    ],
  },
  {
    key: "seo",
    label: "SEO",
    icon: Search,
    subitems: [
      { key: "vision-general-seo", label: "Visión General" },
      { key: "palabras-clave", label: "Palabras Clave" },
    ],
  },
  {
    key: "ads",
    label: "ADS",
    icon: TrendingUp,
    subitems: [
      { key: "google-ads", label: "Google Ads" },
      { key: "meta-ads", label: "Meta Ads" },
    ],
  },
  {
    key: "ia",
    label: "IA",
    icon: Sparkles,
    subitems: [
      { key: "visibilidad-ia", label: "Visibilidad IA" },
      { key: "oportunidades-ia", label: "Oportunidades Detectadas" },
    ],
  },
];

const DEFAULT_OPEN_KEYS = ["analitica"];

const groupRowClasses =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[0.75rem] font-semibold uppercase text-neutral-900 transition-colors hover:bg-neutral-200/60";

const subitemRowClasses =
  "relative rounded-lg px-3 py-1.5 text-left text-[0.75rem] font-medium uppercase transition-colors before:absolute before:-left-4 before:top-1/2 before:h-px before:w-4 before:bg-neutral-300 before:content-['']";

function RailAccordionGroup({
  group,
  open,
  onToggle,
  activeSubitemKey,
}: {
  group: RailGroup;
  open: boolean;
  onToggle: () => void;
  activeSubitemKey: EntityRailSubitemKey;
}) {
  const Icon = group.icon;

  return (
    <div>
      <button type="button" onClick={onToggle} aria-expanded={open} className={groupRowClasses}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl">
          <Icon className="h-5 w-5" strokeWidth={2} />
        </span>
        <span className="flex-1">{group.label}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
      </button>

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
            <div className="mt-1 flex flex-col gap-0.5 pb-0.5">
              {group.subitems.map((sub) =>
                sub.href ? (
                  <Link
                    key={sub.key}
                    href={sub.href}
                    className={cn(
                      subitemRowClasses,
                      activeSubitemKey === sub.key
                        ? "bg-white font-semibold text-neutral-900 shadow-sm"
                        : "text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900"
                    )}
                  >
                    {sub.label}
                  </Link>
                ) : (
                  <span key={sub.key} className={cn(subitemRowClasses, "cursor-default text-neutral-300")}>
                    {sub.label}
                  </span>
                )
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EntityRail({ activeSubitemKey }: { activeSubitemKey: EntityRailSubitemKey }) {
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(DEFAULT_OPEN_KEYS));

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
      aria-label="Navegación"
      className="fixed bottom-0 left-0 top-10 z-40 flex w-56 flex-col gap-4 overflow-y-auto px-5 py-8"
    >
      <div className="flex justify-start px-3">
        <CrbLogo className="h-12 w-12" />
      </div>

      <Link
        href="/mockup"
        className="-mt-2 flex items-center gap-2 px-3 text-xs uppercase text-neutral-400 transition-colors hover:text-neutral-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Mockup
      </Link>

      {RAIL_GROUPS.map((group) => (
        <RailAccordionGroup
          key={group.key}
          group={group}
          open={openKeys.has(group.key)}
          onToggle={() => toggle(group.key)}
          activeSubitemKey={activeSubitemKey}
        />
      ))}
    </nav>
  );
}
