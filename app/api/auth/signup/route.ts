import { NextResponse } from "next/server";
import { createUser, setSession } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  if (!password || String(password).length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });
  try {
    const user = await createUser(email, password);
    await setSession(user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error && /unique/i.test(e.message) ? "That email already has a desktop. Sign in instead." : "Could not create the account.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
