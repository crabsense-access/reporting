"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ReportSummary } from "@/lib/types";

interface InformesPopupProps {
  clientId: string;
  clientName: string;
  reports: ReportSummary[];
  /** Trigger custom (ej. "Ver informes" en el detalle del cliente). Default: "Informes (N)". */
  trigger?: ReactNode;
}

function StatusBadge({ status }: { status: ReportSummary["status"] }) {
  if (status === "failed") {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        Falló
      </Badge>
    );
  }
  if (status === "pending" || status === "generating") {
    return <Badge variant="secondary">Generando…</Badge>;
  }
  return null;
}

export function InformesPopup({ clientId, clientName, reports, trigger }: InformesPopupProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSelect(reportId: string) {
    setOpen(false);
    router.push(`/admin/clients/${clientId}/informes/${reportId}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline" size="sm">
            <FileText className="h-4 w-4" />
            Informes ({reports.length})
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Informes de {clientName}</DialogTitle>
          <DialogDescription>Historial de informes generados por prompt.</DialogDescription>
        </DialogHeader>

        {reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Todavía no se generó ningún informe para este cliente.
            </p>
            <Button asChild size="sm" onClick={() => setOpen(false)}>
              <Link href={`/admin/clients/${clientId}/informes/nuevo`}>Generar el primero</Link>
            </Button>
          </div>
        ) : (
          <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto">
            {reports.map((report) => (
              <li key={report.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(report.id)}
                  className="flex w-full flex-col gap-1 rounded-md px-2 py-3 text-left hover:bg-secondary/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {new Date(report.created_at).toLocaleString("es-AR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground" title={report.prompt_text}>
                    {report.prompt_text}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.date_range_start} – {report.date_range_end}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
