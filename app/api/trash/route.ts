import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { emptyTrash, listTrash, restoreApp } from "@/lib/apps";

export async function GET() {
  const user = await requireUser();
  return NextResponse.json({ apps: await listTrash(user.id) });
}

/** Puts an app back on the desktop. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { slug } = await req.json().catch(() => ({}));
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  await restoreApp(user.id, String(slug));
  return NextResponse.json({ ok: true });
}

/** Empties the Trash for good. */
export async function DELETE() {
  const user = await requireUser();
  await emptyTrash(user.id);
  return NextResponse.json({ ok: true });
}
