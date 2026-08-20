# Client Dashboards

Tableros de métricas multi-cliente para una agencia: cada cliente se loguea con Google
y ve únicamente su propio tablero (por ahora, métricas de Google Analytics 4). Un panel
de administración interno permite dar de alta clientes, configurar sus fuentes de datos
y gestionar qué emails tienen acceso.

## Stack

- Next.js (App Router) + TypeScript estricto
- Tailwind CSS + componentes accesibles estilo shadcn/ui (Radix UI)
- Supabase: Auth (Google) + Postgres, vía `@supabase/supabase-js` y `@supabase/ssr`

## Estructura

```
app/            rutas (landing, /admin, /dashboard, /auth/callback, /unauthorized)
components/     UI reutilizable (components/ui = primitivas, resto = features)
lib/            clientes de Supabase, tipos y utilidades
supabase/migrations/  SQL de schema + Row Level Security
```

## Poner el proyecto en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

```bash
cp .env.local.example .env.local
```

Completar en `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`: en el dashboard de
  Supabase → Project Settings → API.
- `SUPABASE_SERVICE_ROLE_KEY`: misma pantalla (clave con privilegios de administrador;
  no exponer al cliente ni commitear).
- `GA4_SERVICE_ACCOUNT_EMAIL` / `GA4_SERVICE_ACCOUNT_PRIVATE_KEY`: credenciales de la
  cuenta de servicio de Google con acceso de lectura a las propiedades de GA4 de los
  clientes. Todavía no se usan en el código (ver el TODO en
  `components/dashboard/MockGA4Dashboard.tsx`), pero quedan preparadas para la
  integración real con la Google Analytics Data API.

### 3. Configurar Supabase

En el proyecto de Supabase:

1. Habilitar el proveedor de Google en **Authentication → Providers**, con las
   credenciales OAuth de Google (Client ID / Secret) y agregando
   `<tu-dominio>/auth/callback` como Redirect URL (también `http://localhost:3000/auth/callback`
   para desarrollo).
2. Correr la migración de `supabase/migrations/0001_init.sql` — desde la CLI de
   Supabase (`supabase db push`) o pegando el contenido en el SQL Editor del proyecto.
   Crea las tablas `admins`, `clients`, `client_users`, `data_sources` y sus políticas
   de Row Level Security.
3. Dar de alta al primer admin manualmente (todavía no hay UI para esto, es el punto
   de entrada al panel):
   ```sql
   insert into admins (email, name) values ('tu-email@agencia.com', 'Tu nombre');
   ```

### 4. Correr en desarrollo

```bash
npm run dev
```

- `http://localhost:3000` — landing pública con login de Google.
- `http://localhost:3000/admin/login` — login del panel de administración.

## Notas sobre el estado actual

- El tablero de cliente (`/dashboard`) muestra métricas de ejemplo (mock). La
  integración real con la Google Analytics Data API queda marcada con un `TODO` en
  `components/dashboard/MockGA4Dashboard.tsx`.
- El resto de las fuentes de datos del enum (`search_console`, `google_ads`,
  `meta_ads`, `linkedin_ads`) están contempladas en el modelo de datos pero todavía
  sin UI ni integración — por ahora el alta de cliente solo configura GA4.
