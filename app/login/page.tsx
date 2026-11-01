"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** "ravi.kumar42@example.com" suggests "Ravi"; anything that does not look like a name suggests nothing. */
function suggestName(email: string) {
  const first = email.split("@")[0].split(/[^A-Za-zÀ-ɏ]+/).find((t) => t.length >= 2);
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "";
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [isNew, setIsNew] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/auth/otp/request", { email });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Something went wrong.");
    setIsNew(!!j.isNew);
    // Offer a name for a new address, but never overwrite one the person is typing.
    if (j.isNew && !name) setName(suggestName(email));
    setStep("code");
    setCode("");
    setWait(30);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/auth/otp/verify", { email, code, name: isNew ? name : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setError(j.error || "Something went wrong.");
    }
    router.replace("/desktop");
  }

  return (
    <main className={styles.page}>
      {step === "email" ? (
        <form className={styles.card} onSubmit={sendCode}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/logo.svg" alt="AI Mac logo" width={72} height={72} />
          <h1 className={styles.title}>AI Mac</h1>
          <p className={styles.sub}>Enter your email and we will send you a code. No password, and new here is fine: that creates your desktop.</p>
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" autoComplete="email" autoFocus maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primary} disabled={busy}>{busy ? "Sending" : "Continue"}</button>
        </form>
      ) : (
        <form className={styles.card} onSubmit={verify}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.logo} src="/logo.svg" alt="AI Mac logo" width={72} height={72} />
          <h1 className={styles.title}>{isNew ? "Welcome" : "Welcome back"}</h1>
          <p className={styles.sub}>
            {isNew ? "Looks like you are new. Tell us your first name and enter the 6 digit code we sent to " : "Enter the 6 digit code we sent to "}
            <strong>{email}</strong>. It works for 10 minutes.
          </p>
          {isNew ? (
            <label className={styles.label}>
              First name
              <input className={styles.input} type="text" autoComplete="given-name" maxLength={60} autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          ) : null}
          <label className={styles.label}>
            Code
            <input className={styles.input} type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus={!isNew} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primary} disabled={busy || code.length !== 6 || (isNew && !name.trim())}>{busy ? "One moment" : isNew ? "Create my desktop" : "Sign in"}</button>
          <button type="button" className={styles.link} disabled={wait > 0 || busy} onClick={() => sendCode()}>{wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
          <button type="button" className={styles.link} onClick={() => { setStep("email"); setError(""); }}>Use a different email</button>
        </form>
      )}
    </main>
  );
}
