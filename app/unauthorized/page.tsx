import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldAlert className="h-6 w-6" />
      </span>
      <h1 className="text-2xl font-semibold text-foreground">Acceso no autorizado</h1>
      <p className="max-w-md text-muted-foreground">
        Tu cuenta de Google no tiene acceso a ningún tablero todavía. Contactá a tu agencia
        para que te agreguen como usuario autorizado.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Volver al inicio</Link>
      </Button>
    </div>
  );
}
