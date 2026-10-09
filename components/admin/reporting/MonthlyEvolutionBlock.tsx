"use client";

// "Evolución mensual" del Resumen general: gráfico de dos ejes, un mes por punto, sumando Meta Ads
// + Google Ads. El usuario elige qué métrica ve en cada eje:
//   - Eje izquierdo, en barras (cantidades): Resultados totales, Impresiones, Clicks y cada Tipo
//     de resultado.
//   - Eje derecho, en línea (montos): Inversión total, Costo por resultado, Facturación total,
//     Ticket promedio y ROAS.
// Debajo: tabla con todas las métricas por mes (destacando el último mes completo y el mes en
// curso) e insight de IA ("general-monthly-evolution") calculado SÓLO con meses completos (a pedido
// de Martín, el insight no habla del mes en curso), con foco en el último mes completo.
//
// Meses: desde FIRST_CLIENT_VISIBLE_MONTH (lib/reporting/reportWindow.ts) hasta el mes elegido en el
// informe, como máximo los últimos 12. Cada mes sale de los mismos endpoints (y la misma caché) que
// el resto del informe: /investment-calendar (Meta) y /google-ads-summary (Google).
// Criterios, iguales a la Comparativa por plataforma: Resultados = todos los tipos de Resultado de
// Meta + compras de Google; Facturación = valor de compras de las dos; Ticket = Facturación /
// compras; ROAS = Facturación / Inversión.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BlockTitle } from "@/components/admin/reporting/BlockTitle";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { FIRST_CLIENT_VISIBLE_MONTH } from "@/lib/reporting/reportWindow";
import { resolveResultLabel } from "@/lib/reporting/metaResultLabels";
import { formatCompactCurrency, formatCompactNumber, formatCurrency, formatNumber } from "@/lib/format";
import type { GoogleAdsMonthlySummary } from "@/lib/google-ads/monthlySummary";

type PlatformKey = "meta_ads" | "google_ads";

const MAX_MONTHS = 12;
const BAR_COLOR = "#4f46e5"; // indigo-600 — eje izquierdo (barras)
const LINE_COLOR = "#f59e0b"; // amber-500 — eje derecho (línea)
const roasFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const pctFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

interface MetaMonth {
  currency: string;
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
  impressions: number;
  clicks: number;
  byType: Record<string, number>;
}

type MoneyMetric = "spend" | "costPerResult" | "revenue" | "ticket" | "roas";
const MONEY_METRICS: { key: MoneyMetric; label: string }[] = [
  { key: "spend", label: "Inversión total" },
  { key: "costPerResult", label: "Costo por resultado" },
  { key: "revenue", label: "Facturación total" },
  { key: "ticket", label: "Ticket promedio" },
  { key: "roas", label: "ROAS" },
];

const SELECT_CLASS =
  "h-8 max-w-[220px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60";

