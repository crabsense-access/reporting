// Marketing API REST tradicional (no el MCP — ver lib/meta-ads/mcp-client.ts
// para el motivo: Meta todavía no habilitó el permiso ads_mcp_management
// para la Business de la agencia). Mismo patrón que lib/google-ads/client.ts:
// una sola credencial de agencia (System User token, ads_read) reutilizada
// para todos los clientes, autenticando por request.
const META_GRAPH_API_VERSION = "v26.0";
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

export class MetaAdsAuthError extends Error {}
export class MetaAdsUnavailableError extends Error {}

interface MetaGraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

export async function fetchMetaGraphApi<T>(path: string, params: Record<string, string>): Promise<T> {
  const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
  if (!token) {
    throw new Error(
      "Falta la variable de entorno META_ADS_SYSTEM_USER_TOKEN (System User token de la agencia en Meta Business Manager)."
    );
  }

  const url = new URL(`${META_GRAPH_API_BASE}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", token);

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new MetaAdsUnavailableError("No se pudo conectar con la Marketing API de Meta (graph.facebook.com).");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as MetaGraphErrorBody | null;
    const metaError = body?.error;

    if (metaError?.code === 190 || metaError?.type === "OAuthException") {
      throw new MetaAdsAuthError(
        `El System User token de Meta Ads es inválido o expiró${metaError.message ? `: ${metaError.message}` : "."}`
      );
    }

    throw new MetaAdsUnavailableError(
      metaError?.message
        ? `Error de la Marketing API de Meta: ${metaError.message}`
        : `La Marketing API de Meta respondió con status ${response.status}.`
    );
  }

  return (await response.json()) as T;
}
