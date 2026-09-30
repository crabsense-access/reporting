import { BarChart3 } from "lucide-react";

import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { SignOutButton } from "@/components/SignOutButton";

// Layout de la vista propia del cliente (/{clientSlug}/*). resolveClientAccess
// ya se encarga de: sin sesión → "/", sin acceso → "/unauthorized", slug
// inexistente → 404. Los admins también pueden entrar (para ver lo mismo que
// ve el cliente). La barra superior (nombre del cliente + Cerrar sesión) sólo
// la ven los admins — a pedido de Martín, los usuarios del cliente ven el
// reporte sin header.
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client, isAdminViewing } = await resolveClientAccess(clientSlug);

  return (
    <div className="min-h-screen bg-secondary/30">
      {isAdminViewing && (
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BarChart3 className="h-4 w-4" />
              </span>
              {client.name}
            </div>
            <SignOutButton />
          </div>
        </header>
      )}
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
