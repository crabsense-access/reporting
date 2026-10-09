"use client";

// "Evolución mensual" del Resumen general: Meta Ads + Google Ads SUMADOS, mes a mes. Tabla con
// todas las métricas por mes (destacando el último mes completo y el mes en curso) e insight de IA
// ("general-monthly-evolution") calculado SÓLO con meses completos, con foco en el último mes
// completo. (El gráfico de barras + línea se sacó a pedido de Martín.)
//
// Meses: desde el mes de inicio más viejo de las fuentes configuradas (elegido en el Admin, ver
// lib/reporting/reportWindow.ts) hasta el mes elegido en el informe, como máximo los últimos 12. Cada
// fuente sólo suma desde su propio mes de inicio. Criterios, iguales a la Comparativa por
// plataforma: Resultados = todos los tipos de Resultado de Meta + compras de Google; Facturación =
// valor de compras de las fuentes ECOMMERCE; Ticket = Facturación / compras; ROAS = Facturación /
// inversión de las fuentes ecommerce. Meta cuenta como ecommerce sólo si tiene el switch "Es un
// ecommerce" en el Admin (is_ecommerce), y Google Ads igual (ver isGoogleAdsEcommerce). Si ninguna fuente es
// ecommerce, las filas de Facturación, Ticket y ROAS no se muestran.

import { useEffect, useMemo, useState } from "react";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { resolveResultLabel } from "@/lib/reporting/metaResultLabels";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { GoogleAdsMonthlySummary } from "@/lib/google-ads/monthlySummary";

type PlatformKey = "meta_ads" | "google_ads";

const MAX_MONTHS = 12;
/** Opciones del filtro "Mostrar últimos N meses" (se ofrecen las que entran en los meses disponibles, más "todos"). */
const MONTH_COUNT_OPTIONS = [3, 4, 6, 12];
const DEFAULT_MONTHS = 6;
const roasFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const pctFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

interface MetaMonth {
  currency: string;
  isEcommerce?: boolean;
  objectiveLabels: string[];
  objectiveActionTypes?: (string | null)[];
  days: {
    spend: number;
    objectiveLeads: number[];
    purchases?: number;
    purchaseValue?: number;
    impressions?: number;
    totalClicks?: number;
  }[];
}

interface MonthTotals {
  month: string; // yyyy-MM
  currencies: string[];
  spend: number;
  results: number;
  purchases: number;
  revenue: number;
  /** Inversión de las fuentes ecommerce (base del ROAS). */
  ecommerceSpend: number;
  /** Alguna fuente de este mes es ecommerce. */
  hasEcommerce: boolean;
  impressions: number;
  clicks: number;
  byType: Record<string, number>;
}



function monthsUpTo(month: string, firstMonth: string): string[] {
  const out: string[] = [];
  let cursor = parseISO(`${month}-01`);
  while (out.length < MAX_MONTHS) {
    const key = format(cursor, "yyyy-MM");
    if (key < firstMonth) break;
    out.unshift(key);
    cursor = addMonths(cursor, -1);
  }
  return out;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "No se pudieron cargar los datos.");
  return body as T;
}

