import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Arranca el login con Google desde el servidor y redirige directo a la
// pantalla de Google, sin pasar por un botón intermedio. Lo usa la portada
// ("/") cuando no hay sesión. `origin` ("admin" | "client") viaja hasta
// /auth/callback igual que con GoogleSignInButton.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const loginOrigin = searchParams.get("origin") === "admin" ? "admin" : "client";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?origin=${loginOrigin}`,
      // Siempre muestra el selector de cuentas de Google, para poder entrar
      // con otra cuenta después de cerrar sesión.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/unauthorized`);
  }

  return NextResponse.redirect(data.url);
}
