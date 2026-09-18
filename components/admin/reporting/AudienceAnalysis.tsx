"use client";

// "Quién responde a los anuncios": leads, inversión y CPL del mes por género y rango etario, para
// el Objetivo elegido en el toggle (mismo patrón dinámico que "Leads y CPL por tipo de campaña" —
// ver LeadsByTypeTrendChart.tsx: cualquier cantidad de Objetivos, sólo se listan los que tienen al
// menos 1 lead este mes). Gráfico de barras verticales agrupadas (Mujeres/Hombres) con el rango
// etario en el eje X y la altura de cada barra codificando volumen de leads — debajo de cada rango
// etario, un breve recuadro con el CPL, la inversión y los leads combinados de ambos géneros para
// esa franja, en vez de una tabla de detalle aparte (mismo criterio que "Dónde se muestran los
// anuncios": sin duplicar información que ya se ve en el gráfico).
//
// Datos REALES de Meta Ads (ver lib/reporting/metaInvestmentData.ts — fetchAudienceSegments —
// e InvestmentCalendar.tsx, que pide todo junto una sola vez): un desglose por edad+género a nivel
// campaña, matcheado por Objetivo con el mismo criterio (exacto → "contiene", primero que matchea
// se queda con la fila) que el resto de la página, así que los totales por Objetivo acá suman
// exactamente lo mismo que "Leads por tipo"/"CPL por tipo" del resumen del mes.

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { objectiveColor } from "@/lib/reporting/mockInvestmentCalendar";
import { ChartInsightPanel } from "@/components/admin/reporting/ChartInsightPanel";

type Gender = "mujeres" | "hombres";

const GENDERS: Gender[] = ["mujeres", "hombres"];

const GENDER_LABEL: Record<Gender, string> = {
  mujeres: "Mujeres",
  hombres: "Hombres",
};

const GENDER_COLOR: Record<Gender, string> = {
  mujeres: "#db2777", // pink-600
  hombres: "#2563eb", // blue-600
};

// Orden canónico de los rangos etarios que devuelve Meta — sólo se muestran las columnas que
// realmente aparecen en los datos (una cuenta que sólo le apunta a 25+ nunca va a tener 18-24).
const AGE_RANGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

function compareAgeRanges(a: string, b: string): number {
  const ia = AGE_RANGE_ORDER.indexOf(a);
  const ib = AGE_RANGE_ORDER.indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b);
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

const BAR_AREA_HEIGHT = 112; // px — alto del área de barras (sin contar el recuadro de debajo)

interface AudienceSegmentTotals {
  gender: Gender;
  ageRange: string;
  objectiveLeads: number[];
  objectiveSpend: number[];
}

