import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSettings, setDock } from "@/lib/apps";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await getSettings(user.id));
}

/** Updates which apps sit in the dock. */
export async function PUT(req: Request) {
  const user = await requireUser();
  const { dock_slugs } = await req.json().catch(() => ({}));
  if (!Array.isArray(dock_slugs) || dock_slugs.some((s) => typeof s !== "string")) return NextResponse.json({ error: "dock_slugs must be a list" }, { status: 400 });
  await setDock(user.id, dock_slugs.slice(0, 30));
  return NextResponse.json({ ok: true });
}
