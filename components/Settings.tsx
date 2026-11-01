"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { AppRow } from "@/lib/apps";
import styles from "./settings.module.css";

export type Prefs = Record<string, unknown>;
type Props = {
  user: { id: number; email: string };
  apps: AppRow[];
  prefs: Prefs;
  setPrefs: (patch: Prefs) => void;
  wallpaper: string;
  setWallpaper: (url: string) => void;
  dock: string[];
  setDock: (fn: (d: string[]) => string[]) => void;
  initialPane?: string;
  onLock: () => void;
  onSignOut: () => void;
  onOpenApp: (slug: string) => void;
  notify: (text: string, title?: string) => void;
};
type Stats = { name: string; version: string; build: string; chip: string; models: { code: string; chat: string; image: string }; node: string; uptime: number; apps: { slug: string; name: string; icon_url: string; code: number; versions: number; data: number; version: number | null }[]; totals: { apps: number; built: number; code: number; data: number; versions: number } };

export const ACCENTS: Record<string, string> = { blue: "#0a60ff", purple: "#953d96", pink: "#f74f9e", red: "#ff5257", orange: "#f7821b", yellow: "#ffc600", green: "#62ba46", graphite: "#8c8c8c" };
export const WALLPAPERS: { id: string; name: string; value: string }[] = [
  { id: "waves", name: "AI Mac Waves", value: "/wallpaper.jpg" },
  { id: "sonoma", name: "Sonoma Horizon", value: "gradient:linear-gradient(160deg,#f6d365 0%,#fda085 35%,#6a85b6 70%,#2b3a67 100%)" },
  { id: "ventura", name: "Ventura", value: "gradient:linear-gradient(135deg,#ff9a3c 0%,#ff5e62 40%,#7b2ff7 100%)" },
  { id: "monterey", name: "Monterey", value: "gradient:linear-gradient(135deg,#1d2b64 0%,#f8cdda 100%)" },
  { id: "bigsur", name: "Big Sur", value: "gradient:linear-gradient(180deg,#ff8a00 0%,#e52e71 45%,#2a0845 100%)" },
  { id: "sequoia", name: "Sequoia", value: "gradient:linear-gradient(160deg,#0f2027 0%,#203a43 50%,#2c5364 100%)" },
  { id: "graphite", name: "Graphite", value: "gradient:linear-gradient(180deg,#434343 0%,#000000 100%)" },
  { id: "teal", name: "Teal", value: "gradient:linear-gradient(135deg,#0ba360 0%,#3cba92 100%)" },
  { id: "lavender", name: "Lavender", value: "gradient:linear-gradient(135deg,#a18cd1 0%,#fbc2eb 100%)" },
];

const fmtBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);

