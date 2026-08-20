import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { ComingSoon } from "@/components/dashboard/ComingSoon";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;
  await resolveClientAccess(clientSlug);

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbTitle />
      <ComingSoon
        label="Resumen General"
        description="Acá vas a poder ver insights generales de todos los tableros en un solo lugar. Todavía estamos construyendo esta vista."
      />
    </div>
  );
}
