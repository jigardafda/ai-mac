import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { ensureSchema, sql } from "./db";
import { seedDefaultApps } from "./apps";

const COOKIE = "aic_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type SessionUser = { id: number; email: string };

export async function createUser(email: string, password: string): Promise<SessionUser> {
  await ensureSchema();
  const hash = await bcrypt.hash(password, 10);
  const [u] = await sql<SessionUser[]>`
    insert into users (email, password_hash) values (${email.toLowerCase()}, ${hash})
    returning id, email`;
  await seedDefaultApps(u.id);
  return u;
}

export async function verifyUser(email: string, password: string): Promise<SessionUser | null> {
  await ensureSchema();
  const [u] = await sql<{ id: number; email: string; password_hash: string }[]>`
    select id, email, password_hash from users where email = ${email.toLowerCase()}`;
  if (!u) return null;
  return (await bcrypt.compare(password, u.password_hash)) ? { id: u.id, email: u.email } : null;
}

export async function setSession(user: SessionUser) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { id: Number(payload.sub), email: String(payload.email) };
  } catch {
    return null;
  }
}

/** For route handlers: the signed-in user or a 401 response. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getUser();
  if (!u) throw new Response("Sign in first", { status: 401 });
  return u;
}
