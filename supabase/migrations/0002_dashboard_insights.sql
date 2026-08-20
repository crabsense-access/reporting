-- ============================================================================
-- Caché de insights generados por LLM (ver lib/insights/llm-client.ts) — un
-- insight por (cliente, tablero, métrica, rango de fechas, evento de
-- conversión) se genera una vez y se reusa durante 24hs, en vez de llamar al
-- modelo en cada carga de página. El botón "Generar insights" del tablero
-- fuerza una regeneración salteando el caché.
-- ============================================================================

create table dashboard_insights (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  -- Identifica de qué tablero viene (ej. 'meta_ads_overview',
  -- 'meta_ads_costs') — el mismo cliente puede tener insights de la misma
  -- métrica en más de un tablero.
  dashboard text not null,
  metric_key text not null,
  range_from date not null,
  range_to date not null,
  -- '' cuando el tablero no tiene selector de evento de conversión (todo lo
  -- que no sea Meta Ads, por ahora) — nunca null, para que la unicidad de
  -- abajo funcione sin sorpresas (NULL != NULL en SQL).
  conversion_event text not null default '',
  insight_text text not null,
  sentiment text not null check (sentiment in ('positive', 'negative', 'neutral')),
  model text not null,
  generated_at timestamptz not null default now(),
  unique (client_id, dashboard, metric_key, range_from, range_to, conversion_event)
);

create index dashboard_insights_client_id_idx on dashboard_insights (client_id);

alter table dashboard_insights enable row level security;

-- Mismo patrón que data_sources: admins con control total, y el cliente
-- dueño de esos insights puede leer y también generar/regenerar los suyos
-- (la escritura ocurre desde su propia carga de página, no hay un rol de
-- servicio separado en este proyecto todavía).
create policy "dashboard_insights admin manage"
  on dashboard_insights for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "dashboard_insights client read own"
  on dashboard_insights for select
  to authenticated
  using (client_id = client_id_for_email());

create policy "dashboard_insights client insert own"
  on dashboard_insights for insert
  to authenticated
  with check (client_id = client_id_for_email());

create policy "dashboard_insights client update own"
  on dashboard_insights for update
  to authenticated
  using (client_id = client_id_for_email())
  with check (client_id = client_id_for_email());
