import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { ensureSchema, sql } from "./db";
import { seedDefaultApps } from "./apps";

const COOKIE = "aic_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type SessionUser = { id: number; email: string; name?: string };

/** The account for a verified email: created on first sign-in with the name given, found afterwards. */
export async function findOrCreateUser(email: string, name: string): Promise<SessionUser> {
  await ensureSchema();
  const [existing] = await sql<{ id: number; email: string; name: string | null }[]>`
    select id, email, name from users where email = ${email}`;
  if (existing) {
    if (!existing.name) await sql`update users set name = ${name} where id = ${existing.id}`;
    return { id: existing.id, email: existing.email, name: existing.name || name };
  }
  const [u] = await sql<{ id: number; email: string }[]>`
    insert into users (email, name) values (${email}, ${name})
    on conflict (email) do update set email = excluded.email
    returning id, email`;
  await seedDefaultApps(u.id);
  return { id: u.id, email: u.email, name };
}

export async function setSession(user: SessionUser) {
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("14d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { id: Number(payload.sub), email: String(payload.email), name: payload.name ? String(payload.name) : undefined };
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
