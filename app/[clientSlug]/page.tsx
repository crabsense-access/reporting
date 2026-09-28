import { redirect } from "next/navigation";

import { clientReportPath } from "@/lib/auth/roles";

// /{clientSlug} a secas → directo al reporte.
export default async function ClientRootPage({ params }: { params: Promise<{ clientSlug: string }> }) {
  const { clientSlug } = await params;
  redirect(clientReportPath(clientSlug));
}
