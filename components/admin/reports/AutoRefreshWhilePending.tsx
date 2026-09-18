"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import type { ReportStatus } from "@/lib/types";

// Si alguien abre esta URL mientras el informe todavía se está generando (el flujo normal desde
// NewReportForm ya espera a que termine, pero la URL es navegable directamente), refresca la
// página cada 3s hasta que el status deje de ser pending/generating.
export function AutoRefreshWhilePending({ status }: { status: ReportStatus }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== "pending" && status !== "generating") return;
    const interval = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(interval);
  }, [status, router]);

  return null;
}
