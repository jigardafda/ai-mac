import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { duplicate, emptyTrash, freeName, listDir, mkdirp, move, normalizePath, readFile, remove, search, writeFile } from "@/lib/files";

/** The user's file system. GET lists a folder or reads a file; PUT writes;
 *  POST runs an operation (mkdir, rename, move, duplicate, trash, restore, empty-trash); DELETE removes. */
export async function GET(req: Request) {
  const user = await requireUser();
  const q = new URL(req.url).searchParams;
  if (q.get("search")) return NextResponse.json({ items: await search(user.id, q.get("search")!) });
  const path = q.get("path") || "/";
  const f = await readFile(user.id, path);
  if (f && f.kind === "file") return NextResponse.json({ file: f });
  const items = await listDir(user.id, path);
  if (items === null) return NextResponse.json({ error: "No such folder" }, { status: 404 });
  return NextResponse.json({ path: normalizePath(path), items });
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const { path, content, mime } = await req.json().catch(() => ({}));
  if (typeof path !== "string" || typeof content !== "string") return NextResponse.json({ error: "path and content required" }, { status: 400 });
  if (content.length > 2_000_000) return NextResponse.json({ error: "That file is too large (2 MB limit)." }, { status: 413 });
  try { return NextResponse.json({ file: await writeFile(user.id, path, content, typeof mime === "string" ? mime : undefined) }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not save" }, { status: 400 }); }
}

export async function POST(req: Request) {
  const user = await requireUser();
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.op) {
      case "mkdir": { const dir = normalizePath(b.dir || "/"); const name = await freeName(user.id, dir, String(b.name || "untitled folder")); await mkdirp(user.id, `${dir === "/" ? "" : dir}/${name}`); return NextResponse.json({ path: `${dir === "/" ? "" : dir}/${name}` }); }
      case "new-file": { const dir = normalizePath(b.dir || "/Documents"); const name = await freeName(user.id, dir, String(b.name || "Untitled.txt")); const p = `${dir === "/" ? "" : dir}/${name}`; await writeFile(user.id, p, String(b.content ?? ""), String(b.mime || "text/plain")); return NextResponse.json({ path: p }); }
      case "rename": { const from = normalizePath(b.path); const dir = from.split("/").slice(0, -1).join("/") || "/"; const name = String(b.name || "").replace(/[/\\]/g, "").trim(); if (!name) throw new Error("Give it a name"); const to = `${dir === "/" ? "" : dir}/${name}`; if (to !== from) await move(user.id, from, to); return NextResponse.json({ path: to }); }
      case "move": { const from = normalizePath(b.path); const dir = normalizePath(b.dir); const name = await freeName(user.id, dir, from.split("/").pop()!); const to = `${dir === "/" ? "" : dir}/${name}`; await move(user.id, from, to); return NextResponse.json({ path: to }); }
      case "duplicate": return NextResponse.json({ path: await duplicate(user.id, b.path) });
      case "trash": { const from = normalizePath(b.path); const name = await freeName(user.id, "/Trash", from.split("/").pop()!); await move(user.id, from, `/Trash/${name}`); return NextResponse.json({ path: `/Trash/${name}` }); }
      case "restore": { const from = normalizePath(b.path); const dir = normalizePath(b.dir || "/Documents"); const name = await freeName(user.id, dir, from.split("/").pop()!); await move(user.id, from, `${dir === "/" ? "" : dir}/${name}`); return NextResponse.json({ ok: true }); }
      case "empty-trash": await emptyTrash(user.id); return NextResponse.json({ ok: true });
      default: return NextResponse.json({ error: "unknown op" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  const path = new URL(req.url).searchParams.get("path") || "";
  try { await remove(user.id, path); return NextResponse.json({ ok: true }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 }); }
}
