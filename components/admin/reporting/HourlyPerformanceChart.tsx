"use client";

// "En qué momento del día se consiguen los resultados": inversión por hora (barras, eje
// izquierdo) + costo por contacto por hora (línea, eje derecho), para las 24 horas del día,
// sumando el mes completo — mismo patrón de doble eje que InvestmentTrendChart.tsx, pero por hora
// del día en vez de por día del mes.
//
// Las barras se pintan en rojo cuando el costo por contacto de esa hora supera en más de un 35%
// al costo por contacto promedio de la cuenta — el umbral se calcula siempre a partir del dato
// real del mes, nunca queda hardcodeado.
//
// Debajo del gráfico, un resumen en 3 franjas horarias fijas (09-20h / 21-23h / 00-08h, mismo
// criterio que le sirve a cualquier cuenta: horario comercial extendido, noche y madrugada) con
// inversión, participación, contactos y costo por contacto de cada franja — y el insight de
// Claude a partir de esos mismos números.
//
// Datos REALES de Meta Ads (ver lib/reporting/metaInvestmentData.ts — fetchHourlyTotals — e
// InvestmentCalendar.tsx, que los pide todo junto una sola vez): breakdown
// "hourly_stats_aggregated_by_advertiser_time_zone" a nivel anuncio, matcheado por Objetivo con
// el mismo criterio que el resto de la página.
//
// A pedido de Martín este gráfico SÍ suma un combo de "Tipo de Resultado" (con "Todos los Resultados"
// combinados como default, igual que antes) además de los de CAMPAÑA y ANUNCIO — mismo patrón en
// cascada de 3 combos que InvestmentTrendChart.tsx (nullable objectiveIndex/campaignId/adId, "todos"
// como opción real, no un índice forzado — ver visibleAdsForCampaign/resolveAdFilteredTotals en
// lib/reporting/adFilter.ts). Con Campaña y/o Anuncio elegidos, tanto las barras de Inversión como
// la línea de Costo por Contacto (y el promedio/umbral rojo, que se recalcula sobre el subconjunto
// filtrado) reflejan sólo esa Campaña/Anuncio.

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";
import { cn } from "@/lib/utils";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { resolveAdFilteredTotals, visibleAdsForCampaign, type AdBreakdownEntry } from "@/lib/reporting/adFilter";

interface HourlyTotals {
  hour: number;
  spend: number;
  objectiveLeads: number[];
  objectiveSpend: number[];
  /** Desglose de esta hora por anuncio (clave = ad_id) — ver metaInvestmentData.ts. */
  byAd: Record<string, AdBreakdownEntry>;
}

/** Un tipo de Resultado disponible para el combo (sólo los que tienen datos este mes — ver visibleObjectiveTotals en InvestmentCalendar.tsx). */
interface ObjectiveOption {
  index: number;
  label: string;
}

interface TimeBand {
  label: string;
  startHour: number;
  endHour: number; // inclusive
}

// Franjas fijas: horario comercial extendido, noche y madrugada — mismo criterio para cualquier
// cuenta, no depende de dónde caigan las horas "rojas" de este mes en particular.
const TIME_BANDS: TimeBand[] = [
  { label: "09:00 a 20:00", startHour: 9, endHour: 20 },
  { label: "21:00 a 23:00", startHour: 21, endHour: 23 },
  { label: "00:00 a 08:00", startHour: 0, endHour: 8 },
];

// Cuánto por encima del promedio de la cuenta tiene que estar el costo por contacto de una hora
// para pintarse en rojo.
const RED_THRESHOLD_RATIO = 1.35;

const BAR_COLOR_NORMAL = "#dbeafe"; // blue-100
const BAR_COLOR_ABOVE_THRESHOLD = "#dc2626"; // red-600
const LINE_COLOR = "#15803d"; // green-700

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

function hourLabel(hour: number): string {
  return hour.toString().padStart(2, "0");
}

