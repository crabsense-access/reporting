import { GoogleAdsApi } from "google-ads-api";

import { normalizeGoogleAdsCustomerId } from "@/lib/google-ads/config";

export function getGoogleAdsClient(customerId: string) {
  const normalizedCustomerId = normalizeGoogleAdsCustomerId(customerId);

  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !developerToken || !loginCustomerId || !refreshToken) {
    throw new Error(
      "Faltan las credenciales OAuth de Google Ads (GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_LOGIN_CUSTOMER_ID, GOOGLE_ADS_REFRESH_TOKEN)."
    );
  }

  if (!normalizedCustomerId) {
    throw new Error("El customer_id de Google Ads es obligatorio.");
  }

  const googleAdsApi = new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });

  return googleAdsApi.Customer({
    customer_id: normalizedCustomerId,
    login_customer_id: loginCustomerId,
    refresh_token: refreshToken,
  });
}
