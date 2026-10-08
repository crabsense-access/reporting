import { CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { REPORT_BLOCK_TITLES, type ReportBlockKey } from "@/lib/reporting/blockTitles";

/**
 * Título principal (h3, lo usa el menú lateral) + subtítulo opcional de un bloque del reporte.
 * Los textos salen de lib/reporting/blockTitles.ts; `title` permite pisar el título principal
 * cuando viene de otro lado (ej. el título del Google Sheet cargado en el Admin).
 */
export function BlockTitle({
  block,
  title,
  subtitle,
  className,
}: {
  block: ReportBlockKey;
  title?: string;
  /** Pisa el subtítulo de blockTitles.ts (ej. el que se carga en el Admin para el gráfico del Google Sheet). */
  subtitle?: string;
  className?: string;
}) {
  const entry: { title: string; subtitle?: string } = REPORT_BLOCK_TITLES[block];
  return (
    <div className="flex flex-col gap-1">
      <CardTitle className={cn("text-lg font-bold text-foreground", className)}>{title ?? entry.title}</CardTitle>
      {(subtitle ?? entry.subtitle) && <p className="text-sm text-muted-foreground">{subtitle ?? entry.subtitle}</p>}
    </div>
  );
}
