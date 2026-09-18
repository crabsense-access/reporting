"use client";

import { useState } from "react";
import { FileQuestion } from "lucide-react";

import { cn } from "@/lib/utils";

interface SourceIconProps {
  src: string;
  alt: string;
  connected: boolean;
}

// Asset local en public/icons/ (no hotlinking) para fuentes cuyo ícono de Simple Icons/favicon
// no reflejaba bien el logo real del producto (ver Prompt I → Prompt J). grayscale vía CSS
// cuando la fuente no está conectada, sin filtro cuando sí — mismo criterio que el resto del
// acordeón. Si el asset no carga, cae a un ícono genérico gris en vez de un espacio roto.
export function SourceIcon({ src, alt, connected }: SourceIconProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <FileQuestion className="h-6 w-6 text-muted-foreground" aria-label={alt} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- asset local en public/, sin dominio remoto que configurar
    <img
      src={src}
      alt={alt}
      width={24}
      height={24}
      className={cn("h-6 w-6", !connected && "grayscale opacity-60")}
      onError={() => setFailed(true)}
    />
  );
}
