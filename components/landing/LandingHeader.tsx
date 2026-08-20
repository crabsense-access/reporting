import { BarChart3 } from "lucide-react";

import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export function LandingHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <BarChart3 className="h-4 w-4" />
          </span>
          Client Dashboards
        </div>
        <GoogleSignInButton origin="client" size="sm" label="Iniciar sesión" />
      </div>
    </header>
  );
}
