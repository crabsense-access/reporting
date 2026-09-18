import Link from "next/link";
import { BarChart3, FileText, LineChart, Megaphone, Pencil, Search, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InformesPopup } from "@/components/admin/reports/InformesPopup";
import type { ReportSummary } from "@/lib/types";

interface ClientRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  hasGA4: boolean;
  hasSearchConsole: boolean;
  hasGoogleAds: boolean;
  hasMetaAds: boolean;
  hasBlog: boolean;
  reports: ReportSummary[];
}

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  if (clients.length === 0) {
    return (
      <Card className="p-10 text-center text-sm text-muted-foreground">
        Todavía no hay clientes dados de alta.
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Fuentes de datos</th>
            <th className="px-4 py-3 font-medium">Alta</th>
            <th className="px-4 py-3 font-medium">Informes</th>
            <th className="px-4 py-3 font-medium text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-secondary/30">
              <td className="px-4 py-3 font-medium text-foreground">{client.name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {client.hasGA4 && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary/30 bg-primary/10 text-primary"
                    >
                      <BarChart3 className="h-3 w-3" />
                      GA4
                    </Badge>
                  )}
                  {client.hasSearchConsole && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      <Search className="h-3 w-3" />
                      Search Console
                    </Badge>
                  )}
                  {client.hasGoogleAds && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-amber-200 bg-amber-50 text-amber-700"
                    >
                      <Sparkles className="h-3 w-3" />
                      Google Ads
                    </Badge>
                  )}
                  {client.hasMetaAds && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-sky-200 bg-sky-50 text-sky-700"
                    >
                      <Megaphone className="h-3 w-3" />
                      Meta Ads
                    </Badge>
                  )}
                  {client.hasSearchConsole && client.hasBlog && (
                    <Badge variant="secondary">+ Blog</Badge>
                  )}
                  {!client.hasGA4 && !client.hasSearchConsole && !client.hasGoogleAds && !client.hasMetaAds && (
                    <span className="text-xs italic text-muted-foreground">Sin fuentes</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(client.created_at).toLocaleDateString("es-AR")}
              </td>
              <td className="px-4 py-3">
                <InformesPopup clientId={client.id} clientName={client.name} reports={client.reports} />
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/clients/${client.id}/reporting`}>
                      <LineChart className="h-4 w-4" />
                      Informes
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/admin/clients/${client.id}/informes/nuevo`}>
                      <FileText className="h-4 w-4" />
                      Generar informe
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/clients/${client.id}`}>
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Link>
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
