import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { clientReportPath, getClientsForEmail, isAdminEmail } from "@/lib/auth/roles";
import { SignOutButton } from "@/components/SignOutButton";

// Selector de reportes para un email habilitado en más de un cliente. Con un
// solo cliente no se muestra: el login lo manda directo a su reporte.
export default async function ClientPickerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) redirect("/");
  if (await isAdminEmail(supabase, user.email)) redirect("/admin/clients");

  const clients = await getClientsForEmail(supabase, user.email);
  if (clients.length === 0) redirect("/unauthorized");
  if (clients.length === 1) redirect(clientReportPath(clients[0]!.slug));

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-secondary/30 px-6 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-foreground">Elegí un reporte</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tu cuenta ({user.email}) tiene acceso a {clients.length} clientes.
        </p>
      </div>
      <ul className="flex w-full max-w-md flex-col gap-2">
        {clients.map((client) => (
          <li key={client.id}>
            <Link
              href={clientReportPath(client.slug)}
              className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-foreground transition-colors hover:bg-secondary/50"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BarChart3 className="h-4 w-4" />
              </span>
              <span className="flex-1 font-medium">{client.name}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      <SignOutButton />
    </div>
  );
}
