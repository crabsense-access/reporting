// Lee un campo de texto libre (primary_goal / secondary_goal) de la config de una fuente de
// datos — compartido por NewReportForm y Configuración v2 para precargar objetivos reales.
export function readGoalString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}
