-- ============================================================================
-- Control de acceso (octubre 2026)
--
-- 1. Admin único: sólo access@crabsense.com puede usar /admin y escribir en
--    las tablas de configuración. is_admin() deja de leer la tabla `admins`
--    (que queda sin uso) y compara contra ese email fijo, igual que
--    ADMIN_EMAIL en lib/auth/roles.ts.
-- 2. Un mismo email puede estar habilitado en varios clientes: las policies
--    dejan de usar client_id_for_email() (devolvía un solo cliente) y pasan a
--    client_ids_for_email() (todos los clientes del email).
-- 3. Emails sin distinguir mayúsculas: se pasan a minúsculas los existentes,
--    se exige minúsculas en los nuevos y las comparaciones usan lower().
--
-- Se aplica una sola vez desde el SQL Editor de Supabase. Es idempotente.
-- ============================================================================

-- 3. Normalizar emails existentes. Primero se borran los duplicados que van a
-- aparecer al pasar a minúsculas (mismo cliente, mismo email con distinta
-- capitalización) para no chocar con unique (client_id, email).
delete from client_users a
  using client_users b
  where a.client_id = b.client_id
    and lower(trim(a.email)) = lower(trim(b.email))
    and a.created_at > b.created_at;

update client_users set email = lower(trim(email)) where email <> lower(trim(email));

alter table client_users drop constraint if exists client_users_email_lowercase;
alter table client_users
  add constraint client_users_email_lowercase check (email = lower(trim(email)));

-- 1. Admin único.
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'access@crabsense.com';
$$;

-- 2. Todos los clientes de un email.
create or replace function client_ids_for_email()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from client_users
  where email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

grant execute on function client_ids_for_email() to authenticated;

drop policy if exists "clients read own" on clients;
create policy "clients read own"
  on clients for select
  to authenticated
  using (id in (select client_ids_for_email()));

drop policy if exists "data_sources read own" on data_sources;
create policy "data_sources read own"
  on data_sources for select
  to authenticated
  using (client_id in (select client_ids_for_email()));

drop policy if exists "client_users read own row" on client_users;
create policy "client_users read own row"
  on client_users for select
  to authenticated
  using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

-- dashboard_insights (0002) usaba client_id_for_email(); si la tabla todavía
-- existe en esta base, se actualizan sus policies a la versión multi-cliente.
do $$
begin
  if to_regclass('public.dashboard_insights') is not null then
    execute 'drop policy if exists "dashboard_insights client read own" on dashboard_insights';
    execute 'drop policy if exists "dashboard_insights client insert own" on dashboard_insights';
    execute 'drop policy if exists "dashboard_insights client update own" on dashboard_insights';
    execute 'create policy "dashboard_insights client read own" on dashboard_insights for select to authenticated using (client_id in (select client_ids_for_email()))';
    execute 'create policy "dashboard_insights client insert own" on dashboard_insights for insert to authenticated with check (client_id in (select client_ids_for_email()))';
    execute 'create policy "dashboard_insights client update own" on dashboard_insights for update to authenticated using (client_id in (select client_ids_for_email())) with check (client_id in (select client_ids_for_email()))';
  end if;
end $$;

-- client_id_for_email() queda definida (por compatibilidad) pero ninguna
-- policy de este proyecto la usa.
