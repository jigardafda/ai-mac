import { ensureSchema, sql } from "./db";
import { DEFAULT_APPS } from "./catalog";

/**
 * Read-only queries for the admin panel. They return counts and metadata about accounts
 * and apps. They never read app data, file contents or generated code.
 */
const DEFAULT_SLUGS = DEFAULT_APPS.map((a) => a.slug);

async function hasFilesTable() {
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('public.files') is not null as ok`;
  return r.ok;
}

export type Overview = { users: number; usersWeek: number; usersToday: number; apps: number; customApps: number; builtApps: number; versions: number; dataKeys: number; files: number; signIns24h: number };

export async function getOverview(): Promise<Overview> {
  await ensureSchema();
  const files = (await hasFilesTable()) ? (await sql<{ n: number }[]>`select count(*)::int as n from files`)[0].n : 0;
  const [r] = await sql<Omit<Overview, "files">[]>`
    select
      (select count(*)::int from users) as users,
      (select count(*)::int from users where created_at > now() - interval '7 days') as "usersWeek",
      (select count(*)::int from users where created_at > now() - interval '1 day') as "usersToday",
      (select count(*)::int from apps where deleted_at is null) as apps,
      (select count(*)::int from apps where deleted_at is null and slug <> all(${DEFAULT_SLUGS}::text[])) as "customApps",
      (select count(*)::int from apps where deleted_at is null and current_version_id is not null) as "builtApps",
      (select count(*)::int from app_versions) as versions,
      (select count(*)::int from app_data) as "dataKeys",
      (select count(*)::int from login_codes where used_at is not null and created_at > now() - interval '1 day') as "signIns24h"`;
  return { ...r, files };
}

export type UserRow = { id: number; name: string | null; email: string; created_at: Date; last_sign_in: Date | null; apps: number; custom_apps: number; versions: number; last_build: Date | null };

export async function listUsers(limit = 500): Promise<UserRow[]> {
  await ensureSchema();
  return sql<UserRow[]>`
    select u.id, u.name, u.email, u.created_at,
      (select max(c.used_at) from login_codes c where c.email = u.email) as last_sign_in,
      (select count(*)::int from apps a where a.user_id = u.id and a.deleted_at is null) as apps,
      (select count(*)::int from apps a where a.user_id = u.id and a.deleted_at is null and a.slug <> all(${DEFAULT_SLUGS}::text[])) as custom_apps,
      (select count(*)::int from app_versions v join apps a on a.id = v.app_id where a.user_id = u.id) as versions,
      (select max(v.created_at) from app_versions v join apps a on a.id = v.app_id where a.user_id = u.id) as last_build
    from users u order by u.created_at desc limit ${limit}`;
}

export type CustomApp = { id: number; user_id: number; user_name: string | null; user_email: string; slug: string; name: string; description: string; created_at: Date; versions: number; deleted: boolean };

/** Apps people made with "New app", newest first. The description is the brief the model wrote from their sentence. */
export async function recentCustomApps(limit = 40): Promise<CustomApp[]> {
  await ensureSchema();
  return sql<CustomApp[]>`
    select a.id, a.user_id, u.name as user_name, u.email as user_email, a.slug, a.name, a.description, a.created_at,
      (select count(*)::int from app_versions v where v.app_id = a.id) as versions, (a.deleted_at is not null) as deleted
    from apps a join users u on u.id = a.user_id
    where a.slug <> all(${DEFAULT_SLUGS}::text[])
    order by a.created_at desc limit ${limit}`;
}

export type UserApp = { id: number; slug: string; name: string; description: string; created_at: Date; custom: boolean; deleted: boolean; versions: number; last_model: string | null; last_built: Date | null; data_keys: number };
export type Version = { app_id: number; version: number; prompt: string; model: string; created_at: Date };

export async function getUserDetail(id: number) {
  await ensureSchema();
  const [user] = await sql<{ id: number; name: string | null; email: string; created_at: Date; last_sign_in: Date | null }[]>`
    select u.id, u.name, u.email, u.created_at, (select max(c.used_at) from login_codes c where c.email = u.email) as last_sign_in
    from users u where u.id = ${id}`;
  if (!user) return null;
  const apps = await sql<UserApp[]>`
    select a.id, a.slug, a.name, a.description, a.created_at, (a.slug <> all(${DEFAULT_SLUGS}::text[])) as custom, (a.deleted_at is not null) as deleted,
      (select count(*)::int from app_versions v where v.app_id = a.id) as versions,
      (select v.model from app_versions v where v.app_id = a.id order by v.version desc limit 1) as last_model,
      (select v.created_at from app_versions v where v.app_id = a.id order by v.version desc limit 1) as last_built,
      (select count(*)::int from app_data d where d.app_id = a.id) as data_keys
    from apps a where a.user_id = ${id} order by custom desc, a.position, a.created_at`;
  // The request history for the apps people changed or made: what they asked for, not what came back.
  const versions = await sql<Version[]>`
    select v.app_id, v.version, v.prompt, v.model, v.created_at from app_versions v join apps a on a.id = v.app_id
    where a.user_id = ${id} and (a.slug <> all(${DEFAULT_SLUGS}::text[]) or v.prompt <> 'installed from template')
    order by v.app_id, v.version desc`;
  const files = (await hasFilesTable()) ? (await sql<{ n: number }[]>`select count(*)::int as n from files where user_id = ${id}`)[0].n : 0;
  return { user, apps, versions, files };
}