// The pane list, grouped like macOS Sonoma. Each has a colour and a small glyph.
const PANES: { id: string; name: string; color: string; glyph: string; group: number }[] = [
  { id: "wifi", name: "Wi‑Fi", color: "#1a8cff", glyph: "M2 7a9 9 0 0 1 12 0M4.5 9.5a5.5 5.5 0 0 1 7 0M7 12l1 1 1-1", group: 0 },
  { id: "bluetooth", name: "Bluetooth", color: "#1a8cff", glyph: "M5 5l6 5-6 5V2l6 5-6 5", group: 0 },
  { id: "network", name: "Network", color: "#1a8cff", glyph: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M2 8h12M8 2c3 3 3 9 0 12M8 2c-3 3-3 9 0 12", group: 0 },
  { id: "vpn", name: "VPN", color: "#1a8cff", glyph: "M8 2l5 2v4c0 3-2 5-5 6-3-1-5-3-5-6V4z", group: 0 },
  { id: "notifications", name: "Notifications", color: "#ff3b30", glyph: "M8 2a4 4 0 0 0-4 4v3l-1.5 2h11L12 9V6a4 4 0 0 0-4-4M6.5 13a1.5 1.5 0 0 0 3 0", group: 1 },
  { id: "sound", name: "Sound", color: "#ff3b30", glyph: "M3 6h2l3-3v10l-3-3H3zM10 6a3 3 0 0 1 0 4M12 4a6 6 0 0 1 0 8", group: 1 },
  { id: "focus", name: "Focus", color: "#5856d6", glyph: "M11 3a6 6 0 1 0 2 8 5 5 0 0 1-2-8", group: 1 },
  { id: "screentime", name: "Screen Time", color: "#5856d6", glyph: "M4 2h8v3l-3 3 3 3v3H4v-3l3-3-3-3z", group: 1 },
  { id: "general", name: "General", color: "#8e8e93", glyph: "M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M3 13l1.5-1.5M11.5 4.5L13 3", group: 2 },
  { id: "appearance", name: "Appearance", color: "#1c1c1e", glyph: "M8 2a6 6 0 1 0 0 12V2", group: 2 },
  { id: "accessibility", name: "Accessibility", color: "#1a8cff", glyph: "M8 2a1 1 0 1 0 0 2 1 1 0 0 0 0-2M3 6l5 1 5-1M8 7v3l-2 4M8 10l2 4", group: 2 },
  { id: "controlcentre", name: "Control Centre", color: "#8e8e93", glyph: "M2 5h12M2 11h12M5 3v4M11 9v4", group: 2 },
  { id: "siri", name: "Siri & Spotlight", color: "#1c1c1e", glyph: "M7 2a5 5 0 1 0 3.5 8.5L14 14", group: 2 },
  { id: "privacy", name: "Privacy & Security", color: "#1a8cff", glyph: "M8 1l5 2v4c0 4-2 6-5 8-3-2-5-4-5-8V3zM6 8l1.5 1.5L10.5 6", group: 2 },
  { id: "dock", name: "Desktop & Dock", color: "#1c1c1e", glyph: "M2 3h12v7H2zM4 13h8", group: 3 },
  { id: "displays", name: "Displays", color: "#1a8cff", glyph: "M2 3h12v8H2zM6 14h4M8 11v3", group: 3 },
  { id: "wallpaper", name: "Wallpaper", color: "#34c759", glyph: "M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3", group: 3 },
  { id: "screensaver", name: "Screen Saver", color: "#5ac8fa", glyph: "M2 3h12v8H2zM4 9l3-4 2 3 1-1 2 2", group: 3 },
  { id: "battery", name: "Battery", color: "#34c759", glyph: "M2 5h10v6H2zM12 7h2v2h-2zM4 7h4v2H4z", group: 3 },
  { id: "lockscreen", name: "Lock Screen", color: "#1c1c1e", glyph: "M4 7h8v7H4zM5.5 7V5a2.5 2.5 0 0 1 5 0v2", group: 3 },
  { id: "touchid", name: "Touch ID & Password", color: "#ff3b30", glyph: "M8 3a5 5 0 0 0-5 5v3M8 5a3 3 0 0 0-3 3v4M8 7a1 1 0 0 0-1 1v5M10 5a3 3 0 0 1 1 3v4M13 8a5 5 0 0 0-2-4", group: 4 },
  { id: "users", name: "Users & Groups", color: "#1a8cff", glyph: "M6 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4M2 13a4 4 0 0 1 8 0M11 7a2 2 0 1 0 0-4M10 9a4 4 0 0 1 4 4", group: 4 },
  { id: "passwords", name: "Passwords", color: "#8e8e93", glyph: "M5 5a3 3 0 1 0 2 5l1-1h2l1-1 1 1 1-1 1-2-1-1H8L7 5z", group: 5 },
  { id: "internet", name: "Internet Accounts", color: "#1a8cff", glyph: "M8 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6M11 8v1a2 2 0 0 0 4 0V8", group: 5 },
  { id: "gamecenter", name: "Game Center", color: "#ff9500", glyph: "M3 6h10a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2l-2-2H5l-2 2a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M5 8v3M3.5 9.5h3M11 9h.01M12.5 10.5h.01", group: 5 },
  { id: "wallet", name: "Wallet & Apple Pay", color: "#1c1c1e", glyph: "M2 4h12v9H2zM2 7h12M10 10h2", group: 5 },
  { id: "keyboard", name: "Keyboard", color: "#8e8e93", glyph: "M2 4h12v8H2zM4 6h1M7 6h1M10 6h1M4 9h8", group: 6 },
  { id: "mouse", name: "Mouse", color: "#8e8e93", glyph: "M5 2h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3M8 2v6", group: 6 },
  { id: "trackpad", name: "Trackpad", color: "#8e8e93", glyph: "M2 3h12v10H2zM2 10h12M8 10v3", group: 6 },
  { id: "printers", name: "Printers & Scanners", color: "#8e8e93", glyph: "M4 6V2h8v4M2 6h12v6h-2v2H4v-2H2zM4 10h8", group: 6 },
];
const GENERAL_SUB: { id: string; name: string }[] = [
  { id: "about", name: "About" }, { id: "update", name: "Software Update" }, { id: "storage", name: "Storage" }, { id: "applecare", name: "AppleCare & Warranty" },
  { id: "airdrop", name: "AirDrop & Handoff" }, { id: "autofill", name: "AutoFill & Passwords" }, { id: "datetime", name: "Date & Time" }, { id: "language", name: "Language & Region" },
  { id: "loginitems", name: "Login Items & Extensions" }, { id: "sharing", name: "Sharing" }, { id: "startup", name: "Startup Disk" }, { id: "timemachine", name: "Time Machine" }, { id: "reset", name: "Transfer or Reset" },
];

/* ---------- small controls ---------- */
function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} disabled={disabled} className={`${styles.toggle} ${on ? styles.toggleOn : ""}`} onClick={() => onChange(!on)}><span /></button>;
}
function Group({ title, children, note }: { title?: string; children: React.ReactNode; note?: string }) {
  return <section className={styles.group}>{title ? <h3>{title}</h3> : null}<div className={styles.card}>{children}</div>{note ? <p className={styles.note}>{note}</p> : null}</section>;
}
function Row({ label, sub, children, onClick }: { label: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode; onClick?: () => void }) {
  return <div className={`${styles.row} ${onClick ? styles.rowClick : ""}`} onClick={onClick}><div className={styles.rowText}><span>{label}</span>{sub ? <small>{sub}</small> : null}</div><div className={styles.rowCtl}>{children}{onClick ? <i className={styles.chev} /> : null}</div></div>;
}
function Sel<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <select className={styles.select} value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
function Slider({ value, min, max, step = 1, onChange, labels }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; labels?: [string, string] }) {
  return <div className={styles.slider}>{labels ? <small>{labels[0]}</small> : null}<input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />{labels ? <small>{labels[1]}</small> : null}</div>;
}
const Btn = ({ children, onClick, primary, disabled }: { children: React.ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean }) => <button type="button" className={primary ? styles.btnPrimary : styles.btn} onClick={onClick} disabled={disabled}>{children}</button>;

