import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_CHALLENGE_COOKIE, isAdminEmail } from "@/lib/admin";
import { clientIp } from "@/lib/ip";
import { cleanEmail, issueCode } from "@/lib/otp";

const headers = { "cache-control": "no-store" };

/** Emails an admin code, but only to an address on the allow-list. Everyone else gets the same reply and no email. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400, headers });
  if (isAdminEmail(email)) {
    const r = await issueCode(email, clientIp(req), "admin");
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers });
    (await cookies()).set(ADMIN_CHALLENGE_COOKIE, r.challenge, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/admin/otp", maxAge: 600 });
  }
  return NextResponse.json({ ok: true }, { headers });
}
