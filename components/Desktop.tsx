"use client";
/* eslint-disable react-hooks/refs -- the compiler lint flags menu item closures that call open(), which reads window-order refs when invoked, never during render */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRow, Prefs } from "@/lib/apps";
import { BUILTIN_APPS, DEFAULT_APPS, WINDOW_SIZES, isBuiltin } from "@/lib/catalog";
import { AppWindow } from "./AppWindow";
import { Dock, type DockEntry } from "./Dock";
import { Glyph, MenuBar, type Menu, type MenuItem } from "./MenuBar";
import { ACCENTS, Settings } from "./Settings";
import { Terminal } from "./Terminal";
import styles from "./desktop.module.css";

export type WinState = "open" | "closing" | "minPending" | "minimising" | "min";
export type Win = {
  id: number; slug: string; title: string;
  x: number; y: number; w: number; h: number; z: number;
  max: boolean; state: WinState;
  origin?: { x: number; y: number }; // where it zooms out from (the icon)
  target?: { x: number; y: number }; // where it shrinks to (the dock)
  opened: boolean; zooming: boolean;
  pane?: string; // System Settings pane to open on
};
type Notice = { id: number; title: string; body: string; icon: string; leaving?: boolean };
type Geom = { x: number; y: number; w: number; h: number };
type Ctx = { x: number; y: number; items: MenuItem[]; up?: boolean };

export const MENU_H = 24;
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const BUILTIN_ROWS: AppRow[] = BUILTIN_APPS.map((b, i) => ({ id: -1 - i, slug: b.slug, name: b.name, description: b.description, icon_url: b.icon, position: 1000 + i, current_version_id: null, version: 1 }));

