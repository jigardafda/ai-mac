import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

/**
 * The admin panel has its own session, separate from the desktop's: a short-lived signed
 * cookie that carries no user account, so signing in as an admin never creates a desktop.
 * Who may sign in is the ADMIN_EMAILS allow-list (comma separated). Unset means no admin.
 * The list is checked again on every request, so removing an address ends its session.
 */
export const ADMIN_COOKIE = "aic_admin";
export const ADMIN_CHALLENGE_COOKIE = "aic_admin_otp";
const AUDIENCE = "ai-mac-admin";
const HOURS = 8;
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
export const isAdminEmail = (email: string) => adminEmails().includes(email.trim().toLowerCase());

export async function setAdminSession(email: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email.toLowerCase())
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(secret());
  (await cookies()).set(ADMIN_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: HOURS * 3600 });
}

export async function clearAdminSession() {
  (await cookies()).delete(ADMIN_COOKIE);
}

/** The signed-in admin's email, or null. */
export async function getAdmin(): Promise<string | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: AUDIENCE });
    const email = String(payload.sub || "");
    return isAdminEmail(email) ? email : null;
  } catch {
    return null;
  }
}
