-- ============================================================================
-- Client Dashboards — schema inicial
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------

create type data_source_type as enum (
  'ga4',
  'search_console',
  'google_ads',
  'meta_ads',
  'linkedin_ads'
);

create type connection_type as enum (
  'service_account',
  'oauth_agency',
  'oauth_client'
);

-- ----------------------------------------------------------------------------
-- Tablas
-- ----------------------------------------------------------------------------

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table client_users (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (client_id, email)
);

create table data_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  source_type data_source_type not null,
  connection_type connection_type not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index client_users_client_id_idx on client_users (client_id);
create index client_users_email_idx on client_users (email);
create index data_sources_client_id_idx on data_sources (client_id);

-- ----------------------------------------------------------------------------
-- Funciones helper para RLS (security definer: leen las tablas de control de
-- acceso sin quedar atrapadas por las políticas que ellas mismas alimentan).
-- ----------------------------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admins where email = auth.jwt() ->> 'email'
  );
$$;

create or replace function client_id_for_email()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from client_users where email = auth.jwt() ->> 'email' limit 1;
$$;

grant execute on function is_admin() to authenticated;
grant execute on function client_id_for_email() to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table admins enable row level security;
alter table clients enable row level security;
alter table client_users enable row level security;
alter table data_sources enable row level security;

-- admins: el equipo interno puede administrar la tabla; cualquier usuario
-- autenticado puede leer únicamente su propio registro (lo usa el middleware
-- para resolver a qué panel redirigir después del login).
create policy "admins read own row"
  on admins for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

create policy "admins manage everything"
  on admins for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- clients: los admins tienen control total; un cliente puede leer únicamente
-- su propio registro.
create policy "clients admin manage"
  on clients for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "clients read own"
  on clients for select
  to authenticated
  using (id = client_id_for_email());

-- client_users: los admins gestionan la lista blanca; cualquier usuario
-- autenticado puede leer su propio registro (mismo motivo que en admins).
create policy "client_users read own row"
  on client_users for select
  to authenticated
  using (email = auth.jwt() ->> 'email');

create policy "client_users admin manage"
  on client_users for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- data_sources: los admins tienen control total; un cliente solo puede leer
-- las fuentes de datos que pertenecen a su client_id.
create policy "data_sources admin manage"
  on data_sources for all
  to authenticated
  using (is_admin())
  with check (is_admin());

create policy "data_sources read own"
  on data_sources for select
  to authenticated
  using (client_id = client_id_for_email());
