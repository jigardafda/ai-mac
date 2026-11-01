import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteApp, getApp, getCurrentCode, saveVersion } from "@/lib/apps";
import { generateApp } from "@/lib/generate";
import { getJob, startJob, streamJob } from "@/lib/jobs";
import { CODE_MODEL } from "@/lib/openai";
import { wrapApp } from "@/lib/sandbox";
import { DEFAULT_APPS } from "@/lib/catalog";
import { loadTemplate } from "@/lib/templates";

type Ctx = { params: Promise<{ slug: string }> };

/** The current built app as a complete HTML document, or 404 if never built. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const cur = await getCurrentCode(app.id);
  if (!cur) return NextResponse.json({ error: "Not built yet", app, building: Boolean(getJob(app.id)) }, { status: 404 });
  const job = getJob(app.id);
  return new Response(wrapApp(cur.code), {
    headers: { "content-type": "text/html; charset=utf-8", "x-aic-version": String(cur.version), "cache-control": "no-store", ...(job && !job.done ? { "x-aic-job": job.kind } : {}) },
  });
}

/** Builds (or rebuilds) the app as a server-side job and streams it. A second
 *  caller while it runs attaches to the same job instead of starting another. */
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const running = getJob(app.id);
  if (running && !running.done) return streamJob(running);
  // First open of an app that ships with a tuned build: install it at once.
  const fresh = new URL(req.url).searchParams.get("fresh") === "1";
  if (!fresh && !app.current_version_id) {
    const tpl = await loadTemplate(slug);
    if (tpl) {
      const version = await saveVersion(app.id, tpl, "installed from template", "template");
      const enc = new TextEncoder();
      const lines = [{ type: "meta", started: Date.now(), kind: "build" }, { type: "status", text: `Installing ${app.name}` }, { type: "done", version }];
      return new Response(enc.encode(lines.map((l) => JSON.stringify(l)).join("\n") + "\n"), { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
    }
  }
  // Default apps always build from the current catalog brief, so an older desktop
  // gets the newest version of the brief when it rebuilds.
  const brief = DEFAULT_APPS.find((a) => a.slug === slug) ?? app;
  const job = startJob(app.id, "build", generateApp({ name: brief.name, description: brief.description }), async (code) => ({
    version: await saveVersion(app.id, code, `build: ${brief.description}`, CODE_MODEL),
  }));
  return streamJob(job);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  if (DEFAULT_APPS.some((a) => a.slug === slug)) return NextResponse.json({ error: "Default apps stay on the desktop. Rebuild it instead." }, { status: 400 });
  await deleteApp(user.id, slug);
  return NextResponse.json({ ok: true });
}
