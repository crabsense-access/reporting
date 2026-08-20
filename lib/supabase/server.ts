import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types";

// Cliente de Supabase para Server Components, Route Handlers y Server Actions.
// Respeta RLS: se autentica con la sesión del usuario a través de las cookies.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Se llamó desde un Server Component sin permiso de escritura de
            // cookies. Se puede ignorar porque el middleware refresca la
            // sesión en cada request.
          }
        },
      },
    }
  );
}
