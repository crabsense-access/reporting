// PARKED — no se usa desde ningún código activo.
//
// Este archivo es el cliente MCP (Streamable HTTP) contra el servidor
// oficial de Meta Ads (https://mcp.facebook.com/ads), validado en vivo
// contra el servidor real:
//   - Sin token: 401 "Authentication Required".
//   - Con token inválido: 403 "Unauthorized Access".
//   - Con el System User token real (válido, con scope ads_read confirmado
//     por el Access Token Debugger de Meta): sigue dando 401. El header
//     WWW-Authenticate de esa respuesta reveló el motivo real:
//       scope="ads_management ads_read catalog_management business_management
//              pages_show_list instagram_basic ads_mcp_management"
//     Meta requiere el permiso `ads_mcp_management` específico para este
//     producto, que no apareció como opción al generar el System User token
//     (la Business todavía no está habilitada para otorgarlo — parece
//     requerir enrollment aparte en la beta, más allá de tener ads_read).
//
// lib/meta-ads/client.ts usa por ahora la Marketing API REST tradicional en
// su lugar (mismo patrón que lib/google-ads/client.ts). Cuando Meta habilite
// `ads_mcp_management` para la Business de la agencia:
//   1. Agregar el permiso al System User token y confirmarlo con el Access
//      Token Debugger.
//   2. Correr `listMetaAdsTools()` (abajo) contra el servidor real para ver
//      tools/list — los nombres reales de los tools de la familia Insights
//      todavía no se confirmaron, nunca se llegó a pasar el handshake de
//      auth.
//   3. Reemplazar la implementación de lib/meta-ads/client.ts +
//      lib/meta-ads/reports.ts por las llamadas MCP correspondientes,
//      documentando acá mismo (o donde termine viviendo el código) el
//      nombre exacto del tool y la forma real de su respuesta.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const META_ADS_MCP_URL = "https://mcp.facebook.com/ads";

export class MetaAdsMcpAuthError extends Error {}
export class MetaAdsMcpUnavailableError extends Error {}

// Abre una conexión MCP (Streamable HTTP) contra el servidor oficial de Meta
// Ads, autenticando con el System User token de la agencia. El caller es
// responsable de cerrar el client cuando termina (ver listMetaAdsTools).
async function connectMetaAdsMcpClient(): Promise<Client> {
  const token = process.env.META_ADS_SYSTEM_USER_TOKEN;
  if (!token) {
    throw new Error(
      "Falta la variable de entorno META_ADS_SYSTEM_USER_TOKEN (System User token de la agencia en Meta Business Manager)."
    );
  }

  const client = new Client({ name: "crb-client-dashboards", version: "1.0.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(META_ADS_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    await client.connect(transport);
  } catch (error) {
    if (error instanceof StreamableHTTPError && (error.code === 401 || error.code === 403)) {
      throw new MetaAdsMcpAuthError(
        "El System User token de Meta Ads es inválido, expiró, o le falta el permiso ads_mcp_management."
      );
    }
    // El MCP de Meta Ads está en beta pública (desde abril de 2026): puede
    // tener downtime o cambios de contrato sin aviso — no asumimos que un
    // fallo acá es necesariamente de autenticación.
    throw new MetaAdsMcpUnavailableError(
      "No se pudo conectar al servidor MCP de Meta Ads (mcp.facebook.com). Puede estar caído o haber cambiado su contrato — está en beta pública."
    );
  }

  return client;
}

// Discovery helper: lista los tools reales que expone el servidor, con su
// input/output schema. Usar esto (no asumir nombres) para confirmar cuáles
// son los tools de la familia "Insights" antes de cablear una implementación
// real sobre MCP.
export async function listMetaAdsTools() {
  const client = await connectMetaAdsMcpClient();
  try {
    return await client.listTools();
  } finally {
    await client.close();
  }
}
