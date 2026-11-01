import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { findOrCreateUser, setSession, userExists } from "@/lib/auth";
import { CHALLENGE_COOKIE, cleanEmail, cleanName, hasPendingCode, verifyCode } from "@/lib/otp";

const headers = { "cache-control": "no-store" };

/** Checks the code and signs in. A first sign-in also needs a first name, and creates the desktop. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = cleanEmail(body.email);
  if (!email) return NextResponse.json({ error: "Enter a valid email." }, { status: 400, headers });
  const challenge = (await cookies()).get(CHALLENGE_COOKIE)?.value ?? "";
  // Ask for the name before the code is spent, so a missing name never costs a try. Only a browser
  // holding a live code for this address may learn that it is new, so the answer is covered by the
  // limits on requesting codes and cannot be probed anonymously.
  const name = cleanName(body.name) ?? undefined;
  if (!name) {
    if (!(await hasPendingCode(email, challenge))) return NextResponse.json({ error: "That code is wrong or has expired." }, { status: 401, headers });
    if (!(await userExists(email))) return NextResponse.json({ error: "Enter your first name.", needsName: true }, { status: 400, headers });
  }
  const r = await verifyCode(email, String(body.code ?? "").trim(), challenge);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 401, headers });
  (await cookies()).delete(CHALLENGE_COOKIE);
  await setSession(await findOrCreateUser(email, name));
  return NextResponse.json({ ok: true }, { headers });
}
