import { GoogleSignInButton } from "@/components/GoogleSignInButton";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 flex justify-center blur-3xl"
      >
        <div className="aspect-[1155/678] w-[60rem] bg-gradient-to-tr from-accent to-primary/30 opacity-40" />
      </div>

      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 py-24 text-center sm:py-32">
        <h1 className="text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
          El tablero centralizado de métricas para los clientes de tu agencia
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg text-muted-foreground">
          Cada cliente entra con su cuenta de Google y ve, en un solo lugar, las métricas de
          sus fuentes de datos — sin planillas ni accesos sueltos.
        </p>
        <div className="mt-10">
          <GoogleSignInButton origin="client" size="lg" />
        </div>
      </div>
    </section>
  );
}
