import { Construction } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface ComingSoonProps {
  label: string;
  title?: string;
  description?: string;
}

export function ComingSoon({ label, title, description }: ComingSoonProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <Construction className="h-6 w-6" />
        </span>
        <h2 className="text-lg font-semibold text-foreground">
          {title ?? "Este tablero todavía no está conectado"}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {description ??
            `La fuente de datos de ${label} se va a sumar más adelante. Por ahora este espacio queda reservado para cuando esté lista la integración.`}
        </p>
      </CardContent>
    </Card>
  );
}
