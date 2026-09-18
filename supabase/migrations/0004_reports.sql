-- ============================================================================
-- NO APLICAR TODAVÍA (misma situación que 0003_drop_dashboard_insights.sql):
-- este proyecto comparte la base de Supabase con el proyecto anterior. Antes
-- de correr esta migración, revisar en el Table Editor del dashboard que no
-- exista ya una tabla `reports` de otro origen (nombre genérico).
--
-- Tabla para la funcionalidad "Informes por prompt": el admin escribe un
-- prompt libre + rango de fechas, Claude genera un informe con tool calling
-- contra las fuentes de datos conectadas del cliente, y el resultado
-- estructurado se guarda acá. Mismo patrón de RLS que `data_sources`: tabla
-- exclusivamente de admin, sin policy de client_id_for_email() porque no es
-- una tabla que un client_user deba leer.
-- ============================================================================

create type report_status as enum ('pending', 'generating', 'completed', 'failed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  prompt_text text not null,
  date_range_start date not null,
  date_range_end date not null,
  status report_status not null default 'pending',
  structured_content jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  created_by uuid not null references admins (id)
);

create index reports_client_id_idx on reports (client_id);

alter table reports enable row level security;

create policy "reports admin manage"
  on reports for all
  to authenticated
  using (is_admin())
  with check (is_admin());
