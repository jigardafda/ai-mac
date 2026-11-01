import { NextResponse } from "next/server";
import { findOrCreateUser, setSession } from "@/lib/auth";
import { cleanEmail, verifyCode } from "@/lib/otp";

/** Checks the code and signs in. A first sign-in creates the desktop. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const r = email ? await verifyCode(email, String(body.code ?? "").trim()) : null;
  if (!email || !r || !r.ok) return NextResponse.json({ error: r && !r.ok ? r.error : "Enter a valid email." }, { status: 401, headers: { "cache-control": "no-store" } });
  await setSession(await findOrCreateUser(email, r.name));
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
