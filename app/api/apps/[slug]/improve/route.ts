import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getApp, getCurrentCode, saveVersion } from "@/lib/apps";
import { improveApp } from "@/lib/generate";
import { getJob, startJob, streamJob } from "@/lib/jobs";
import { CODE_MODEL } from "@/lib/openai";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  // A window that comes back (reload, reopen) attaches to the running update with an empty request.
  const running = getJob(app.id);
  if (running && !running.done) return streamJob(running);
  const { request } = await req.json().catch(() => ({}));
  if (!request || String(request).trim().length < 3) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  const cur = await getCurrentCode(app.id);
  if (!cur) return NextResponse.json({ error: "Build the app first" }, { status: 400 });
  const job = startJob(app.id, "improve", improveApp({ name: app.name, description: app.description, code: cur.code, request: String(request) }), async (code) => ({
    version: await saveVersion(app.id, code, `improve: ${String(request)}`, CODE_MODEL),
  }));
  return streamJob(job);
}
