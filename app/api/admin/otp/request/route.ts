import { NextResponse } from "next/server";
import { after } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { ADMIN_CHALLENGE_COOKIE, isAdminEmail } from "@/lib/admin";
import { clientIp } from "@/lib/ip";
import { cleanEmail, issueCode } from "@/lib/otp";
import { allow } from "@/lib/ratelimit";

const headers = { "cache-control": "no-store" };

/**
 * Asks for an admin code. Every valid address gets the identical instant answer and an
 * identical cookie, so nothing in the status, the body or the timing says who an admin is.
 * Only for an allow-listed address does anything happen, and it happens after the response.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!allow(`admin-otp:${ip}`, 10, 10 * 60_000)) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429, headers });
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400, headers });

  const challenge = randomBytes(32).toString("hex");
  (await cookies()).set(ADMIN_CHALLENGE_COOKIE, challenge, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/admin/otp", maxAge: 600 });
  if (isAdminEmail(email)) {
    after(async () => {
      const r = await issueCode(email, ip, "admin", challenge);
      if (!r.ok) console.error(`[admin] could not issue a code: ${r.error}`);
    });
  }
  return NextResponse.json({ ok: true }, { headers });
}
