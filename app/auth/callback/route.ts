import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getClientForEmail, isAdminEmail } from "@/lib/auth/roles";
import {
  getAvailableDashboardTypes,
  getFirstAvailableDashboardType,
} from "@/lib/dashboard/getAvailableDashboardTypes";

// Supabase redirige acá después del login con Google, con un `code` en la
// query string y un `origin` ("admin" | "client") que indica desde qué
// puerta de entrada se inició sesión (ver GoogleSignInButton).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const loginOrigin = searchParams.get("origin");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const email = user?.email;

      if (email) {
        if (await isAdminEmail(supabase, email)) {
          // Vamos directo a /admin/clients en vez de pasar por /admin: esa
          // página vuelve a llamar a getUser() por su cuenta, y encadenar
          // ese segundo chequeo + su propio redirect era el punto donde a
          // veces la sesión recién creada no se veía todavía, mostrando de
          // nuevo el botón de "Iniciar sesión con Google".
          return NextResponse.redirect(`${origin}/admin/clients`);
        }

        if (loginOrigin === "admin") {
          // Autenticado pero sin permiso de admin: /admin resuelve el
          // mensaje de "no tenés acceso".
          return NextResponse.redirect(`${origin}/admin`);
        }

        const client = await getClientForEmail(supabase, email);
        if (client) {
          const availableTypes = await getAvailableDashboardTypes(supabase, client.id);
          const firstAvailable = getFirstAvailableDashboardType(availableTypes) ?? "analitica";
          return NextResponse.redirect(`${origin}/${client.slug}/dashboard/${firstAvailable}`);
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/unauthorized`);
}
