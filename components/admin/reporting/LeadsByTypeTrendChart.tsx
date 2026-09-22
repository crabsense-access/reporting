"use client";

// Gráfico de tendencia diaria de Leads segmentados por Objetivo (barras apiladas por Objetivo,
// eje Y izquierdo) — mismo patrón que InvestmentTrendChart (barras + línea, doble eje, SVG a
// mano) pero con Leads como métrica principal y el CPL del Objetivo elegido como métrica
// secundaria (línea, eje Y derecho). El combo de Tipo de Resultado (con "Todos los tipos" como
// default, igual que el resto de los gráficos con este combo) sólo afecta la LÍNEA de CPL: las
// barras apiladas siempre muestran TODOS los Objetivos visibles a la vez, elegido lo que se elija
// — con "Todos los tipos" la línea pasa a mostrar el CPL blended (gasto total / leads totales del
// día, mismo criterio que InvestmentTrendChart). El tooltip siempre muestra el desglose de
// cantidad y CPL de todos los Objetivos visibles, sea cual sea el elegido para la línea. Va
// debajo de "Inversión y rendimiento por día".
//
// DINÁMICO por Objetivo (índice 0..N-1, ver lib/reporting/metaInvestmentData.ts): a diferencia de
// la versión anterior (3 tipos fijos, LeadType), acá se muestra CUALQUIER cantidad de Objetivos
// que el cliente tenga cargados en el Admin — un Objetivo nuevo aparece solo, sin tocar código.
// Sólo se muestran (leyenda, botones de filtro, barras apiladas) los Objetivos con al menos 1
// lead en el mes: uno con 0 leads todo el mes simplemente no aparece (visibleIndexes más abajo),
// y con el nombre REAL del tipo de Resultado como lo llama Meta Ads Manager (ver objectiveOptions
// más abajo y resolveResultLabel en lib/reporting/metaResultLabels.ts), no el label que se tipea
// a mano al cargar el Objetivo en el Admin.
//
// Además del toggle de Objetivo (arriba), dos combos más de CAMPAÑA y ANUNCIO filtran todo el
// gráfico (barras apiladas, línea de CPL y hallazgos) — mismo patrón en cascada que
// InvestmentTrendChart: el de Anuncio se acota a la Campaña elegida (ver visibleAdsForCampaign en
// lib/reporting/adFilter.ts) y ambos componen con el toggle de Objetivo (ver DailyRealTotals.byAd
// y resolveAdFilteredTotals, mismo helper que usan el resto de los gráficos con estos combos).
//
// Recibe los datos reales del mes (ver components/admin/reporting/InvestmentCalendar.tsx, que
// los pide una sola vez a /api/clients/[id]/investment-calendar y los reparte entre este chart e
// InvestmentTrendChart).

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartInsightByTypePanel } from "@/components/admin/reporting/ChartInsightByTypePanel";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { resolveAdFilteredTotals, visibleAdsForCampaign } from "@/lib/reporting/adFilter";

interface DailyRealTotals {
  date: string; // yyyy-MM-dd
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de este día por anuncio (clave = ad_id) — ver metaInvestmentData.ts. */
  byAd: Record<string, { campaignId: string; spend: number; objectiveLeads: number[]; objectiveSpend: number[] }>;
}

interface DayTypePoint {
  date: Date;
  day: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  totalLeads: number;
  hasData: boolean;
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

const VIEW_W = 760;
const VIEW_H = 260;
const PAD = { top: 16, right: 46, bottom: 26, left: 50 };
const INNER_W = VIEW_W - PAD.left - PAD.right;
const INNER_H = VIEW_H - PAD.top - PAD.bottom;
const TICK_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];

function roundedTopBarPath(x: number, yTop: number, width: number, yBottom: number, radius: number) {
  const r = Math.min(radius, (yBottom - yTop) / 2, width / 2);
  if (r <= 0.5) return `M ${x},${yBottom} L ${x},${yTop} L ${x + width},${yTop} L ${x + width},${yBottom} Z`;
  return `M ${x},${yBottom} L ${x},${yTop + r} Q ${x},${yTop} ${x + r},${yTop} L ${x + width - r},${yTop} Q ${x + width},${yTop} ${x + width},${yTop + r} L ${x + width},${yBottom} Z`;
}

