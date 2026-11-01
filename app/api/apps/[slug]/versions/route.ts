import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getApp, listVersions, rollback } from "@/lib/apps";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  return NextResponse.json({ current: app.version, versions: await listVersions(app.id) });
}

export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  const { slug } = await params;
  const app = await getApp(user.id, slug);
  if (!app) return NextResponse.json({ error: "No such app" }, { status: 404 });
  const { version } = await req.json().catch(() => ({}));
  await rollback(app.id, Number(version));
  return NextResponse.json({ ok: true });
}
