import { BetaAnalyticsDataClient } from "@google-analytics/data";

let cachedClient: BetaAnalyticsDataClient | null = null;

export function getGA4Client(): BetaAnalyticsDataClient {
  if (cachedClient) return cachedClient;

  const clientEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Faltan las credenciales del Service Account de GA4 (GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY)."
    );
  }

  cachedClient = new BetaAnalyticsDataClient({
    credentials: {
      client_email: clientEmail,
      // En variables de entorno los saltos de línea suelen venir escapados.
      private_key: privateKey.replace(/\\n/g, "\n"),
    },
  });

  return cachedClient;
}
