"use client";

// Menú lateral del reporte (a pedido de Martín): un ítem por plataforma (Meta Ads / Google Ads,
// con sus logos) y, debajo de cada una, un sub-ítem por cada bloque del reporte. Click en un
// sub-ítem → baja despacio (animación propia, más lenta que el scroll "smooth" nativo) hasta ese
// bloque.
//
// Los sub-ítems NO están hardcodeados: se arman leyendo los títulos (h3) que hay renderizados
// dentro del contenedor del reporte de cada plataforma ([data-report-platform="…"]). Así el menú
// sigue solo a los bloques condicionales (Facturación sólo para ecommerce, el gráfico del Google
// Sheet sólo si hay uno configurado, Recomendaciones sólo para admins, etc.) y a cualquier bloque
// nuevo que se agregue, sin tener que mantener una lista aparte.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SiGoogleads, SiMeta } from "react-icons/si";

import { cn } from "@/lib/utils";

export type ReportPlatform = "meta_ads" | "google_ads";

interface SectionLink {
  id: string;
  title: string;
}

const PLATFORMS: { key: ReportPlatform; label: string; icon: ReactNode }[] = [
  { key: "meta_ads", label: "Meta Ads", icon: <SiMeta color="#0467DF" className="h-6 w-6" /> },
  { key: "google_ads", label: "Google Ads", icon: <SiGoogleads color="#4285F4" className="h-6 w-6" /> },
];

