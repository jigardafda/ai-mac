import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findOrCreateUser, setSession } from "@/lib/auth";
import { CHALLENGE_COOKIE, cleanEmail, verifyCode } from "@/lib/otp";

/** Checks the code and signs in. A first sign-in creates the desktop. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const challenge = (await cookies()).get(CHALLENGE_COOKIE)?.value ?? "";
  const r = email ? await verifyCode(email, String(body.code ?? "").trim(), challenge) : null;
  if (!email || !r || !r.ok) return NextResponse.json({ error: r && !r.ok ? r.error : "Enter a valid email." }, { status: 401, headers: { "cache-control": "no-store" } });
  (await cookies()).delete(CHALLENGE_COOKIE);
  await setSession(await findOrCreateUser(email, r.name));
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
