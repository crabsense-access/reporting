"use client";

// Gráfico de tendencia diaria: barras de Inversión (eje Y izquierdo) + línea de Cantidad o Costo
// por Resultado de un tipo de Resultado (o de todos agregados), a elección del usuario (eje Y
// derecho) — eje X con los días del mes en curso. Va debajo del resumen del mes y arriba del
// calendario semanal.
//
// Es un chart de doble eje a propósito: Inversión (decenas/cientos de dólares) y Costo por
// Resultado (unos pocos dólares) o Cantidad (decenas de Resultados) viven en escalas muy
// distintas, así que un solo eje dejaría una de las dos series ilegible — este es el mismo patrón
// que usan Meta Ads Manager / Google Ads para "gasto vs. métrica de eficiencia" por día.
//
// DINÁMICO por Objetivo (índice 0..N-1, ver lib/reporting/metaInvestmentData.ts) — a pedido de
// Martín, reemplaza al viejo toggle fijo Leads/CPL (agregaba los 3 tipos legado) por un combo de
// tipo de Resultado ("Todos los tipos" incluido) + un toggle Cantidad/Costo por Resultado que
// aplica al tipo elegido. Se le suma un segundo combo de CAMPAÑA: al elegir una, TODO el gráfico
// (barras de Inversión Y línea de Resultados) se filtra a esa campaña puntual — ambos filtros
// componen entre sí (ver DailyRealTotals.byCampaign).
//
// Está hecho a mano con SVG (sin librería de gráficos, siguiendo la convención del resto del
// dashboard). Recibe los datos reales del mes (ver components/admin/reporting/InvestmentCalendar.tsx,
// que los pide una sola vez a /api/clients/[id]/investment-calendar y los reparte entre este
// chart y LeadsByTypeTrendChart).

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";

