import { LayoutDashboard, ShieldCheck, PlugZap, Users } from "lucide-react";

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: "Todas tus métricas en un solo lugar",
    description: "Un tablero por cliente que reúne sus fuentes de datos sin planillas sueltas.",
  },
  {
    icon: ShieldCheck,
    title: "Acceso seguro con tu cuenta de Google",
    description: "Sin contraseñas nuevas: cada cliente entra con el Google que ya usa a diario.",
  },
  {
    icon: PlugZap,
    title: "Sumamos nuevas fuentes de datos sin fricción",
    description: "Empezamos con Google Analytics 4 y vamos sumando canales sin cambiar el flujo.",
  },
  {
    icon: Users,
    title: "Control total desde la agencia",
    description: "Tu equipo da de alta clientes, configura fuentes y administra accesos en minutos.",
  },
];

export function LandingFeatures() {
  return (
    <section className="border-t border-border bg-secondary/40">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex flex-col gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
