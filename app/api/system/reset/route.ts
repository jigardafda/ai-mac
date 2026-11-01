import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { eraseAll } from "@/lib/apps";

/** Erase All Content and Settings. Asks for the account email to be typed, so a stray click cannot do it. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { confirm } = await req.json().catch(() => ({}));
  if (String(confirm || "").trim().toLowerCase() !== user.email.toLowerCase()) return NextResponse.json({ error: "That is not your email address." }, { status: 403 });
  await eraseAll(user.id);
  return NextResponse.json({ ok: true });
}