interface DailyRealTotals {
  date: string; // yyyy-MM-dd
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de este día por campaña (clave = campaign_id) — ver metaInvestmentData.ts. */
  byCampaign: Record<string, { spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>;
}

/** Un tipo de Resultado disponible para el combo (sólo los que tienen datos este mes — ver visibleObjectiveTotals en InvestmentCalendar.tsx). */
interface ObjectiveOption {
  index: number;
  label: string;
}

type Submetric = "cantidad" | "costo";

interface DayPoint {
  date: Date;
  day: number;
  spend: number;
  leads: number;
  cpl: number | null;
  hasData: boolean;
}

function formatSecondaryCurrency(value: number, currency: string) {
  return formatCurrency(value, currency, 2);
}

const VIEW_W = 760;
const VIEW_H = 260;
const PAD = { top: 16, right: 46, bottom: 26, left: 50 };
const INNER_W = VIEW_W - PAD.left - PAD.right;
const INNER_H = VIEW_H - PAD.top - PAD.bottom;
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

const SUBMETRIC_LABEL: Record<Submetric, string> = { costo: "Costo por Resultado", cantidad: "Cantidad" };
// Colores por default (sin tipo de Resultado elegido, "Todos los tipos"): mismo criterio que el
// viejo toggle CPL/Leads (amber para costo, sky para cantidad). Con un tipo puntual elegido, el
// color pasa a ser el de ESE Objetivo (objectiveColor) para que se identifique con el resto del
// tablero — ver secondaryColor más abajo.
const SUBMETRIC_DEFAULT_COLOR: Record<Submetric, string> = { costo: "#d97706", cantidad: "#0284c7" }; // amber-600 / sky-600

function roundedTopBarPath(x: number, yTop: number, width: number, yBottom: number, radius: number) {
  const r = Math.min(radius, (yBottom - yTop) / 2, width / 2);
  if (r <= 0.5) return `M ${x},${yBottom} L ${x},${yTop} L ${x + width},${yTop} L ${x + width},${yBottom} Z`;
  return `M ${x},${yBottom} L ${x},${yTop + r} Q ${x},${yTop} ${x + r},${yTop} L ${x + width - r},${yTop} Q ${x + width},${yTop} ${x + width},${yTop + r} L ${x + width},${yBottom} Z`;
}

function formatSecondary(submetric: Submetric, value: number, currency: string) {
  return submetric === "costo" ? formatSecondaryCurrency(value, currency) : formatNumber(value);
}

/** Devuelve el elemento de `items` con mayor (o menor) `value(item)`, o null si la lista está vacía — usado para armar las métricas que se le pasan a Claude para la leyenda de hallazgos. */
function pickExtreme<T>(items: readonly T[], value: (item: T) => number, mode: "max" | "min"): T | null {
  let best: T | null = null;
  let bestValue = mode === "max" ? -Infinity : Infinity;
  for (const item of items) {
    const v = value(item);
    if ((mode === "max" && v > bestValue) || (mode === "min" && v < bestValue)) {
      best = item;
      bestValue = v;
    }
  }
  return best;
}

const AVG_PILL_HEIGHT = 20;

function AvgPill({ xRight, yTop, label, fill, className }: { xRight: number; yTop: number; label: string; fill?: string; className?: string }) {
  const height = AVG_PILL_HEIGHT;
  const width = label.length * 5.4 + 18;
  const x = xRight - width;
  return (
    <>
      <rect x={x} y={yTop} width={width} height={height} rx={height / 2} fill={fill} className={className} />
      <text
        x={x + width / 2}
        y={yTop + height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        className="text-[9px] font-medium"
      >
        {label}
      </text>
    </>
  );
}

// Pill centrado sobre un punto (usado para marcar el día máximo/mínimo de la
// métrica secundaria) — a diferencia de AvgPill, que siempre cuelga del
// borde derecho, este se ancla al x del punto y se recorta para no salirse
// del área del gráfico. Fondo blanco con borde de 2px del color de la
// métrica, para distinguirse visualmente de las pills de promedio (que van
// rellenas).
const POINT_PILL_HEIGHT = 19;
const POINT_PILL_GAP = 9;

function PointPill({ x, yTop, label, color }: { x: number; yTop: number; label: string; color: string }) {
  const height = POINT_PILL_HEIGHT;
  const width = label.length * 5 + 14;
  const left = Math.min(Math.max(x - width / 2, PAD.left), VIEW_W - PAD.right - width);
  return (
    <>
      <rect x={left} y={yTop} width={width} height={height} rx={height / 2} className="fill-background" stroke={color} strokeWidth={2} />
      <text x={left + width / 2} y={yTop + height / 2} textAnchor="middle" dominantBaseline="middle" style={{ fill: color }} className="text-[8px] font-medium">
        {label}
      </text>
    </>
  );
}

export function InvestmentTrendChart({
  days,
  currency,
  month,
  monthIsComplete,
  clientId,
  objectiveOptions,
  campaigns,
}: {
  days: DailyRealTotals[];
  currency: string;
  /** Primer día del mes seleccionado en el combo de InvestmentCalendar.tsx — define el rango de días del eje X (independiente de "hoy", que sólo se usa para resaltar el día actual cuando el mes mostrado es el mes en curso). */
  month: Date;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
  /** Tipos de Resultado con datos este mes, para el combo — ver visibleObjectiveTotals en InvestmentCalendar.tsx. */
  objectiveOptions: ObjectiveOption[];
  /** Campañas con gasto este mes, para el combo — ver data.campaigns en InvestmentCalendar.tsx. */
  campaigns: { id: string; name: string }[];
}) {
  const [objectiveIndex, setObjectiveIndex] = useState<number | null>(null); // null = "Todos los tipos"
  const [campaignId, setCampaignId] = useState<string | null>(null); // null = "Todas las campañas"
  const [submetric, setSubmetric] = useState<Submetric>("costo");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const today = useMemo(() => new Date(), []);

  // El tipo/campaña elegidos son específicos del mes que se está mirando (pueden no tener datos
  // en el mes nuevo) — si al cambiar de mes la selección ya no está entre las opciones vigentes,
  // se cae de vuelta a "Todos los tipos"/"Todas las campañas" en vez de quedar en un estado que
  // ya no existe.
  useEffect(() => {
    if (objectiveIndex !== null && !objectiveOptions.some((o) => o.index === objectiveIndex)) {
      setObjectiveIndex(null);
    }
  }, [objectiveOptions, objectiveIndex]);

  useEffect(() => {
    if (campaignId !== null && !campaigns.some((c) => c.id === campaignId)) {
      setCampaignId(null);
    }
  }, [campaigns, campaignId]);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  const points = useMemo<DayPoint[]>(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const daysInMonth = monthEnd.getDate();
    const result: DayPoint[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dateKey = format(date, "yyyy-MM-dd");
      const entry = byDate.get(dateKey);
      // Con una campaña elegida, el día se resuelve contra SU desglose (entry.byCampaign[id]) en
      // vez del total de cuenta — si esa campaña no tuvo ninguna fila ese día (no arrancó
      // todavía, está pausada, etc.), el día queda sin datos para ella, no en 0 (mismo criterio
      // que ya usa `days` para "sin datos" a nivel de cuenta completa).
      const campaignEntry = campaignId !== null ? entry?.byCampaign[campaignId] : undefined;
      const hasData = campaignId !== null ? Boolean(campaignEntry) : Boolean(entry);
      const spend = campaignId !== null ? (campaignEntry?.spend ?? 0) : (entry?.spend ?? 0);
      const objectiveLeadsSource = campaignId !== null ? campaignEntry?.objectiveLeads : entry?.objectiveLeads;
      const objectiveSpendSource = campaignId !== null ? campaignEntry?.objectiveSpend : entry?.objectiveSpend;
      const leads = hasData
        ? objectiveIndex !== null
          ? (objectiveLeadsSource?.[objectiveIndex] ?? 0)
          : (objectiveLeadsSource ?? []).reduce((sum, v) => sum + v, 0)
        : 0;
      // Costo por Resultado: con un tipo puntual elegido, el gasto atribuido a ESE tipo
      // (objectiveSpend[i]); con "Todos los tipos", el gasto TOTAL del día/campaña sobre el total
      // de Resultados matcheados — mismo criterio "blended" que ya usa el resumen del mes
      // (monthTotal/monthLeads en InvestmentCalendar.tsx).
      const cplSpend = objectiveIndex !== null ? (objectiveSpendSource?.[objectiveIndex] ?? 0) : spend;
      result.push({ date, day, spend, leads, cpl: hasData && leads > 0 ? cplSpend / leads : null, hasData });
    }
    return result;
  }, [month, byDate, objectiveIndex, campaignId]);

  const daysInMonth = points.length;
  const slot = INNER_W / daysInMonth;
  const barWidth = Math.min(16, slot * 0.55);
  const labelStep = daysInMonth > 24 ? 2 : 1;

  const maxSpend = Math.max(...points.filter((p) => p.hasData).map((p) => p.spend), 1) * 1.15;
  const spendValues = points.filter((p) => p.hasData).map((p) => p.spend);
  const avgSpend = spendValues.length > 0 ? spendValues.reduce((sum, v) => sum + v, 0) / spendValues.length : null;
  const secondaryValues = points
    .filter((p) => p.hasData)
    .map((p) => (submetric === "costo" ? p.cpl : p.leads))
    .filter((v): v is number => v !== null);
  const maxSecondary = Math.max(...secondaryValues, submetric === "costo" ? 5 : 5) * 1.15;
  const avgSecondary =
    secondaryValues.length > 0 ? secondaryValues.reduce((sum, v) => sum + v, 0) / secondaryValues.length : null;

  const xAt = (index: number) => PAD.left + slot * index + slot / 2;
  const yLeftAt = (value: number) => PAD.top + INNER_H - (value / maxSpend) * INNER_H;
  const yRightAt = (value: number) => PAD.top + INNER_H - (value / maxSecondary) * INNER_H;

  const linePoints = points
    .map((p, i) => {
      const value = submetric === "costo" ? p.cpl : p.hasData ? p.leads : null;
      if (value === null) return null;
      return { x: xAt(i), y: yRightAt(value), index: i, value };
    })
    .filter((p): p is { x: number; y: number; index: number; value: number } => p !== null);

  const linePath = linePoints.reduce((acc, p, i) => {
    // Corta el trazo si hay un salto de días sin dato (no debería pasar salvo al inicio del mes).
    const prev = linePoints[i - 1];
    const isGap = prev && p.index - prev.index > 1;
    return acc + `${i === 0 || isGap ? "M" : "L"} ${p.x},${p.y} `;
  }, "");

  // Día con el valor máximo y mínimo de la métrica secundaria (Cantidad o Costo por Resultado)
  // entre los días con datos — se marcan en el gráfico para que se vea de
  // un vistazo cuándo fue el mejor/peor día.
  let maxPoint: (typeof linePoints)[number] | null = null;
  let minPoint: (typeof linePoints)[number] | null = null;
  for (const lp of linePoints) {
    if (maxPoint === null || lp.value > maxPoint.value) maxPoint = lp;
    if (minPoint === null || lp.value < minPoint.value) minPoint = lp;
  }
  const hasDistinctExtremes = linePoints.length > 1 && maxPoint !== null && minPoint !== null && maxPoint.index !== minPoint.index;

  const selectedObjectiveLabel = objectiveIndex !== null ? (objectiveOptions.find((o) => o.index === objectiveIndex)?.label ?? null) : null;
  const selectedCampaignName = campaignId !== null ? (campaigns.find((c) => c.id === campaignId)?.name ?? null) : null;
  const secondaryColor = objectiveIndex !== null ? objectiveColor(objectiveIndex) : SUBMETRIC_DEFAULT_COLOR[submetric];
  const secondaryLabel = SUBMETRIC_LABEL[submetric];
  const secondaryLegend = `${secondaryLabel} · ${selectedObjectiveLabel ?? "Todos los tipos"}`;

  // Métricas para la leyenda de hallazgos (independientes de los combos/toggle, así no hace falta
  // volver a pedirle el resumen a Claude cada vez que el usuario cambia de vista).
  const insightMetrics = useMemo(() => {
    const withData = points.filter((p) => p.hasData);
    const totalSpend = withData.reduce((sum, p) => sum + p.spend, 0);
    const avgSpendAll = withData.length > 0 ? totalSpend / withData.length : null;
    const totalResultadosAll = withData.reduce((sum, p) => sum + p.leads, 0);
    const avgResultadosAll = withData.length > 0 ? totalResultadosAll / withData.length : null;
    const cplPoints = withData.filter((p): p is DayPoint & { cpl: number } => p.cpl !== null);
    const avgCplAll = cplPoints.length > 0 ? cplPoints.reduce((sum, p) => sum + p.cpl, 0) / cplPoints.length : null;

    const maxSpendPoint = pickExtreme(withData, (p) => p.spend, "max");
    const minSpendPoint = pickExtreme(withData, (p) => p.spend, "min");
    const maxCplPoint = pickExtreme(cplPoints, (p) => p.cpl, "max");
    const minCplPoint = pickExtreme(cplPoints, (p) => p.cpl, "min");
    const maxResultadosPoint = pickExtreme(withData, (p) => p.leads, "max");

    return {
      mes: format(month, "MMMM yyyy", { locale: es }),
      tipoDeResultado: selectedObjectiveLabel ?? "Todos los tipos",
      campania: selectedCampaignName ?? "Todas las campañas",
      diasConDatos: withData.length,
      inversionTotal: formatCurrency(totalSpend, currency),
      inversionPromedioDiaria: avgSpendAll !== null ? formatCurrency(avgSpendAll, currency) : null,
      inversionPico: maxSpendPoint
        ? { fecha: format(maxSpendPoint.date, "d MMM", { locale: es }), valor: formatCurrency(maxSpendPoint.spend, currency) }
        : null,
      inversionMinima: minSpendPoint
        ? { fecha: format(minSpendPoint.date, "d MMM", { locale: es }), valor: formatCurrency(minSpendPoint.spend, currency) }
        : null,
      resultadosTotales: totalResultadosAll,
      resultadosPromedioDiario: avgResultadosAll !== null ? Math.round(avgResultadosAll) : null,
      resultadosPico: maxResultadosPoint
        ? { fecha: format(maxResultadosPoint.date, "d MMM", { locale: es }), valor: maxResultadosPoint.leads }
        : null,
      costoPorResultadoPromedio: avgCplAll !== null ? formatCurrency(avgCplAll, currency, 2) : null,
      costoPorResultadoMasBajo: minCplPoint
        ? { fecha: format(minCplPoint.date, "d MMM", { locale: es }), valor: formatCurrency(minCplPoint.cpl, currency, 2) }
        : null,
      costoPorResultadoMasAlto: maxCplPoint
        ? { fecha: format(maxCplPoint.date, "d MMM", { locale: es }), valor: formatCurrency(maxCplPoint.cpl, currency, 2) }
        : null,
    };
  }, [points, month, currency, selectedObjectiveLabel, selectedCampaignName]);

  const handleMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((relX - PAD.left - slot / 2) / slot);
    setHoverIndex(Math.min(daysInMonth - 1, Math.max(0, index)));
  };

