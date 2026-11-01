import { ensureSchema, sql } from "./db";
import { DEFAULT_APPS } from "./catalog";

export type AppRow = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon_url: string;
  position: number;
  current_version_id: number | null;
  version: number | null;
};

export async function seedDefaultApps(userId: number) {
  await ensureSchema();
  for (const [i, a] of DEFAULT_APPS.entries()) {
    await sql`insert into apps (user_id, slug, name, description, icon_url, position)
      values (${userId}, ${a.slug}, ${a.name}, ${a.description}, ${a.icon}, ${i})
      on conflict (user_id, slug) do nothing`;
  }
  await sql`insert into user_settings (user_id, dock_slugs) values (${userId}, ${DEFAULT_APPS.slice(0, 5).map((a) => a.slug)})
    on conflict (user_id) do nothing`;
}

export async function listApps(userId: number): Promise<AppRow[]> {
  await ensureSchema();
  return sql<AppRow[]>`
    select a.id, a.slug, a.name, a.description, a.icon_url, a.position, a.current_version_id, v.version
    from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} order by a.position, a.id`;
}

export async function getApp(userId: number, slug: string): Promise<AppRow | null> {
  await ensureSchema();
  const [a] = await sql<AppRow[]>`
    select a.id, a.slug, a.name, a.description, a.icon_url, a.position, a.current_version_id, v.version
    from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} and a.slug = ${slug}`;
  return a ?? null;
}

export async function getCurrentCode(appId: number): Promise<{ code: string; version: number } | null> {
  const [v] = await sql<{ code: string; version: number }[]>`
    select v.code, v.version from apps a join app_versions v on v.id = a.current_version_id where a.id = ${appId}`;
  return v ?? null;
}

export async function saveVersion(appId: number, code: string, prompt: string, model: string): Promise<number> {
  return sql.begin(async (tx) => {
    const [{ next }] = await tx<{ next: number }[]>`select coalesce(max(version), 0) + 1 as next from app_versions where app_id = ${appId}`;
    const [v] = await tx<{ id: number }[]>`insert into app_versions (app_id, version, code, prompt, model)
      values (${appId}, ${next}, ${code}, ${prompt}, ${model}) returning id`;
    await tx`update apps set current_version_id = ${v.id} where id = ${appId}`;
    return next;
  });
}

export async function listVersions(appId: number) {
  return sql<{ id: number; version: number; prompt: string; created_at: string }[]>`
    select id, version, prompt, created_at from app_versions where app_id = ${appId} order by version desc`;
}

export async function rollback(appId: number, version: number) {
  await sql`update apps set current_version_id = (select id from app_versions where app_id = ${appId} and version = ${version}) where id = ${appId}`;
}

export async function createApp(userId: number, a: { slug: string; name: string; description: string; icon_url: string }) {
  await ensureSchema();
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from apps where user_id = ${userId}`;
  const [row] = await sql<{ id: number }[]>`insert into apps (user_id, slug, name, description, icon_url, position)
    values (${userId}, ${a.slug}, ${a.name}, ${a.description}, ${a.icon_url}, ${n}) returning id`;
  return row.id;
}

export async function deleteApp(userId: number, slug: string) {
  await sql`delete from apps where user_id = ${userId} and slug = ${slug}`;
}

export async function getData(appId: number, key: string) {
  const [r] = await sql<{ value: unknown }[]>`select value from app_data where app_id = ${appId} and key = ${key}`;
  return r?.value ?? null;
}

export async function setData(appId: number, key: string, value: unknown) {
  await sql`insert into app_data (app_id, key, value) values (${appId}, ${key}, ${sql.json(value as never)})
    on conflict (app_id, key) do update set value = excluded.value, updated_at = now()`;
}

export async function listKeys(appId: number): Promise<string[]> {
  const rows = await sql<{ key: string }[]>`select key from app_data where app_id = ${appId} order by key`;
  return rows.map((r) => r.key);
}

export async function getSettings(userId: number) {
  await ensureSchema();
  const [s] = await sql<{ wallpaper_url: string | null; dock_slugs: string[] }[]>`select wallpaper_url, dock_slugs from user_settings where user_id = ${userId}`;
  return s ?? { wallpaper_url: null, dock_slugs: [] };
}
