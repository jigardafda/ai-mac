import { NextResponse } from "next/server";
import { clientIp } from "@/lib/ip";
import { cleanEmail, cleanName, issueCode } from "@/lib/otp";

/** Sends a sign-in code. The answer never says whether the address already has a desktop. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  const name = cleanName(body.name);
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  const r = await issueCode(email, name, clientIp(req));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