/* ---------- the app ---------- */
export function Settings({ user, apps, prefs, setPrefs, wallpaper, setWallpaper, initialPane = "general", onLock, onSignOut, onOpenApp, notify }: Props) {
  const general = GENERAL_SUB.some((g) => g.id === initialPane);
  const [pane, setPane] = useState(general ? "general" : initialPane);
  const [sub, setSub] = useState<string | null>(general ? initialPane : null);
  const [q, setQ] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [pw, setPw] = useState<{ cur: string; next: string; again: string } | null>(null);
  const [erase, setErase] = useState<string | null>(null);
  const [wallPrompt, setWallPrompt] = useState("");
  const [making, setMaking] = useState(false);
  const p = <T,>(k: string, d: T): T => (prefs[k] === undefined ? d : (prefs[k] as T));
  const set = (k: string, v: unknown) => setPrefs({ [k]: v });
  const name = user.email.split("@")[0];
  const initial = name.slice(0, 1).toUpperCase();
  const current = pane === "general" && sub ? GENERAL_SUB.find((s) => s.id === sub)?.name ?? "General" : PANES.find((x) => x.id === pane)?.name ?? "General";
  const visible = useMemo(() => (q ? PANES.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())) : PANES), [q]);
  useEffect(() => { if (pane === "general" && (sub === "about" || sub === "storage" || sub === "update") && !stats) fetch("/api/system/stats").then((r) => r.json()).then(setStats).catch(() => {}); }, [pane, sub, stats]);

  async function savePassword() {
    if (!pw) return;
    if (pw.next !== pw.again) return notify("The new passwords do not match.", "Users & Groups");
    const r = await fetch("/api/auth/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: pw.cur, next: pw.next }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error || "Could not change the password.", "Users & Groups");
    setPw(null);
    notify("Your password was changed.", "Users & Groups");
  }
  async function doErase() {
    const r = await fetch("/api/system/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: erase }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error || "Could not erase.", "Transfer or Reset");
    location.reload();
  }
  async function makeWallpaper() {
    if (wallPrompt.trim().length < 3 || making) return;
    setMaking(true);
    try {
      const r = await fetch("/api/wallpaper", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: wallPrompt }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return notify(j.error || "Could not make the wallpaper.", "Wallpaper");
      setWallpaper(j.url);
      setWallPrompt("");
    } finally { setMaking(false); }
  }

  const allApps = apps;
  const onOff = (v: boolean) => (v ? "On" : "Off");

  function body() {
    if (pane === "general" && !sub) return (
      <Group>
        {GENERAL_SUB.map((s) => <Row key={s.id} label={s.name} onClick={() => setSub(s.id)} />)}
      </Group>
    );
    if (pane === "general" && sub) {
      switch (sub) {
        case "about": return <>
          <div className={styles.about}><span className={styles.aboutLogo} /><h2>AI Mac</h2><p>Web desktop, {new Date().getFullYear()}</p></div>
          <Group>
            <Row label="Name"><span className={styles.val}>{p("hostname", "AI-Mac")}</span></Row>
            <Row label="Chip"><span className={styles.val}>{stats?.chip ?? "AI Mac Engine"}</span></Row>
            <Row label="Models"><span className={styles.val}>{stats ? `${stats.models.code} · ${stats.models.chat} · ${stats.models.image}` : "…"}</span></Row>
            <Row label="Apps"><span className={styles.val}>{stats ? `${stats.totals.apps} apps, ${stats.totals.built} built, ${stats.totals.versions} versions` : "…"}</span></Row>
            <Row label="Signed in as"><span className={styles.val}>{user.email}</span></Row>
            <Row label="Runtime"><span className={styles.val}>{stats ? `Node ${stats.node}, up ${Math.floor(stats.uptime / 60)} min` : "…"}</span></Row>
          </Group>
          <Group>
            <Row label="AI Mac"><span className={styles.val}>Version {stats?.version ?? "1.0"} (build {stats?.build ?? "…"})</span></Row>
            <Row label="Software Update" onClick={() => setSub("update")} />
          </Group>
        </>;
        case "update": return <Group>
          <Row label="AI Mac is up to date" sub={`AI Mac ${stats?.version ?? "1.0"}, build ${stats?.build ?? "…"}`}><Btn onClick={() => { setStats(null); notify("No updates are available.", "Software Update"); }}>Check Now</Btn></Row>
          <Row label="Automatic updates" sub="New builds of the shell arrive when the desktop is redeployed"><Toggle on={p("autoUpdate", true)} onChange={(v) => set("autoUpdate", v)} /></Row>
        </Group>;
        case "storage": { const total = stats ? stats.totals.code + stats.totals.data : 0; return <>
          <Group title="AI Mac HD">
            <div className={styles.storageBar}><span style={{ width: `${total ? (stats!.totals.code / total) * 100 : 0}%` }} className={styles.segCode} /><span style={{ width: `${total ? (stats!.totals.data / total) * 100 : 0}%` }} className={styles.segData} /></div>
            <Row label={<span><i className={styles.dotCode} /> App code</span>}><span className={styles.val}>{stats ? fmtBytes(stats.totals.code) : "…"}</span></Row>
            <Row label={<span><i className={styles.dotData} /> App records</span>}><span className={styles.val}>{stats ? fmtBytes(stats.totals.data) : "…"}</span></Row>
          </Group>
          <Group title="Applications">
            {(stats?.apps ?? []).map((a) => <Row key={a.slug} label={<span className={styles.appLabel}><img src={a.icon_url} alt="" width={20} height={20} />{a.name}</span>} sub={`${a.versions} version${a.versions === 1 ? "" : "s"}${a.version ? ", current v" + a.version : ", not built"}`}><span className={styles.val}>{fmtBytes(a.code + a.data)}</span></Row>)}
          </Group>
        </>; }
        case "applecare": return <Group><Row label="AI Mac" sub="Coverage: experimental software, no warranty expressed or implied" /><Row label="Support" sub="Open an issue in the jigardafda/ai-mac repository" /></Group>;
        case "airdrop": return <Group>
          <Row label="AirDrop"><Sel value={p("airdrop", "off")} options={[["off", "No One"], ["contacts", "Contacts Only"], ["everyone", "Everyone"]]} onChange={(v) => set("airdrop", v)} /></Row>
          <Row label="Allow Handoff between this Mac and your other devices"><Toggle on={p("handoff", false)} onChange={(v) => set("handoff", v)} /></Row>
        </Group>;
        case "autofill": return <Group>
          <Row label="AutoFill Passwords and Passkeys"><Toggle on={p("autofill", true)} onChange={(v) => set("autofill", v)} /></Row>
          <Row label="Verification codes" sub="Delete after use"><Toggle on={p("codes", true)} onChange={(v) => set("codes", v)} /></Row>
        </Group>;
        case "datetime": return <>
          <Group>
            <Row label="Set time and date automatically" sub="Uses the time of this computer"><Toggle on={true} onChange={() => {}} disabled /></Row>
            <Row label="Time zone"><span className={styles.val}>{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></Row>
          </Group>
          <Group title="Clock">
            <Row label="Use a 24-hour clock"><Toggle on={p("clock24", true)} onChange={(v) => set("clock24", v)} /></Row>
            <Row label="Display the time with seconds"><Toggle on={p("clockSeconds", false)} onChange={(v) => set("clockSeconds", v)} /></Row>
            <Row label="Show the day of the week"><Toggle on={p("clockDay", true)} onChange={(v) => set("clockDay", v)} /></Row>
            <Row label="Show date"><Toggle on={p("clockDate", true)} onChange={(v) => set("clockDate", v)} /></Row>
            <Row label="Flash the time separators"><Toggle on={p("clockFlash", false)} onChange={(v) => set("clockFlash", v)} /></Row>
          </Group>
        </>;
        case "language": return <Group>
          <Row label="Preferred language"><Sel value={p("language", "en-GB")} options={[["en-GB", "English (UK)"], ["en-US", "English (US)"], ["en-IN", "English (India)"], ["hi-IN", "हिन्दी"]]} onChange={(v) => set("language", v)} /></Row>
          <Row label="Region"><Sel value={p("region", "IN")} options={[["IN", "India"], ["GB", "United Kingdom"], ["US", "United States"], ["AE", "United Arab Emirates"]]} onChange={(v) => set("region", v)} /></Row>
          <Row label="Calendar"><Sel value={p("calendar", "gregorian")} options={[["gregorian", "Gregorian"], ["indian", "Indian National"]]} onChange={(v) => set("calendar", v)} /></Row>
          <Row label="Temperature"><Sel value={p("tempUnit", "c")} options={[["c", "°C – Celsius"], ["f", "°F – Fahrenheit"]]} onChange={(v) => set("tempUnit", v)} /></Row>
          <Row label="First day of week"><Sel value={p("firstDay", "mon")} options={[["sun", "Sunday"], ["mon", "Monday"], ["sat", "Saturday"]]} onChange={(v) => set("firstDay", v)} /></Row>
          <Row label="Date format" sub={new Date().toLocaleDateString(p("language", "en-GB"), { day: "numeric", month: "long", year: "numeric" })} />
        </Group>;
        case "loginitems": { const items = p<string[]>("loginItems", []); return <>
          <Group title="Open at Login" note="These apps open their windows when you sign in.">
            {allApps.map((a) => <Row key={a.slug} label={<span className={styles.appLabel}><img src={a.icon_url} alt="" width={20} height={20} />{a.name}</span>}><Toggle on={items.includes(a.slug)} onChange={(v) => set("loginItems", v ? [...items, a.slug] : items.filter((s) => s !== a.slug))} /></Row>)}
          </Group>
          <Group title="Extensions"><Row label="Spotlight" sub="Search apps by description"><Toggle on={p("spotlightDescriptions", true)} onChange={(v) => set("spotlightDescriptions", v)} /></Row></Group>
        </>; }
        case "sharing": return <>
          <Group title="Local hostname">
            <Row label="Hostname" sub="Used by the Terminal prompt"><input className={styles.text} value={p("hostname", "AI-Mac")} onChange={(e) => set("hostname", e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 24) || "AI-Mac")} /></Row>
          </Group>
          <Group>
            {["Screen Sharing", "File Sharing", "Media Sharing", "Printer Sharing", "Remote Login", "Remote Management", "Internet Sharing", "Content Caching"].map((s) => <Row key={s} label={s}><Toggle on={false} onChange={() => notify(`${s} is not available on this Mac.`, "Sharing")} /></Row>)}
          </Group>
        </>;
        case "startup": return <Group><Row label="AI Mac HD" sub="Postgres, the web desktop" ><span className={styles.val}>Selected</span></Row></Group>;
        case "timemachine": return <Group title="Back up your apps and records" note="The backup is a JSON file with every app, its records and your settings.">
          <Row label="Back up automatically"><Toggle on={p("backupAuto", false)} onChange={(v) => set("backupAuto", v)} /></Row>
          <Row label="Back Up Now"><Btn onClick={() => { location.href = "/api/system/backup"; }}>Back Up Now…</Btn></Row>
        </Group>;
        case "reset": return <>
          <Group><Row label="Transfer to a new Mac" sub="Download a backup from Time Machine and keep it safe" onClick={() => setSub("timemachine")} /></Group>
          <Group title="Erase All Content and Settings" note="Removes every app, every record and all settings from this desktop. The default apps come back fresh. This cannot be undone.">
            {erase === null ? <Row label="Erase this Mac"><Btn onClick={() => setErase("")}>Erase All Content and Settings…</Btn></Row> : (
              <Row label="Enter your password to erase"><input className={styles.text} type="password" value={erase} onChange={(e) => setErase(e.target.value)} placeholder="Password" /><Btn onClick={() => setErase(null)}>Cancel</Btn><Btn primary onClick={doErase} disabled={!erase}>Erase</Btn></Row>
            )}
          </Group>
        </>;
      }
    }
    switch (pane) {
      case "wifi": return <>
        <Group><Row label="Wi‑Fi"><Toggle on={p("wifi", true)} onChange={(v) => set("wifi", v)} /></Row></Group>
        {p("wifi", true) ? <Group title="Known network"><Row label={<span><i className={styles.wifiDot} /> AI Mac Network</span>} sub="Connected · WPA3"><span className={styles.val}>Connected</span></Row></Group> : null}
        <Group title="Other networks"><Row label="Ask to join networks"><Toggle on={p("wifiAsk", true)} onChange={(v) => set("wifiAsk", v)} /></Row></Group>
      </>;
      case "bluetooth": return <>
        <Group><Row label="Bluetooth" sub={p("bt", true) ? `This Mac is discoverable as “${p("hostname", "AI-Mac")}”` : "Off"}><Toggle on={p("bt", true)} onChange={(v) => set("bt", v)} /></Row></Group>
        <Group title="My Devices"><Row label="No devices" sub="Bluetooth devices cannot reach a web desktop" /></Group>
      </>;
      case "network": return <>
        <Group><Row label={<span><i className={styles.wifiDot} /> Wi‑Fi</span>} sub="Connected" onClick={() => setPane("wifi")} /><Row label="Firewall" sub={onOff(p("firewall", true))}><Toggle on={p("firewall", true)} onChange={(v) => set("firewall", v)} /></Row></Group>
        <Group title="Details"><Row label="IP address"><span className={styles.val}>10.0.1.{(user.id % 200) + 2}</span></Row><Row label="Router"><span className={styles.val}>10.0.1.1</span></Row><Row label="DNS"><span className={styles.val}>1.1.1.1</span></Row></Group>
      </>;
      case "vpn": return <Group note="VPN configurations are not available on this Mac."><Row label="No VPN configurations" /><Row label="Add VPN Configuration…"><Btn disabled>Add…</Btn></Row></Group>;
      case "notifications": return <>
        <Group>
          <Row label="Show previews"><Sel value={p("previews", "always")} options={[["always", "Always"], ["unlocked", "When Unlocked"], ["never", "Never"]]} onChange={(v) => set("previews", v)} /></Row>
          <Row label="Allow notifications when the display is sleeping"><Toggle on={p("notifySleep", false)} onChange={(v) => set("notifySleep", v)} /></Row>
          <Row label="Play sound for notifications"><Toggle on={p("alertSound", true)} onChange={(v) => set("alertSound", v)} /></Row>
        </Group>
        <Group title="Application Notifications">
          {allApps.map((a) => { const m = p<Record<string, boolean>>("notifyApps", {}); return <Row key={a.slug} label={<span className={styles.appLabel}><img src={a.icon_url} alt="" width={20} height={20} />{a.name}</span>} sub={m[a.slug] === false ? "Off" : "Banners, Sounds"}><Toggle on={m[a.slug] !== false} onChange={(v) => set("notifyApps", { ...m, [a.slug]: v })} /></Row>; })}
        </Group>
      </>;
      case "sound": return <>
        <Group title="Sound Effects">
          <Row label="Alert sound"><Sel value={p("alertTone", "boop")} options={[["boop", "Boop"], ["breeze", "Breeze"], ["bubble", "Bubble"], ["crystal", "Crystal"], ["funk", "Funk"], ["heroine", "Heroine"]]} onChange={(v) => set("alertTone", v)} /></Row>
          <Row label="Play sound effects for notifications"><Toggle on={p("alertSound", true)} onChange={(v) => set("alertSound", v)} /></Row>
          <Row label="Play user interface sound effects"><Toggle on={p("uiSounds", false)} onChange={(v) => set("uiSounds", v)} /></Row>
          <Row label="Alert volume"><Slider value={p("alertVolume", 60)} min={0} max={100} onChange={(v) => set("alertVolume", v)} /></Row>
        </Group>
        <Group title="Output & Input">
          <Row label="Output device"><span className={styles.val}>Browser</span></Row>
          <Row label="Output volume"><Slider value={p("volume", 80)} min={0} max={100} onChange={(v) => set("volume", v)} /></Row>
          <Row label="Mute"><Toggle on={p("mute", false)} onChange={(v) => set("mute", v)} /></Row>
        </Group>
      </>;
      case "focus": return <>
        <Group><Row label="Do Not Disturb" sub={p("dnd", false) ? "On: notifications are held" : "Off"}><Toggle on={p("dnd", false)} onChange={(v) => set("dnd", v)} /></Row></Group>
        <Group title="Focus">{["Personal", "Work", "Sleep", "Driving", "Gaming"].map((f) => <Row key={f} label={f} sub="Set up" />)}</Group>
        <Group><Row label="Share across devices"><Toggle on={false} onChange={() => {}} disabled /></Row></Group>
      </>;
      case "screentime": { const u = p<Record<string, number>>("usage", {}); const entries = Object.entries(u).sort((a, b) => b[1] - a[1]); const total = entries.reduce((n, e) => n + e[1], 0); return <>
        <Group title="Today"><Row label="Total" sub="Time with windows open this session"><span className={styles.val}>{Math.round(total / 60)} min</span></Row></Group>
        <Group title="Most used">{entries.length ? entries.slice(0, 8).map(([slug, sec]) => { const a = allApps.find((x) => x.slug === slug); return <Row key={slug} label={a?.name ?? slug}><span className={styles.val}>{Math.max(1, Math.round(sec / 60))} min</span></Row>; }) : <Row label="No usage yet" />}</Group>
        <Group><Row label="App Limits" sub="Set time limits for apps" onClick={() => notify("App limits are not available yet.", "Screen Time")} /><Row label="Downtime" onClick={() => notify("Downtime is not available yet.", "Screen Time")} /></Group>
      </>; }
      case "appearance": return <>
        <Group>
          <Row label="Appearance"><div className={styles.seg}>{(["light", "dark", "auto"] as const).map((m) => <button key={m} type="button" className={p("appearance", "light") === m ? styles.segOn : ""} onClick={() => set("appearance", m)}>{m === "light" ? "Light" : m === "dark" ? "Dark" : "Auto"}</button>)}</div></Row>
          <Row label="Accent colour"><div className={styles.accents}>{Object.entries(ACCENTS).map(([k, c]) => <button key={k} type="button" title={k} style={{ background: c }} className={p("accent", "blue") === k ? styles.accentOn : ""} onClick={() => set("accent", k)} />)}</div></Row>
          <Row label="Highlight colour"><Sel value={p("highlight", "accent")} options={[["accent", "Accent Colour"], ["blue", "Blue"], ["purple", "Purple"], ["pink", "Pink"], ["red", "Red"], ["orange", "Orange"], ["yellow", "Yellow"], ["green", "Green"], ["graphite", "Graphite"]]} onChange={(v) => set("highlight", v)} /></Row>
          <Row label="Sidebar icon size"><Sel value={p("sidebarIcon", "medium")} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]} onChange={(v) => set("sidebarIcon", v)} /></Row>
          <Row label="Allow wallpaper tinting in windows"><Toggle on={p("tinting", true)} onChange={(v) => set("tinting", v)} /></Row>
          <Row label="Show scroll bars"><Sel value={p("scrollbars", "auto")} options={[["auto", "Automatically based on mouse or trackpad"], ["scrolling", "When scrolling"], ["always", "Always"]]} onChange={(v) => set("scrollbars", v)} /></Row>
          <Row label="Click in the scroll bar to"><Sel value={p("scrollClick", "page")} options={[["page", "Jump to the next page"], ["spot", "Jump to the spot that's clicked"]]} onChange={(v) => set("scrollClick", v)} /></Row>
        </Group>
      </>;
      case "accessibility": return <>
        <Group title="Vision">
          <Row label="Reduce motion"><Toggle on={p("reduceMotion", false)} onChange={(v) => set("reduceMotion", v)} /></Row>
          <Row label="Reduce transparency"><Toggle on={p("reduceTransparency", false)} onChange={(v) => set("reduceTransparency", v)} /></Row>
          <Row label="Increase contrast"><Toggle on={p("contrast", false)} onChange={(v) => set("contrast", v)} /></Row>
          <Row label="Larger text" sub="Scales the whole desktop"><Toggle on={p("largerText", false)} onChange={(v) => set("largerText", v)} /></Row>
          <Row label="Pointer size"><Slider value={p("pointer", 1)} min={1} max={4} onChange={(v) => set("pointer", v)} labels={["Normal", "Large"]} /></Row>
        </Group>
        <Group title="Hearing"><Row label="Flash the screen when an alert sound occurs"><Toggle on={p("flashAlert", false)} onChange={(v) => set("flashAlert", v)} /></Row></Group>
        <Group title="Motor"><Row label="Sticky Keys"><Toggle on={p("sticky", false)} onChange={(v) => set("sticky", v)} /></Row><Row label="Slow Keys"><Toggle on={p("slowKeys", false)} onChange={(v) => set("slowKeys", v)} /></Row></Group>
      </>;
      case "controlcentre": { const m = p<Record<string, boolean>>("menuItems", {}); const items: [string, string][] = [["wifi", "Wi‑Fi"], ["bluetooth", "Bluetooth"], ["battery", "Battery"], ["spotlight", "Spotlight"], ["control", "Control Centre"], ["user", "Fast User Switching"]]; return <>
        <Group title="Menu Bar">{items.map(([k, l]) => <Row key={k} label={l}><Sel value={m[k] === false ? "hide" : "show"} options={[["show", "Show in Menu Bar"], ["hide", "Don't Show in Menu Bar"]]} onChange={(v) => set("menuItems", { ...m, [k]: v === "show" })} /></Row>)}</Group>
        <Group title="Clock"><Row label="Clock options" onClick={() => { setPane("general"); setSub("datetime"); }} /></Group>
        <Group><Row label="Automatically hide and show the menu bar"><Sel value={p("hideMenuBar", "never")} options={[["never", "Never"], ["fullscreen", "In Full Screen Only"]]} onChange={(v) => set("hideMenuBar", v)} /></Row></Group>
      </>; }
      case "siri": return <>
        <Group><Row label="Ask Siri" sub="Siri is not available on a web desktop; the Terminal's `ask` command talks to the model"><Toggle on={false} onChange={() => {}} disabled /></Row></Group>
        <Group title="Spotlight" note="Choose what Spotlight searches.">
          <Row label="Applications"><Toggle on={true} onChange={() => {}} disabled /></Row>
          <Row label="App descriptions"><Toggle on={p("spotlightDescriptions", true)} onChange={(v) => set("spotlightDescriptions", v)} /></Row>
          <Row label="Create new apps from a sentence"><Toggle on={p("spotlightCreate", true)} onChange={(v) => set("spotlightCreate", v)} /></Row>
        </Group>
      </>;
      case "privacy": return <>
        <Group title="Privacy">
          {[["Location Services", "Weather uses the city you choose, never your location"], ["Contacts", "No app has asked"], ["Calendars", "Calendar keeps its own events"], ["Photos", "No app has asked"], ["Microphone", "No app has asked"], ["Camera", "No app has asked"], ["Files and Folders", "Each app sees only its own records"], ["Analytics & Improvements", "Nothing is collected"]].map(([l, s]) => <Row key={l} label={l} sub={s} />)}
        </Group>
        <Group title="Security">
          <Row label="App sandbox" sub="Every app runs in an isolated frame with no access to the desktop or your session"><span className={styles.val}>On</span></Row>
          <Row label="FileVault" sub="Records live in the database, protected by your password"><span className={styles.val}>On</span></Row>
          <Row label="Lockdown Mode"><Toggle on={p("lockdown", false)} onChange={(v) => set("lockdown", v)} /></Row>
        </Group>
      </>;
      case "dock": return <>
        <Group title="Dock">
          <Row label="Size"><Slider value={p("dockSize", 52)} min={32} max={80} onChange={(v) => set("dockSize", v)} labels={["Small", "Large"]} /></Row>
          <Row label="Magnification"><Toggle on={p("magnification", true)} onChange={(v) => set("magnification", v)} /></Row>
          {p("magnification", true) ? <Row label="Magnified size"><Slider value={p("magnifySize", 92)} min={56} max={128} onChange={(v) => set("magnifySize", v)} labels={["Small", "Large"]} /></Row> : null}
          <Row label="Position on screen"><Sel value={p("dockPosition", "bottom")} options={[["left", "Left"], ["bottom", "Bottom"], ["right", "Right"]]} onChange={(v) => set("dockPosition", v)} /></Row>
          <Row label="Minimise windows using"><Sel value={p("minimiseEffect", "scale")} options={[["genie", "Genie Effect"], ["scale", "Scale Effect"]]} onChange={(v) => set("minimiseEffect", v)} /></Row>
          <Row label="Double-click a window's title bar to"><Sel value={p("doubleClickTitle", "zoom")} options={[["zoom", "Zoom"], ["minimise", "Minimise"], ["none", "Do Nothing"]]} onChange={(v) => set("doubleClickTitle", v)} /></Row>
          <Row label="Minimise windows into application icon"><Toggle on={p("minIntoApp", false)} onChange={(v) => set("minIntoApp", v)} /></Row>
          <Row label="Automatically hide and show the Dock"><Toggle on={p("autohideDock", false)} onChange={(v) => set("autohideDock", v)} /></Row>
          <Row label="Animate opening applications"><Toggle on={p("bounceOpen", true)} onChange={(v) => set("bounceOpen", v)} /></Row>
          <Row label="Show indicators for open applications"><Toggle on={p("dockIndicators", true)} onChange={(v) => set("dockIndicators", v)} /></Row>
          <Row label="Show suggested and recent apps in Dock"><Toggle on={p("showRecents", true)} onChange={(v) => set("showRecents", v)} /></Row>
        </Group>
        <Group title="Desktop & Stage Manager">
          <Row label="Show items on Desktop"><Toggle on={p("desktopIcons", true)} onChange={(v) => set("desktopIcons", v)} /></Row>
          <Row label="Click wallpaper to reveal desktop"><Sel value={p("clickWallpaper", "always")} options={[["always", "Always"], ["stage", "Only in Stage Manager"]]} onChange={(v) => set("clickWallpaper", v)} /></Row>
        </Group>
        <Group title="Windows">
          <Row label="Prefer tabs when opening documents"><Sel value={p("preferTabs", "fullscreen")} options={[["never", "Never"], ["fullscreen", "In Full Screen"], ["always", "Always"]]} onChange={(v) => set("preferTabs", v)} /></Row>
          <Row label="Ask to keep changes when closing documents"><Toggle on={p("askKeep", false)} onChange={(v) => set("askKeep", v)} /></Row>
          <Row label="Close windows when quitting an application"><Toggle on={p("closeOnQuit", true)} onChange={(v) => set("closeOnQuit", v)} /></Row>
        </Group>
        <Group title="Hot Corners"><Row label="Hot Corners…"><Btn onClick={() => notify("Hot corners are not available yet.", "Desktop & Dock")}>Hot Corners…</Btn></Row></Group>
      </>;
      case "displays": return <>
        <Group title="Built-in Display">
          <Row label="Use as"><span className={styles.val}>Main display · {typeof window !== "undefined" ? `${window.screen.width} × ${window.screen.height}` : ""}</span></Row>
          <Row label="Resolution"><div className={styles.seg}>{(["larger", "default", "more"] as const).map((m) => <button key={m} type="button" className={p("resolution", "default") === m ? styles.segOn : ""} onClick={() => set("resolution", m)}>{m === "larger" ? "Larger Text" : m === "default" ? "Default" : "More Space"}</button>)}</div></Row>
          <Row label="Brightness"><Slider value={p("brightness", 100)} min={40} max={100} onChange={(v) => set("brightness", v)} /></Row>
          <Row label="Automatically adjust brightness"><Toggle on={p("autoBright", true)} onChange={(v) => set("autoBright", v)} /></Row>
          <Row label="True Tone"><Toggle on={p("trueTone", false)} onChange={(v) => set("trueTone", v)} /></Row>
          <Row label="Night Shift" sub="Warmer colours"><Toggle on={p("nightShift", false)} onChange={(v) => set("nightShift", v)} /></Row>
        </Group>
        <Group><Row label="Advanced…"><Btn onClick={() => notify("Nothing to set here on a web desktop.", "Displays")}>Advanced…</Btn></Row></Group>
      </>;
      case "wallpaper": return <>
        <Group title="Current">
          <div className={styles.wallCurrent} style={{ backgroundImage: wallpaper.startsWith("gradient:") ? wallpaper.slice(9) : `url(${wallpaper})` }} />
        </Group>
        <Group title="AI Mac" note="Pick one, or describe a new wallpaper and the image model paints it (about half a minute).">
          <div className={styles.wallGrid}>
            {WALLPAPERS.map((w) => <button key={w.id} type="button" title={w.name} className={`${styles.wallTile} ${wallpaper === w.value ? styles.wallOn : ""}`} style={{ backgroundImage: w.value.startsWith("gradient:") ? w.value.slice(9) : `url(${w.value})` }} onClick={() => setWallpaper(w.value)}><span>{w.name}</span></button>)}
          </div>
          <Row label="Generate a wallpaper"><input className={styles.text} value={wallPrompt} onChange={(e) => setWallPrompt(e.target.value)} placeholder="Misty pine forest at dawn" disabled={making} /><Btn primary onClick={makeWallpaper} disabled={making || wallPrompt.trim().length < 3}>{making ? "Painting…" : "Generate"}</Btn></Row>
        </Group>
      </>;
      case "screensaver": return <>
        <Group>
          <Row label="Screen saver"><Sel value={p("screenSaver", "drift")} options={[["drift", "Drift"], ["clock", "Word Clock"], ["flurry", "Flurry"], ["monterey", "Monterey Dunes"]]} onChange={(v) => set("screenSaver", v)} /></Row>
          <Row label="Start after"><Sel value={String(p("screenSaverMinutes", 0))} options={[["0", "Never"], ["1", "1 minute"], ["5", "5 minutes"], ["10", "10 minutes"], ["20", "20 minutes"], ["30", "30 minutes"]]} onChange={(v) => set("screenSaverMinutes", Number(v))} /></Row>
          <Row label="Show with clock"><Toggle on={p("saverClock", true)} onChange={(v) => set("saverClock", v)} /></Row>
        </Group>
      </>;
      case "battery": return <>
        <Group><Row label="Battery level" sub="Charging via the power adapter"><span className={styles.val}>100%</span></Row><Row label="Low Power Mode" sub="Reduces motion and effects"><Sel value={p("lowPower", "never")} options={[["never", "Never"], ["battery", "Only on Battery"], ["always", "Always"]]} onChange={(v) => set("lowPower", v)} /></Row></Group>
        <Group title="Usage"><Row label="Last 24 hours" sub="A web desktop uses whatever your browser uses" /></Group>
      </>;
      case "lockscreen": return <>
        <Group>
          <Row label="Start Screen Saver when inactive"><Sel value={String(p("screenSaverMinutes", 0))} options={[["0", "Never"], ["1", "For 1 minute"], ["5", "For 5 minutes"], ["10", "For 10 minutes"], ["20", "For 20 minutes"]]} onChange={(v) => set("screenSaverMinutes", Number(v))} /></Row>
          <Row label="Require password after screen saver begins"><Sel value={String(p("lockAfterMinutes", 0))} options={[["0", "Never"], ["1", "After 1 minute"], ["5", "After 5 minutes"], ["15", "After 15 minutes"]]} onChange={(v) => set("lockAfterMinutes", Number(v))} /></Row>
          <Row label="Show message when locked"><input className={styles.text} value={p("lockMessage", "")} onChange={(e) => set("lockMessage", e.target.value.slice(0, 80))} placeholder="Optional message" /></Row>
          <Row label="Show user name and photo"><Toggle on={p("lockShowUser", true)} onChange={(v) => set("lockShowUser", v)} /></Row>
        </Group>
        <Group><Row label="Lock this Mac now"><Btn onClick={onLock}>Lock Screen</Btn></Row></Group>
      </>;
      case "touchid": return <>
        <Group title="Touch ID"><Row label="Touch ID is not available on this Mac" sub="Sign in with your password" /></Group>
        <Group title="Password"><Row label="Change the password for this account"><Btn onClick={() => { setPane("users"); setPw({ cur: "", next: "", again: "" }); }}>Change…</Btn></Row></Group>
      </>;
      case "users": return <>
        <Group>
          <Row label={<span className={styles.userLabel}><i className={styles.avatar}>{initial}</i>{name}</span>} sub={`${user.email} · Admin`}><Btn onClick={() => setPw(pw ? null : { cur: "", next: "", again: "" })}>Change Password…</Btn></Row>
          {pw ? <>
            <Row label="Current password"><input className={styles.text} type="password" value={pw.cur} onChange={(e) => setPw({ ...pw, cur: e.target.value })} /></Row>
            <Row label="New password"><input className={styles.text} type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Row>
            <Row label="Verify"><input className={styles.text} type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /><Btn onClick={() => setPw(null)}>Cancel</Btn><Btn primary onClick={savePassword} disabled={pw.next.length < 8}>Change Password</Btn></Row>
          </> : null}
        </Group>
        <Group><Row label="Automatically log in as"><span className={styles.val}>Off</span></Row><Row label="Guest User" sub="Off"><Toggle on={false} onChange={() => notify("Guest accounts are not available.", "Users & Groups")} /></Row></Group>
        <Group><Row label="Log out"><Btn onClick={onSignOut}>Log Out {name}…</Btn></Row></Group>
      </>;
      case "passwords": return <Group note="Passwords for other sites are not stored on this Mac."><Row label="AI Mac" sub={user.email}><Btn onClick={() => setPane("users")}>Change…</Btn></Row></Group>;
      case "internet": return <Group note="Mail, Contacts and Calendar accounts cannot be added to a web desktop."><Row label="No accounts" /><Row label="Add Account…"><Btn disabled>Add Account…</Btn></Row></Group>;
      case "gamecenter": return <Group><Row label="Game Center" sub="Bomberman and Road Rash keep their own high scores"><Toggle on={p("gamecenter", false)} onChange={(v) => set("gamecenter", v)} /></Row><Row label="Open Bomberman" onClick={() => onOpenApp("bomberman")} /><Row label="Open Road Rash" onClick={() => onOpenApp("roadrash")} /></Group>;
      case "wallet": return <Group note="Apple Pay is not available on this Mac."><Row label="No cards" /><Row label="Add Card…"><Btn disabled>Add Card…</Btn></Row></Group>;
      case "keyboard": return <>
        <Group>
          <Row label="Key repeat rate"><Slider value={p("keyRepeat", 6)} min={1} max={8} onChange={(v) => set("keyRepeat", v)} labels={["Slow", "Fast"]} /></Row>
          <Row label="Delay until repeat"><Slider value={p("keyDelay", 3)} min={1} max={6} onChange={(v) => set("keyDelay", v)} labels={["Long", "Short"]} /></Row>
          <Row label="Adjust keyboard brightness in low light"><Toggle on={p("kbBright", true)} onChange={(v) => set("kbBright", v)} /></Row>
          <Row label="Press 🌐 key to"><Sel value={p("globe", "emoji")} options={[["emoji", "Show Emoji & Symbols"], ["input", "Change Input Source"], ["nothing", "Do Nothing"]]} onChange={(v) => set("globe", v)} /></Row>
        </Group>
        <Group title="Keyboard Shortcuts">
          {[["Spotlight", "⌘ Space"], ["New app", "⌘ N"], ["Close window", "⌘ W"], ["Minimise", "⌘ M"], ["Lock screen", "⌃ ⌘ Q"], ["Dismiss dialogs", "Esc"]].map(([l, k]) => <Row key={l} label={l}><kbd className={styles.kbd}>{k}</kbd></Row>)}
        </Group>
        <Group title="Text Input"><Row label="Correct spelling automatically"><Toggle on={p("spell", true)} onChange={(v) => set("spell", v)} /></Row><Row label="Capitalise words automatically"><Toggle on={p("caps", false)} onChange={(v) => set("caps", v)} /></Row><Row label="Use smart quotes and dashes"><Toggle on={p("smartQuotes", true)} onChange={(v) => set("smartQuotes", v)} /></Row></Group>
      </>;
      case "mouse": return <Group>
        <Row label="Tracking speed"><Slider value={p("mouseSpeed", 5)} min={1} max={10} onChange={(v) => set("mouseSpeed", v)} labels={["Slow", "Fast"]} /></Row>
        <Row label="Natural scrolling"><Toggle on={p("naturalScroll", true)} onChange={(v) => set("naturalScroll", v)} /></Row>
        <Row label="Secondary click"><Sel value={p("secondaryClick", "right")} options={[["right", "Click Right Side"], ["left", "Click Left Side"]]} onChange={(v) => set("secondaryClick", v)} /></Row>
        <Row label="Double-click speed"><Slider value={p("dblSpeed", 6)} min={1} max={10} onChange={(v) => set("dblSpeed", v)} labels={["Slow", "Fast"]} /></Row>
      </Group>;
      case "trackpad": return <Group>
        <Row label="Tracking speed"><Slider value={p("tpSpeed", 5)} min={1} max={10} onChange={(v) => set("tpSpeed", v)} labels={["Slow", "Fast"]} /></Row>
        <Row label="Click"><Sel value={p("tpClick", "medium")} options={[["light", "Light"], ["medium", "Medium"], ["firm", "Firm"]]} onChange={(v) => set("tpClick", v)} /></Row>
        <Row label="Tap to click"><Toggle on={p("tapClick", false)} onChange={(v) => set("tapClick", v)} /></Row>
        <Row label="Force Click and haptic feedback"><Toggle on={p("forceClick", true)} onChange={(v) => set("forceClick", v)} /></Row>
      </Group>;
      case "printers": return <Group note="Printing from a web desktop uses the browser's print dialog."><Row label="No printers are set up" /><Row label="Add Printer, Scanner or Fax…"><Btn disabled>Add…</Btn></Row></Group>;
    }
    return <Group><Row label="Nothing here yet" /></Group>;
  }

  return (
    <div className={styles.app}>
      <aside className={styles.sidebar}>
        <div className={styles.search}><svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="6" cy="6" r="4.5" /><path d="m9.5 9.5 3 3" /></svg><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></div>
        <button type="button" className={`${styles.user} ${pane === "users" ? styles.on : ""}`} onClick={() => { setPane("users"); setSub(null); }}><i className={styles.avatar}>{initial}</i><span><b>{name}</b><small>AI Mac account</small></span></button>
        <nav className={styles.list}>
          {visible.map((x, i) => <div key={x.id}>
            {i > 0 && visible[i - 1].group !== x.group ? <div className={styles.gap} /> : null}
            <button type="button" className={`${styles.item} ${pane === x.id ? styles.on : ""}`} onClick={() => { setPane(x.id); setSub(null); }}>
              <i style={{ background: x.color }}><svg viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={x.glyph} /></svg></i>{x.name}
            </button>
          </div>)}
        </nav>
      </aside>
      <main className={styles.main}>
        <header className={styles.head}>
          <button type="button" className={styles.navBtn} disabled={!(pane === "general" && sub)} onClick={() => setSub(null)} aria-label="Back">‹</button>
          <button type="button" className={styles.navBtn} disabled aria-label="Forward">›</button>
          <h1>{current}</h1>
        </header>
        <div className={styles.body}>{body()}</div>
      </main>
    </div>
  );
}
