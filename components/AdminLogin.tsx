"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";

const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Admin sign-in: an email, then the code. Only addresses on the allow-list ever receive one. */
export function AdminLogin() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/admin/otp/request", { email });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Something went wrong.");
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await post("/api/admin/otp/verify", { email, code });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      setBusy(false);
      return setError(j.error || "Something went wrong.");
    }
    router.refresh();
  }

  return (
    <main className={styles.loginPage}>
      <form className={styles.loginCard} onSubmit={step === "email" ? send : verify}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={56} height={56} className={styles.loginLogo} />
        <h1>AI Mac admin</h1>
        {step === "email" ? (
          <>
            <p>Enter your admin email. If it is on the list, a code is sent to it.</p>
            <label>Email<input type="email" autoComplete="email" autoFocus maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          </>
        ) : (
          <>
            <p>If <strong>{email}</strong> is an admin address, a 6 digit code is on its way.</p>
            <label>Code<input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required /></label>
          </>
        )}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button disabled={busy || (step === "code" && code.length !== 6)}>{busy ? "One moment" : step === "email" ? "Send code" : "Sign in"}</button>
        {step === "code" ? <button type="button" className={styles.linkButton} onClick={() => { setStep("email"); setError(""); setCode(""); }}>Use a different email</button> : null}
      </form>
    </main>
  );
}

export function AdminSignOut() {
  const router = useRouter();
  return (
    <button
      className={styles.linkButton}
      onClick={async () => {
        await post("/api/admin/logout", {});
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