  const hovered = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;
  const tooltipLeft = hoverX !== null ? `${(hoverX / VIEW_W) * 100}%` : "0%";
  const tooltipFromRightEdge = hoverX !== null && hoverX > VIEW_W * 0.72;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">Inversión y rendimiento por día</CardTitle>
          <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary/70" /> Inversión
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: secondaryColor }} /> {secondaryLegend}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Tipo de Resultado"
            value={objectiveIndex === null ? "all" : String(objectiveIndex)}
            onChange={(event) => setObjectiveIndex(event.target.value === "all" ? null : Number(event.target.value))}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos los tipos</option>
            {objectiveOptions.map((o) => (
              <option key={o.index} value={o.index}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            aria-label="Campaña"
            value={campaignId ?? "all"}
            onChange={(event) => setCampaignId(event.target.value === "all" ? null : event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 rounded-md bg-muted p-1">
            {(["costo", "cantidad"] as Submetric[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSubmetric(option)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-bold transition-colors",
                  submetric === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {SUBMETRIC_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="h-full w-full"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            {/* Grillas horizontales + ticks de los dos ejes */}
            {TICK_FRACTIONS.map((frac) => {
              const y = PAD.top + INNER_H - frac * INNER_H;
              return (
                <g key={frac}>
                  <line
                    x1={PAD.left}
                    x2={VIEW_W - PAD.right}
                    y1={y}
                    y2={y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={1}
                    strokeDasharray={frac === 0 ? undefined : "3 3"}
                  />
                  <text x={PAD.left - 8} y={y} textAnchor="end" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                    {formatCurrency(maxSpend * frac, currency, 0)}
                  </text>
                  <text x={VIEW_W - PAD.right + 8} y={y} textAnchor="start" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                    {submetric === "costo" ? formatCurrency(maxSecondary * frac, currency, 0) : formatNumber(Math.round(maxSecondary * frac))}
                  </text>
                </g>
              );
            })}

            {/* Línea de referencia: promedio de la métrica secundaria seleccionada (la pill con la etiqueta se dibuja más abajo, después de las barras, para quedar siempre por encima) */}
            {avgSecondary !== null && (
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yRightAt(avgSecondary)}
                y2={yRightAt(avgSecondary)}
                stroke={secondaryColor}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.5}
              />
            )}

            {/* Línea de referencia: promedio de inversión diaria (misma lógica: la pill va después de las barras) */}
            {avgSpend !== null && (
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yLeftAt(avgSpend)}
                y2={yLeftAt(avgSpend)}
                className="stroke-primary"
                strokeWidth={1.5}
                opacity={0.55}
              />
            )}

            {/* Barras de inversión */}
            {points.map((p, i) => {
              if (!p.hasData) return null;
              const isCurrentDay = hoverIndex === null && p.date.toDateString() === today.toDateString();
              return (
                <path
                  key={p.date.toISOString()}
                  d={roundedTopBarPath(xAt(i) - barWidth / 2, yLeftAt(p.spend), barWidth, PAD.top + INNER_H, 3)}
                  className={cn(isCurrentDay ? "fill-primary" : "fill-primary/45")}
                />
              );
            })}

            {/* Línea de la métrica secundaria (Cantidad o Costo por Resultado) */}
            {linePath && <path d={linePath} fill="none" stroke={secondaryColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {linePoints.map((p) => (
              <circle key={p.index} cx={p.x} cy={p.y} r={2.5} fill={secondaryColor} />
            ))}

            {/* Días con el valor máximo y mínimo de la métrica secundaria */}
            {hasDistinctExtremes && maxPoint && minPoint && (
              <>
                <circle cx={maxPoint.x} cy={maxPoint.y} r={4} fill={secondaryColor} className="stroke-background" strokeWidth={2} />
                <PointPill
                  x={maxPoint.x}
                  yTop={
                    maxPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP) >= PAD.top
                      ? maxPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP)
                      : maxPoint.y + POINT_PILL_GAP
                  }
                  label={`Máx ${format(points[maxPoint.index]!.date, "d MMM", { locale: es })}: ${formatSecondary(submetric, maxPoint.value, currency)}`}
                  color={secondaryColor}
                />
                <circle cx={minPoint.x} cy={minPoint.y} r={4} fill={secondaryColor} className="stroke-background" strokeWidth={2} />
                <PointPill
                  x={minPoint.x}
                  yTop={
                    minPoint.y + (POINT_PILL_HEIGHT + POINT_PILL_GAP) <= PAD.top + INNER_H
                      ? minPoint.y + POINT_PILL_GAP
                      : minPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP)
                  }
                  label={`Mín ${format(points[minPoint.index]!.date, "d MMM", { locale: es })}: ${formatSecondary(submetric, minPoint.value, currency)}`}
                  color={secondaryColor}
                />
              </>
            )}

            {/* Pills de "Promedio" — se dibujan al final (por encima de barras, línea y puntos
                máx/mín) para que el texto siempre se lea completo y no quede tapado por el gráfico. */}
            {avgSecondary !== null && (
              <AvgPill
                xRight={VIEW_W - PAD.right}
                yTop={yRightAt(avgSecondary) - AVG_PILL_HEIGHT / 2}
                label={`Promedio: ${formatSecondary(submetric, avgSecondary, currency)}`}
                fill={secondaryColor}
              />
            )}
            {avgSpend !== null && (
              <AvgPill
                xRight={VIEW_W - PAD.right}
                yTop={yLeftAt(avgSpend) - AVG_PILL_HEIGHT / 2}
                label={`Promedio: ${formatCurrency(avgSpend, currency)}`}
                className="fill-primary"
              />
            )}

            {/* Eje X: días del mes */}
            {points.map((p, i) =>
              p.day === 1 || p.day === daysInMonth || (p.day - 1) % labelStep === 0 ? (
                <text
                  key={`x-${p.date.toISOString()}`}
                  x={xAt(i)}
                  y={VIEW_H - 8}
                  textAnchor="middle"
                  className={cn("fill-muted-foreground text-[9px]", p.hasData && p.date.toDateString() === today.toDateString() && "fill-primary font-semibold")}
                >
                  {p.day}
                </text>
              ) : null
            )}

            {/* Crosshair de hover */}
            {hoverX !== null && (
              <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + INNER_H} stroke="currentColor" className="text-border" strokeWidth={1} />
            )}
            {hovered?.hasData && hoverX !== null && (
              <>
                <circle cx={hoverX} cy={yLeftAt(hovered.spend)} r={3.5} className="fill-primary stroke-background" strokeWidth={1.5} />
                {hovered.cpl !== null && submetric === "costo" && (
                  <circle cx={hoverX} cy={yRightAt(hovered.cpl)} r={3.5} fill={secondaryColor} className="stroke-background" strokeWidth={1.5} />
                )}
                {submetric === "cantidad" && (
                  <circle cx={hoverX} cy={yRightAt(hovered.leads)} r={3.5} fill={secondaryColor} className="stroke-background" strokeWidth={1.5} />
                )}
              </>
            )}
          </svg>

          {hovered && (
            <div
              className={cn(
                "pointer-events-none absolute top-2 flex min-w-[140px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md",
                tooltipFromRightEdge ? "-translate-x-full" : ""
              )}
              style={{ left: tooltipLeft }}
            >
              <span className="font-medium text-foreground">{format(hovered.date, "EEEE d MMM", { locale: es })}</span>
              {hovered.hasData ? (
                <>
                  <span className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-sm bg-primary/70" /> Inversión
                    </span>
                    <span className="font-medium text-foreground">{formatCurrency(hovered.spend, currency)}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: secondaryColor }} /> {secondaryLabel}
                    </span>
                    <span className="font-medium text-foreground">
                      {submetric === "costo"
                        ? hovered.cpl !== null
                          ? formatSecondary("costo", hovered.cpl, currency)
                          : "0"
                        : formatSecondary("cantidad", hovered.leads, currency)}
                    </span>
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Aún sin datos</span>
              )}
            </div>
          )}
        </div>

        <ChartInsightPanel chart="investment-trend" metrics={insightMetrics} accentColor="hsl(var(--primary))" monthIsComplete={monthIsComplete} clientId={clientId} />
      </CardContent>
    </Card>
  );
}
