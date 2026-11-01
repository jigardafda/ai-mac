import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { ensureSchema, sql } from "./db";

/**
 * Email one-time codes. A code is six digits from a CSPRNG, stored only as an
 * HMAC keyed with SESSION_SECRET, valid for ten minutes, single use, and
 * locked after five wrong tries. Requests are limited per address and per IP.
 */
const TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const COOLDOWN_SECONDS = 30;
const MAX_PER_EMAIL_PER_HOUR = 5;
const MAX_PER_IP_PER_HOUR = 20;
const FROM = process.env.MAIL_FROM || "AI Mac <noreply@jigardafda.com>";

export const CHALLENGE_COOKIE = "aic_otp";

export const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,255}\.[^@\s]{2,}$/;

export function cleanEmail(raw: unknown): string | null {
  const e = String(raw ?? "").trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : null;
}

/** Names end up in a desktop and an email, so keep them plain text of sane length. */
export function cleanName(raw: unknown): string | null {
  const n = String(raw ?? "").replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim();
  return n.length >= 1 && n.length <= 60 ? n : null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const hashChallenge = (c: string) => createHash("sha256").update(c).digest("hex");

function hashCode(email: string, code: string) {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(`${email}:${code}`).digest("hex");
}

/** On success, `challenge` goes to the requesting browser as a cookie; only that browser can use the code. */
export type IssueResult = { ok: true; challenge: string } | { ok: false; status: number; error: string };

export async function issueCode(email: string, name: string, ip: string): Promise<IssueResult> {
  await ensureSchema();
  const [lim] = await sql<{ recent: number; last_secs: number | null; by_ip: number }[]>`
    select
      count(*) filter (where email = ${email} and created_at > now() - interval '1 hour')::int as recent,
      extract(epoch from now() - max(created_at) filter (where email = ${email}))::float as last_secs,
      count(*) filter (where ip = ${ip} and created_at > now() - interval '1 hour')::int as by_ip
    from login_codes where created_at > now() - interval '1 hour'`;
  if (lim.last_secs !== null && lim.last_secs < COOLDOWN_SECONDS) return { ok: false, status: 429, error: `Wait ${Math.ceil(COOLDOWN_SECONDS - lim.last_secs)} seconds before asking for another code.` };
  if (lim.recent >= MAX_PER_EMAIL_PER_HOUR || lim.by_ip >= MAX_PER_IP_PER_HOUR) return { ok: false, status: 429, error: "Too many codes requested. Try again in an hour." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const challenge = randomBytes(32).toString("hex");
  await sql`update login_codes set used_at = now() where email = ${email} and used_at is null`;
  await sql`insert into login_codes (email, name, code_hash, challenge_hash, ip, expires_at)
            values (${email}, ${name}, ${hashCode(email, code)}, ${hashChallenge(challenge)}, ${ip}, now() + ${TTL_MINUTES} * interval '1 minute')`;
  try {
    await sendCodeEmail(email, name, code);
  } catch (e) {
    await sql`update login_codes set used_at = now() where email = ${email} and used_at is null`;
    console.error("Could not send the sign-in email:", e instanceof Error ? e.message : e);
    return { ok: false, status: 502, error: "Could not send the email. Try again in a moment." };
  }
  return { ok: true, challenge };
}

export type VerifyResult = { ok: true; name: string } | { ok: false; error: string };

/**
 * `challenge` is the cookie set when the code was requested. Without the matching one
 * nothing is counted or checked, so a stranger who knows only the address cannot use up
 * someone else's five tries.
 */
export async function verifyCode(email: string, code: string, challenge: string): Promise<VerifyResult> {
  await ensureSchema();
  const bad: VerifyResult = { ok: false, error: "That code is wrong or has expired." };
  if (!/^\d{6}$/.test(code) || !/^[0-9a-f]{64}$/.test(challenge)) return bad;
  // Count the try first, atomically, so parallel guesses cannot beat the limit.
  const [row] = await sql<{ id: number; name: string; code_hash: string; attempts: number }[]>`
    update login_codes set attempts = attempts + 1
    where id = (select id from login_codes where email = ${email} and challenge_hash = ${hashChallenge(challenge)}
                  and used_at is null and expires_at > now() order by created_at desc limit 1)
      and attempts < ${MAX_ATTEMPTS}
    returning id, name, code_hash, attempts`;
  if (!row) return bad;
  const a = Buffer.from(row.code_hash, "hex");
  const b = Buffer.from(hashCode(email, code), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return bad;
  const [used] = await sql`update login_codes set used_at = now() where id = ${row.id} and used_at is null returning id`;
  return used ? { ok: true, name: row.name } : bad;
}

async function sendCodeEmail(to: string, name: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY is not set");
    console.log(`[dev] sign-in code for ${to}: ${code}`);
    return;
  }
  const safe = escapeHtml(name);
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1d1d1f">
<p style="font-size:15px;margin:0 0 16px">Hi ${safe},</p>
<p style="font-size:15px;margin:0 0 16px">Your AI Mac sign-in code is:</p>
<p style="font-size:32px;letter-spacing:6px;font-weight:600;margin:0 0 16px">${code}</p>
<p style="font-size:13px;color:#6e6e73;margin:0">It expires in ${TTL_MINUTES} minutes and works once. If you did not ask for it, ignore this email; nobody can sign in without the code.</p></div>`;
  const text = `Hi ${name},\n\nYour AI Mac sign-in code is ${code}.\nIt expires in ${TTL_MINUTES} minutes and works once. If you did not ask for it, ignore this email.\n`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject: `${code} is your AI Mac sign-in code`, html, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`Resend answered ${r.status}`);
}
