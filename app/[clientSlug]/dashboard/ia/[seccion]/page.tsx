import { notFound } from "next/navigation";

import { resolveClientAccess } from "@/lib/auth/resolveClientAccess";
import { BreadcrumbTitle } from "@/components/dashboard/BreadcrumbTitle";
import { ComingSoon } from "@/components/dashboard/ComingSoon";
import { IA_SECTIONS } from "@/components/dashboard/sidebar/nav-items";
import { slugify } from "@/lib/utils";

export default async function IaSeccionPage({
  params,
}: {
  params: Promise<{ clientSlug: string; seccion: string }>;
}) {
  const { clientSlug, seccion } = await params;

  const label = IA_SECTIONS.find((item) => slugify(item) === seccion);
  if (!label) notFound();

  await resolveClientAccess(clientSlug);

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbTitle />
      <ComingSoon label={label} />
    </div>
  );
}
