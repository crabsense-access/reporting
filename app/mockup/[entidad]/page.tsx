import { notFound } from "next/navigation";

import { ConversionesMockup } from "@/components/mockup/entities/ConversionesMockup";
import { SesionesMockup } from "@/components/mockup/entities/SesionesMockup";
import { UsuariosMockup } from "@/components/mockup/entities/UsuariosMockup";

const VALID_ENTITIES = ["usuarios", "conversiones", "sesiones"] as const;
type Entidad = (typeof VALID_ENTITIES)[number];

function isValidEntidad(value: string): value is Entidad {
  return (VALID_ENTITIES as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return VALID_ENTITIES.map((entidad) => ({ entidad }));
}

export default async function MockupEntidadPage({ params }: { params: Promise<{ entidad: string }> }) {
  const { entidad } = await params;

  if (!isValidEntidad(entidad)) {
    notFound();
  }

  switch (entidad) {
    case "usuarios":
      return <UsuariosMockup />;
    case "conversiones":
      return <ConversionesMockup />;
    case "sesiones":
      return <SesionesMockup />;
  }
}
