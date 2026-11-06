"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Label } from "@/components/ui/label";
import { listGoogleAdsAccountsAction } from "@/app/admin/(dashboard)/clients/googleAdsActions";
import { formatGoogleAdsCustomerId } from "@/lib/google-ads/config";
import type { GoogleAdsAccountOption } from "@/lib/google-ads/accounts";

/**
 * Combo "Cuenta de Google Ads" del Admin (alta de cliente y detalle): lista las cuentas a las que
 * tiene acceso access@crabsense.com y devuelve el Customer ID (sin guiones) y el nombre elegidos.
 */
export function GoogleAdsAccountSelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (customerId: string, accountName: string | null) => void;
}) {
  const [accounts, setAccounts] = useState<GoogleAdsAccountOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force: boolean) => {
    setLoading(true);
    setError(null);
    const result = await listGoogleAdsAccountsAction(force);
    setAccounts(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const current = value ? accounts?.find((account) => account.id === value) : undefined;
  // La cuenta guardada ya no aparece entre las accesibles: se muestra igual para no perderla.
  const missing = Boolean(value) && accounts !== null && !current;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Cuenta de Google Ads</Label>
      <div className="flex items-center gap-2">
        <select
          id={id}
          value={value}
          disabled={loading && accounts === null}
          onChange={(event) => {
            const selected = accounts?.find((account) => account.id === event.target.value);
            onChange(event.target.value, selected?.name ?? null);
          }}
          className="h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
        >
          <option value="">
            {loading && accounts === null ? "Cargando cuentas…" : "Seleccioná una cuenta"}
          </option>
          {missing && (
            <option value={value}>
              {formatGoogleAdsCustomerId(value)} — sin acceso desde access@crabsense.com
            </option>
          )}
          {accounts?.map((account) => (
            <option key={account.id} value={account.id} disabled={!account.available}>
              {account.name ?? "Sin nombre"} — {formatGoogleAdsCustomerId(account.id)}
              {account.currency ? ` (${account.currency})` : ""}
              {account.available ? "" : " · no disponible"}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={loading}
          title="Actualizar lista de cuentas"
          aria-label="Actualizar lista de cuentas"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : missing ? (
        <p className="text-xs text-destructive">
          access@crabsense.com no tiene acceso a la cuenta guardada. Pedile al cliente que agregue a
          access@crabsense.com como usuario de su cuenta de Google Ads, o elegí otra cuenta.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Cuentas de Google Ads a las que tiene acceso access@crabsense.com. Si no aparece la del
          cliente, pedile que agregue a access@crabsense.com como usuario de su cuenta y tocá actualizar.
        </p>
      )}
    </div>
  );
}
