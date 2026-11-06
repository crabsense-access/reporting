import { GoogleAdsApi } from "google-ads-api";

import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";

/**
 * Credenciales OAuth de la cuenta de Google de la agencia (access@crabsense.com). El refresh token
 * es de esa cuenta, así que la API ve exactamente las cuentas de Google Ads a las que
 * access@crabsense.com tiene acceso directo como usuario. Ya no se pasa por una MCC: cada cuenta
 * se consulta directamente (sin login_customer_id).
 */
function getGoogleAdsCredentials() {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !developerToken || !refreshToken) {
    throw new Error(
      "Faltan las credenciales OAuth de Google Ads (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_REFRESH_TOKEN)."
    );
  }

  return { clientId, clientSecret, developerToken, refreshToken };
}

export function getGoogleAdsApi() {
  const { clientId, clientSecret, developerToken, refreshToken } = getGoogleAdsCredentials();
  const api = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
  return { api, refreshToken };
}

export function getGoogleAdsClient(customerId: string) {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);
  if (!normalizedCustomerId) {
    throw new Error("El customer_id de Google Ads es obligatorio.");
  }

  const { api, refreshToken } = getGoogleAdsApi();
  return api.Customer({
    customer_id: normalizedCustomerId,
    refresh_token: refreshToken,
  });
}
