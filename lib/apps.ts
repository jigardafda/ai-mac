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
  await sql`insert into user_settings (user_id, dock_slugs) values (${userId}, ${["finder", "browser", ...DEFAULT_APPS.slice(0, 5).map((a) => a.slug), "textedit", "terminal", "settings"]})
    on conflict (user_id) do nothing`;
}

export async function listApps(userId: number): Promise<AppRow[]> {
  await ensureSchema();
  return sql<AppRow[]>`
    select a.id, a.slug, a.name, a.description, a.icon_url, a.position, a.current_version_id, v.version
    from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} and a.deleted_at is null order by a.position, a.id`;
}

/** Apps the user moved to the Trash, newest first. */
export async function listTrash(userId: number): Promise<AppRow[]> {
  await ensureSchema();
  return sql<AppRow[]>`
    select a.id, a.slug, a.name, a.description, a.icon_url, a.position, a.current_version_id, v.version
    from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} and a.deleted_at is not null order by a.deleted_at desc`;
}

export async function restoreApp(userId: number, slug: string) {
  await sql`update apps set deleted_at = null where user_id = ${userId} and slug = ${slug}`;
}

export async function emptyTrash(userId: number) {
  await sql`delete from apps where user_id = ${userId} and deleted_at is not null`;
}

export async function setDock(userId: number, slugs: string[]) {
  await ensureSchema();
  await sql`insert into user_settings (user_id, dock_slugs) values (${userId}, ${slugs})
    on conflict (user_id) do update set dock_slugs = excluded.dock_slugs`;
}

export async function getApp(userId: number, slug: string): Promise<AppRow | null> {
  await ensureSchema();
  const [a] = await sql<AppRow[]>`
    select a.id, a.slug, a.name, a.description, a.icon_url, a.position, a.current_version_id, v.version
    from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} and a.slug = ${slug} and a.deleted_at is null`;
  return a ?? null;
}

export async function getCurrentCode(appId: number): Promise<{ code: string; version: number; prompt: string } | null> {
  const [v] = await sql<{ code: string; version: number; prompt: string }[]>`
    select v.code, v.version, v.prompt from apps a join app_versions v on v.id = a.current_version_id where a.id = ${appId}`;
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

/** Moves the app to the Trash. It can be put back until the Trash is emptied. */
export async function deleteApp(userId: number, slug: string) {
  await sql`update apps set deleted_at = now() where user_id = ${userId} and slug = ${slug}`;
}

export async function deleteData(appId: number, key: string) {
  await sql`delete from app_data where app_id = ${appId} and key = ${key}`;
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

export type Prefs = Record<string, unknown>;

export async function getSettings(userId: number): Promise<{ wallpaper_url: string | null; dock_slugs: string[]; prefs: Prefs }> {
  await ensureSchema();
  const [s] = await sql<{ wallpaper_url: string | null; dock_slugs: string[]; prefs: Prefs }[]>`select wallpaper_url, dock_slugs, prefs from user_settings where user_id = ${userId}`;
  return s ?? { wallpaper_url: null, dock_slugs: [], prefs: {} };
}

/** Merges a patch into the user's preferences (System Settings). */
export async function setPrefs(userId: number, patch: Prefs) {
  await ensureSchema();
  await sql`insert into user_settings (user_id, prefs) values (${userId}, ${sql.json(patch as never)})
    on conflict (user_id) do update set prefs = user_settings.prefs || excluded.prefs`;
}

export async function setWallpaper(userId: number, url: string | null) {
  await ensureSchema();
  await sql`insert into user_settings (user_id, wallpaper_url) values (${userId}, ${url})
    on conflict (user_id) do update set wallpaper_url = excluded.wallpaper_url`;
}

/** Sizes for the Storage pane and About: code per app and data per app. */
export async function storageStats(userId: number) {
  const apps = await sql<{ slug: string; name: string; icon_url: string; code: number; versions: number; data: number; version: number | null }[]>`
    select a.slug, a.name, a.icon_url,
      coalesce((select sum(length(v.code)) from app_versions v where v.app_id = a.id), 0)::int as code,
      (select count(*) from app_versions v where v.app_id = a.id)::int as versions,
      coalesce((select sum(length(d.value::text)) from app_data d where d.app_id = a.id), 0)::int as data,
      cv.version
    from apps a left join app_versions cv on cv.id = a.current_version_id
    where a.user_id = ${userId} and a.deleted_at is null order by a.position, a.id`;
  return apps;
}

/** Everything the user owns, for Time Machine's backup. */
export async function exportAll(userId: number) {
  const apps = await sql<{ slug: string; name: string; description: string; version: number | null }[]>`
    select a.slug, a.name, a.description, v.version from apps a left join app_versions v on v.id = a.current_version_id
    where a.user_id = ${userId} and a.deleted_at is null order by a.position`;
  const data = await sql<{ slug: string; key: string; value: unknown }[]>`
    select a.slug, d.key, d.value from app_data d join apps a on a.id = d.app_id where a.user_id = ${userId} order by a.slug, d.key`;
  const settings = await getSettings(userId);
  return { exported_at: new Date().toISOString(), apps, data, settings };
}

/** Erase All Content and Settings: every app, its code and data, and the preferences. Defaults are re-seeded. */
export async function eraseAll(userId: number) {
  await sql`delete from apps where user_id = ${userId}`;
  await sql`delete from user_settings where user_id = ${userId}`;
  await seedDefaultApps(userId);
}