export function HourlyPerformanceChart({
  hourlyTotals,
  currency,
  monthIsComplete,
  clientId,
  objectiveOptions,
  campaigns,
  ads,
}: {
  /** Un elemento por hora (0-23), sumando el mes completo — ver lib/reporting/metaInvestmentData.ts. */
  hourlyTotals: HourlyTotals[];
  currency: string;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
  /** Tipos de Resultado con datos este mes, para el combo — ver visibleObjectiveTotals en InvestmentCalendar.tsx. */
  objectiveOptions: ObjectiveOption[];
  /** Campañas con gasto este mes, para el combo — ver data.campaigns en InvestmentCalendar.tsx. */
  campaigns: { id: string; name: string }[];
  /** Anuncios con gasto este mes, cada uno con el id de su campaña — combo de Anuncio, en cascada con el de Campaña (ver visibleAdsForCampaign). */
  ads: { id: string; name: string; campaignId: string }[];
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [objectiveIndex, setObjectiveIndex] = useState<number | null>(null); // null = "Todos los Resultados"
  const [campaignId, setCampaignId] = useState<string | null>(null); // null = "Todas las campañas"
  const [adId, setAdId] = useState<string | null>(null); // null = "Todos los anuncios"
  const svgRef = useRef<SVGSVGElement>(null);

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

  const visibleAds = useMemo(() => visibleAdsForCampaign(ads, campaignId), [ads, campaignId]);
  useEffect(() => {
    if (adId !== null && !visibleAds.some((a) => a.id === adId)) {
      setAdId(null);
    }
  }, [visibleAds, adId]);

  const hours = useMemo(() => {
    const byHour = new Map(hourlyTotals.map((h) => [h.hour, h]));
    const hasFilter = campaignId !== null || adId !== null;
    return Array.from({ length: 24 }, (_, hour) => {
      const entry = byHour.get(hour);
      // Mismo criterio que InvestmentTrendChart: con Campaña/Anuncio elegidos, la hora se resuelve
      // contra SU desglose por anuncio (entry.byAd) en vez del total de cuenta.
      const scoped = hasFilter && entry ? resolveAdFilteredTotals(entry.byAd, campaignId, adId, entry.objectiveLeads.length) : null;
      const hasData = hasFilter ? scoped !== null : Boolean(entry);
      const spend = hasFilter ? (scoped?.spend ?? 0) : (entry?.spend ?? 0);
      const objectiveLeadsSource = hasFilter ? scoped?.objectiveLeads : entry?.objectiveLeads;
      const objectiveSpendSource = hasFilter ? scoped?.objectiveSpend : entry?.objectiveSpend;
      const leads = hasData
        ? objectiveIndex !== null
          ? (objectiveLeadsSource?.[objectiveIndex] ?? 0)
          : (objectiveLeadsSource ?? []).reduce((sum, v) => sum + v, 0)
        : 0;
      // Costo por Contacto: con un tipo puntual elegido, el gasto atribuido a ESE tipo; con
      // "Todos los Resultados", el gasto total de la hora/campaña/anuncio (mismo criterio "blended" que
      // el resto de la página).
      const cplSpend = objectiveIndex !== null ? (objectiveSpendSource?.[objectiveIndex] ?? 0) : spend;
      return { hour, spend, leads, cpl: hasData && leads > 0 ? cplSpend / leads : null };
    });
  }, [hourlyTotals, objectiveIndex, campaignId, adId]);

  const totalSpend = hours.reduce((sum, h) => sum + h.spend, 0);
  const totalLeads = hours.reduce((sum, h) => sum + h.leads, 0);
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null;
  const threshold = avgCpl !== null ? avgCpl * RED_THRESHOLD_RATIO : null;

  const slot = INNER_W / 24;
  const barWidth = Math.min(20, slot * 0.6);

  const maxSpend = Math.max(...hours.map((h) => h.spend), 1) * 1.15;
  const cplValues = hours.map((h) => h.cpl).filter((v): v is number => v !== null);
  const maxCpl = Math.max(...cplValues, 1) * 1.15;

  const xAt = (index: number) => PAD.left + slot * index + slot / 2;
  const yLeftAt = (value: number) => PAD.top + INNER_H - (value / maxSpend) * INNER_H;
  const yRightAt = (value: number) => PAD.top + INNER_H - (value / maxCpl) * INNER_H;

  const linePoints = hours
    .map((h, i) => (h.cpl !== null ? { x: xAt(i), y: yRightAt(h.cpl), index: i, value: h.cpl } : null))
    .filter((p): p is { x: number; y: number; index: number; value: number } => p !== null);

  const linePath = linePoints.reduce((acc, p, i) => {
    const prev = linePoints[i - 1];
    const isGap = prev && p.index - prev.index > 1;
    return acc + `${i === 0 || isGap ? "M" : "L"} ${p.x},${p.y} `;
  }, "");

  // Franjas horarias fijas, con los totales reales de este mes.
  const bands = useMemo(() => {
    return TIME_BANDS.map((band) => {
      const inBand = hours.filter((h) => h.hour >= band.startHour && h.hour <= band.endHour);
      const spend = inBand.reduce((sum, h) => sum + h.spend, 0);
      const leads = inBand.reduce((sum, h) => sum + h.leads, 0);
      return {
        ...band,
        spend,
        leads,
        cpl: leads > 0 ? spend / leads : null,
        share: totalSpend > 0 ? spend / totalSpend : 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, totalSpend]);

  const hasData = totalSpend > 0 || totalLeads > 0;

  const selectedObjectiveLabel = objectiveIndex !== null ? (objectiveOptions.find((o) => o.index === objectiveIndex)?.label ?? null) : null;
  const selectedCampaignName = campaignId !== null ? (campaigns.find((c) => c.id === campaignId)?.name ?? null) : null;
  const tipoLabel = selectedObjectiveLabel ?? "Todos los Resultados";
  const lineColor = objectiveIndex !== null ? objectiveColor(objectiveIndex) : LINE_COLOR;

  const insightMetrics = useMemo(() => {
    if (!hasData) return null;
    const withLeads = hours.filter((h) => h.leads > 0);
    const peakHour = withLeads.length > 0 ? [...withLeads].sort((a, b) => b.leads - a.leads)[0]! : null;
    const withCpl = hours.filter((h): h is typeof h & { cpl: number } => h.cpl !== null);
    const cheapestHour = withCpl.length > 0 ? [...withCpl].sort((a, b) => a.cpl - b.cpl)[0]! : null;
    const priciestHour = withCpl.length > 0 ? [...withCpl].sort((a, b) => b.cpl - a.cpl)[0]! : null;
    const bandsWithLeads = bands.filter((b) => b.leads > 0);
    const bestBand = bandsWithLeads.length > 0 ? [...bandsWithLeads].sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity))[0]! : null;
    const worstBand = bandsWithLeads.length > 0 ? [...bandsWithLeads].sort((a, b) => (b.cpl ?? -Infinity) - (a.cpl ?? -Infinity))[0]! : null;

    return {
      tipoDeResultado: tipoLabel,
      campania: selectedCampaignName ?? "Todas las campañas",
      costoPromedio: avgCpl !== null ? formatCurrency(avgCpl, currency, 2) : null,
      inversionTotal: formatCurrency(totalSpend, currency),
      contactosTotales: formatNumber(totalLeads),
      franjas: bands.map((b) => ({
        franja: b.label,
        inversion: formatCurrency(b.spend, currency),
        participacionInversion: formatPercent(b.share),
        contactos: formatNumber(b.leads),
        costoPorContacto: b.cpl !== null ? formatCurrency(b.cpl, currency, 2) : "s/d",
      })),
      mejorFranja: bestBand ? { franja: bestBand.label, costoPorContacto: formatCurrency(bestBand.cpl ?? 0, currency, 2) } : null,
      peorFranja: worstBand ? { franja: worstBand.label, costoPorContacto: formatCurrency(worstBand.cpl ?? 0, currency, 2) } : null,
      horaPico: peakHour ? { hora: `${hourLabel(peakHour.hour)}:00`, contactos: formatNumber(peakHour.leads) } : null,
      horaMasEficiente: cheapestHour ? { hora: `${hourLabel(cheapestHour.hour)}:00`, costoPorContacto: formatCurrency(cheapestHour.cpl, currency, 2) } : null,
      horaMenosEficiente: priciestHour
        ? { hora: `${hourLabel(priciestHour.hour)}:00`, costoPorContacto: formatCurrency(priciestHour.cpl, currency, 2) }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours, bands, hasData, avgCpl, totalSpend, totalLeads, currency, tipoLabel, selectedCampaignName]);

  const handleMove = (event: ReactMouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((event.clientX - rect.left) / rect.width) * VIEW_W;
    const index = Math.round((relX - PAD.left - slot / 2) / slot);
    setHoverIndex(Math.min(23, Math.max(0, index)));
  };

  const hovered = hoverIndex !== null ? hours[hoverIndex] : null;
  const hoverX = hoverIndex !== null ? xAt(hoverIndex) : null;
  const tooltipLeft = hoverX !== null ? `${(hoverX / VIEW_W) * 100}%` : "0%";
  const tooltipFromRightEdge = hoverX !== null && hoverX > VIEW_W * 0.72;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 pb-2">
        <div className="flex flex-row flex-wrap items-start justify-between gap-3">
          <CardTitle className="text-lg font-bold text-foreground">En qué momento del día se consiguen los resultados</CardTitle>

          <div className="flex flex-col items-stretch gap-2">
            <select
              aria-label="Tipo de Resultado"
              value={objectiveIndex === null ? "all" : String(objectiveIndex)}
              onChange={(event) => setObjectiveIndex(event.target.value === "all" ? null : Number(event.target.value))}
              className="h-8 w-[260px] truncate rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="all">Todos los Resultados</option>
              {objectiveOptions.map((o) => (
                <option key={o.index} value={o.index}>
                  {o.label}
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
        </div>

        <span className="text-xs text-muted-foreground">
          {threshold !== null
            ? `Las barras en rojo señalan las horas cuyo costo por contacto (${tipoLabel.toLowerCase()}) supera los ${formatCurrency(threshold, currency, 2)}, es decir, más de un ${Math.round((RED_THRESHOLD_RATIO - 1) * 100)}% por encima del promedio del período filtrado.`
            : "Todavía no hay contactos este período para calcular el promedio."}
        </span>
      </CardHeader>

      <CardContent className="pt-2">
        {!hasData ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Todavía no hay datos este mes.</p>
        ) : (
          <>
            <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                className="h-full w-full"
                onMouseMove={handleMove}
                onMouseLeave={() => setHoverIndex(null)}
              >
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
                        {formatCurrency(maxCpl * frac, currency, 0)}
                      </text>
                    </g>
                  );
                })}

                {/* Barras de inversión por hora, coloreadas por umbral de costo por contacto */}
                {hours.map((h, i) => {
                  if (h.spend <= 0 && h.leads <= 0) return null;
                  const isAboveThreshold = threshold !== null && h.cpl !== null && h.cpl > threshold;
                  return (
                    <path
                      key={h.hour}
                      d={roundedTopBarPath(xAt(i) - barWidth / 2, yLeftAt(h.spend), barWidth, PAD.top + INNER_H, 3)}
                      fill={isAboveThreshold ? BAR_COLOR_ABOVE_THRESHOLD : BAR_COLOR_NORMAL}
                    />
                  );
                })}

                {/* Línea de costo por contacto */}
                {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                {linePoints.map((p) => (
                  <circle key={p.index} cx={p.x} cy={p.y} r={3} fill="#ffffff" stroke={lineColor} strokeWidth={2} />
                ))}

                {/* Eje X: horas del día */}
                {hours.map((h, i) => (
                  <text key={`x-${h.hour}`} x={xAt(i)} y={VIEW_H - 8} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                    {hourLabel(h.hour)}
                  </text>
                ))}

                {hoverX !== null && (
                  <line x1={hoverX} x2={hoverX} y1={PAD.top} y2={PAD.top + INNER_H} stroke="currentColor" className="text-border" strokeWidth={1} />
                )}
                {hovered && hoverX !== null && hovered.cpl !== null && (
                  <circle cx={hoverX} cy={yRightAt(hovered.cpl)} r={4} fill="#ffffff" stroke={lineColor} strokeWidth={2} />
                )}
              </svg>

              {hovered && (
                <div
                  className={cn(
                    "pointer-events-none absolute top-2 flex min-w-[150px] flex-col gap-1 rounded-md border border-border bg-background px-3 py-2 text-xs shadow-md",
                    tooltipFromRightEdge ? "-translate-x-full" : ""
                  )}
                  style={{ left: tooltipLeft }}
                >
                  <span className="font-medium text-foreground">{hourLabel(hovered.hour)}:00 hs</span>
                  {hovered.spend > 0 || hovered.leads > 0 ? (
                    <>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-sm" style={{ backgroundColor: BAR_COLOR_ABOVE_THRESHOLD }} /> Inversión
                        </span>
                        <span className="font-medium text-foreground">{formatCurrency(hovered.spend, currency)}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lineColor }} /> Costo/contacto
                        </span>
                        <span className="font-medium text-foreground">{hovered.cpl !== null ? formatCurrency(hovered.cpl, currency, 2) : "0"}</span>
                      </span>
                      <span className="flex items-center justify-between gap-3 text-muted-foreground">
                        <span>Contactos</span>
                        <span className="font-medium text-foreground">{formatNumber(hovered.leads)}</span>
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Sin actividad esta hora</span>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1.5 pr-4 font-medium">Franja horaria</th>
                    <th className="py-1.5 pr-4 font-medium">Inversión</th>
                    <th className="py-1.5 pr-4 font-medium">% del total</th>
                    <th className="py-1.5 pr-4 font-medium">Contactos</th>
                    <th className="py-1.5 font-medium">Costo/contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {bands.map((band) => (
                    <tr key={band.label} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-4 font-medium text-foreground">{band.label}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatCurrency(band.spend, currency)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatPercent(band.share)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{formatNumber(band.leads)}</td>
                      <td className="py-2 font-semibold text-foreground">{band.cpl !== null ? formatCurrency(band.cpl, currency, 2) : "s/d"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {insightMetrics && (
          <ChartInsightPanel chart="hourly-performance" metrics={insightMetrics} accentColor={lineColor} monthIsComplete={monthIsComplete} clientId={clientId} />
        )}
      </CardContent>
    </Card>
  );
}
