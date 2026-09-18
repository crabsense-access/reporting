import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { SignOutButton } from "@/components/SignOutButton";

// Gate temporal: mientras el sitio está en construcción, la primera pantalla
// (la raíz "/") es un login con Google y sólo puede entrar este email. Antes
// acá vivía la landing pública (ver components/landing/*, que sigue existiendo
// sin usar por ahora). Este mismo patrón de 3 estados (sin sesión, sesión sin
// permiso, ok) es el que ya usa app/admin/page.tsx.
// TODO: sacar este gate cuando el sitio esté listo para más gente — en ese
// momento esta página debería volver a mostrar la landing pública y dejar la
// autorización real en manos de isAdminEmail / isClientUserOfClient, como en
// el resto de la app.
const TEMP_ALLOWED_EMAIL = "access@crabsense.com";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Reporting</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Sitio en construcción. Iniciá sesión con tu cuenta de Google para continuar.
        </p>
        <GoogleSignInButton origin="client" />
      </div>
    );
  }

  if (user.email !== TEMP_ALLOWED_EMAIL) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-semibold text-foreground">Acceso no habilitado</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Tu cuenta ({user.email}) todavía no está habilitada. El sitio está en construcción.
        </p>
        <SignOutButton />
      </div>
    );
  }

  redirect("/admin/clients");
}
