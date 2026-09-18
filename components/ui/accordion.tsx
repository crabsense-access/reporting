"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface AccordionContextValue {
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

interface AccordionProps {
  defaultOpenId?: string;
  children: ReactNode;
}

// Exclusivo: como mucho un item abierto a la vez. Los AccordionItem hijos se coordinan vía este
// context en lugar de manejar su propio estado de apertura.
export function Accordion({ defaultOpenId, children }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId ?? null);

  return (
    <AccordionContext.Provider value={{ openId, setOpenId }}>
      <div className="flex flex-col gap-4">{children}</div>
    </AccordionContext.Provider>
  );
}

interface AccordionItemProps {
  id: string;
  icon: ReactNode;
  title: string;
  description?: string;
  status?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function AccordionItem({
  id,
  icon,
  title,
  description,
  status,
  headerRight,
  children,
}: AccordionItemProps) {
  const ctx = useContext(AccordionContext);
  if (!ctx) {
    throw new Error("AccordionItem debe usarse dentro de un <Accordion>");
  }
  const { openId, setOpenId } = ctx;
  const open = openId === id;

  function toggle() {
    setOpenId(open ? null : id);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex w-full items-center gap-3 px-6 py-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex flex-1 items-center gap-3 text-left"
        >
          <span className="flex shrink-0 items-center text-2xl">{icon}</span>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-foreground">{title}</span>
              {status}
            </div>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </button>
        {headerRight}
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? "Colapsar" : "Expandir"}
          className="shrink-0"
        >
          <ChevronDown
            className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
      </div>
      {open && <div className="border-t border-border px-6 py-6">{children}</div>}
    </div>
  );
}

export function SourceStatusBadge({ configured }: { configured: boolean }) {
  return (
    <Badge
      variant="outline"
      className={configured ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-muted-foreground"}
    >
      {configured ? "Configurado" : "Sin configurar"}
    </Badge>
  );
}
