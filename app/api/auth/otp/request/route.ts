import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIp } from "@/lib/ip";
import { CHALLENGE_COOKIE, cleanEmail, issueCode } from "@/lib/otp";

/**
 * Sends a sign-in code to any valid address and says whether it is new, so the page
 * knows to ask for a first name. That tells a caller whether an address has a desktop;
 * the per-address and per-IP limits in issueCode keep it from being a free lookup.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const r = await issueCode(email, clientIp(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
  (await cookies()).set(CHALLENGE_COOKIE, r.challenge, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/auth/otp", maxAge: 600 });
  return NextResponse.json({ ok: true, isNew: r.isNew }, { headers: { "cache-control": "no-store" } });
}