function monthsUpTo(month: string): string[] {
  const out: string[] = [];
  let cursor = parseISO(`${month}-01`);
  while (out.length < MAX_MONTHS) {
    const key = format(cursor, "yyyy-MM");
    if (key < FIRST_CLIENT_VISIBLE_MONTH) break;
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
  platforms,
}: {
  clientId: string;
  /** Mes elegido en el informe (yyyy-MM): último mes del gráfico. */
  month: string;
  platforms: PlatformKey[];
}) {
  const months = useMemo(() => monthsUpTo(month), [month]);
  // Clave estable: el array `platforms` puede llegar con otra identidad en cada render del padre.
  const platformsKey = platforms.join(",");
  const [data, setData] = useState<MonthTotals[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [money, setMoney] = useState<MoneyMetric>("spend");
  const [count, setCount] = useState<string>("results");

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
          impressions: 0,
          clicks: 0,
          byType: {},
        };
        const addType = (label: string, value: number) => {
          if (value > 0) totals.byType[label] = (totals.byType[label] ?? 0) + value;
        };

        const [meta, google] = await Promise.all([
          platformsKey.includes("meta_ads")
            ? getJson<MetaMonth>(`/api/clients/${clientId}/investment-calendar?month=${m}`).catch((e: Error) => {
                failed.add(`Meta Ads: ${e.message}`);
                return null;
              })
            : null,
          platformsKey.includes("google_ads")
            ? getJson<GoogleAdsMonthlySummary>(`/api/clients/${clientId}/google-ads-summary?month=${m}`).catch(
                (e: Error) => {
                  failed.add(`Google Ads: ${e.message}`);
                  return null;
                }
              )
            : null,
        ]);

        if (meta) {
          totals.currencies.push(meta.currency);
          meta.objectiveLabels.forEach((raw, i) => {
            const label = resolveResultLabel(meta.objectiveActionTypes?.[i] ?? null, raw);
            const value = meta.days.reduce((sum, d) => sum + (d.objectiveLeads[i] ?? 0), 0);
            totals.results += value;
            addType(label, value);
          });
          for (const d of meta.days) {
            totals.spend += d.spend;
            totals.purchases += d.purchases ?? 0;
            totals.revenue += d.purchaseValue ?? 0;
            totals.impressions += d.impressions ?? 0;
            totals.clicks += d.totalClicks ?? 0;
          }
        }
        if (google) {
          totals.currencies.push(google.currency);
          totals.spend += google.spend;
          totals.results += google.purchases;
          totals.purchases += google.purchases;
          totals.revenue += google.revenue;
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
  }, [clientId, months, platformsKey]);

  const currencies = useMemo(() => [...new Set((data ?? []).flatMap((d) => d.currencies))], [data]);
  const currency = currencies[0] ?? "ARS";
  const mixedCurrencies = currencies.length > 1;

  const typeLabels = useMemo(() => {
    const totals = new Map<string, number>();
    for (const d of data ?? []) for (const [label, v] of Object.entries(d.byType)) totals.set(label, (totals.get(label) ?? 0) + v);
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  }, [data]);

  // Si el tipo elegido desaparece al cambiar de mes, vuelve a Resultados totales.
  useEffect(() => {
    if (count.startsWith("type:") && data && !typeLabels.includes(count.slice(5))) setCount("results");
  }, [count, typeLabels, data]);

  const moneyValue = (d: MonthTotals): number | null => {
    switch (money) {
      case "spend":
        return d.spend;
      case "costPerResult":
        return d.results > 0 ? d.spend / d.results : null;
      case "revenue":
        return d.revenue;
      case "ticket":
        return d.purchases > 0 && d.revenue > 0 ? d.revenue / d.purchases : null;
      case "roas":
        return d.spend > 0 && d.revenue > 0 ? d.revenue / d.spend : null;
    }
  };
  const countValue = (d: MonthTotals): number | null => {
    if (count === "results") return d.results;
    if (count === "impressions") return d.impressions;
    if (count === "clicks") return d.clicks;
    return d.byType[count.slice(5)] ?? 0;
  };
  const formatMoney = (v: number) =>
    money === "roas" ? `${roasFormat.format(v)}x` : formatCurrency(Math.round(v), currency);
  const formatMoneyAxis = (v: number) =>
    money === "roas" ? `${roasFormat.format(v)}x` : formatCompactCurrency(v, currency);

  const moneyLabel = MONEY_METRICS.find((m) => m.key === money)!.label;
  const countLabel =
    count === "results" ? "Resultados totales" : count === "impressions" ? "Impresiones" : count === "clicks" ? "Clicks" : count.slice(5);

  const currentMonthKey = format(new Date(), "yyyy-MM");
  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInCurrentMonth = getDaysInMonth(today);

  // Último mes completo = el último del gráfico que no sea el mes en curso.
  const lastCompleteKey = useMemo(
    () => [...(data ?? [])].reverse().find((d) => d.month !== currentMonthKey)?.month ?? null,
    [data, currentMonthKey]
  );

  // Insight: sólo meses completos (el mes en curso queda afuera).
  const completeMonths = useMemo(() => (data ?? []).filter((d) => d.month !== currentMonthKey), [data, currentMonthKey]);

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
      facturacion: d.revenue > 0 ? money(d.revenue) : "s/d",
      compras: Math.round(d.purchases),
      ticketPromedio: d.purchases > 0 && d.revenue > 0 ? money(d.revenue / d.purchases) : "s/d",
      roas: d.spend > 0 && d.revenue > 0 ? `${roasFormat.format(d.revenue / d.spend)}x` : "s/d",
      porTipoDeResultado: Object.entries(d.byType).map(([tipo, cantidad]) => ({ tipo, cantidad: Math.round(cantidad) })),
    });
    const last = completeMonths[completeMonths.length - 1]!;
    const previous = completeMonths.length > 1 ? completeMonths[completeMonths.length - 2]! : null;
    // Variaciones ya calculadas y formateadas (Claude no recalcula): "+12,3%", "-4%", "s/d".
    const pct = (now: number | null, before: number | null) =>
      now === null || before === null || before === 0 ? "s/d" : `${now >= before ? "+" : ""}${pctFormat.format(((now - before) / before) * 100)}%`;
    const ratio = (a: number, b: number) => (b > 0 && a > 0 ? a / b : null);
    return {
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
            ...(mixedCurrencies
              ? {}
              : {
                  facturacion: pct(last.revenue, previous.revenue),
                  ticketPromedio: pct(ratio(last.revenue, last.purchases), ratio(previous.revenue, previous.purchases)),
                  roas: pct(ratio(last.revenue, last.spend), ratio(previous.revenue, previous.spend)),
                }),
          }
        : null,
    };
  }, [completeMonths, mixedCurrencies, currency, currencies]);

  return (
    <Card data-report-block>
      <CardHeader className="pb-2">
        <BlockTitle block="evolucionMensual" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BAR_COLOR }} />
            Eje izquierdo (barras)
            <select
              aria-label="Métrica del eje izquierdo"
              className={SELECT_CLASS}
              value={count}
              onChange={(e) => setCount(e.target.value)}
            >
              <option value="results">Resultados totales</option>
              <option value="impressions">Impresiones</option>
              <option value="clicks">Clicks</option>
              {typeLabels.length > 0 && (
                <optgroup label="Tipo de resultado">
                  {typeLabels.map((label) => (
                    <option key={label} value={`type:${label}`}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            Eje derecho (línea)
            <select
              aria-label="Métrica del eje derecho"
              className={SELECT_CLASS}
              value={money}
              disabled={mixedCurrencies}
              onChange={(e) => setMoney(e.target.value as MoneyMetric)}
            >
              {MONEY_METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: LINE_COLOR }} />
          </label>
        </div>

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
            el eje derecho no se muestra.
          </p>
        )}

        {!data ? (
          <div className="h-[300px] animate-pulse rounded-lg bg-muted/40" />
        ) : (
          <BarLineChart
            rows={data.map((d) => ({
              key: d.month,
              label: monthLabel(d.month),
              note: d.month === currentMonthKey ? "en curso" : null,
              bar: countValue(d),
              line: mixedCurrencies ? null : moneyValue(d),
            }))}
            barLabel={countLabel}
            lineLabel={moneyLabel}
            showLine={!mixedCurrencies}
            formatBar={formatNumber}
            formatBarAxis={formatCompactNumber}
            formatLine={formatMoney}
            formatLineAxis={formatMoneyAxis}
          />
        )}

        {data && data.length > 0 && (
          <MonthlyTable
            rows={data}
            typeLabels={typeLabels}
            currency={currency}
            showMoney={!mixedCurrencies}
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

interface ChartRow {
  key: string;
  label: string;
  note: string | null;
  bar: number | null;
  line: number | null;
}

const HEIGHT = 300;
const MARGIN = { top: 16, right: 76, bottom: 28, left: 64 };
const TICKS = 4;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return step * TICKS;
}

/** Barras en el eje izquierdo + línea con puntos en el eje derecho, un mes por posición. */
function BarLineChart({
  rows,
  barLabel,
  lineLabel,
  showLine,
  formatBar,
  formatBarAxis,
  formatLine,
  formatLineAxis,
}: {
  rows: ChartRow[];
  barLabel: string;
  lineLabel: string;
  showLine: boolean;
  formatBar: (v: number) => string;
  formatBarAxis: (v: number) => string;
  formatLine: (v: number) => string;
  formatLineAxis: (v: number) => string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const barMax = niceMax(Math.max(0, ...rows.map((r) => r.bar ?? 0)));
  const lineMax = niceMax(Math.max(0, ...rows.map((r) => r.line ?? 0)));
  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const group = rows.length > 0 ? plotW / rows.length : 0;
  const barW = Math.min(64, group * 0.45);
  const y = (v: number, max: number) => MARGIN.top + plotH - (v / max) * plotH;
  const cx = (i: number) => MARGIN.left + group * i + group / 2;
  const hovered = hover !== null ? rows[hover] : null;

  // Tramos de la línea: se corta donde falta el dato (ej. ROAS sin facturación).
  const segments: string[] = [];
  let current: string[] = [];
  rows.forEach((r, i) => {
    if (r.line === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(`${current.length === 0 ? "M" : "L"}${cx(i)},${y(r.line, lineMax)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));

  return (
    <div ref={wrapperRef} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={HEIGHT} role="img" aria-label={`${barLabel} y ${lineLabel} por mes`}>
          {Array.from({ length: TICKS + 1 }, (_, i) => {
            const frac = i / TICKS;
            const yy = MARGIN.top + plotH - frac * plotH;
            return (
              <g key={i}>
                <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={yy} y2={yy} stroke="hsl(var(--border))" strokeDasharray={i === 0 ? undefined : "3 3"} />
                <text x={MARGIN.left - 8} y={yy} dy="0.32em" textAnchor="end" fontSize={11} fill={BAR_COLOR}>
                  {formatBarAxis(barMax * frac)}
                </text>
                {showLine && (
                  <text x={MARGIN.left + plotW + 8} y={yy} dy="0.32em" textAnchor="start" fontSize={11} fill={LINE_COLOR}>
                    {formatLineAxis(lineMax * frac)}
                  </text>
                )}
              </g>
            );
          })}

          {rows.map((r, i) => (
            <g key={r.key}>
              <rect x={MARGIN.left + group * i} y={MARGIN.top} width={group} height={plotH} fill={hover === i ? "hsl(var(--muted))" : "transparent"} opacity={0.5} />
              {r.bar !== null && r.bar > 0 && (
                <rect x={cx(i) - barW / 2} y={y(r.bar, barMax)} width={barW} height={MARGIN.top + plotH - y(r.bar, barMax)} rx={3} fill={BAR_COLOR} opacity={0.85} />
              )}
              <text x={cx(i)} y={HEIGHT - 8} textAnchor="middle" fontSize={12} fill="hsl(var(--muted-foreground))">
                {r.label}
                {r.note ? "*" : ""}
              </text>
            </g>
          ))}

          {showLine && (
            <g>
              {segments.map((d) => (
                <path key={d} d={d} fill="none" stroke={LINE_COLOR} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {rows.map((r, i) =>
                r.line !== null ? (
                  <circle key={r.key} cx={cx(i)} cy={y(r.line, lineMax)} r={hover === i ? 5.5 : 4} fill="hsl(var(--background))" stroke={LINE_COLOR} strokeWidth={2.5} />
                ) : null
              )}
            </g>
          )}

          {/* Zonas de hover por mes, arriba de todo para que la línea no las tape. */}
          {rows.map((r, i) => (
            <rect
              key={`hover-${r.key}`}
              x={MARGIN.left + group * i}
              y={MARGIN.top}
              width={group}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 z-10 flex min-w-[190px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md"
          style={{
            left: cx(hover!),
            transform: hover! > rows.length / 2 ? "translateX(calc(-100% - 16px))" : "translateX(16px)",
          }}
        >
          <span className="font-semibold text-foreground">
            {hovered.label}
            {hovered.note ? ` (${hovered.note})` : ""}
          </span>
          <span className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: BAR_COLOR }} />
              {barLabel}
            </span>
            <span className="font-medium text-foreground">{hovered.bar !== null ? formatBar(hovered.bar) : "s/d"}</span>
          </span>
          {showLine && (
            <span className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-0.5 w-2.5 rounded-full" style={{ backgroundColor: LINE_COLOR }} />
                {lineLabel}
              </span>
              <span className="font-medium text-foreground">{hovered.line !== null ? formatLine(hovered.line) : "s/d"}</span>
            </span>
          )}
        </div>
      )}

      {rows.some((r) => r.note) && <p className="mt-1 text-[11px] text-muted-foreground">* Mes en curso: datos parciales hasta hoy.</p>}
    </div>
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
  currentMonthKey,
  lastCompleteKey,
  currentProgress,
}: {
  rows: MonthTotals[];
  typeLabels: string[];
  currency: string;
  showMoney: boolean;
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
    { label: "Facturación total", value: (d) => (d.revenue > 0 ? money(d.revenue) : "s/d") },
    { label: "Ticket promedio", value: (d) => money(d.purchases > 0 && d.revenue > 0 ? d.revenue / d.purchases : null) },
    {
      label: "ROAS",
      value: (d) => (d.spend > 0 && d.revenue > 0 && showMoney ? `${roasFormat.format(d.revenue / d.spend)}x` : "s/d"),
    },
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
