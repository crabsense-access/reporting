import Anthropic from "@anthropic-ai/sdk";

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY.");
  }

  cachedClient = new Anthropic();
  return cachedClient;
}

/**
 * Pausa manual de llamadas a la API de Anthropic (ANTHROPIC_PAUSED=true en .env.local) — para
 * cuando se acaban los créditos/cupo y se quiere seguir usando el resto del dashboard sin que
 * cada carga de página o "Generar informe" intente pegarle a la API. Mientras está pausado:
 *  - Los insights de gráficos (ver app/api/reporting/chart-insights/route.ts) devuelven el
 *    último contenido generado, cacheado a mano en lib/reports/chartInsightFallbacks.ts, en vez
 *    de pedirle uno nuevo a Claude.
 *  - La generación de informes completos (ver lib/reports/generate.ts) se corta al toque con un
 *    mensaje claro, sin intentar la llamada ni crear una fila en "reports".
 * Para reactivar: borrar la variable o ponerla en "false" en .env.local y reiniciar el server.
 */
export function isAnthropicPaused(): boolean {
  return process.env.ANTHROPIC_PAUSED === "true";
}
