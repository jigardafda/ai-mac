import { ensureSchema, sql } from "./db";

/**
 * Each user has a small file system in Postgres: folders and text files under
 * a home with the usual macOS folders. Finder browses it, TextEdit edits it,
 * the Linux app's macOS-style shell lists and reads it. Paths are absolute and start with "/".
 */
export type FileRow = { path: string; name: string; kind: "file" | "folder"; content: string; mime: string; size: number; created_at: string; updated_at: string };

const HOME_FOLDERS = ["Desktop", "Documents", "Downloads", "Movies", "Music", "Pictures", "Public"];
const WELCOME = `Welcome to AI Mac

This is your home folder. Finder shows it, TextEdit edits what is in it, and the Linux app's macOS-style shell can list it with ls and read it with cat.

Documents you save in TextEdit land in Documents. Files you move to the Trash sit in the Trash until you empty it.

Everything here belongs to your account alone.`;

export async function ensureFiles(userId: number) {
  await ensureSchema();
  await sql`create table if not exists files (
    id bigserial primary key,
    user_id bigint not null references users(id) on delete cascade,
    path text not null,
    name text not null,
    kind text not null default 'file',
    content text not null default '',
    mime text not null default 'text/plain',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, path)
  )`;
  const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from files where user_id = ${userId}`;
  if (n) return;
  const rows = [{ path: "/", name: "AI Mac HD", kind: "folder" }, { path: "/Trash", name: "Trash", kind: "folder" }, ...HOME_FOLDERS.map((f) => ({ path: `/${f}`, name: f, kind: "folder" }))];
  for (const r of rows) await sql`insert into files (user_id, path, name, kind) values (${userId}, ${r.path}, ${r.name}, ${r.kind}) on conflict do nothing`;
  await sql`insert into files (user_id, path, name, kind, content, mime) values (${userId}, '/Documents/Welcome.txt', 'Welcome.txt', 'file', ${WELCOME}, 'text/plain') on conflict do nothing`;
  await sql`insert into files (user_id, path, name, kind, content, mime) values (${userId}, '/Documents/About this Mac.rtf', 'About this Mac.rtf', 'file', ${"<h1>About this Mac</h1><p>AI Mac is a desktop whose apps are written the moment you open them. This document is <b>rich text</b>, edited in TextEdit and stored in your files.</p><ul><li>Finder: browse and organise</li><li>TextEdit: write</li><li>Terminal: ls, cat, mkdir, rm</li></ul>"}, 'text/html') on conflict do nothing`;
}

const norm = (p: string) => { const parts: string[] = []; for (const s of p.split("/")) { if (!s || s === ".") continue; if (s === "..") parts.pop(); else parts.push(s); } return "/" + parts.join("/"); };
const parent = (p: string) => norm(p.split("/").slice(0, -1).join("/"));
const base = (p: string) => p.split("/").pop() || "";
export const normalizePath = norm;

export async function listDir(userId: number, dir: string): Promise<FileRow[] | null> {
  await ensureFiles(userId);
  const d = norm(dir);
  if (d !== "/") { const [f] = await sql`select 1 from files where user_id = ${userId} and path = ${d} and kind = 'folder'`; if (!f) return null; }
  const prefix = d === "/" ? "/" : d + "/";
  return sql<FileRow[]>`select path, name, kind, '' as content, mime, length(content)::int as size, created_at, updated_at from files
    where user_id = ${userId} and path like ${prefix + "%"} and path <> ${d} and position('/' in substring(path from (${prefix.length + 1})::int)) = 0
    order by kind desc, lower(name)`;
}

export async function readFile(userId: number, path: string): Promise<FileRow | null> {
  await ensureFiles(userId);
  const [f] = await sql<FileRow[]>`select path, name, kind, content, mime, length(content)::int as size, created_at, updated_at from files where user_id = ${userId} and path = ${norm(path)}`;
  return f ?? null;
}

export async function writeFile(userId: number, path: string, content: string, mime = "text/plain") {
  await ensureFiles(userId);
  const p = norm(path);
  if (p === "/" || p === "/Trash") throw new Error("Cannot write there");
  await mkdirp(userId, parent(p));
  await sql`insert into files (user_id, path, name, kind, content, mime) values (${userId}, ${p}, ${base(p)}, 'file', ${content}, ${mime})
    on conflict (user_id, path) do update set content = excluded.content, mime = excluded.mime, updated_at = now()`;
  return readFile(userId, p);
}

export async function mkdirp(userId: number, path: string) {
  const p = norm(path);
  const parts = p.split("/").filter(Boolean);
  let cur = "";
  for (const part of parts) {
    cur += "/" + part;
    await sql`insert into files (user_id, path, name, kind) values (${userId}, ${cur}, ${part}, 'folder') on conflict do nothing`;
  }
}

/** A name that does not exist yet in the folder: "Untitled", "Untitled 2", … */
export async function freeName(userId: number, dir: string, name: string) {
  const list = (await listDir(userId, dir)) ?? [];
  const names = new Set(list.map((f) => f.name.toLowerCase()));
  if (!names.has(name.toLowerCase())) return name;
  const m = /^(.*?)(\.[^.]+)?$/.exec(name)!;
  for (let i = 2; i < 1000; i++) { const n = `${m[1]} ${i}${m[2] ?? ""}`; if (!names.has(n.toLowerCase())) return n; }
  return `${m[1]} ${Date.now()}${m[2] ?? ""}`;
}

export async function move(userId: number, from: string, to: string) {
  const a = norm(from), b = norm(to);
  if (a === "/" || a === "/Trash" || HOME_FOLDERS.some((f) => `/${f}` === a)) throw new Error("That folder cannot be moved");
  if (b === a || b.startsWith(a + "/")) throw new Error("Cannot move a folder into itself");
  const rows = await sql<{ path: string }[]>`select path from files where user_id = ${userId} and (path = ${a} or path like ${a + "/%"})`;
  await mkdirp(userId, parent(b));
  for (const r of rows) {
    const np = b + r.path.slice(a.length);
    await sql`update files set path = ${np}, name = ${base(np)}, updated_at = now() where user_id = ${userId} and path = ${r.path}`;
  }
}

export async function remove(userId: number, path: string) {
  const p = norm(path);
  if (p === "/" || p === "/Trash" || HOME_FOLDERS.some((f) => `/${f}` === p)) throw new Error("That folder cannot be deleted");
  await sql`delete from files where user_id = ${userId} and (path = ${p} or path like ${p + "/%"})`;
}

export async function duplicate(userId: number, path: string) {
  const p = norm(path);
  const src = await readFile(userId, p);
  if (!src) throw new Error("No such file");
  const m = /^(.*?)(\.[^.]+)?$/.exec(src.name)!;
  const name = await freeName(userId, parent(p), `${m[1]} copy${m[2] ?? ""}`);
  const dst = `${parent(p) === "/" ? "" : parent(p)}/${name}`;
  const rows = await sql<FileRow[]>`select path, name, kind, content, mime from files where user_id = ${userId} and (path = ${p} or path like ${p + "/%"})`;
  for (const r of rows) {
    const np = dst + r.path.slice(p.length);
    await sql`insert into files (user_id, path, name, kind, content, mime) values (${userId}, ${np}, ${base(np)}, ${r.kind}, ${r.content}, ${r.mime}) on conflict do nothing`;
  }
  return dst;
}

export async function emptyTrash(userId: number) {
  await sql`delete from files where user_id = ${userId} and path like '/Trash/%'`;
}

export async function search(userId: number, q: string): Promise<FileRow[]> {
  await ensureFiles(userId);
  return sql<FileRow[]>`select path, name, kind, '' as content, mime, length(content)::int as size, created_at, updated_at from files
    where user_id = ${userId} and path not like '/Trash/%' and path <> '/' and (name ilike ${"%" + q + "%"} or (kind = 'file' and content ilike ${"%" + q + "%"})) order by lower(name) limit 100`;
}
