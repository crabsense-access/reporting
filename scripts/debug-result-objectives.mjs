// Diagnóstico: qué devuelve Meta para derivar los tipos de Resultado de un cliente.
// Uso: node scripts/debug-result-objectives.mjs <slug-del-cliente>
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
);
const slug = process.argv[2] ?? "nu-canning";
const sb = async (path) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  return r.json();
};
const [client] = await sb(`clients?slug=eq.${slug}&select=id,name`);
if (!client) throw new Error(`No existe el cliente ${slug}`);
const [source] = await sb(`data_sources?client_id=eq.${client.id}&source_type=eq.meta_ads&select=config`);
const cfg = source.config;
const token = cfg.system_user_token || env.META_ADS_SYSTEM_USER_TOKEN;
console.log("Cliente:", client.name, "| cuenta:", cfg.ad_account_id, "| token propio:", Boolean(cfg.system_user_token));

const graph = async (path, params) => {
  const u = new URL(`https://graph.facebook.com/v21.0/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", token);
  const r = await fetch(u);
  const body = await r.json();
  if (!r.ok) console.log(`ERROR ${r.status} en ${path || "/?ids"}:`, JSON.stringify(body.error));
  return body;
};

const since = "2026-09-01", until = new Date().toISOString().slice(0, 10);
const ins = await graph(`${cfg.ad_account_id}/insights`, {
  level: "adset", time_range: JSON.stringify({ since, until }), fields: "adset_id,adset_name,spend", limit: "500",
});
console.log("\nConjuntos con gasto:", (ins.data ?? []).length);
for (const r of ins.data ?? []) console.log(" -", r.adset_id, r.adset_name, "$" + r.spend);

const ids = (ins.data ?? []).map((r) => r.adset_id).filter(Boolean);
console.log("\nObjetivo de optimización de cada conjunto:");
for (const id of ids) {
  const a = await graph(id, { fields: "name,optimization_goal,destination_type,promoted_object" });
  if (a && a.id) console.log(" -", a.name, "|", a.optimization_goal, "|", a.destination_type, "|", JSON.stringify(a.promoted_object ?? {}));
}
