import { AlertTriangle } from "lucide-react";

export function MockupBanner() {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-10 items-center justify-center gap-2 bg-amber-400 px-4 text-center text-xs font-medium text-amber-950 shadow-sm">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span>Vista de mockup — datos ficticios, no conectado a ninguna fuente real.</span>
    </div>
  );
}
