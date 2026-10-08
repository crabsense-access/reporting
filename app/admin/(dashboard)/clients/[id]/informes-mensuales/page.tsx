import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { format, parseISO, startOfMonth, subMonths } from "date-fns";
import { es } from "date-fns/locale";

import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMetaGraphApi } from "@/lib/meta-ads/client";
import { withCache, THREE_HOURS_SECONDS } from "@/lib/cache/withCache";
import { formatCurrency } from "@/lib/format";
import type { MetaAdsConfig } from "@/lib/types";
import { isMonthVisibleToClients } from "@/lib/reporting/reportWindow";

// Listado de informes mensuales de un cliente (reemplaza los botones "Informes", "Ver informes" y
// "Generar informe" del detalle del cliente, a pedido de Martín). Cada mes es el Calendario de
// inversión de ese mes. Se listan los últimos 12 meses (el mismo rango que el combo de mes del
// Calendario) que tuvieron inversión en Meta Ads, más reciente primero.

interface MonthlySpendResponse {
  data: { date_start?: string; spend?: string }[];
}

interface MonthRow {
  value: string; // yyyy-MM
  label: string;
  spend: number;
  isCurrent: boolean;
}

async function fetchMonthsWithSpend(clientId: string, config: MetaAdsConfig): Promise<{ months: MonthRow[]; currency: string }> {
  const today = new Date();
  const currentMonthStart = startOfMonth(today);
  const since = format(subMonths(currentMonthStart, 11), "yyyy-MM-dd");
  const until = format(today, "yyyy-MM-dd");

  const [insights, account] = await Promise.all([
    withCache(
      {
        clientId,
        source: "meta_ads",
        query: "monthlyReports:v1",
        params: { accountId: config.ad_account_id, from: since, to: until },
        ttlSeconds: THREE_HOURS_SECONDS,
      },
      () =>
        fetchMetaGraphApi<MonthlySpendResponse>(
          `${config.ad_account_id}/insights`,
          { time_increment: "monthly", time_range: JSON.stringify({ since, until }), fields: "spend", limit: "50" },
          config.system_user_token
        )
    ),
    fetchMetaGraphApi<{ currency?: string }>(config.ad_account_id, { fields: "currency" }, config.system_user_token),
  ]);

  const currentValue = format(currentMonthStart, "yyyy-MM");
  const months = (insights.data ?? [])
    .filter((row) => row.date_start && Number(row.spend ?? 0) > 0)
    .map((row) => {
      const date = parseISO(row.date_start!);
      const label = format(date, "MMMM yyyy", { locale: es });
      const value = format(date, "yyyy-MM");
      return {
        value,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        spend: Number(row.spend ?? 0),
        isCurrent: value === currentValue,
      };
    })
    .sort((a, b) => b.value.localeCompare(a.value));

  return { months, currency: account.currency ?? "USD" };
}

export default async function MonthlyReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: client } = await supabase.from("clients").select("id, name").eq("id", id).maybeSingle();
  if (!client) notFound();

  const { data: metaAdsSource } = await supabase
    .from("data_sources")
    .select("config")
    .eq("client_id", id)
    .eq("source_type", "meta_ads")
    .maybeSingle();
  const config = metaAdsSource?.config as MetaAdsConfig | undefined;

  let result: { months: MonthRow[]; currency: string } | null = null;
  let error: string | null = null;
  if (config?.ad_account_id) {
    try {
      result = await fetchMonthsWithSpend(client.id, config);
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudieron cargar los meses desde Meta Ads.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/admin/clients/${client.id}`} aria-label="Volver al cliente">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">Informes mensuales</p>
          <h1 className="text-2xl font-semibold text-foreground">{client.name}</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informes por mes</CardTitle>
          <CardDescription>Calendario de inversión de cada mes con inversión en Meta Ads (últimos 12 meses).</CardDescription>
        </CardHeader>
        <CardContent>
          {!config?.ad_account_id ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">Este cliente todavía no tiene Meta Ads configurado.</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/clients/${client.id}#fuentes-de-datos`}>Configurar Meta Ads</Link>
              </Button>
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm text-destructive">{error}</p>
          ) : !result || result.months.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No hay meses con inversión en Meta Ads en los últimos 12 meses.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {result.months.map((month) => {
                const content = (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{month.label}</span>
                      {month.isCurrent && <Badge variant="secondary">En curso</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>Inversión {formatCurrency(month.spend, result!.currency)}</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>
                  </>
                );
                // Meses anteriores a FIRST_CLIENT_VISIBLE_MONTH (agosto 2026): grisados y sin link.
                return (
                  <li key={month.value}>
                    {isMonthVisibleToClients(month.value) ? (
                      <Link
                        href={`/admin/clients/${client.id}/reporting/resumen?month=${month.value}`}
                        className="flex items-center justify-between gap-4 rounded-md px-2 py-3 transition-colors hover:bg-secondary/60"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        aria-disabled="true"
                        title="Por el momento sólo están disponibles los meses desde agosto 2026"
                        className="flex cursor-not-allowed items-center justify-between gap-4 rounded-md px-2 py-3 opacity-40"
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
