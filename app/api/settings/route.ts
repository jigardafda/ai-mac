import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSettings, setDock, setPrefs, setWallpaper } from "@/lib/apps";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json(await getSettings(user.id));
}

/** Updates the dock, the wallpaper or any preferences (System Settings). */
export async function PUT(req: Request) {
  const user = await requireUser();
  const body = await req.json().catch(() => ({}));
  if (Array.isArray(body.dock_slugs)) {
    if (body.dock_slugs.some((s: unknown) => typeof s !== "string")) return NextResponse.json({ error: "dock_slugs must be a list" }, { status: 400 });
    await setDock(user.id, body.dock_slugs.slice(0, 30));
  }
  if ("wallpaper_url" in body) {
    const w = body.wallpaper_url;
    if (w !== null && (typeof w !== "string" || w.length > 2000)) return NextResponse.json({ error: "bad wallpaper" }, { status: 400 });
    await setWallpaper(user.id, w);
  }
  if (body.prefs && typeof body.prefs === "object") {
    if (JSON.stringify(body.prefs).length > 20000) return NextResponse.json({ error: "too many preferences" }, { status: 413 });
    await setPrefs(user.id, body.prefs);
  }
  return NextResponse.json(await getSettings(user.id));
}