const AVG_PILL_HEIGHT = 20;

// Pill de promedio centrada verticalmente sobre su línea de referencia (la línea queda "detrás",
// tapada por el fondo de la pill) en vez de colgar por completo arriba o abajo de ella.
function AvgPill({ xRight, yMid, label, fill }: { xRight: number; yMid: number; label: string; fill: string }) {
  const height = AVG_PILL_HEIGHT;
  const width = label.length * 5.4 + 18;
  const x = xRight - width;
  return (
    <>
      <rect x={x} y={yMid - height / 2} width={width} height={height} rx={height / 2} fill={fill} />
      <text
        x={x + width / 2}
        y={yMid}
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

const POINT_PILL_HEIGHT = 19;
const POINT_PILL_GAP = 9;

// Color de la línea/pill de CPL con "Todos los tipos" elegido (sin un Objetivo puntual para
// colorear) — mismo valor que COSTO_DEFAULT_COLOR en InvestmentTrendChart.tsx, para que el
// acento de "blended" se vea igual en los dos gráficos.
const CPL_DEFAULT_COLOR = "#d97706"; // amber-600

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

interface ObjectiveOption {
  index: number;
  label: string;
}

export function LeadsByTypeTrendChart({
  days,
  currency,
  objectiveOptions,
  month,
  monthIsComplete,
  clientId,
  campaigns,
  ads,
}: {
  days: DailyRealTotals[];
  currency: string;
  /**
   * Tipos de Resultado con al menos 1 lead este mes (índice alineado con objectiveLeads/objectiveSpend
   * de cada día), ya resueltos al nombre real que muestra Meta Ads Manager — ver resolveResultLabel
   * en lib/reporting/metaResultLabels.ts y visibleObjectiveTotals en InvestmentCalendar.tsx. No es
   * el label que se tipea a mano al cargar el Objetivo en el Admin.
   */
  objectiveOptions: ObjectiveOption[];
  /** Primer día del mes seleccionado en el combo de InvestmentCalendar.tsx — define el rango de días del eje X (independiente de "hoy", que sólo se usa para resaltar el día actual cuando el mes mostrado es el mes en curso). */
  month: Date;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightByTypePanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
  /** Campañas con gasto este mes, para el combo — ver data.campaigns en InvestmentCalendar.tsx. */
  campaigns: { id: string; name: string }[];
  /** Anuncios con gasto este mes, cada uno con el id de su campaña — combo de Anuncio, en cascada con el de Campaña (ver visibleAdsForCampaign). */
  ads: { id: string; name: string; campaignId: string }[];
}) {
  const [objectiveIndex, setObjectiveIndex] = useState<number | null>(null); // null = "Todos los tipos"
  const [campaignId, setCampaignId] = useState<string | null>(null); // null = "Todas las campañas"
  const [adId, setAdId] = useState<string | null>(null); // null = "Todos los anuncios"
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const today = useMemo(() => new Date(), []);

  // El mismo criterio de "cae a la opción vigente" que usa InvestmentTrendChart: si la Campaña
  // elegida deja de tener gasto en el mes nuevo, vuelve a "Todas las campañas" en vez de quedar en
  // un estado que ya no existe.
  useEffect(() => {
    if (campaignId !== null && !campaigns.some((c) => c.id === campaignId)) {
      setCampaignId(null);
    }
  }, [campaigns, campaignId]);

  const visibleAds = useMemo(() => visibleAdsForCampaign(ads, campaignId), [ads, campaignId]);
  useEffect(() => {
    if (adId !== null && !visibleAds.some((a) => a.id === adId)) {
      setAdId(null);
    }
  }, [visibleAds, adId]);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);

  // objectiveOptions ya viene calculado en InvestmentCalendar.tsx sólo con los Objetivos con al
  // menos 1 lead este mes — uno que no generó nada este mes no aparece, en vez de mostrar una
  // columna/segmento vacío.
  const visibleIndexes = useMemo(() => objectiveOptions.map((o) => o.index), [objectiveOptions]);

  // Nombre resuelto de cada Objetivo por índice, para no repetir el .find() en cada lugar que lo
  // necesita (leyenda, select, tooltip, hallazgos).
  const labelByIndex = useMemo(() => {
    const map: Record<number, string> = {};
    objectiveOptions.forEach((o) => {
      map[o.index] = o.label;
    });
    return map;
  }, [objectiveOptions]);

  // Si el Objetivo seleccionado deja de estar visible (cambió el mes, o dejó de tener leads), cae
  // a "Todos los tipos" en vez de quedarse mostrando un CPL vacío.
  useEffect(() => {
    if (objectiveIndex !== null && !visibleIndexes.includes(objectiveIndex)) {
      setObjectiveIndex(null);
    }
  }, [visibleIndexes, objectiveIndex]);

  // Mapa inverso label -> índice, para poder colorear cada tarjeta de hallazgo por su propio
  // Objetivo (el "tipo" que devuelve Claude es el label YA resuelto, no un índice).
  const indexByLabel = useMemo(() => {
    const map: Record<string, number> = {};
    objectiveOptions.forEach((o) => {
      map[o.label] = o.index;
    });
    return map;
  }, [objectiveOptions]);
  const colorForTipo = (tipo: string): string => {
    const idx = indexByLabel[tipo];
    return idx !== undefined ? objectiveColor(idx) : "hsl(var(--primary))";
  };

  const points = useMemo<DayTypePoint[]>(() => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const daysInMonth = monthEnd.getDate();
    // Cantidad TOTAL de Objetivos configurados (no sólo los visibles) — para dimensionar arrays
    // que se indexan por la posición ORIGINAL del Objetivo (ver resolveAdFilteredTotals); sale del
    // propio array de datos, no de objectiveOptions (que sólo trae los visibles).
    const objectivesCount = days[0]?.objectiveLeads.length ?? 0;
    const zeroArr = Array.from({ length: objectivesCount }, () => 0);
    // Con Campaña y/o Anuncio elegidos, cada día se resuelve contra SU desglose por anuncio
    // (entry.byAd — ver resolveAdFilteredTotals) en vez del total de cuenta; mismo criterio que
    // InvestmentTrendChart: si ninguno de los anuncios que matchean el filtro tuvo una fila ese
    // día, el día queda sin datos para ese filtro, no en 0.
    const hasFilter = campaignId !== null || adId !== null;
    const result: DayTypePoint[] = [];
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dateKey = format(date, "yyyy-MM-dd");
      const entry = byDate.get(dateKey);
      const scoped = hasFilter && entry ? resolveAdFilteredTotals(entry.byAd, campaignId, adId, objectivesCount) : null;
      const hasData = hasFilter ? scoped !== null : Boolean(entry);
      const objectiveLeads = hasFilter ? (scoped?.objectiveLeads ?? zeroArr) : (entry?.objectiveLeads ?? zeroArr);
      const objectiveSpend = hasFilter ? (scoped?.objectiveSpend ?? zeroArr) : (entry?.objectiveSpend ?? zeroArr);
      const totalLeads = objectiveLeads.reduce((sum, value) => sum + value, 0);
      result.push({ date, day, objectiveLeads, objectiveSpend, totalLeads, hasData });
    }
    return result;
  }, [month, byDate, days, campaignId, adId]);

  const daysInMonth = points.length;
  const slot = INNER_W / daysInMonth;
  const barWidth = Math.min(16, slot * 0.55);
  const labelStep = daysInMonth > 24 ? 2 : 1;

  const maxTotalLeads = Math.max(...points.filter((p) => p.hasData).map((p) => p.totalLeads), 1) * 1.15;

  const cplSeries = points.map((p) => {
    if (!p.hasData) return null;
    // Con "Todos los tipos" (objectiveIndex null), CPL blended: gasto total / leads totales del
    // día — mismo criterio que InvestmentTrendChart.tsx.
    const leads = objectiveIndex !== null ? (p.objectiveLeads[objectiveIndex] ?? 0) : p.totalLeads;
    const spend =
      objectiveIndex !== null ? (p.objectiveSpend[objectiveIndex] ?? 0) : p.objectiveSpend.reduce((sum, v) => sum + v, 0);
    return leads > 0 ? spend / leads : null;
  });
  const cplValues = cplSeries.filter((v): v is number => v !== null);
  const maxCpl = Math.max(...cplValues, 5) * 1.15;
  const avgCpl = cplValues.length > 0 ? cplValues.reduce((sum, v) => sum + v, 0) / cplValues.length : null;

  const xAt = (index: number) => PAD.left + slot * index + slot / 2;
  const yLeftAt = (value: number) => PAD.top + INNER_H - (value / maxTotalLeads) * INNER_H;
  const yRightAt = (value: number) => PAD.top + INNER_H - (value / maxCpl) * INNER_H;

  const linePoints = cplSeries
    .map((value, i) => (value === null ? null : { x: xAt(i), y: yRightAt(value), index: i, value }))
    .filter((p): p is { x: number; y: number; index: number; value: number } => p !== null);

  const linePath = linePoints.reduce((acc, p, i) => {
    // Corta el trazo si hay un salto de días sin dato (no debería pasar salvo al inicio del mes).
    const prev = linePoints[i - 1];
    const isGap = prev && p.index - prev.index > 1;
    return acc + `${i === 0 || isGap ? "M" : "L"} ${p.x},${p.y} `;
  }, "");

  // Día con el CPL máximo y mínimo del Objetivo seleccionado entre los días con datos.
  let maxPoint: (typeof linePoints)[number] | null = null;
  let minPoint: (typeof linePoints)[number] | null = null;
  for (const lp of linePoints) {
    if (maxPoint === null || lp.value > maxPoint.value) maxPoint = lp;
    if (minPoint === null || lp.value < minPoint.value) minPoint = lp;
  }
  const hasDistinctExtremes = linePoints.length > 1 && maxPoint !== null && minPoint !== null && maxPoint.index !== minPoint.index;

  const selectedColor = objectiveIndex !== null ? objectiveColor(objectiveIndex) : CPL_DEFAULT_COLOR;

  // Métricas para la leyenda de hallazgos (desglose por Objetivo visible, independiente del que
  // esté seleccionado para la línea de CPL) — se le pasan ya formateadas a Claude.
  const selectedCampaignName = campaignId !== null ? (campaigns.find((c) => c.id === campaignId)?.name ?? null) : null;

  const insightMetrics = useMemo(() => {
    const withData = points.filter((p) => p.hasData);
    const objectivesCount = points[0]?.objectiveLeads.length ?? 0;
    const totalsByIndex = Array.from({ length: objectivesCount }, () => 0);
    const spendByIndex = Array.from({ length: objectivesCount }, () => 0);
    for (const p of withData) {
      p.objectiveLeads.forEach((value, i) => {
        totalsByIndex[i] = (totalsByIndex[i] ?? 0) + value;
      });
      p.objectiveSpend.forEach((value, i) => {
        spendByIndex[i] = (spendByIndex[i] ?? 0) + value;
      });
    }
    const totalLeads = totalsByIndex.reduce((sum, v) => sum + v, 0);

    const porTipo = visibleIndexes.map((i) => {
      const leads = totalsByIndex[i] ?? 0;
      const spend = spendByIndex[i] ?? 0;
      const cpl = leads > 0 ? spend / leads : null;
      const porcentaje = totalLeads > 0 ? Math.round((leads / totalLeads) * 100) : 0;
      return {
        tipo: labelByIndex[i] ?? `Objetivo ${i + 1}`,
        leads,
        porcentaje,
        cpl: cpl !== null ? formatCurrency(cpl, currency, 2) : null,
      };
    });

    const tipoLiderEnVolumen = pickExtreme(visibleIndexes, (i) => totalsByIndex[i] ?? 0, "max");
    const tipoMasEficiente = pickExtreme(visibleIndexes, (i) => (spendByIndex[i] ?? 0) / (totalsByIndex[i] ?? 1), "min");
    const tipoMasCaro = pickExtreme(visibleIndexes, (i) => (spendByIndex[i] ?? 0) / (totalsByIndex[i] ?? 1), "max");

    return {
      mes: format(month, "MMMM yyyy", { locale: es }),
      campania: selectedCampaignName ?? "Todas las campañas",
      diasConDatos: withData.length,
      leadsTotales: totalLeads,
      porTipo,
      tipoLiderEnVolumen: tipoLiderEnVolumen !== null ? (labelByIndex[tipoLiderEnVolumen] ?? null) : null,
      tipoMasEficiente: tipoMasEficiente !== null ? (labelByIndex[tipoMasEficiente] ?? null) : null,
      tipoMasCaro: tipoMasCaro !== null ? (labelByIndex[tipoMasCaro] ?? null) : null,
    };
  }, [points, month, labelByIndex, visibleIndexes, currency, selectedCampaignName]);

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
  const hoveredSelectedLeads = hovered
    ? (objectiveIndex !== null ? (hovered.objectiveLeads[objectiveIndex] ?? 0) : hovered.totalLeads)
    : 0;
  const hoveredSelectedSpend = hovered
    ? objectiveIndex !== null
      ? (hovered.objectiveSpend[objectiveIndex] ?? 0)
      : hovered.objectiveSpend.reduce((sum, v) => sum + v, 0)
    : 0;
  const hoveredSelectedCpl = hoveredSelectedLeads > 0 ? hoveredSelectedSpend / hoveredSelectedLeads : null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">Leads y CPL por tipo de campaña</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {visibleIndexes.map((idx) => (
              <span key={idx} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: objectiveColor(idx) }} /> {labelByIndex[idx]}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-stretch gap-2">
          <select
            aria-label="Tipo de Resultado"
            value={objectiveIndex === null ? "all" : String(objectiveIndex)}
            onChange={(event) => setObjectiveIndex(event.target.value === "all" ? null : Number(event.target.value))}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos los tipos</option>
            {visibleIndexes.map((idx) => (
              <option key={idx} value={idx}>
                {labelByIndex[idx]}
              </option>
            ))}
          </select>

          <select
            aria-label="Campaña"
            value={campaignId ?? "all"}
            onChange={(event) => {
              const value = event.target.value === "all" ? null : event.target.value;
              setCampaignId(value);
              setAdId(null); // cambiar de Campaña invalida el Anuncio elegido (ver visibleAds).
            }}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todas las campañas</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Anuncio"
            value={adId ?? "all"}
            onChange={(event) => setAdId(event.target.value === "all" ? null : event.target.value)}
            className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="all">Todos los anuncios</option>
            {visibleAds.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
                    {formatNumber(Math.round(maxTotalLeads * frac))}
                  </text>
                  <text x={VIEW_W - PAD.right + 8} y={y} textAnchor="start" dominantBaseline="middle" className="fill-muted-foreground text-[9px]">
                    {formatCurrency(maxCpl * frac, currency, 0)}
                  </text>
                </g>
              );
            })}

            {/* Línea de referencia: promedio de CPL del Objetivo seleccionado (la pill con la etiqueta se dibuja más abajo, después de las barras, para quedar siempre por encima) */}
            {avgCpl !== null && (
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={yRightAt(avgCpl)}
                y2={yRightAt(avgCpl)}
                stroke={selectedColor}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.5}
              />
            )}

            {/* Barras apiladas de Leads por Objetivo (sólo los visibles, con leads > 0 este mes) */}
            {points.map((p, i) => {
              if (!p.hasData || p.totalLeads <= 0) return null;
              const isCurrentDay = hoverIndex === null && p.date.toDateString() === today.toDateString();
              const barLeft = xAt(i) - barWidth / 2;

              // Apila los segmentos de abajo hacia arriba en el orden de visibleIndexes; sólo el
              // segmento no vacío más alto lleva el borde superior redondeado.
              let cumulative = 0;
              const nonZeroVisible = visibleIndexes.filter((idx) => (p.objectiveLeads[idx] ?? 0) > 0);
              const lastNonZero = nonZeroVisible.length > 0 ? nonZeroVisible[nonZeroVisible.length - 1] : -1;
              return (
                <g key={p.date.toISOString()} opacity={isCurrentDay ? 1 : 0.75}>
                  {visibleIndexes.map((idx) => {
                    const value = p.objectiveLeads[idx] ?? 0;
                    if (value <= 0) return null;
                    const yBottom = yLeftAt(cumulative);
                    cumulative += value;
                    const yTop = yLeftAt(cumulative);
                    const d =
                      idx === lastNonZero
                        ? roundedTopBarPath(barLeft, yTop, barWidth, yBottom, 3)
                        : `M ${barLeft},${yBottom} L ${barLeft},${yTop} L ${barLeft + barWidth},${yTop} L ${barLeft + barWidth},${yBottom} Z`;
                    return <path key={idx} d={d} fill={objectiveColor(idx)} />;
                  })}
                </g>
              );
            })}

            {/* Línea de CPL del Objetivo seleccionado */}
            {linePath && <path d={linePath} fill="none" stroke={selectedColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
            {linePoints.map((p) => (
              <circle key={p.index} cx={p.x} cy={p.y} r={2.5} fill={selectedColor} />
            ))}

            {/* Días con el CPL máximo y mínimo del Objetivo seleccionado */}
            {hasDistinctExtremes && maxPoint && minPoint && (
              <>
                <circle cx={maxPoint.x} cy={maxPoint.y} r={4} fill={selectedColor} className="stroke-background" strokeWidth={2} />
                <PointPill
                  x={maxPoint.x}
                  yTop={
                    maxPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP) >= PAD.top
                      ? maxPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP)
                      : maxPoint.y + POINT_PILL_GAP
                  }
                  label={`Máx ${format(points[maxPoint.index]!.date, "d MMM", { locale: es })}: ${formatCurrency(maxPoint.value, currency, 2)}`}
                  color={selectedColor}
                />
                <circle cx={minPoint.x} cy={minPoint.y} r={4} fill={selectedColor} className="stroke-background" strokeWidth={2} />
                <PointPill
                  x={minPoint.x}
                  yTop={
                    minPoint.y + (POINT_PILL_HEIGHT + POINT_PILL_GAP) <= PAD.top + INNER_H
                      ? minPoint.y + POINT_PILL_GAP
                      : minPoint.y - (POINT_PILL_HEIGHT + POINT_PILL_GAP)
                  }
                  label={`Mín ${format(points[minPoint.index]!.date, "d MMM", { locale: es })}: ${formatCurrency(minPoint.value, currency, 2)}`}
                  color={selectedColor}
                />
              </>
            )}

            {/* Pill de "Promedio" — se dibuja al final (por encima de las barras apiladas, la línea
                de CPL y los puntos máx/mín) para que el texto siempre se lea completo y no quede
                tapado por el gráfico. */}
            {avgCpl !== null && (
              <AvgPill
                xRight={VIEW_W - PAD.right}
                yMid={yRightAt(avgCpl)}
                label={`Promedio: ${formatCurrency(avgCpl, currency, 2)}`}
                fill={selectedColor}
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
                <circle cx={hoverX} cy={yLeftAt(hovered.totalLeads)} r={3.5} className="fill-foreground/70 stroke-background" strokeWidth={1.5} />
                {hoveredSelectedCpl !== null && (
                  <circle cx={hoverX} cy={yRightAt(hoveredSelectedCpl)} r={3.5} fill={selectedColor} className="stroke-background" strokeWidth={1.5} />
                )}
              </>
            )}
          </svg>

          {hovered && (
            <div
              className={cn(
                "pointer-events-none absolute top-2 flex min-w-[170px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md",
                tooltipFromRightEdge ? "-translate-x-full" : ""
              )}
              style={{ left: tooltipLeft }}
            >
              <span className="font-medium text-foreground">{format(hovered.date, "EEEE d MMM", { locale: es })}</span>
              {hovered.hasData ? (
                <>
                  <span className="flex items-center justify-between gap-3 text-muted-foreground">
                    <span>Total leads</span>
                    <span className="font-medium text-foreground">{formatNumber(hovered.totalLeads)}</span>
                  </span>
                  {visibleIndexes.map((idx) => {
                    const qty = hovered.objectiveLeads[idx] ?? 0;
                    const spend = hovered.objectiveSpend[idx] ?? 0;
                    const cpl = qty > 0 ? spend / qty : null;
                    return (
                      <span key={idx} className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: objectiveColor(idx) }} /> {labelByIndex[idx]}
                        </span>
                        <span className="font-medium text-foreground">
                          {formatNumber(qty)} · CPL {cpl !== null ? formatCurrency(cpl, currency, 2) : "0"}
                        </span>
                      </span>
                    );
                  })}
                </>
              ) : (
                <span className="text-muted-foreground">Aún sin datos</span>
              )}
            </div>
          )}
        </div>

        <ChartInsightByTypePanel chart="leads-by-type" metrics={insightMetrics} colorForTipo={colorForTipo} monthIsComplete={monthIsComplete} clientId={clientId} />
      </CardContent>
    </Card>
  );
}
