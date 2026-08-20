import Link from "next/link";
import { BarChart3, Settings } from "lucide-react";

import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { getAvailableDashboardTypes } from "@/lib/dashboard/getAvailableDashboardTypes";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import { InsightsProvider } from "@/components/dashboard/insights-context";
import { InsightsPreloader } from "@/components/dashboard/insights-preloader";
import { Sidebar } from "@/components/dashboard/sidebar/sidebar";
import { buildDashboardNavItems } from "@/components/dashboard/sidebar/nav-items";
import { NavItemsProvider } from "@/components/dashboard/sidebar/nav-items-context";
import { Button } from "@/components/ui/button";

export default async function ClientDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  const { client, isAdminViewing } = await resolveClientAccess(clientSlug);

  const supabase = await createClient();
  const availableTypes = await getAvailableDashboardTypes(supabase, client.id);
  const navItems = buildDashboardNavItems({ clientSlug: client.slug, availableTypes });

  return (
    <InsightsProvider>
      <InsightsPreloader clientId={client.id} availableTypes={availableTypes} />
      <NavItemsProvider items={navItems}>
        <div className="min-h-screen bg-secondary/30">
          <Sidebar items={navItems} />
          <div className="pl-72">
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
            <main className="mx-auto max-w-6xl px-6 py-8">
              {isAdminViewing && (
                <div className="mb-6 flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Estás viendo el tablero de <strong>{client.name}</strong> como administrador.
                  </span>
                  <Button asChild variant="outline" size="sm" className="w-fit shrink-0 bg-background">
                    <Link href={`/admin/clients/${client.id}#fuentes-de-datos`}>
                      <Settings className="h-4 w-4" />
                      Configurar fuentes de datos
                    </Link>
                  </Button>
                </div>
              )}
              {children}
            </main>
          </div>
        </div>
      </NavItemsProvider>
    </InsightsProvider>
  );
}