export function Desktop({ user, initialApps, dockSlugs, wallpaper: initialWallpaper, prefs: initialPrefs }: { user: { id: number; email: string }; initialApps: AppRow[]; dockSlugs: string[]; wallpaper: string; prefs: Prefs }) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [dock, setDockState] = useState(dockSlugs);
  const [prefs, setPrefsState] = useState<Prefs>(initialPrefs);
  const [wallpaper, setWallpaperState] = useState(initialWallpaper);
  const [wins, setWins] = useState<Win[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [clock, setClock] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<{ id: number; name: string }[]>([]); // icons shown while an app is being designed
  const [spot, setSpot] = useState<string | null>(null);
  const [spotIdx, setSpotIdx] = useState(0);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState<Set<string>>(new Set());
  const [about, setAbout] = useState(false);
  const [trash, setTrash] = useState<AppRow[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [saver, setSaver] = useState(false);
  const [nearBottom, setNearBottom] = useState(false);
  const zRef = useRef(10);
  const idRef = useRef(1);
  const nRef = useRef(1);
  const geomRef = useRef<Record<string, Geom>>({}); // where each app's window was last time
  const restored = useRef(false);
  const lastActivity = useRef(0);
  const usageRef = useRef<Record<string, number>>({});
  const sessionKey = `aic:session:${user.id}`;

  const p = useCallback(<T,>(k: string, d: T): T => (prefs[k] === undefined ? d : (prefs[k] as T)), [prefs]);
  const allApps = useMemo(() => [...apps, ...BUILTIN_ROWS], [apps]);
  const appOf = useCallback((slug: string) => allApps.find((a) => a.slug === slug), [allApps]);
  const isDefault = (slug: string) => DEFAULT_APPS.some((a) => a.slug === slug);
  const K = isMac ? "⌘" : "Ctrl+";
  const name = user.email.split("@")[0];

  /* ---------- preferences ---------- */
  const setPrefs = useCallback((patch: Prefs) => {
    setPrefsState((s) => ({ ...s, ...patch }));
    fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefs: patch }) }).catch(() => {});
  }, []);
  const setWallpaper = useCallback((url: string) => {
    setWallpaperState(url);
    fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallpaper_url: url }) }).catch(() => {});
  }, []);
  function setDock(fn: (d: string[]) => string[]) {
    setDockState((d) => {
      const next = fn(d);
      fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dock_slugs: next }) }).catch(() => {});
      return next;
    });
  }
  const dark = p<string>("appearance", "light") === "dark" || (p<string>("appearance", "light") === "auto" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const accent = ACCENTS[p("accent", "blue")] ?? ACCENTS.blue;
  const reduceMotion = p("reduceMotion", false) || p<string>("lowPower", "never") === "always";

  // No browser autofill popups anywhere in the shell either.
  useEffect(() => {
    const quiet = (root: ParentNode) => root.querySelectorAll("input, textarea, form").forEach((el) => el.setAttribute("autocomplete", "off"));
    quiet(document);
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { quiet(n); if (n.matches("input, textarea, form")) n.setAttribute("autocomplete", "off"); } })));
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  /* ---------- clock ---------- */
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const lang = p("language", "en-GB");
      const parts: string[] = [];
      if (p("clockDay", true) || p("clockDate", true)) parts.push(d.toLocaleDateString(lang, { ...(p("clockDay", true) ? { weekday: "short" } : {}), ...(p("clockDate", true) ? { day: "numeric", month: "short" } : {}) }).replace(",", ""));
      parts.push(d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit", ...(p("clockSeconds", false) ? { second: "2-digit" } : {}), hour12: !p("clock24", true) }));
      setClock(parts.join("  "));
    };
    tick();
    const t = setInterval(tick, p("clockSeconds", false) ? 1000 : 5000);
    return () => clearInterval(t);
  }, [p]);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/apps");
    if (r.ok) setApps((await r.json()).apps);
  }, []);

  /* ---------- notifications ---------- */
  const dismiss = useCallback((id: number) => {
    setNotices((n) => n.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 400);
  }, []);
  const notify = useCallback((body: string, title = "AI Mac", icon = "/icons/settings.png", slug?: string) => {
    if (p("dnd", false)) return;
    if (slug && p<Record<string, boolean>>("notifyApps", {})[slug] === false) return;
    const id = nRef.current++;
    setNotices((n) => [...n.slice(-3), { id, title, body, icon }]);
    setTimeout(() => dismiss(id), 5000);
    if (p("alertSound", true) && !p("mute", false)) {
      try {
        const ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const o = ac.createOscillator(); const g = ac.createGain();
        o.type = "sine"; o.frequency.value = 880; g.gain.value = 0.0001;
        o.connect(g); g.connect(ac.destination); o.start();
        g.gain.exponentialRampToValueAtTime(0.08 * (p<number>("alertVolume", 60) / 100), ac.currentTime + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.25);
        o.stop(ac.currentTime + 0.3);
      } catch { /* no audio */ }
    }
  }, [dismiss, p]);

  /* ---------- windows ---------- */
  const update = useCallback((id: number, patch: Partial<Win>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w))), []);
  const focus = useCallback((id: number) => {
    zRef.current += 1;
    const z = zRef.current;
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z, state: w.state === "min" || w.state === "minimising" ? "open" : w.state } : w)));
    setActive(id);
  }, []);
  const place = useCallback((slug: string, n: number, geom?: Geom): Geom => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const saved = geom ?? geomRef.current[slug];
    if (saved) return { x: Math.min(Math.max(0, saved.x), vw - 120), y: Math.min(Math.max(MENU_H, saved.y), vh - 80), w: Math.min(saved.w, vw - 16), h: Math.min(saved.h, vh - MENU_H - 16) };
    const want = WINDOW_SIZES[slug] ?? { w: 1040, h: 680 };
    const w = Math.min(want.w, vw - 80), h = Math.min(want.h, vh - MENU_H - 110);
    return { x: Math.round(Math.max(16, (vw - w) / 2 - 60 + (n % 6) * 28)), y: Math.round(Math.max(MENU_H + 12, (vh - h) / 2 - 30 + (n % 6) * 24)), w, h };
  }, []);
  const open = useCallback((slug: string, origin?: { x: number; y: number }, pane?: string) => {
    const app = allApps.find((a) => a.slug === slug);
    if (!app) return;
    const existing = wins.find((w) => w.slug === slug && w.state !== "closing");
    if (existing) { focus(existing.id); if (pane) update(existing.id, { pane }); return; }
    zRef.current += 1;
    const id = idRef.current++;
    const g = place(slug, wins.length);
    setWins((ws) => [...ws, { id, slug, title: app.name, ...g, z: zRef.current, max: false, state: "open", origin, opened: false, zooming: false, pane }]);
    setActive(id);
  }, [allApps, wins, focus, place, update]);
  const close = useCallback((id: number) => {
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (w && !w.max) geomRef.current[w.slug] = { x: w.x, y: w.y, w: w.w, h: w.h };
      return ws.map((x) => (x.id === id ? { ...x, state: "closing" } : x));
    });
    setTimeout(() => setWins((ws) => ws.filter((w) => w.id !== id)), 170);
    setActive((a) => (a === id ? null : a));
  }, []);
  const minimise = useCallback((id: number) => { update(id, { state: "minPending" }); setActive((a) => (a === id ? null : a)); }, [update]);
  useEffect(() => {
    const pending = wins.filter((w) => w.state === "minPending");
    if (!pending.length) return;
    const raf = requestAnimationFrame(() => {
      for (const w of pending) {
        const el = document.querySelector(p("minIntoApp", false) ? `[data-dock="${w.slug}"]` : `[data-dock-min="${w.id}"]`) ?? document.querySelector(`[data-dock-min="${w.id}"]`);
        const r = el?.getBoundingClientRect();
        const target = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight - 30 };
        update(w.id, { state: "minimising", target });
        setTimeout(() => setWins((ws) => ws.map((x) => (x.id === w.id && x.state === "minimising" ? { ...x, state: "min" } : x))), reduceMotion ? 0 : 440);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [wins, update, p, reduceMotion]);
  const zoom = useCallback((id: number) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, max: !w.max, zooming: true } : w)));
    setTimeout(() => update(id, { zooming: false }), 340);
  }, [update]);

  // Session: open windows come back after a reload, where they were; login items open on a fresh start.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    let list: { slug: string; x: number; y: number; w: number; h: number; max: boolean; min: boolean }[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) || "null") as { geoms?: Record<string, Geom>; wins?: typeof list } | null;
      if (saved?.geoms) geomRef.current = saved.geoms;
      list = (saved?.wins || []).filter((s) => allApps.some((a) => a.slug === s.slug)).slice(0, 8);
    } catch { /* no session */ }
    if (!list.length) {
      const items = (initialPrefs.loginItems as string[] | undefined) ?? [];
      list = items.filter((s) => allApps.some((a) => a.slug === s)).map((slug) => ({ slug, x: 0, y: 0, w: 0, h: 0, max: false, min: false }));
      if (!list.length) return;
      const ws: Win[] = list.map((s, i) => { zRef.current += 1; return { id: idRef.current++, slug: s.slug, title: allApps.find((a) => a.slug === s.slug)!.name, ...place(s.slug, i), z: zRef.current, max: false, state: "open", opened: false, zooming: false }; });
      setWins(ws); setActive(ws.at(-1)!.id); return;
    }
    const ws: Win[] = list.map((s, i) => {
      zRef.current += 1;
      return { id: idRef.current++, slug: s.slug, title: allApps.find((a) => a.slug === s.slug)!.name, ...place(s.slug, i, s), z: zRef.current, max: s.max, state: s.min ? "min" : "open", opened: true, zooming: false, target: s.min ? { x: window.innerWidth / 2, y: window.innerHeight - 30 } : undefined };
    });
    setWins(ws);
    const top = ws.filter((w) => w.state === "open").at(-1);
    if (top) setActive(top.id);
  }, [allApps, place, sessionKey, initialPrefs]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const list = wins.filter((w) => w.state !== "closing").map((w) => ({ slug: w.slug, x: w.x, y: w.y, w: w.w, h: w.h, max: w.max, min: w.state === "min" || w.state === "minimising" || w.state === "minPending" }));
        localStorage.setItem(sessionKey, JSON.stringify({ geoms: geomRef.current, wins: list }));
      } catch { /* storage unavailable */ }
    }, 300);
    return () => clearTimeout(t);
  }, [wins, sessionKey]);

  // Screen Time: seconds each app had a window open.
  useEffect(() => {
    const t = setInterval(() => {
      const openSlugs = new Set(wins.filter((w) => w.state === "open").map((w) => w.slug));
      if (!openSlugs.size) return;
      for (const s of openSlugs) usageRef.current[s] = (usageRef.current[s] || 0) + 30;
      const merged = { ...(p<Record<string, number>>("usage", {})) };
      for (const s of openSlugs) merged[s] = (merged[s] || 0) + 30;
      setPrefs({ usage: merged });
    }, 30000);
    return () => clearInterval(t);
  }, [wins, p, setPrefs]);

  // Idle: screen saver and lock after the chosen minutes.
  useEffect(() => {
    const touch = () => { lastActivity.current = Date.now(); if (saver) setSaver(false); };
    window.addEventListener("pointermove", touch); window.addEventListener("keydown", touch); window.addEventListener("pointerdown", touch);
    const t = setInterval(() => {
      const idle = (Date.now() - lastActivity.current) / 60000;
      const sm = p<number>("screenSaverMinutes", 0), lm = p<number>("lockAfterMinutes", 0);
      if (sm > 0 && idle >= sm && !saver && !locked) setSaver(true);
      if (sm > 0 && lm > 0 && idle >= sm + lm && !locked) { setLocked(true); setSaver(false); }
    }, 5000);
    return () => { window.removeEventListener("pointermove", touch); window.removeEventListener("keydown", touch); window.removeEventListener("pointerdown", touch); clearInterval(t); };
  }, [p, saver, locked]);

  // Autohide dock: reveal when the pointer reaches the bottom edge.
  const autohide = p("autohideDock", false);
  useEffect(() => {
    if (!autohide) return;
    const h = (e: PointerEvent) => setNearBottom((was) => e.clientY > window.innerHeight - (was ? 110 : 6));
    window.addEventListener("pointermove", h);
    return () => window.removeEventListener("pointermove", h);
  }, [autohide]);
  const dockShown = !autohide || nearBottom;

  const activeId = wins.some((w) => w.id === active && w.state === "open") ? active : (wins.filter((w) => w.state === "open").sort((a, b) => b.z - a.z)[0]?.id ?? null);

  /* ---------- new app, trash, sign out ---------- */
  /** Designing the name and icon takes about half a minute. The icon appears on the
   *  desktop at once with a progress ring, the way the App Store shows a download. */
  async function createApp(e?: React.FormEvent, text = wish) {
    e?.preventDefault();
    const wishText = text.trim();
    if (wishText.length < 4) return;
    setNewOpen(false); setSpot(null); setWish(""); setCreating(true);
    const pid = nRef.current++;
    const guess = wishText.replace(/^(a|an|the)\s+/i, "").split(/[\s,.]+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    setPending((l) => [...l, { id: pid, name: guess || "New App" }]);
    try {
      const r = await fetch("/api/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wish: wishText }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return notify(j.error || "Could not create the app.", "New app", "/icons/new-app.png");
      await refresh();
      setTimeout(() => window.dispatchEvent(new CustomEvent("aic:open", { detail: j.slug })), 60);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create the app.", "New app", "/icons/new-app.png");
    } finally {
      setPending((l) => l.filter((x) => x.id !== pid));
      setCreating(false);
    }
  }
  useEffect(() => {
    const h = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener("aic:open", h);
    return () => window.removeEventListener("aic:open", h);
  }, [open]);
  async function removeApp(slug: string) {
    const r = await fetch(`/api/apps/${slug}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error || "Could not remove it.");
    wins.filter((w) => w.slug === slug).forEach((w) => close(w.id));
    setDock((d) => d.filter((s) => s !== slug));
    refresh();
    notify(`${appOf(slug)?.name ?? "The app"} was moved to the Trash. You can put it back from there.`, "Trash");
  }
  async function openTrash() { const r = await fetch("/api/trash"); setTrash(r.ok ? (await r.json()).apps : []); }
  async function putBack(slug: string) { await fetch("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) }); await refresh(); setTrash((t) => (t ? t.filter((a) => a.slug !== slug) : t)); }
  async function emptyTrash() { await fetch("/api/trash", { method: "DELETE" }); setTrash([]); }
  async function signOut() { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }

  const winCmd = (cmd: string, target?: { id?: number; slug?: string }) => window.dispatchEvent(new CustomEvent("aic:win", { detail: { ...(target ?? { id: activeId ?? undefined }), cmd } }));

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (locked) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape") { if (!creating) setNewOpen(false); setSpot(null); setCtx(null); setAbout(false); setTrash(null); return; }
      if (!mod) return;
      if ((e.key === "q" || e.key === "Q") && e.ctrlKey && (e.metaKey || !isMac)) { e.preventDefault(); setLocked(true); return; }
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewOpen(true); }
      if (e.key === " ") { e.preventDefault(); setSpot((s) => (s === null ? "" : null)); setSpotIdx(0); }
      if (e.key === ",") { e.preventDefault(); open("settings"); }
      if (activeId === null) return;
      if (e.key === "w" || e.key === "W") { e.preventDefault(); close(activeId); }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); minimise(activeId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, close, minimise, creating, locked, open]);

  /* ---------- menus ---------- */
  const activeWin = wins.find((w) => w.id === activeId && w.state === "open");
  const openWins = wins.filter((w) => w.state !== "closing");
  const loginItems = p<string[]>("loginItems", []);

  const appMenuItems = (slug: string, fromDock = false): MenuItem[] => {
    const a = appOf(slug);
    const running = openWins.filter((w) => w.slug === slug);
    const inDock = dock.includes(slug);
    const items: MenuItem[] = [];
    if (fromDock && running.length) items.push(...running.map((w) => ({ label: w.title, checked: w.id === activeId, action: () => focus(w.id) })), "sep");
    if (!fromDock || !running.length) items.push({ label: "Open", action: () => open(slug) });
    if (a?.version && !isBuiltin(slug)) items.push({ label: "Improve…", action: () => { open(slug); setTimeout(() => winCmd("improve", { slug }), 450); } });
    items.push("sep", { label: inDock ? "Remove from Dock" : "Keep in Dock", action: () => setDock((d) => (inDock ? d.filter((s) => s !== slug) : [...d, slug])) });
    items.push({ label: "Open at Login", checked: loginItems.includes(slug), action: () => setPrefs({ loginItems: loginItems.includes(slug) ? loginItems.filter((s) => s !== slug) : [...loginItems, slug] }) });
    if (fromDock && running.length) items.push("sep", { label: "Show All Windows", action: () => running.forEach((w) => focus(w.id)) }, { label: "Hide", action: () => running.forEach((w) => w.state === "open" && minimise(w.id)) }, { label: "Quit", action: () => running.forEach((w) => close(w.id)) });
    if (!fromDock && !isDefault(slug) && !isBuiltin(slug)) items.push("sep", { label: "Move to Trash", action: () => removeApp(slug) });
    return items;
  };
  const showCtx = (e: React.MouseEvent, items: MenuItem[], anchor?: { x: number; bottom: number }) => {
    e.preventDefault();
    const h = items.reduce<number>((n, it) => n + (it === "sep" ? 11 : 22), 10);
    if (anchor) return setCtx({ x: anchor.x, y: anchor.bottom, items, up: true });
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 232), y: Math.min(e.clientY, window.innerHeight - h - 8), items });
  };

  const leftMenus: Menu[] = [
    { key: "logo", title: Glyph.logo, items: [
      { label: "About This Mac", action: () => open("settings", undefined, "about") }, "sep",
      { label: "System Settings…", shortcut: `${K},`, action: () => open("settings") },
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      { label: "Sleep", action: () => setSaver(true) },
      { label: "Restart…", action: () => location.reload() }, "sep",
      { label: "Lock Screen", shortcut: `⌃${K}Q`, action: () => setLocked(true) },
      { label: `Log Out ${name}…`, action: signOut },
    ] },
    { key: "app", title: activeWin ? (appOf(activeWin.slug)?.name ?? activeWin.title) : "Finder", bold: true, items: activeWin ? [
      { label: `About ${appOf(activeWin.slug)?.name ?? activeWin.title}`, hint: isBuiltin(activeWin.slug) ? "part of AI Mac" : `version ${appOf(activeWin.slug)?.version ?? "?"}, written by AI`, disabled: true }, "sep",
      ...(isBuiltin(activeWin.slug) ? [] : [{ label: "Improve This App…", action: () => winCmd("improve") }, { label: "Rebuild From Scratch", action: () => winCmd("rebuild") }, "sep" as const]),
      { label: dock.includes(activeWin.slug) ? "Remove from Dock" : "Keep in Dock", action: () => { const s = activeWin.slug; setDock((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s])); } },
      { label: "Hide", shortcut: `${K}H`, action: () => minimise(activeWin.id) }, "sep",
      { label: "Close Window", shortcut: `${K}W`, action: () => close(activeWin.id) },
      { label: "Quit", shortcut: `${K}Q`, action: () => openWins.filter((w) => w.slug === activeWin.slug).forEach((w) => close(w.id)) },
    ] : [
      { label: "About Finder", disabled: true }, "sep",
      { label: "Empty Trash…", action: () => { openTrash(); } },
    ] },
    { key: "file", title: "File", items: [
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      ...allApps.map((a) => ({ label: `Open ${a.name}`, action: () => open(a.slug) })),
    ] },
    { key: "edit", title: "Edit", items: [
      { label: "Undo", shortcut: `${K}Z`, disabled: !activeWin, action: () => winCmd("exec:undo") }, { label: "Redo", shortcut: `⇧${K}Z`, disabled: !activeWin, action: () => winCmd("exec:redo") }, "sep",
      { label: "Cut", shortcut: `${K}X`, disabled: !activeWin, action: () => winCmd("exec:cut") }, { label: "Copy", shortcut: `${K}C`, disabled: !activeWin, action: () => winCmd("exec:copy") }, { label: "Paste", shortcut: `${K}V`, disabled: !activeWin, action: () => winCmd("exec:paste") }, { label: "Select All", shortcut: `${K}A`, disabled: !activeWin, action: () => winCmd("exec:selectAll") },
    ] },
    { key: "view", title: "View", items: [
      { label: "Clean Up", action: () => setSelected(null) },
      { label: "Show Desktop Icons", checked: p("desktopIcons", true), action: () => setPrefs({ desktopIcons: !p("desktopIcons", true) }) }, "sep",
      { label: typeof document !== "undefined" && document.fullscreenElement ? "Exit Full Screen" : "Enter Full Screen", shortcut: `⌃${K}F`, action: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) },
    ] },
    { key: "window", title: "Window", items: [
      { label: "Minimise", shortcut: `${K}M`, disabled: !activeWin, action: () => activeWin && minimise(activeWin.id) },
      { label: "Zoom", disabled: !activeWin, action: () => activeWin && zoom(activeWin.id) }, "sep",
      { label: "Bring All to Front", disabled: !openWins.length, action: () => openWins.forEach((w) => { if (w.state !== "min") focus(w.id); }) },
      ...(openWins.length ? ["sep" as const, ...openWins.map((w) => ({ label: w.title, checked: w.id === activeId, hint: w.state === "min" ? "minimised" : undefined, action: () => focus(w.id) }))] : []),
    ] },
    { key: "help", title: "Help", items: [
      { label: "About AI Mac", action: () => setAbout(true) }, "sep",
      { label: "Open an app", action: () => notify("Double-click an icon on the desktop, click it in the Dock, or press " + K + "Space and type its name. The first open writes the app; after that it opens at once.", "Help") },
      { label: "Make a new app", action: () => notify("Double-click New app (or press " + K + "N), describe what you want in a sentence, and it joins the desktop with its own icon.", "Help") },
      { label: "Change an app", action: () => notify("Hover the window's title bar and click the sparkle, or use the app menu. Describe the change; the app keeps working while the new version is written, and your records are kept.", "Help") },
      { label: "Keep an app in the Dock", action: () => notify("Right-click its icon on the desktop or in the Dock and choose Keep in Dock. Remove from Dock undoes it.", "Help") },
      { label: "Recover an app from the Trash", action: () => notify("Click the Trash in the Dock and choose Put Back next to the app. Its records come back with it.", "Help") }, "sep",
      { label: "Keyboard Shortcuts", action: () => open("settings", undefined, "keyboard") },
    ] },
  ];
  const mi = p<Record<string, boolean>>("menuItems", {});
  const rightMenus: Menu[] = ([
    { key: "wifi", title: Glyph.wifi, align: "right", items: [{ label: "Wi‑Fi", hint: p("wifi", true) ? "On" : "Off", action: () => setPrefs({ wifi: !p("wifi", true) }) }, "sep", { label: "AI Mac Network", checked: p("wifi", true) }, "sep", { label: "Wi‑Fi Settings…", action: () => open("settings", undefined, "wifi") }] },
    { key: "bluetooth", title: Glyph.bluetooth, align: "right", items: [{ label: "Bluetooth", hint: p("bt", true) ? "On" : "Off", action: () => setPrefs({ bt: !p("bt", true) }) }, "sep", { label: "Bluetooth Settings…", action: () => open("settings", undefined, "bluetooth") }] },
    { key: "battery", title: Glyph.battery, align: "right", items: [{ label: "Battery", hint: "100%", disabled: true }, { label: "Power Source: Power Adapter", disabled: true }, "sep", { label: "Battery Settings…", action: () => open("settings", undefined, "battery") }] },
    { key: "spotlight", title: Glyph.search, align: "right", items: [{ label: "Spotlight Search…", shortcut: `${K}Space`, action: () => { setSpot(""); setSpotIdx(0); } }] },
    { key: "control", title: Glyph.control, align: "right", items: [
      { label: "Do Not Disturb", checked: p("dnd", false), action: () => setPrefs({ dnd: !p("dnd", false) }) },
      { label: "Dark Mode", checked: dark, action: () => setPrefs({ appearance: dark ? "light" : "dark" }) },
      { label: "Night Shift", checked: p("nightShift", false), action: () => setPrefs({ nightShift: !p("nightShift", false) }) }, "sep",
      { label: "Lock Screen", action: () => setLocked(true) },
      { label: "Control Centre Settings…", action: () => open("settings", undefined, "controlcentre") },
    ] },
    { key: "user", title: Glyph.user, align: "right", items: [{ label: user.email, disabled: true }, "sep", { label: "Users & Groups Settings…", action: () => open("settings", undefined, "users") }, { label: "Lock Screen", action: () => setLocked(true) }, { label: "Log Out…", action: signOut }] },
  ] as Menu[]).filter((m) => mi[m.key] !== false);

  /* ---------- dock ---------- */
  const minWins = openWins.filter((w) => w.state === "min" || w.state === "minimising" || w.state === "minPending");
  const dockEntries: DockEntry[] = useMemo(() => {
    const inDock = dock.map((s) => allApps.find((a) => a.slug === s)).filter(Boolean) as AppRow[];
    const running = p("showRecents", true) ? allApps.filter((a) => !dock.includes(a.slug) && openWins.some((w) => w.slug === a.slug)) : [];
    const e: DockEntry[] = [...inDock, ...running].map((a) => ({ kind: "app", slug: a.slug, name: a.name, icon: a.icon_url, running: p("dockIndicators", true) && openWins.some((w) => w.slug === a.slug), building: p("bounceOpen", true) && building.has(a.slug) }));
    e.push({ kind: "new" }, { kind: "sep" });
    if (minWins.length && !p("minIntoApp", false)) e.push(...minWins.map((w) => ({ kind: "min" as const, winId: w.id, slug: w.slug, name: w.title, icon: appOf(w.slug)?.icon_url || "/icons/new-app.png" })));
    e.push({ kind: "trash" });
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allApps, dock, wins, building, prefs]);

  /* ---------- spotlight ---------- */
  const q = (spot ?? "").trim().toLowerCase();
  const byName = spot !== null && q ? [...allApps.filter((a) => a.name.toLowerCase().startsWith(q)), ...allApps.filter((a) => !a.name.toLowerCase().startsWith(q) && a.name.toLowerCase().includes(q))] : [];
  const spotMatches = byName.length || !q || !p("spotlightDescriptions", true) ? byName : allApps.filter((a) => a.description.toLowerCase().includes(q));
  const spotSel = Math.min(spotIdx, Math.max(0, spotMatches.length - 1));

  const bg = wallpaper.startsWith("gradient:") ? wallpaper.slice(9) : `url(${wallpaper})`;
  const rootStyle = { backgroundImage: bg, "--accent": accent, zoom: p("largerText", false) || p<string>("resolution", "default") === "larger" ? 1.12 : p<string>("resolution", "default") === "more" ? 0.9 : 1 } as React.CSSProperties;
  const builtinContent = (w: Win) => w.slug === "settings"
    ? <Settings user={user} apps={allApps.filter((a) => !isBuiltin(a.slug))} prefs={prefs} setPrefs={setPrefs} wallpaper={wallpaper} setWallpaper={setWallpaper} dock={dock} setDock={setDock} initialPane={w.pane} onLock={() => setLocked(true)} onSignOut={signOut} onOpenApp={(s) => open(s)} notify={(t, title) => notify(t, title ?? "System Settings", "/icons/settings.png")} />
    : w.slug === "terminal"
      ? <Terminal user={user} apps={allApps.filter((a) => !isBuiltin(a.slug))} hostname={p("hostname", "AI-Mac")} onOpen={(s) => open(s)} onClose={() => close(w.id)} onTitle={(t) => update(w.id, { title: t })} />
      : null;

  return (
    <div className={`${styles.desktop} ${dark ? styles.dark : ""} ${reduceMotion ? styles.reduceMotion : ""} ${p("reduceTransparency", false) ? styles.opaque : ""} ${p("contrast", false) ? styles.contrast : ""}`} style={rootStyle} data-theme={dark ? "dark" : "light"}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setCtx(null); } }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) showCtx(e, [{ label: "New App…", action: () => setNewOpen(true) }, "sep", { label: "Change Wallpaper…", action: () => open("settings", undefined, "wallpaper") }, { label: "Clean Up", action: () => setSelected(null) }, "sep", { label: "Open Trash", action: openTrash }]); }}>
      <MenuBar left={leftMenus} right={rightMenus} clock={clock} />

      {p("desktopIcons", true) ? (
        <div className={styles.icons}>
          {apps.map((a) => (
            <button key={a.slug} className={`${styles.icon} ${selected === a.slug ? styles.iconSelected : ""}`}
              onMouseDown={(e) => { e.stopPropagation(); setSelected(a.slug); setCtx(null); }}
              onDoubleClick={(e) => { const r = (e.currentTarget.querySelector("img") as HTMLElement).getBoundingClientRect(); open(a.slug, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
              onClick={(e) => { if (e.detail === 1 && window.matchMedia("(pointer: coarse)").matches) open(a.slug); }}
              onContextMenu={(e) => { setSelected(a.slug); showCtx(e, appMenuItems(a.slug)); }}
              title={a.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <span className={styles.iconArt}>
                <img src={a.icon_url} alt="" width={64} height={64} draggable={false} className={building.has(a.slug) ? styles.iconDim : ""} />
                {building.has(a.slug) ? <svg className={styles.ring} viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" className={styles.ringSpin} /></svg> : null}
              </span>
              <span className={styles.iconLabel}>{a.name}</span>
            </button>
          ))}
          {pending.map((x) => (
            <div key={x.id} className={styles.icon} title="Designing this app">
              <span className={styles.iconArt}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icons/new-app.png" alt="" width={64} height={64} draggable={false} className={styles.iconDim} />
                <svg className={styles.ring} viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" className={styles.ringFill} /></svg>
              </span>
              <span className={styles.iconLabel}>{x.name}</span>
            </div>
          ))}
          <button className={`${styles.icon} ${selected === "new-app" ? styles.iconSelected : ""}`}
            onMouseDown={(e) => { e.stopPropagation(); setSelected("new-app"); }}
            onDoubleClick={() => setNewOpen(true)}
            onClick={(e) => { if (e.detail === 1 && window.matchMedia("(pointer: coarse)").matches) setNewOpen(true); }}
            title="New app">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/new-app.png" alt="" width={64} height={64} draggable={false} />
            <span className={styles.iconLabel}>New app</span>
          </button>
        </div>
      ) : null}

      {wins.map((w) => (
        <AppWindow key={w.id} win={w} active={w.id === activeId} menuHeight={MENU_H} content={isBuiltin(w.slug) ? <span key={w.pane ?? ""}>{builtinContent(w)}</span> : undefined}
          onFocus={() => focus(w.id)} onClose={() => close(w.id)} onMinimise={() => minimise(w.id)} onZoom={() => zoom(w.id)}
          onTitleDoubleClick={() => { const m = p<string>("doubleClickTitle", "zoom"); if (m === "zoom") zoom(w.id); else if (m === "minimise") minimise(w.id); }}
          onChange={(pt) => update(w.id, pt)} onOpen={(s) => open(s)}
          onNotify={(text) => notify(text, w.title, appOf(w.slug)?.icon_url, w.slug)}
          onBuilt={(kind, version) => { refresh(); const nm = appOf(w.slug)?.name ?? w.title; if (kind === "improve") notify(`${nm} was updated to version ${version ?? "?"}.`, nm, appOf(w.slug)?.icon_url, w.slug); else if (w.id !== activeId) notify(`${nm} is ready.`, nm, appOf(w.slug)?.icon_url, w.slug); }}
          onBuilding={(b) => setBuilding((s) => { if (s.has(w.slug) === b) return s; const n = new Set(s); if (b) n.add(w.slug); else n.delete(w.slug); return n; })} />
      ))}

      <div className={`${styles.dockWrap} ${dockShown ? "" : styles.dockHidden}`}>
        <Dock entries={dockEntries} size={p<number>("dockSize", 52)} magnify={p("magnification", true)} maxSize={p<number>("magnifySize", 92)} onApp={(s) => open(s)} onMin={(id) => focus(id)} onNew={() => setNewOpen(true)} onTrash={openTrash}
          onContext={(e, entry) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const anchor = { x: r.left + r.width / 2, bottom: window.innerHeight - r.top + 14 };
            if (entry.kind === "app") showCtx(e, appMenuItems(entry.slug, true), anchor);
            else if (entry.kind === "min") showCtx(e, [{ label: entry.name, disabled: true }, "sep", { label: "Restore", action: () => focus(entry.winId) }, { label: "Close", action: () => close(entry.winId) }], anchor);
            else if (entry.kind === "trash") showCtx(e, [{ label: "Open", action: openTrash }, { label: "Empty Trash…", action: () => { openTrash(); } }], anchor);
            else showCtx(e, [{ label: "New App…", action: () => setNewOpen(true) }], anchor);
          }} />
      </div>

      {newOpen ? (
        <div className={styles.sheetBack} onMouseDown={() => !creating && setNewOpen(false)}>
          <form className={styles.alert} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => createApp(e)} aria-busy={creating}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/new-app.png" alt="" width={64} height={64} className={styles.alertIcon} />
            <h2>New App</h2>
            <p>Describe the app you want. It gets a name and an icon now, and is written the first time you open it.</p>
            <textarea autoFocus value={wish} onChange={(e) => setWish(e.target.value)} placeholder="A habit tracker with streaks and a weekly chart" rows={3} disabled={creating} />
            <div className={styles.alertActions}>
              <button type="button" className={styles.bezel} onClick={() => setNewOpen(false)} disabled={creating}>Cancel</button>
              <button className={styles.bezelDefault} disabled={creating || wish.trim().length < 4}>{creating ? "Designing…" : "Add to Desktop"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {spot !== null ? (
        <div className={styles.spotBack} onMouseDown={() => setSpot(null)}>
          <div className={styles.spotlight} onMouseDown={(e) => e.stopPropagation()} aria-label="Spotlight">
            <div className={styles.spotField}>
              {Glyph.search}
              <input autoFocus value={spot} onChange={(e) => { setSpot(e.target.value); setSpotIdx(0); }} placeholder="Spotlight Search"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSpotIdx((i) => Math.min(i + 1, spotMatches.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSpotIdx((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") { if (spotMatches[spotSel]) { open(spotMatches[spotSel].slug); setSpot(null); } else if (q.length >= 4 && p("spotlightCreate", true)) createApp(undefined, spot); }
                }} />
            </div>
            {q ? (
              <div className={styles.spotList} role="listbox">
                {spotMatches.map((a, i) => (
                  <button key={a.slug} role="option" aria-selected={i === spotSel} className={`${styles.spotRow} ${i === spotSel ? styles.spotRowFirst : ""}`} onMouseEnter={() => setSpotIdx(i)} onClick={() => { open(a.slug); setSpot(null); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon_url} alt="" width={28} height={28} /><span>{a.name}</span><em>{isBuiltin(a.slug) ? "System" : "Application"}</em>
                  </button>
                ))}
                {!spotMatches.length && p("spotlightCreate", true) ? (
                  <button className={`${styles.spotRow} ${styles.spotRowFirst}`} onClick={() => createApp(undefined, spot)} disabled={creating || q.length < 4}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/icons/new-app.png" alt="" width={28} height={28} /><span>{creating ? "Designing…" : `Create an app: “${spot}”`}</span><em>New app</em>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {about ? (
        <div className={styles.sheetBack} onMouseDown={() => setAbout(false)}>
          <div className={styles.alert} onMouseDown={(e) => e.stopPropagation()} style={{ textAlign: "center" }} role="dialog" aria-label="About AI Mac">
            <span className={styles.aboutLogo} />
            <h2>AI Mac</h2>
            <p>A desktop whose apps are written the moment you open them. Every app is a single file, generated once for you and kept.</p>
            <p className={styles.fine}>Signed in as {user.email}. {apps.length} apps, {apps.filter((a) => a.version).length} built. {K}Space opens Spotlight, {K}N makes a new app, {K}, opens System Settings.</p>
            <div className={styles.alertActions}><button className={styles.bezelDefault} onClick={() => setAbout(false)}>OK</button></div>
          </div>
        </div>
      ) : null}

      {trash ? (
        <div className={styles.sheetBack} onMouseDown={() => setTrash(null)}>
          <div className={styles.alert} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Trash">
            <h2>Trash</h2>
            {trash.length ? (
              <div className={styles.trashList}>
                {trash.map((a) => (
                  <div key={a.slug} className={styles.trashRow}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon_url} alt="" width={28} height={28} />
                    <span>{a.name}</span>
                    <button className={styles.bezel} onClick={() => putBack(a.slug)}>Put Back</button>
                  </div>
                ))}
              </div>
            ) : <p>The Trash is empty. Apps you move to the Trash can be put back from here until you empty it.</p>}
            <div className={styles.alertActions}>
              <button className={styles.bezel} onClick={emptyTrash} disabled={!trash.length}>Empty Trash</button>
              <button className={styles.bezelDefault} onClick={() => setTrash(null)}>Done</button>
            </div>
          </div>
        </div>
      ) : null}

      {ctx ? (
        <div className={`${styles.context} ${ctx.up ? styles.contextUp : ""}`} style={ctx.up ? { left: ctx.x, bottom: ctx.y } : { left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()} role="menu">
          {ctx.items.map((it, i) => it === "sep" ? <div key={i} className={styles.ctxSep} /> : (
            <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setCtx(null); it.action?.(); }}><span className={styles.ctxCheck}>{it.checked ? "✓" : ""}</span>{it.label}{it.hint ? <small> {it.hint}</small> : null}</button>
          ))}
        </div>
      ) : null}

      <div className={styles.notices}>
        {notices.map((n) => (
          <div key={n.id} className={`${styles.notice} ${n.leaving ? styles.noticeLeaving : ""}`} role="status" onClick={() => dismiss(n.id)} title="Click to dismiss">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.icon} alt="" width={38} height={38} />
            <div><strong>{n.title}</strong><span>{n.body}</span></div>
            <em>now</em>
          </div>
        ))}
      </div>

      {p("nightShift", false) ? <div className={styles.nightShift} /> : null}
      {saver && !locked ? <ScreenSaver kind={p("screenSaver", "drift")} clock={p("saverClock", true)} onEnd={() => setSaver(false)} /> : null}
      {locked ? <LockScreen email={user.email} name={name} message={p("lockMessage", "")} showUser={p("lockShowUser", true)} bg={bg} onUnlock={() => setLocked(false)} onSwitch={signOut} /> : null}
    </div>
  );
}

function ScreenSaver({ kind, clock, onEnd }: { kind: string; clock: boolean; onEnd: () => void }) {
  const [t, setT] = useState("");
  useEffect(() => { const f = () => setT(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })); f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  return <div className={`${styles.saver} ${styles[`saver_${kind}`] ?? ""}`} onPointerDown={onEnd} onKeyDown={onEnd}>{clock ? <span>{t}</span> : null}</div>;
}

function LockScreen({ email, name, message, showUser, bg, onUnlock, onSwitch }: { email: string; name: string; message: string; showUser: boolean; bg: string; onUnlock: () => void; onSwitch: () => void }) {
  const [pw, setPw] = useState("");
  const [shake, setShake] = useState(false);
  const [t, setT] = useState<{ time: string; date: string }>({ time: "", date: "" });
  useEffect(() => { const f = () => { const d = new Date(); setT({ time: d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }), date: d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) }); }; f(); const i = setInterval(f, 1000); return () => clearInterval(i); }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
    if (r.ok) return onUnlock();
    setShake(true); setPw(""); setTimeout(() => setShake(false), 500);
  }
  return (
    <div className={styles.lock} style={{ backgroundImage: bg }}>
      <div className={styles.lockTime}><span>{t.date}</span><strong>{t.time}</strong></div>
      <form className={`${styles.lockUser} ${shake ? styles.shake : ""}`} onSubmit={submit}>
        {showUser ? <><i className={styles.lockAvatar}>{name.slice(0, 1).toUpperCase()}</i><b>{name}</b></> : null}
        <input autoFocus type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Enter Password" aria-label="Password" />
        <small>{message || "Touch ID or Enter Password"}</small>
        <button type="button" className={styles.lockSwitch} onClick={onSwitch}>Switch User…</button>
      </form>
    </div>
  );
}
