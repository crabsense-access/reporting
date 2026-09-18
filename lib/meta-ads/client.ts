// Marketing API REST tradicional (no el MCP — ver lib/meta-ads/mcp-client.ts
// para el motivo: Meta todavía no habilitó el permiso ads_mcp_management
// para la Business de la agencia). Antes usaba una sola credencial de
// agencia (System User token) para todos los clientes; ahora cada cliente
// puede tener su propio System User token (guardado en
// data_sources.config.system_user_token, ver MetaAdsConfig en lib/types.ts)
// para no depender de que el cliente comparta su cuenta con el Business
// Manager de la agencia. El param `token` es opcional y, si no se pasa, cae
// al token de agencia (env var META_ADS_SYSTEM_USER_TOKEN) — eso mantiene
// funcionando a lib/reports/tools.ts (todavía no migrado a token por cliente).
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

export async function fetchMetaGraphApi<T>(
  path: string,
  params: Record<string, string>,
  clientToken?: string
): Promise<T> {
  const token = clientToken || process.env.META_ADS_SYSTEM_USER_TOKEN;
  if (!token) {
    throw new Error(
      "Falta un token de Meta Ads para este cliente. Configurá un System User token propio del cliente en su ficha, o definí la variable de entorno META_ADS_SYSTEM_USER_TOKEN como token de agencia por defecto."
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
