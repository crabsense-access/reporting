// Primer mes del Calendario de inversión que pueden ver los usuarios del cliente (client_users) —
// a pedido de Martín, por el momento sólo desde agosto 2026 (inclusive). Los meses anteriores se
// muestran grisados en el combo y la API los rechaza para no-admins. Los admins no tienen límite.
// Para habilitar más meses, cambiar sólo esta constante (formato yyyy-MM).
export const FIRST_CLIENT_VISIBLE_MONTH = "2026-08";

export function isMonthVisibleToClients(month: string): boolean {
  return month >= FIRST_CLIENT_VISIBLE_MONTH;
}
