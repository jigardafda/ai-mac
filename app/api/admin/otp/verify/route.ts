import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_CHALLENGE_COOKIE, isAdminEmail, setAdminSession } from "@/lib/admin";
import { cleanEmail, verifyCode } from "@/lib/otp";
import { clientIp } from "@/lib/ip";
import { allow } from "@/lib/ratelimit";

const headers = { "cache-control": "no-store" };
const wrong = () => NextResponse.json({ error: "That code is wrong or has expired." }, { status: 401, headers });

export async function POST(req: Request) {
  if (!allow(`admin-verify:${clientIp(req)}`, 20, 10 * 60_000)) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429, headers });
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email || !isAdminEmail(email)) return wrong();
  const challenge = (await cookies()).get(ADMIN_CHALLENGE_COOKIE)?.value ?? "";
  const r = await verifyCode(email, String(body.code ?? "").trim(), challenge, "admin");
  if (!r.ok) return wrong();
  (await cookies()).delete(ADMIN_CHALLENGE_COOKIE);
  await setAdminSession(email);
  console.log(`[admin] sign-in: ${email}`);
  return NextResponse.json({ ok: true }, { headers });
}
