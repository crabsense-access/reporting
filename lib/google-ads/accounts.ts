import { getGoogleAdsApi } from "@/lib/google-ads/client";

export interface GoogleAdsAccountOption {
  /** Customer ID sin guiones. */
  id: string;
  /** Nombre descriptivo de la cuenta en Google Ads (null si no se pudo leer). */
  name: string | null;
  currency: string | null;
  /** false si la cuenta está cancelada/suspendida o no se pudo consultar: no se puede conectar. */
  available: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; accounts: GoogleAdsAccountOption[] } | null = null;

/**
 * Cuentas de Google Ads a las que tiene acceso directo access@crabsense.com (dueño del refresh
 * token), para el combo del Admin. Las cuentas de administrador (MCC) se excluyen: no tienen
 * métricas propias y la conexión ahora es siempre a la cuenta, no a la MCC.
 */
export async function listAccessibleGoogleAdsAccounts(
  { force = false }: { force?: boolean } = {}
): Promise<GoogleAdsAccountOption[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.accounts;

  const { api, refreshToken } = getGoogleAdsApi();
  const { resource_names } = await api.listAccessibleCustomers(refreshToken);
  const ids = (resource_names ?? []).map((name) => name.split("/")[1]).filter((id): id is string => Boolean(id));

  const results = await mapWithConcurrency(ids, 8, async (id): Promise<GoogleAdsAccountOption | null> => {
    try {
      const customer = api.Customer({ customer_id: id, refresh_token: refreshToken });
      const rows = await customer.query(
        "SELECT customer.id, customer.descriptive_name, customer.manager, customer.status, customer.currency_code FROM customer LIMIT 1"
      );
      const info = rows[0]?.customer;
      if (info?.manager) return null;
      // status: 2 = ENABLED (enum numérico de la librería) o "ENABLED" según versión.
      const status = info?.status as unknown;
      const enabled = status === 2 || status === "ENABLED";
      return {
        id,
        name: info?.descriptive_name?.trim() || null,
        currency: info?.currency_code ?? null,
        available: enabled,
      };
    } catch {
      // Cuentas canceladas o sin permisos de lectura: se listan deshabilitadas para que se vean.
      return { id, name: null, currency: null, available: false };
    }
  });

  const accounts = results
    .filter((account): account is GoogleAdsAccountOption => account !== null)
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (a.name ?? a.id).localeCompare(b.name ?? b.id, "es", { sensitivity: "base" });
    });

  cache = { at: Date.now(), accounts };
  return accounts;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
