import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getApp, getCurrentCode, saveVersion } from "@/lib/apps";
import { improveApp } from "@/lib/generate";
import { CODE_MODEL } from "@/lib/openai";
import { lockBuild, streamEvents, unlockBuild } from "../route";

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const user = await requireUser();
  const { slug } = await params;
  const { request } = await req.json().catch(() => ({}));
  if (!request || String(request).trim().length < 3) return NextResponse.json({ error: "Say what to change." }, { status: 400 });
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const cur = await getCurrentCode(app.id);
  if (!cur) return NextResponse.json({ error: "Build the app first" }, { status: 400 });
  if (!lockBuild(app.id)) return NextResponse.json({ error: "Already building" }, { status: 409 });
  return streamEvents(
    improveApp({ name: app.name, description: app.description, code: cur.code, request: String(request) }),
    async (code) => {
      const version = await saveVersion(app.id, code, `improve: ${String(request)}`, CODE_MODEL);
      return { version };
    },
    () => unlockBuild(app.id),
  );
}
