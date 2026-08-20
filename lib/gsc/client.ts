import { google, type searchconsole_v1 } from "googleapis";

let cachedClient: searchconsole_v1.Searchconsole | null = null;

// Mismo Service Account que GA4 (GA4_SERVICE_ACCOUNT_EMAIL /
// GA4_SERVICE_ACCOUNT_PRIVATE_KEY), pedido con el scope de Search Console en
// vez del de Analytics.
export function getGSCClient(): searchconsole_v1.Searchconsole {
  if (cachedClient) return cachedClient;

  const clientEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GA4_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error(
      "Faltan las credenciales del Service Account (GA4_SERVICE_ACCOUNT_EMAIL / GA4_SERVICE_ACCOUNT_PRIVATE_KEY), que también se usan para Search Console."
    );
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  cachedClient = google.searchconsole({ version: "v1", auth });
  return cachedClient;
}
