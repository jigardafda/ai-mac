"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"details" | "code">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
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
    const r = await post("/api/auth/otp/request", { name, email });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Something went wrong.");
    setStep("code");
    setCode("");
    setWait(30);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/auth/otp/verify", { email, code });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setError(j.error || "Something went wrong.");
    }
    router.replace("/desktop");
  }

  return (
    <main className={styles.page}>
      {step === "details" ? (
        <form className={styles.card} onSubmit={sendCode}>
          <div className={styles.logo} aria-hidden="true" />
          <h1 className={styles.title}>AI Mac</h1>
          <p className={styles.sub}>Enter your name and email. We will send you a code to sign in. New here? That creates your desktop.</p>
          <label className={styles.label}>
            Name
            <input className={styles.input} type="text" autoComplete="name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className={styles.label}>
            Email
            <input className={styles.input} type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primary} disabled={busy}>{busy ? "Sending" : "Send code"}</button>
        </form>
      ) : (
        <form className={styles.card} onSubmit={verify}>
          <div className={styles.logo} aria-hidden="true" />
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.sub}>We sent a 6 digit code to {email}. It works for 10 minutes.</p>
          <label className={styles.label}>
            Code
            <input className={styles.input} type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
          </label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primary} disabled={busy || code.length !== 6}>{busy ? "One moment" : "Sign in"}</button>
          <button type="button" className={styles.link} disabled={wait > 0 || busy} onClick={() => sendCode()}>{wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
          <button type="button" className={styles.link} onClick={() => { setStep("details"); setError(""); }}>Use a different email</button>
        </form>
      )}
    </main>
  );
}
