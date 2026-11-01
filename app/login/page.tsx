"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error || "Something went wrong.");
    router.replace("/desktop");
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={submit}>
        <div className={styles.logo} aria-hidden="true" />
        <h1 className={styles.title}>AI Computer</h1>
        <p className={styles.sub}>{mode === "login" ? "Sign in to your desktop." : "Create your desktop. Every app on it is written the first time you open it."}</p>
        <label className={styles.label}>
          Email
          <input className={styles.input} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className={styles.label}>
          Password
          <input className={styles.input} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button className={styles.primary} disabled={busy}>
          {busy ? "One moment" : mode === "login" ? "Sign in" : "Create desktop"}
        </button>
        <button type="button" className={styles.link} onClick={() => setMode(mode === "login" ? "signup" : "login")}>
          {mode === "login" ? "New here? Create a desktop" : "Already have one? Sign in"}
        </button>
      </form>
    </main>
  );
}
