import { NextResponse } from "next/server";
import { changePassword, requireUser } from "@/lib/auth";

export async function POST(req: Request) {
  const user = await requireUser();
  const { current, next } = await req.json().catch(() => ({}));
  if (!next || String(next).length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  const ok = await changePassword(user.id, String(current || ""), String(next));
  if (!ok) return NextResponse.json({ error: "The current password is wrong." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
