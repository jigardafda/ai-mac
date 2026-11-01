import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteApp, getApp, getCurrentCode, saveVersion } from "@/lib/apps";
import { generateApp, type GenEvent } from "@/lib/generate";
import { CODE_MODEL } from "@/lib/openai";
import { wrapApp } from "@/lib/sandbox";
import { DEFAULT_APPS } from "@/lib/catalog";

type Ctx = { params: Promise<{ slug: string }> };

/** The current built app as a complete HTML document, or 404 if never built. */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const cur = await getCurrentCode(app.id);
  if (!cur) return NextResponse.json({ error: "Not built yet", app }, { status: 404 });
  return new Response(wrapApp(cur.code), { headers: { "content-type": "text/html; charset=utf-8", "x-aic-version": String(cur.version), "cache-control": "no-store" } });
}

/** Builds (or rebuilds) the app. Streams NDJSON events, stores the result. */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  if (!lockBuild(app.id)) return NextResponse.json({ error: "Already building" }, { status: 409 });
  // Default apps always build from the current catalog brief, so an older desktop
  // gets the newest version of the brief when it rebuilds.
  const brief = DEFAULT_APPS.find((a) => a.slug === slug) ?? app;
  return streamEvents(
    generateApp({ name: brief.name, description: brief.description }),
    async (code) => {
      const version = await saveVersion(app.id, code, `build: ${brief.description}`, CODE_MODEL);
      return { version };
    },
    () => unlockBuild(app.id),
  );
}

// One build per app at a time. Two windows (or React's dev double mount) asking
// together would otherwise write two versions of the same app.
const building: Set<number> = ((globalThis as unknown as { __aicBuilding?: Set<number> }).__aicBuilding ??= new Set());
export function lockBuild(appId: number) {
  if (building.has(appId)) return false;
  building.add(appId);
  return true;
}
export function unlockBuild(appId: number) {
  building.delete(appId);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  if (DEFAULT_APPS.some((a) => a.slug === slug)) return NextResponse.json({ error: "Default apps stay on the desktop. Rebuild it instead." }, { status: 400 });
  await deleteApp(user.id, slug);
  return NextResponse.json({ ok: true });
}

export function streamEvents(gen: AsyncGenerator<GenEvent>, onDone: (code: string) => Promise<Record<string, unknown>>, onFinally?: () => void) {
  const enc = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        for await (const ev of gen) {
          if (ev.type === "done") {
            const extra = await onDone(ev.code);
            send({ type: "done", ...extra });
          } else send(ev);
        }
      } catch (e) {
        send({ type: "error", text: e instanceof Error ? e.message : "Failed" });
      } finally {
        onFinally?.();
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
