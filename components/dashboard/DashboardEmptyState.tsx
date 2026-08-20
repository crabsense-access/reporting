import { LayoutDashboard } from "lucide-react";

export function DashboardEmptyState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-background px-6 py-16 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <LayoutDashboard className="h-6 w-6" />
      </span>
      <p className="text-base font-medium text-foreground">Todavía no tenés tableros configurados.</p>
      <p className="text-sm text-muted-foreground">Contactá a tu agencia.</p>
    </div>
  );
}
