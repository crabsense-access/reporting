import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";
import { isAdminEmail } from "@/lib/auth/roles";

// Protege /admin/* (todo menos la raíz /admin, que resuelve sus propios
// estados de login / sin acceso / redirect en app/admin/page.tsx). La
// autorización de /{clientSlug}/dashboard/{tipo} vive en
// lib/auth/resolveClientAccess.ts, no acá.
export async function middleware(request: NextRequest) {
  const { supabase, response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAdminSubroute = pathname.startsWith("/admin") && pathname !== "/admin";

  if (!isAdminSubroute) {
    return response;
  }

  if (!user?.email) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (await isAdminEmail(supabase, user.email)) {
    return response;
  }

  return NextResponse.redirect(new URL("/admin", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
};
