import postgres from "postgres";

// One connection pool per process. Next's dev server reloads modules, so the
// pool is parked on globalThis to avoid leaking connections on every change.
const g = globalThis as unknown as { __aicSql?: ReturnType<typeof postgres>; __aicSchema?: Promise<void>; __aicSchemaText?: string };

export const sql =
  g.__aicSql ??
  (g.__aicSql = postgres(process.env.DATABASE_URL!, { max: 10, idle_timeout: 30 }));

const SCHEMA = `
create table if not exists users (
  id bigserial primary key,
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists apps (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null,
  icon_url text not null,
  position int not null default 0,
  current_version_id bigint,
  created_at timestamptz not null default now(),
  unique (user_id, slug)
);
create table if not exists app_versions (
  id bigserial primary key,
  app_id bigint not null references apps(id) on delete cascade,
  version int not null,
  code text not null,
  prompt text not null,
  model text not null,
  created_at timestamptz not null default now(),
  unique (app_id, version)
);
create table if not exists app_data (
  app_id bigint not null references apps(id) on delete cascade,
  key text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (app_id, key)
);
create table if not exists user_settings (
  user_id bigint primary key references users(id) on delete cascade,
  wallpaper_url text,
  dock_slugs text[] not null default '{}'
);
alter table apps add column if not exists deleted_at timestamptz;
alter table user_settings add column if not exists prefs jsonb not null default '{}'::jsonb;
`;

/** Applies the schema once per process, and again whenever it changes under a
 *  running dev server. Every statement is idempotent. */
export function ensureSchema(): Promise<void> {
  if (!g.__aicSchema || g.__aicSchemaText !== SCHEMA) {
    g.__aicSchemaText = SCHEMA;
    g.__aicSchema = sql.unsafe(SCHEMA).then(() => undefined);
  }
  return g.__aicSchema;
}
