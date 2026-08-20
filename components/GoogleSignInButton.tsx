"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { Button, type ButtonProps } from "@/components/ui/button";

interface GoogleSignInButtonProps extends Omit<ButtonProps, "onClick"> {
  label?: string;
  // Marca desde dónde se inició el login para que /auth/callback sepa a
  // dónde volver: "client" es la landing pública, "admin" es /admin.
  origin: "admin" | "client";
}

export function GoogleSignInButton({
  label = "Iniciar sesión con Google",
  origin,
  ...props
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?origin=${origin}`,
      },
    });
  }

  return (
    <Button onClick={handleSignIn} disabled={loading} {...props}>
      {loading ? "Redirigiendo…" : label}
    </Button>
  );
}
