"use client";

// "Performance por campaña / grupo de anuncios / anuncio" — tabla del bloque Facturación (sólo
// clientes ecommerce, ver EcommerceBlock en InvestmentCalendar.tsx). Mismo look que "Análisis de
// campañas": nombre + barra de participación en la facturación a la izquierda, métricas a la
// derecha. La dimensión se elige con el combo y el título cambia con ella. Datos: ver
// fetchEntityPerformance en lib/reporting/metaInvestmentData.ts.

import { useEffect, useState } from "react";

import { formatCurrency, formatNumber } from "@/lib/format";

type Dimension = "campaign" | "adset" | "ad";

interface EntityPerformance {
  id: string;
  name: string;
  spend: number;
  reach: number;
  impressions: number;
  clicks: number;
  results: number;
  purchases: number;
  revenue: number;
}

const DIMENSION_LABEL: Record<Dimension, { option: string; title: string }> = {
  campaign: { option: "Campaña", title: "Performance por campaña" },
  adset: { option: "Grupo de anuncios", title: "Performance por grupo de anuncios" },
  ad: { option: "Anuncio", title: "Performance por anuncio" },
};

const BAR_COLOR = "#16a34a";
const COLUMNS = [
  "Alcance",
  "Impresiones",
  "Clicks",
  "Resultados",
  "Costo por resultado",
  "Facturación total",
  "ROAS",
  "Ticket promedio",
];
// Columnas de ancho fijo e igual, con título y valores centrados (a pedido de Martín).
const GRID_COLUMNS = `repeat(${COLUMNS.length}, 108px)`;

export function EcommercePerformanceTable({
  clientId,
  month,
  currency,
}: {
  clientId: string;
  /** yyyy-MM */
  month: string;
  currency: string;
}) {
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [entities, setEntities] = useState<EntityPerformance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntities(null);
    setError(null);
    fetch(`/api/clients/${clientId}/entity-performance?month=${month}&dimension=${dimension}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "No se pudo cargar la performance.");
        return body.entities as EntityPerformance[];
      })
      .then((rows) => {
        if (!cancelled) setEntities(rows);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, month, dimension]);

  // La barra muestra el peso de cada fila en la facturación total (ya no hay columna de inversión).
  const maxRevenue = Math.max(...(entities ?? []).map((e) => e.revenue), 1);
  const money = (v: number) => formatCurrency(Math.round(v), currency);
  const roasText = (v: number) => `${v.toLocaleString("es-AR", { maximumFractionDigits: 2 })}x`;

  return (
    <div className="flex flex-col gap-4 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-lg font-bold text-foreground">{DIMENSION_LABEL[dimension].title}</span>
        <select
          aria-label="Dimensión"
          value={dimension}
          onChange={(event) => setDimension(event.target.value as Dimension)}
          className="h-8 w-[220px] rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {(Object.keys(DIMENSION_LABEL) as Dimension[]).map((d) => (
            <option key={d} value={d}>
              {DIMENSION_LABEL[d].option}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : entities === null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : entities.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay datos con inversión este mes.</p>
      ) : (
        // Con 10 columnas de métricas la tabla no entra en pantallas angostas: scroll horizontal
        // en vez de apretar los números.
        <div className="overflow-x-auto">
          <div className="flex min-w-[1150px] flex-col gap-3.5">
            <div className="flex items-end gap-4">
              <span className="min-w-[220px] flex-1" />
              <div
                className="grid shrink-0 items-end gap-x-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                style={{ gridTemplateColumns: GRID_COLUMNS }}
              >
                {COLUMNS.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
            </div>

            {entities.map((e) => {
              const widthPct = e.revenue > 0 ? Math.max(4, Math.round((e.revenue / maxRevenue) * 100)) : 0;
              const costPerResult = e.results > 0 ? e.spend / e.results : null;
              const roas = e.spend > 0 ? e.revenue / e.spend : null;
              const ticket = e.purchases > 0 ? e.revenue / e.purchases : null;
              return (
                <div key={e.id} className="flex items-center gap-4">
                  <div className="flex min-w-[220px] flex-1 flex-col gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: BAR_COLOR }} />
                      <span className="truncate" title={e.name}>
                        {e.name}
                      </span>
                    </span>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${widthPct}%`, backgroundColor: BAR_COLOR }} />
                    </div>
                  </div>
                  <div
                    className="grid shrink-0 gap-x-2 text-center text-xs tabular-nums"
                    style={{ gridTemplateColumns: GRID_COLUMNS }}
                  >
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(e.reach)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(e.impressions)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{formatNumber(e.clicks)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{formatNumber(e.results)}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{costPerResult !== null ? money(costPerResult) : "s/d"}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{money(e.revenue)}</span>
                    <span className="whitespace-nowrap font-semibold text-foreground">{roas !== null ? roasText(roas) : "s/d"}</span>
                    <span className="whitespace-nowrap text-muted-foreground">{ticket !== null ? money(ticket) : "s/d"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