/** Distancia que se deja libre arriba del bloque al terminar de bajar. */
const SCROLL_OFFSET = 24;
/** Duración del scroll animado (ms) — "que baje despacio". */
const SCROLL_DURATION = 1100;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function slowScrollTo(targetY: number) {
  const startY = window.scrollY;
  const distance = targetY - startY;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / SCROLL_DURATION, 1);
    window.scrollTo(0, startY + distance * easeInOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Lee los títulos de bloque de una plataforma y les asigna un id estable (para el link y el scroll). */
function readSections(platform: ReportPlatform): SectionLink[] {
  const root = document.querySelector(`[data-report-platform="${platform}"]`);
  if (!root) return [];
  const used = new Set<string>();
  return Array.from(root.querySelectorAll<HTMLElement>("h3"))
    .map((el) => {
      const title = el.textContent?.trim() ?? "";
      if (!title) return null;
      if (!el.id) {
        let id = `seccion-${slugify(title)}`;
        let n = 2;
        while (used.has(id) || (document.getElementById(id) && document.getElementById(id) !== el)) id = `seccion-${slugify(title)}-${n++}`;
        el.id = id;
      }
      used.add(el.id);
      return { id: el.id, title };
    })
    .filter((s): s is SectionLink => s !== null);
}

/** Publica el ancho real del scrollbar en --scrollbar-width (100vw lo incluye y generaría scroll horizontal). */
function useScrollbarWidthVar() {
  useEffect(() => {
    const update = () =>
      document.documentElement.style.setProperty("--scrollbar-width", `${window.innerWidth - document.documentElement.clientWidth}px`);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
}

/**
 * Cada plataforma tiene su PROPIA página (a pedido de Martín): el título de la plataforma en el
 * menú es un link a esa página (conserva el mes elegido, ver ?month= en ReportBody.tsx) y los
 * sub-ítems con scroll se muestran sólo para la plataforma de la página actual.
 */
export function ReportSidebar({
  platforms,
  current,
  hrefs,
}: {
  /** Plataformas con reporte para este cliente; el resto se muestra como "Próximamente". */
  platforms: ReportPlatform[];
  /** Plataforma de la página que se está viendo. */
  current: ReportPlatform;
  /** URL de la página de cada plataforma. */
  hrefs: Record<ReportPlatform, string>;
}) {
  const router = useRouter();
  const [sections, setSections] = useState<Record<ReportPlatform, SectionLink[]>>({ meta_ads: [], google_ads: [] });
  const [activeId, setActiveId] = useState<string | null>(null);
  useScrollbarWidthVar();

  // Los bloques se renderizan a medida que llegan los datos (y cambian al elegir otro mes), así que
  // el menú se recalcula cada vez que cambia el DOM del reporte.
  useEffect(() => {
    const refresh = () => {
      const next = { meta_ads: readSections("meta_ads"), google_ads: readSections("google_ads") };
      setSections((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    refresh();
    const observer = new MutationObserver(refresh);
    document.querySelectorAll("[data-report-platform]").forEach((root) =>
      observer.observe(root, { childList: true, subtree: true, characterData: true })
    );
    return () => observer.disconnect();
  }, []);

  // Resalta el bloque que se está mirando: el último título que ya pasó el tercio superior de la pantalla.
  useEffect(() => {
    const all = [...sections.meta_ads, ...sections.google_ads];
    if (all.length === 0) return;
    const onScroll = () => {
      const line = window.innerHeight / 3;
      let current: string | null = null;
      for (const s of all) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) current = s.id;
      }
      setActiveId(current ?? all[0]!.id);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sections]);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    // Se apunta a la card que contiene el título (si hay), para que se vea el bloque entero.
    const target = (el?.closest("[data-report-block]") as HTMLElement | null) ?? el?.closest(".rounded-lg") ?? el;
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    slowScrollTo(Math.max(y, 0));
    setActiveId(id);
  }, []);

  return (
    <nav className="flex flex-col gap-7 text-sm" aria-label="Secciones del reporte">
      {PLATFORMS.map((platform) => {
        const enabled = platforms.includes(platform.key);
        const items = sections[platform.key];
        return (
          <div key={platform.key} className="flex flex-col gap-2.5">
            {enabled && platform.key !== current ? (
              <button
                type="button"
                onClick={() => {
                  // Lleva el mes que se está mirando a la otra página.
                  const month = new URLSearchParams(window.location.search).get("month");
                  router.push(month ? `${hrefs[platform.key]}?month=${month}` : hrefs[platform.key]);
                }}
                className="flex items-center gap-2.5 rounded-md text-left text-lg font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                <span>{platform.icon}</span>
                {platform.label}
                <span className="ml-auto text-xs font-medium">Ver →</span>
              </button>
            ) : (
              <div className={cn("flex items-center gap-2.5 text-lg font-bold", enabled ? "text-foreground" : "text-muted-foreground")}>
                <span className={cn(!enabled && "opacity-50 grayscale")}>{platform.icon}</span>
                {platform.label}
              </div>
            )}
            {platform.key !== current && enabled ? null : !enabled ? (
              <span className="pl-[34px] text-sm text-muted-foreground">Próximamente</span>
            ) : items.length === 0 ? (
              <span className="pl-[34px] text-sm text-muted-foreground">Cargando…</span>
            ) : (
              <ul className="flex flex-col border-l border-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => goTo(item.id)}
                      className={cn(
                        "-ml-px w-full border-l-2 py-1.5 pl-3 pr-1 text-left text-sm leading-snug transition-colors",
                        activeId === item.id
                          ? "border-primary font-medium text-primary"
                          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                      )}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

/**
 * Layout del reporte: menú lateral fijo a la izquierda (sticky al hacer scroll) + contenido.
 *
 * A pedido de Martín, el reporte usa casi todo el ancho de la pantalla (poco padding a los
 * costados): este bloque "rompe" el contenedor max-w-6xl del layout (full-bleed con 50vw) en vez
 * de cambiar el layout, que comparten otras páginas del admin. `header` (título de la página) va
 * arriba de la columna del reporte, alineado con él. En pantallas chicas (< lg) el menú se oculta.
 */
export function ReportWithSidebar({
  platforms,
  current,
  hrefs,
  header,
  children,
}: {
  platforms: ReportPlatform[];
  current: ReportPlatform;
  hrefs: Record<ReportPlatform, string>;
  header?: ReactNode;
  /** Contenido del reporte (ReportBody). */
  children: ReactNode;
}) {
  return (
    <div className="relative left-1/2 w-[calc(100vw-var(--scrollbar-width,0px))] -translate-x-1/2 px-4">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto pr-2">
            <ReportSidebar platforms={platforms} current={current} hrefs={hrefs} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-col gap-6">
          {header}
          {/* Los contenedores [data-report-platform] los arma ReportBody (uno por plataforma). */}
          <div className="min-w-0">{children}</div>
        </div>
      </div>
    </div>
  );
}
