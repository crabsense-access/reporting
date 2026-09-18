import { PLATFORM_LABELS, type ReportPlatform } from "@/lib/reports/platforms";

export interface PlatformObjective {
  principal: string;
  secundario?: string;
}

// Arma el mensaje que se le manda a Claude (y que se guarda como `reports.prompt_text`)
// concatenando el Rol, los objetivos por plataforma y las instrucciones de período en texto
// legible. Si una plataforma seleccionada no tiene objetivo principal cargado, se omite su
// línea (no inventa nada).
export function buildPromptMessage(
  rol: string,
  selectedPlatforms: ReportPlatform[],
  objetivos: Partial<Record<ReportPlatform, PlatformObjective>>,
  periodoInstrucciones: string,
  reglaPrincipal: string,
  formatoEntregable: string,
  estructuraFinal: string,
  metricasInsights: Partial<Record<ReportPlatform, string>>,
  formatoInsight: string,
  priorizacion: string,
  reglas: string,
  top10Acciones: string,
  principioFinal: string,
  dateRangeStart: string,
  dateRangeEnd: string
): string {
  const lines: string[] = [rol.trim()];

  const objectiveLines = selectedPlatforms
    .map((platform) => {
      const objective = objetivos[platform];
      const principal = objective?.principal?.trim();
      if (!principal) return null;

      const label = PLATFORM_LABELS[platform];
      const secundario = objective?.secundario?.trim();
      return secundario
        ? `Objetivo en ${label}: ${principal}. Objetivo secundario: ${secundario}.`
        : `Objetivo en ${label}: ${principal}.`;
    })
    .filter((line): line is string => Boolean(line));

  if (objectiveLines.length > 0) {
    lines.push("", "Objetivos por plataforma:", ...objectiveLines);
  }

  const trimmedPeriodoInstrucciones = periodoInstrucciones.trim();
  const periodoLines = [`Rango de fechas seleccionado: ${dateRangeStart} a ${dateRangeEnd}.`];
  if (trimmedPeriodoInstrucciones) {
    periodoLines.push("", trimmedPeriodoInstrucciones);
  }
  lines.push("", "Instrucciones sobre el período a analizar:", ...periodoLines);

  const trimmedReglaPrincipal = reglaPrincipal.trim();
  if (trimmedReglaPrincipal) {
    lines.push("", "Regla principal del análisis:", trimmedReglaPrincipal);
  }

  const trimmedFormatoEntregable = formatoEntregable.trim();
  if (trimmedFormatoEntregable) {
    lines.push("", "Formato del entregable:", trimmedFormatoEntregable);
  }

  const trimmedEstructuraFinal = estructuraFinal.trim();
  if (trimmedEstructuraFinal) {
    lines.push("", "Estructura final del informe:", trimmedEstructuraFinal);
  }

  const metricasInsightsEntries = selectedPlatforms
    .map((platform) => {
      const text = metricasInsights[platform]?.trim();
      return text ? { label: PLATFORM_LABELS[platform], text } : null;
    })
    .filter((entry): entry is { label: string; text: string } => entry !== null);

  if (metricasInsightsEntries.length > 0) {
    lines.push("", "Métricas & Insights por plataforma:");
    for (const { label, text } of metricasInsightsEntries) {
      lines.push("", `Qué mostrar en ${label}:`, text);
    }
  }

  const trimmedFormatoInsight = formatoInsight.trim();
  if (trimmedFormatoInsight) {
    lines.push("", "Formato de cada insight:", trimmedFormatoInsight);
  }

  const trimmedPriorizacion = priorizacion.trim();
  if (trimmedPriorizacion) {
    lines.push("", "Criterio de priorización:", trimmedPriorizacion);
  }

  const trimmedReglas = reglas.trim();
  if (trimmedReglas) {
    lines.push("", "Reglas obligatorias:", trimmedReglas);
  }

  const trimmedTop10Acciones = top10Acciones.trim();
  if (trimmedTop10Acciones) {
    lines.push("", "Acciones finales:", trimmedTop10Acciones);
  }

  const trimmedPrincipioFinal = principioFinal.trim();
  if (trimmedPrincipioFinal) {
    lines.push("", "Principio rector del análisis:", trimmedPrincipioFinal);
  }

  return lines.join("\n");
}
