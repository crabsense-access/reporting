"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";
import { SiMeta } from "react-icons/si";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MetaExcelImportSummary } from "@/lib/reporting/metaExcelStore";

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(y!, m! - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Meta Ads desde Excel (ver lib/reporting/metaExcelImport.ts): para clientes cuya cuenta de Meta no
 * se lee por la API. Se sube el export de cada mes y el Calendario de inversión lo muestra igual que
 * a un cliente conectado. `mode`: "api" si el cliente ya tiene un Ad Account ID (no se puede subir),
 * "excel" si ya está en modo Excel, "none" si todavía no tiene Meta Ads.
 */
export function MetaExcelImportForm({
  clientId,
  mode,
  initialImports,
  initialError = null,
}: {
  clientId: string;
  mode: "api" | "excel" | "none";
  initialImports: MetaExcelImportSummary[];
  /** Error que viene del asistente de nuevo cliente (no pudo subir el Excel elegido ahí). */
  initialError?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imports, setImports] = useState(initialImports);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function refreshList() {
    const res = await fetch(`/api/clients/${clientId}/meta-excel-import`);
    if (res.ok) setImports(((await res.json()) as { imports: MetaExcelImportSummary[] }).imports);
    startTransition(() => router.refresh());
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/clients/${clientId}/meta-excel-import`, { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "No se pudo subir el archivo.");
      const s = json.summary as { spend: number; currency: string; days: number; campaigns: number; hasAudience: boolean; hasVideo: boolean };
      setNotice(
        `${monthLabel(json.month)} cargado: ${formatCurrency(s.spend, s.currency)} en ${s.campaigns} campañas, ${s.days} días.` +
          (s.hasAudience ? "" : " Sin desglose por edad y sexo.")
      );
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(month: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/meta-excel-import?month=${month}`, { method: "DELETE" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "No se pudo borrar.");
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SiMeta color="#0467DF" className="h-5 w-5" />
          Meta Ads desde Excel
        </CardTitle>
        <CardDescription>
          Para clientes cuya cuenta de Meta no leemos por la API: subí el export de cada mes (Meta Ads Manager → Informes,
          desglosado por Día, y por Edad y Sexo si querés el bloque de audiencia). El informe se arma igual que el de Meta Ads.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mode === "api" ? (
          <p className="text-sm text-muted-foreground">
            Este cliente ya toma Meta Ads desde la API. Para usar Excel, desactivá primero Meta Ads en Fuentes de datos.
          </p>
        ) : (
          <>
            {imports.length > 0 && (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {imports.map((imp) => (
                  <li key={imp.month} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="font-medium text-foreground">{monthLabel(imp.month)}</span>
                      <span className="truncate text-muted-foreground">{imp.fileName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-muted-foreground">Inversión {formatCurrency(imp.spend, imp.currency)}</span>
                      <Link
                        href={`/admin/clients/${clientId}/reporting/calendario?month=${imp.month}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Ver informe
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleRemove(imp.month)}
                        disabled={busy}
                        className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" />
                {busy ? "Procesando…" : imports.length > 0 ? "Subir otro mes" : "Subir export de Meta Ads"}
              </Button>
              <span className="text-xs text-muted-foreground">.xlsx hasta 4 MB, un mes por archivo. Si el mes ya existe, se reemplaza.</span>
            </div>
          </>
        )}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
