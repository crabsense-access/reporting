import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { clientLandingPath, isAdminEmail } from "@/lib/auth/roles";
import { SignOutButton } from "@/components/SignOutButton";

// Puerta de entrada ("/"): sin sesión redirige directo al login de Google
// (app/auth/login/route.ts). Después del login, los usuarios
// del cliente van a su reporte (o al selector si tienen varios clientes), el
// admin (ADMIN_EMAIL, lib/auth/roles.ts) va al panel y cualquier otra cuenta
// ve "Acceso no habilitado".

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sin sesión: directo a la pantalla de login de Google.
  if (!user?.email) {
    redirect("/auth/login?origin=client");
  }

  if (await isAdminEmail(supabase, user.email)) {
    redirect("/admin/clients");
  }

  // Usuarios del cliente: directo a su reporte (o al selector si tienen varios).
  const landing = await clientLandingPath(supabase, user.email);
  if (landing) {
    redirect(landing);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-semibold text-foreground">Acceso no habilitado</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Tu cuenta ({user.email}) no tiene acceso a ningún reporte. Pedile a tu agencia que la
        habilite.
      </p>
      <SignOutButton />
    </div>
  );
}
