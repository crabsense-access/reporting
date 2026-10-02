// Primer mes del Calendario de inversión que se puede ver — a pedido de Martín, por el momento
// sólo desde agosto 2026 (inclusive), para TODOS (admins y usuarios del cliente). Los meses
// anteriores se muestran grisados (combo de mes y listado "Ver informes mensuales") y la API los rechaza.
// Para habilitar más meses, cambiar sólo esta constante (formato yyyy-MM).
export const FIRST_CLIENT_VISIBLE_MONTH = "2026-08";

export function isMonthVisibleToClients(month: string): boolean {
  return month >= FIRST_CLIENT_VISIBLE_MONTH;
}
