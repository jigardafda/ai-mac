import { NextResponse } from "next/server";
import { setSession, verifyUser } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  const user = email && password ? await verifyUser(email, password) : null;
  if (!user) return NextResponse.json({ error: "Email or password is wrong." }, { status: 401 });
  await setSession(user);
  return NextResponse.json({ ok: true });
}
