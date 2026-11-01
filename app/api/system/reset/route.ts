import { NextResponse } from "next/server";
import { requireUser, verifyUser } from "@/lib/auth";
import { eraseAll } from "@/lib/apps";

/** Erase All Content and Settings. Needs the password, like the real thing. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { password } = await req.json().catch(() => ({}));
  if (!(await verifyUser(user.email, String(password || "")))) return NextResponse.json({ error: "The password is wrong." }, { status: 403 });
  await eraseAll(user.id);
  return NextResponse.json({ ok: true });
}