function monthLabel(month: string): string {
  const label = format(parseISO(`${month}-01`), "MMM yy", { locale: es }).replace(".", "");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function MonthlyEvolutionBlock({
  clientId,
  month,
  startMonths,
}: {
  clientId: string;
  /** Mes elegido en el informe (yyyy-MM): último mes del gráfico. */
  month: string;
  /** Mes de inicio (yyyy-MM) de cada fuente configurada. */
  startMonths: Partial<Record<PlatformKey, string>>;
}) {
  // Clave estable: el objeto puede llegar con otra identidad en cada render del padre.
  const metaStart = startMonths.meta_ads ?? null;
  const googleStart = startMonths.google_ads ?? null;
  const firstMonth = [metaStart, googleStart].filter((m): m is string => m !== null).sort()[0] ?? month;
  const months = useMemo(() => monthsUpTo(month, firstMonth), [month, firstMonth]);
  const [data, setData] = useState<MonthTotals[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  // Filtro "Mostrar últimos N meses" (tabla e insight). null = el default (6, o todos si hay menos).
  const [monthsToShow, setMonthsToShow] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setErrors([]);
    const failed = new Set<string>();

    Promise.all(
      months.map(async (m): Promise<MonthTotals> => {
        const totals: MonthTotals = {
          month: m,
          currencies: [],
          spend: 0,
          results: 0,
          purchases: 0,
          revenue: 0,
          ecommerceSpend: 0,
          hasEcommerce: false,
          impressions: 0,
          clicks: 0,
          byType: {},
        };
        const addType = (label: string, value: number) => {
          if (value > 0) totals.byType[label] = (totals.byType[label] ?? 0) + value;
        };

        const [meta, google] = await Promise.all([
          metaStart !== null && m >= metaStart
            ? getJson<MetaMonth>(`/api/clients/${clientId}/investment-calendar?month=${m}`).catch((e: Error) => {
                failed.add(`Meta Ads: ${e.message}`);
                return null;
              })
            : null,
          googleStart !== null && m >= googleStart
            ? getJson<GoogleAdsMonthlySummary & { isEcommerce?: boolean }>(`/api/clients/${clientId}/google-ads-summary?month=${m}`).catch(
                (e: Error) => {
                  failed.add(`Google Ads: ${e.message}`);
                  return null;
                }
              )
            : null,
        ]);

        if (meta) {
          totals.currencies.push(meta.currency);
          if (meta.isEcommerce) totals.hasEcommerce = true;
          meta.objectiveLabels.forEach((raw, i) => {
            const label = resolveResultLabel(meta.objectiveActionTypes?.[i] ?? null, raw);
            const value = meta.days.reduce((sum, d) => sum + (d.objectiveLeads[i] ?? 0), 0);
            totals.results += value;
            addType(label, value);
          });
          for (const d of meta.days) {
            totals.spend += d.spend;
            if (meta.isEcommerce) {
              totals.ecommerceSpend += d.spend;
              totals.purchases += d.purchases ?? 0;
              totals.revenue += d.purchaseValue ?? 0;
            }
            totals.impressions += d.impressions ?? 0;
            totals.clicks += d.totalClicks ?? 0;
          }
        }
        if (google) {
          totals.currencies.push(google.currency);
          totals.spend += google.spend;
          totals.results += google.purchases;
          if (google.isEcommerce !== false) {
            totals.purchases += google.purchases;
            totals.revenue += google.revenue;
            totals.ecommerceSpend += google.spend;
            totals.hasEcommerce = true;
          }
          totals.impressions += google.impressions;
          totals.clicks += google.clicks;
          addType("Compras", google.purchases);
        }
        return totals;
      })
    ).then((result) => {
      if (cancelled) return;
      setData(result);
      setErrors([...failed]);
    });

    return () => {
      cancelled = true;
    };
  }, [clientId, months, metaStart, googleStart]);

  const currencies = useMemo(() => [...new Set((data ?? []).flatMap((d) => d.currencies))], [data]);
  const currency = currencies[0] ?? "ARS";
  const mixedCurrencies = currencies.length > 1;

  const available = data?.length ?? 0;
  const shownCount = Math.min(monthsToShow ?? DEFAULT_MONTHS, available);
  const visibleData = useMemo(() => (data ? data.slice(-shownCount) : null), [data, shownCount]);
  const monthsOptions = [...MONTH_COUNT_OPTIONS.filter((n) => n < available), available].filter((n) => n > 0);

  const typeLabels = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of visibleData ?? []) for (const [label, v] of Object.entries(d.byType)) totals.set(label, (totals.get(label) ?? 0) + v);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  }, [visibleData]);

  const currentMonthKey = format(new Date(), "yyyy-MM");
  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInCurrentMonth = getDaysInMonth(today);

  // Último mes completo = el último del gráfico que no sea el mes en curso.
  const lastCompleteKey = useMemo(
    () => [...(visibleData ?? [])].reverse().find((d) => d.month !== currentMonthKey)?.month ?? null,
    [visibleData, currentMonthKey]
  );

  // Facturación / Ticket / ROAS sólo si alguna fuente de los meses visibles es ecommerce.
  const anyEcommerce = (visibleData ?? []).some((d) => d.hasEcommerce);

  // Insight: sólo meses completos (el mes en curso queda afuera).
  const completeMonths = useMemo(
    () => (visibleData ?? []).filter((d) => d.month !== currentMonthKey),
    [visibleData, currentMonthKey]
  );

  const insightMetrics = useMemo(() => {
    if (completeMonths.length === 0) return null;
    const money = (v: number) => (mixedCurrencies ? null : formatCurrency(Math.round(v), currency));
    const describe = (d: MonthTotals) => ({
      mes: d.month,
      inversion: money(d.spend),
      resultados: Math.round(d.results),
      costoPorResultado: d.results > 0 ? money(d.spend / d.results) : "s/d",
      impresiones: Math.round(d.impressions),
      clics: Math.round(d.clicks),
      ...(d.hasEcommerce
        ? {
            facturacion: d.revenue > 0 ? money(d.revenue) : "s/d",
            compras: Math.round(d.purchases),
            ticketPromedio: d.purchases > 0 && d.revenue > 0 ? money(d.revenue / d.purchases) : "s/d",
            roas: d.ecommerceSpend > 0 && d.revenue > 0 ? `${roasFormat.format(d.revenue / d.ecommerceSpend)}x` : "s/d",
          }
        : {}),
      porTipoDeResultado: Object.entries(d.byType).map(([tipo, cantidad]) => ({ tipo, cantidad: Math.round(cantidad) })),
    });
    const last = completeMonths[completeMonths.length - 1]!;
    const previous = completeMonths.length > 1 ? completeMonths[completeMonths.length - 2]! : null;
    // Variaciones ya calculadas y formateadas (Claude no recalcula): "+12,3%", "-4%", "s/d".
    const pct = (now: number | null, before: number | null) =>
      now === null || before === null || before === 0 ? "s/d" : `${now >= before ? "+" : ""}${pctFormat.format(((now - before) / before) * 100)}%`;
    const ratio = (a: number, b: number) => (b > 0 && a > 0 ? a / b : null);
    return {
      esEcommerce: anyEcommerce,
      moneda: mixedCurrencies ? `Monedas distintas (${currencies.join(" y ")}): montos no comparables` : currency,
      meses: completeMonths.map(describe),
      ultimoMesCompleto: last.month,
      variacionUltimoMesCompletoVsAnterior: previous
        ? {
            meses: `${last.month} vs ${previous.month}`,
            ...(mixedCurrencies ? {} : { inversion: pct(last.spend, previous.spend) }),
            resultados: pct(last.results, previous.results),
            ...(mixedCurrencies
              ? {}
              : { costoPorResultado: pct(ratio(last.spend, last.results), ratio(previous.spend, previous.results)) }),
            impresiones: pct(last.impressions, previous.impressions),
            clics: pct(last.clicks, previous.clicks),
            ...(mixedCurrencies || !anyEcommerce
              ? {}
              : {
                  facturacion: pct(last.revenue, previous.revenue),
                  ticketPromedio: pct(ratio(last.revenue, last.purchases), ratio(previous.revenue, previous.purchases)),
                  roas: pct(ratio(last.revenue, last.ecommerceSpend), ratio(previous.revenue, previous.ecommerceSpend)),
                }),
          }
        : null,
    };
  }, [completeMonths, mixedCurrencies, currency, currencies, anyEcommerce]);

  return (
    <Card data-report-block>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <BlockTitle block="evolucionMensual" />
          {available > 1 && (
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              Mostrar últimos
              <select
                aria-label="Cantidad de meses"
                value={shownCount}
                onChange={(e) => setMonthsToShow(Number(e.target.value))}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {monthsOptions.map((n) => (
                  <option key={n} value={n}>
                    {n} meses
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {errors.length > 0 && (
          <div className="flex flex-col gap-0.5 text-xs text-destructive">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {mixedCurrencies && (
          <p className="text-xs text-muted-foreground">
            Las plataformas usan monedas distintas ({currencies.join(" y ")}), así que los montos no se pueden sumar:
            los montos no se muestran.
          </p>
        )}

        {!data && <div className="h-[300px] animate-pulse rounded-lg bg-muted/40" />}

        {data && data.length > 0 && (
          <MonthlyTable
            rows={visibleData ?? []}
            typeLabels={typeLabels}
            currency={currency}
            showMoney={!mixedCurrencies}
            showEcommerce={anyEcommerce}
            currentMonthKey={currentMonthKey}
            lastCompleteKey={lastCompleteKey}
            currentProgress={`${daysElapsed} de ${daysInCurrentMonth} días`}
          />
        )}

        {insightMetrics && (
          <div className="flex flex-col gap-1.5">
            <ChartInsightPanel
              chart="general-monthly-evolution"
              metrics={insightMetrics}
              accentColor="hsl(var(--primary))"
              variant="card"
              bordered={false}
              monthIsComplete
              clientId={clientId}
            />
            <p className="text-[11px] text-muted-foreground">
              El análisis se basa sólo en meses completos{" "}
              {completeMonths.length > 1
                ? `(${monthLabel(completeMonths[0]!.month)} a ${monthLabel(completeMonths[completeMonths.length - 1]!.month)})`
                : `(${monthLabel(completeMonths[0]!.month)})`}
              ; el mes en curso no se tiene en cuenta.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tabla de todas las métricas por mes: una fila por métrica y una columna por mes (mismo orden que
 * el gráfico), con el último mes completo destacado y el mes en curso marcado.
 */
function MonthlyTable({
  rows,
  typeLabels,
  currency,
  showMoney,
  showEcommerce,
  currentMonthKey,
  lastCompleteKey,
  currentProgress,
}: {
  rows: MonthTotals[];
  typeLabels: string[];
  currency: string;
  showMoney: boolean;
  /** Alguna fuente es ecommerce: muestra Facturación, Ticket promedio y ROAS. */
  showEcommerce: boolean;
  currentMonthKey: string;
  lastCompleteKey: string | null;
  currentProgress: string;
}) {
  const money = (v: number | null) => (v === null || !showMoney ? "s/d" : formatCurrency(Math.round(v), currency));
  const metrics: { label: string; sub?: boolean; value: (d: MonthTotals) => string }[] = [
    { label: "Inversión total", value: (d) => money(d.spend) },
    { label: "Resultados totales", value: (d) => formatNumber(d.results) },
    ...typeLabels.map((label) => ({ label, sub: true, value: (d: MonthTotals) => formatNumber(d.byType[label] ?? 0) })),
    { label: "Costo por resultado", value: (d) => money(d.results > 0 ? d.spend / d.results : null) },
    { label: "Impresiones", value: (d) => formatNumber(d.impressions) },
    { label: "Clicks", value: (d) => formatNumber(d.clicks) },
    ...(showEcommerce
      ? [
          { label: "Facturación total", value: (d: MonthTotals) => (d.revenue > 0 ? money(d.revenue) : "s/d") },
          {
            label: "Ticket promedio",
            value: (d: MonthTotals) => money(d.purchases > 0 && d.revenue > 0 ? d.revenue / d.purchases : null),
          },
          {
            label: "ROAS",
            value: (d: MonthTotals) =>
              d.ecommerceSpend > 0 && d.revenue > 0 && showMoney ? `${roasFormat.format(d.revenue / d.ecommerceSpend)}x` : "s/d",
          },
        ]
      : []),
  ];
  const highlight = (d: MonthTotals) => (d.month === lastCompleteKey ? "bg-primary/5" : "");

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">Métrica</th>
            {rows.map((d) => (
              <th key={d.month} className={`whitespace-nowrap px-3 py-2 text-right align-bottom font-medium ${highlight(d)}`}>
                <div className="flex flex-col items-end">
                  {d.month === lastCompleteKey && <span className="text-[11px] font-semibold text-primary">Último mes completo</span>}
                  {d.month === currentMonthKey && <span className="text-[11px] font-normal">En curso · {currentProgress}</span>}
                  <span className="text-sm font-semibold text-foreground">{monthLabel(d.month)}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.label} className="border-b border-border last:border-0">
              <td className={`whitespace-nowrap px-3 py-2 text-left ${m.sub ? "pl-6 text-xs text-muted-foreground" : "font-medium text-foreground"}`}>
                {m.label}
              </td>
              {rows.map((d) => (
                <td
                  key={d.month}
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${highlight(d)} ${
                    m.sub ? "text-xs text-muted-foreground" : d.month === lastCompleteKey ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                >
                  {m.value(d)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
