import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/roles";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { SignOutButton } from "@/components/SignOutButton";

// Puerta de entrada del equipo interno: esta misma página resuelve los tres
// estados posibles (sin sesión, sesión sin permiso, admin) en vez de tener
// una ruta /admin/login separada.
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Panel de administración</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Acceso exclusivo para el equipo de la agencia. Iniciá sesión con tu cuenta de Google.
        </p>
        <GoogleSignInButton origin="admin" />
      </div>
    );
  }

  if (!(await isAdminEmail(supabase, user.email))) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold text-foreground">
          No tenés acceso al panel de administración
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu cuenta ({user.email}) no está habilitada como usuaria del equipo interno. Si
          creés que es un error, contactá a quien administra la agencia.
        </p>
        <SignOutButton />
      </div>
    );
  }

  redirect("/admin/clients");
}