export function AudienceAnalysis({
  segments,
  objectiveLabels,
  currency,
  monthIsComplete,
  clientId,
}: {
  /** Un elemento por cada combinación género+rango etario con datos este mes — ver lib/reporting/metaInvestmentData.ts. */
  segments: AudienceSegmentTotals[];
  /** Leyenda de cada Objetivo, en orden (índice alineado con objectiveLeads/objectiveSpend de cada segmento). */
  objectiveLabels: string[];
  currency: string;
  /** true cuando el mes seleccionado ya terminó — se le pasa a ChartInsightPanel para que la ruta de insights sólo cachee en ese caso (ver InvestmentCalendar.tsx). */
  monthIsComplete: boolean;
  clientId: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const objectiveMonthLeads = useMemo(() => {
    const totals = objectiveLabels.map(() => 0);
    for (const s of segments) {
      s.objectiveLeads.forEach((value, i) => {
        totals[i] = (totals[i] ?? 0) + value;
      });
    }
    return totals;
  }, [segments, objectiveLabels]);

  const visibleIndexes = useMemo(
    () => objectiveLabels.map((_, i) => i).filter((i) => (objectiveMonthLeads[i] ?? 0) > 0),
    [objectiveLabels, objectiveMonthLeads]
  );

  // Si el Objetivo seleccionado deja de estar visible (cambió el mes, o dejó de tener leads), cae
  // al primero visible en vez de quedarse mostrando un desglose vacío.
  useEffect(() => {
    if (visibleIndexes.length > 0 && !visibleIndexes.includes(selectedIndex)) {
      setSelectedIndex(visibleIndexes[0]!);
    }
  }, [visibleIndexes, selectedIndex]);

  const ageRanges = useMemo(
    () => Array.from(new Set(segments.map((s) => s.ageRange))).sort(compareAgeRanges),
    [segments]
  );

  const typeLeads = objectiveMonthLeads[selectedIndex] ?? 0;
  const typeSpend = useMemo(
    () => segments.reduce((sum, s) => sum + (s.objectiveSpend[selectedIndex] ?? 0), 0),
    [segments, selectedIndex]
  );
  const avgCpl = typeLeads > 0 ? typeSpend / typeLeads : 0;
  const selectedColor = objectiveColor(selectedIndex);

  const maxLeads = Math.max(...segments.map((s) => s.objectiveLeads[selectedIndex] ?? 0), 1);

  // Totales combinados (Mujeres + Hombres) por rango etario, para el recuadro debajo de cada
  // grupo de barras — la altura de las barras sigue mostrando el desglose por género.
  const combinedByAge = useMemo(() => {
    const map = new Map<string, { leads: number; spend: number }>();
    for (const ageRange of ageRanges) map.set(ageRange, { leads: 0, spend: 0 });
    for (const s of segments) {
      const entry = map.get(s.ageRange);
      if (entry) {
        entry.leads += s.objectiveLeads[selectedIndex] ?? 0;
        entry.spend += s.objectiveSpend[selectedIndex] ?? 0;
      }
    }
    return map;
  }, [segments, ageRanges, selectedIndex]);

  const genderTotals = useMemo(() => {
    const totals: Record<Gender, { leads: number; spend: number }> = {
      mujeres: { leads: 0, spend: 0 },
      hombres: { leads: 0, spend: 0 },
    };
    for (const s of segments) {
      totals[s.gender].leads += s.objectiveLeads[selectedIndex] ?? 0;
      totals[s.gender].spend += s.objectiveSpend[selectedIndex] ?? 0;
    }
    return totals;
  }, [segments, selectedIndex]);

  const insightMetrics = useMemo(() => {
    const withLeads = segments
      .map((s) => ({
        gender: s.gender,
        ageRange: s.ageRange,
        leads: s.objectiveLeads[selectedIndex] ?? 0,
        spend: s.objectiveSpend[selectedIndex] ?? 0,
      }))
      .filter((s) => s.leads > 0)
      .map((s) => ({ ...s, cpl: s.spend / s.leads }));
    if (withLeads.length === 0) return null;

    const masVolumen = [...withLeads].sort((a, b) => b.leads - a.leads)[0] ?? null;
    const masEficiente = [...withLeads].sort((a, b) => a.cpl - b.cpl)[0] ?? null;
    const menosEficiente = [...withLeads].sort((a, b) => b.cpl - a.cpl)[0] ?? null;
    const totalLeads = typeLeads > 0 ? typeLeads : 1;

    return {
      tipoCampania: objectiveLabels[selectedIndex] ?? "",
      cplPromedio: formatCurrency(avgCpl, currency, 2),
      leadsTotales: formatNumber(typeLeads),
      splitGenero: {
        mujeres: formatPercent(genderTotals.mujeres.leads / totalLeads),
        hombres: formatPercent(genderTotals.hombres.leads / totalLeads),
      },
      segmentos: withLeads.map((s) => ({
        genero: GENDER_LABEL[s.gender],
        rango: s.ageRange,
        leads: formatNumber(s.leads),
        inversion: formatCurrency(s.spend, currency),
        cpl: formatCurrency(s.cpl, currency, 2),
      })),
      masVolumen: masVolumen
        ? { segmento: `${GENDER_LABEL[masVolumen.gender]} ${masVolumen.ageRange}`, leads: formatNumber(masVolumen.leads) }
        : null,
      masEficiente: masEficiente
        ? { segmento: `${GENDER_LABEL[masEficiente.gender]} ${masEficiente.ageRange}`, cpl: formatCurrency(masEficiente.cpl, currency, 2) }
        : null,
      menosEficiente: menosEficiente
        ? {
            segmento: `${GENDER_LABEL[menosEficiente.gender]} ${menosEficiente.ageRange}`,
            cpl: formatCurrency(menosEficiente.cpl, currency, 2),
          }
        : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segments, selectedIndex, objectiveLabels, avgCpl, typeLeads, genderTotals, currency]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
        <div>
          <CardTitle className="text-lg font-bold text-foreground">Quién responde a los anuncios</CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {GENDERS.map((gender) => (
              <span key={gender} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: GENDER_COLOR[gender] }} /> {GENDER_LABEL[gender]}
              </span>
            ))}
            {typeLeads > 0 && <span>CPL promedio: {formatCurrency(avgCpl, currency, 2)}</span>}
          </div>
        </div>

        {visibleIndexes.length > 0 && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-[11px] text-muted-foreground">Tipo de conversión:</span>
            <div className="flex items-center gap-1 rounded-md bg-muted p-1">
              {visibleIndexes.map((idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={cn(
                    "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                    selectedIndex === idx ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {objectiveLabels[idx]}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {visibleIndexes.length === 0 || ageRanges.length === 0 ? (
          <p className="text-xs text-muted-foreground">Todavía no hay leads este mes.</p>
        ) : (
          <div className="flex items-end justify-between gap-2 sm:gap-4">
            {ageRanges.map((ageRange) => {
              const rowSegments = segments.filter((s) => s.ageRange === ageRange);
              const combined = combinedByAge.get(ageRange) ?? { leads: 0, spend: 0 };
              const combinedCpl = combined.leads > 0 ? combined.spend / combined.leads : null;

              return (
                <div key={ageRange} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex w-full items-end justify-center gap-1.5" style={{ height: BAR_AREA_HEIGHT }}>
                    {GENDERS.map((gender) => {
                      const segment = rowSegments.find((s) => s.gender === gender);
                      const leads = segment?.objectiveLeads[selectedIndex] ?? 0;
                      const color = GENDER_COLOR[gender];
                      const heightPct = leads > 0 ? Math.max(6, Math.round((leads / maxLeads) * 100)) : 0;
                      return (
                        <div key={gender} className="flex h-full w-full max-w-[30px] flex-col items-center justify-end gap-1">
                          <span className="text-[10px] font-medium tabular-nums text-foreground">{formatNumber(leads)}</span>
                          <div className="w-full rounded-t-sm" style={{ height: `${heightPct}%`, backgroundColor: color }} />
                        </div>
                      );
                    })}
                  </div>

                  <span className="text-xs font-semibold text-foreground">{ageRange}</span>

                  <div className="flex w-full flex-col items-center gap-0.5 rounded-md border border-border bg-muted/40 px-1.5 py-1.5 text-center">
                    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-foreground">
                      {combinedCpl !== null ? formatCurrency(combinedCpl, currency, 2) : "0"}
                    </span>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">CPL</span>
                    <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                      {formatCurrency(combined.spend, currency)}
                    </span>
                    <span className="whitespace-nowrap text-[10px] leading-tight text-muted-foreground">
                      {formatNumber(combined.leads)} leads
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {insightMetrics && (
          <ChartInsightPanel
            chart="audience"
            metrics={insightMetrics}
            accentColor={selectedColor}
            monthIsComplete={monthIsComplete}
            clientId={clientId}
          />
        )}
      </CardContent>
    </Card>
  );
}
