import type { ReactNode } from "react";
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportContent, ReportMetric, ReportSection, ReportSentiment } from "@/lib/reports/types";

interface ReportInfographicProps {
  content: ReportContent;
  clientName: string;
  createdAt: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  actions?: ReactNode;
}

const SENTIMENT_STYLES: Record<ReportSentiment, { text: string; icon: typeof TrendingUp }> = {
  positivo: { text: "text-emerald-700", icon: TrendingUp },
  negativo: { text: "text-red-600", icon: TrendingDown },
  neutral: { text: "text-muted-foreground", icon: Minus },
};

function MetricTile({ metric }: { metric: ReportMetric }) {
  const sentiment = metric.sentimiento ? SENTIMENT_STYLES[metric.sentimiento] : null;
  const SentimentIcon = sentiment?.icon;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4">
      <span className="text-sm text-muted-foreground">{metric.label}</span>
      <span className="text-3xl font-semibold text-foreground">{metric.valor}</span>
      {metric.variacion && (
        <span className={`flex items-center gap-1 text-sm font-medium ${sentiment?.text ?? "text-muted-foreground"}`}>
          {SentimentIcon && <SentimentIcon className="h-4 w-4" />}
          {metric.variacion}
        </span>
      )}
    </div>
  );
}

function SectionCard({ section }: { section: ReportSection }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{section.titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        {section.tipo === "metricas" && section.metricas && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {section.metricas.map((metric, index) => (
              <MetricTile key={index} metric={metric} />
            ))}
          </div>
        )}

        {section.tipo === "texto" && section.texto && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{section.texto}</p>
        )}

        {section.tipo === "ranking" && section.items && (
          <ol className="flex flex-col divide-y divide-border">
            {section.items.map((item, index) => (
              <li key={index} className="flex items-center gap-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
                  {index + 1}
                </span>
                <span className="flex-1 text-sm text-foreground">{item.nombre}</span>
                <span className="text-sm font-medium text-foreground">{item.valor}</span>
              </li>
            ))}
          </ol>
        )}

        {section.tipo === "comparacion" && section.comparaciones && (
          <div className="flex flex-col divide-y divide-border">
            {section.comparaciones.map((item, index) => (
              <div key={index} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm text-foreground">{item.etiqueta}</span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{item.anterior}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{item.actual}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReportInfographic({
  content,
  clientName,
  createdAt,
  dateRangeStart,
  dateRangeEnd,
  actions,
}: ReportInfographicProps) {
  const createdAtLabel = new Date(createdAt).toLocaleString("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{clientName}</p>
          <h1 className="text-3xl font-semibold text-foreground">{content.titulo}</h1>
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <p>Informe generado el {createdAtLabel}</p>
            <p>
              Período analizado: {dateRangeStart} – {dateRangeEnd}
            </p>
          </div>
        </div>
        {actions}
      </div>

      <Card className="border-primary/30 bg-accent">
        <CardContent className="py-5 text-base leading-relaxed text-accent-foreground">
          {content.resumenEjecutivo}
        </CardContent>
      </Card>

      {content.secciones.map((section, index) => (
        <SectionCard key={index} section={section} />
      ))}
    </div>
  );
}
