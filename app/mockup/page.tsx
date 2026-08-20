import Link from "next/link";

import { MockupBanner } from "@/components/mockup/MockupBanner";

const ENTITIES = [
  {
    slug: "usuarios",
    label: "Usuarios",
    description: "Composición, comportamiento, retención, perfil (Google Signals) y dispositivo.",
  },
  {
    slug: "conversiones",
    label: "Conversiones",
    description: "Composición por evento/canal/dispositivo, calidad de conversión y dispositivo.",
  },
  {
    slug: "sesiones",
    label: "Sesiones",
    description: "Composición por canal/landing/tráfico, calidad de sesión y dispositivo.",
  },
];

export default function MockupLandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <MockupBanner />
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 pb-16 pt-24">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mockup de reestructuración</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Previsualización con datos ficticios. Elegí una entidad para ver la propuesta de estructura.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {ENTITIES.map((entity) => (
            <Link
              key={entity.slug}
              href={`/mockup/${entity.slug}`}
              className="rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent"
            >
              <div className="text-lg font-medium text-foreground">{entity.label}</div>
              <div className="text-sm text-muted-foreground">{entity.description}</div>
            </Link>
          ))}
        </div>

        <Link
          href="/mockup/nav-preview"
          className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <div className="font-medium text-foreground">Preview de navegación</div>
          Cómo quedaría el sidebar actual con un flyout de segundo nivel al pasar el mouse por &quot;Analítica&quot;.
        </Link>
      </main>
    </div>
  );
}
