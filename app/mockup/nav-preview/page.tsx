import { MockupBanner } from "@/components/mockup/MockupBanner";
import { ProductionSidebarFlyoutPreview } from "@/components/mockup/nav-preview/ProductionSidebarFlyoutPreview";

export default function NavPreviewPage() {
  return (
    <div className="min-h-screen bg-neutral-200">
      <MockupBanner />
      <ProductionSidebarFlyoutPreview />
      <main className="flex flex-col gap-4 py-16 pl-64 pr-8">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Preview de navegación — sidebar actual + segundo sidebar</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Mismo diseño del sidebar real (paleta clara, rail colapsado). &quot;Comportamiento&quot; se renombra a{" "}
            <strong>Analítica</strong>, que siempre muestra sus 3 sub-items (Audiencia / Retención / Conversiones)
            indentados en el primer sidebar. Al pasar el mouse por uno de esos sub-items se abre un segundo sidebar
            de la misma altura con solo su contenido seccionado (Resumen, Composición, Comportamiento y Retención,
            Perfil, Dispositivo y Tecnología) — pasar a otro sub-item actualiza el segundo sidebar al instante.
          </p>
        </div>
      </main>
    </div>
  );
}
