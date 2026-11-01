"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRow } from "@/lib/apps";
import { DEFAULT_APPS, WINDOW_SIZES } from "@/lib/catalog";
import { AppWindow } from "./AppWindow";
import { Dock, type DockEntry } from "./Dock";
import { Glyph, MenuBar, type Menu, type MenuItem } from "./MenuBar";
import styles from "./desktop.module.css";

export type WinState = "open" | "closing" | "minPending" | "minimising" | "min";
export type Win = {
  id: number; slug: string; title: string;
  x: number; y: number; w: number; h: number; z: number;
  max: boolean; state: WinState;
  origin?: { x: number; y: number }; // where it zooms out from (the icon)
  target?: { x: number; y: number }; // where it shrinks to (the dock)
  opened: boolean; zooming: boolean;
};
type Notice = { id: number; title: string; body: string; icon: string; leaving?: boolean };
type Geom = { x: number; y: number; w: number; h: number };
type Ctx = { x: number; y: number; items: MenuItem[] };

export const MENU_H = 24;
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function Desktop({ user, initialApps, dockSlugs, wallpaper }: { user: { id: number; email: string }; initialApps: AppRow[]; dockSlugs: string[]; wallpaper: string }) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [dock, setDockState] = useState(dockSlugs);
  const [wins, setWins] = useState<Win[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [clock, setClock] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [creating, setCreating] = useState(false);
  const [spot, setSpot] = useState<string | null>(null);
  const [spotIdx, setSpotIdx] = useState(0);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState<Set<string>>(new Set());
  const [about, setAbout] = useState(false);
  const [trash, setTrash] = useState<AppRow[] | null>(null);
  const zRef = useRef(10);
  const idRef = useRef(1);
  const nRef = useRef(1);
  const geomRef = useRef<Record<string, Geom>>({}); // where each app's window was last time
  const restored = useRef(false);
  const sessionKey = `aic:session:${user.id}`;

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", ""));
    tick();
    const t = setInterval(tick, 5_000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/apps");
    if (r.ok) setApps((await r.json()).apps);
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotices((n) => n.map((x) => (x.id === id ? { ...x, leaving: true } : x)));
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 400);
  }, []);
  const notify = useCallback((body: string, title = "AI Computer", icon = "/icons/settings.png") => {
    const id = nRef.current++;
    setNotices((n) => [...n.slice(-3), { id, title, body, icon }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

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
    if (saved) return { x: Math.min(Math.max(16, saved.x), vw - 120), y: Math.min(Math.max(MENU_H, saved.y), vh - 80), w: Math.min(saved.w, vw - 16), h: Math.min(saved.h, vh - MENU_H - 16) };
    const want = WINDOW_SIZES[slug] ?? { w: 1040, h: 680 };
    const w = Math.min(want.w, vw - 80), h = Math.min(want.h, vh - MENU_H - 110);
    return { x: Math.round(Math.max(16, (vw - w) / 2 - 60 + (n % 6) * 28)), y: Math.round(Math.max(MENU_H + 12, (vh - h) / 2 - 30 + (n % 6) * 24)), w, h };
  }, []);

  const open = useCallback(
    (slug: string, origin?: { x: number; y: number }) => {
      const app = apps.find((a) => a.slug === slug);
      if (!app) return;
      const existing = wins.find((w) => w.slug === slug && w.state !== "closing");
      if (existing) return focus(existing.id);
      zRef.current += 1;
      const id = idRef.current++;
      const g = place(slug, wins.length);
      setWins((ws) => [...ws, { id, slug, title: app.name, ...g, z: zRef.current, max: false, state: "open", origin, opened: false, zooming: false }]);
      setActive(id);
    },
    [apps, wins, focus, place],
  );

  const close = useCallback((id: number) => {
    setWins((ws) => {
      const w = ws.find((x) => x.id === id);
      if (w && !w.max) geomRef.current[w.slug] = { x: w.x, y: w.y, w: w.w, h: w.h };
      return ws.map((x) => (x.id === id ? { ...x, state: "closing" } : x));
    });
    setTimeout(() => setWins((ws) => ws.filter((w) => w.id !== id)), 170);
    setActive((a) => (a === id ? null : a));
  }, []);

  const minimise = useCallback((id: number) => {
    update(id, { state: "minPending" });
    setActive((a) => (a === id ? null : a));
  }, [update]);

  // Once the dock has rendered the minimised entry, measure it and shrink the window into it.
  useEffect(() => {
    const pending = wins.filter((w) => w.state === "minPending");
    if (!pending.length) return;
    const raf = requestAnimationFrame(() => {
      for (const w of pending) {
        const el = document.querySelector(`[data-dock-min="${w.id}"]`);
        const r = el?.getBoundingClientRect();
        const target = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight - 30 };
        update(w.id, { state: "minimising", target });
        setTimeout(() => setWins((ws) => ws.map((x) => (x.id === w.id && x.state === "minimising" ? { ...x, state: "min" } : x))), 440);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [wins, update]);

  const zoom = useCallback((id: number) => {
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, max: !w.max, zooming: true } : w)));
    setTimeout(() => update(id, { zooming: false }), 340);
  }, [update]);

  // Session: open windows come back after a reload, where they were.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(sessionKey) || "null") as { geoms?: Record<string, Geom>; wins?: { slug: string; x: number; y: number; w: number; h: number; max: boolean; min: boolean }[] } | null;
      if (saved?.geoms) geomRef.current = saved.geoms;
      const list = (saved?.wins || []).filter((s) => apps.some((a) => a.slug === s.slug)).slice(0, 8);
      if (!list.length) return;
      const ws: Win[] = list.map((s, i) => {
        zRef.current += 1;
        const g = place(s.slug, i, s);
        return { id: idRef.current++, slug: s.slug, title: apps.find((a) => a.slug === s.slug)!.name, ...g, z: zRef.current, max: s.max, state: s.min ? "min" : "open", opened: true, zooming: false, target: s.min ? { x: window.innerWidth / 2, y: window.innerHeight - 30 } : undefined };
      });
      setWins(ws);
      const top = ws.filter((w) => w.state === "open").at(-1);
      if (top) setActive(top.id);
    } catch { /* no session */ }
  }, [apps, place, sessionKey]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const list = wins.filter((w) => w.state !== "closing").map((w) => ({ slug: w.slug, x: w.x, y: w.y, w: w.w, h: w.h, max: w.max, min: w.state === "min" || w.state === "minimising" || w.state === "minPending" }));
        localStorage.setItem(sessionKey, JSON.stringify({ geoms: geomRef.current, wins: list }));
      } catch { /* storage unavailable */ }
    }, 300);
    return () => clearTimeout(t);
  }, [wins, sessionKey]);

  // The desktop falls back to the top-most window when the active one goes away.
  const activeId = wins.some((w) => w.id === active && w.state === "open") ? active : (wins.filter((w) => w.state === "open").sort((a, b) => b.z - a.z)[0]?.id ?? null);

  /** Designing the name and icon takes about half a minute; it runs in the background and the desktop stays usable. */
  async function createApp(e?: React.FormEvent, text = wish) {
    e?.preventDefault();
    const wishText = text.trim();
    if (wishText.length < 4) return;
    setNewOpen(false);
    setSpot(null);
    setWish("");
    setCreating(true);
    notify(`Designing an app for “${wishText.slice(0, 60)}${wishText.length > 60 ? "…" : ""}”. It appears on the desktop in about half a minute.`, "New app", "/icons/new-app.png");
    try {
      const r = await fetch("/api/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wish: wishText }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return notify(j.error || "Could not create the app.", "New app", "/icons/new-app.png");
      await refresh();
      notify(`${j.name} is on your desktop and opening now. Its first open writes it.`, "New app", "/icons/new-app.png");
      setTimeout(() => window.dispatchEvent(new CustomEvent("aic:open", { detail: j.slug })), 60);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Could not create the app.", "New app", "/icons/new-app.png");
    } finally {
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
    notify(`${apps.find((a) => a.slug === slug)?.name ?? "The app"} was moved to the Trash. You can put it back from there.`, "Trash");
  }

  async function openTrash() {
    const r = await fetch("/api/trash");
    setTrash(r.ok ? (await r.json()).apps : []);
  }
  async function putBack(slug: string) {
    await fetch("/api/trash", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug }) });
    await refresh();
    setTrash((t) => (t ? t.filter((a) => a.slug !== slug) : t));
  }
  async function emptyTrash() {
    await fetch("/api/trash", { method: "DELETE" });
    setTrash([]);
  }

  function setDock(fn: (d: string[]) => string[]) {
    setDockState((d) => {
      const next = fn(d);
      fetch("/api/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ dock_slugs: next }) }).catch(() => {});
      return next;
    });
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const winCmd = (cmd: string, target?: { id?: number; slug?: string }) => window.dispatchEvent(new CustomEvent("aic:win", { detail: { ...(target ?? { id: activeId ?? undefined }), cmd } }));

  // Keyboard shortcuts. Apps forward these through the bridge, so they work while typing in an app too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape") { if (!creating) setNewOpen(false); setSpot(null); setCtx(null); setAbout(false); setTrash(null); return; }
      if (!mod) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewOpen(true); }
      if (e.key === " ") { e.preventDefault(); setSpot((s) => (s === null ? "" : null)); setSpotIdx(0); }
      if (activeId === null) return;
      if (e.key === "w" || e.key === "W") { e.preventDefault(); close(activeId); }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); minimise(activeId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, close, minimise, creating]);

  const activeWin = wins.find((w) => w.id === activeId && w.state === "open");
  const openWins = wins.filter((w) => w.state !== "closing");
  const K = isMac ? "⌘" : "Ctrl+";
  const appOf = (slug: string) => apps.find((a) => a.slug === slug);
  const isDefault = (slug: string) => DEFAULT_APPS.some((a) => a.slug === slug);

  const appMenuItems = (slug: string, fromDock = false): MenuItem[] => {
    const a = appOf(slug);
    const running = openWins.some((w) => w.slug === slug);
    const inDock = dock.includes(slug);
    const items: MenuItem[] = [{ label: "Open", action: () => open(slug) }, "sep"];
    if (a?.version) items.push({ label: "Improve…", action: () => { open(slug); setTimeout(() => winCmd("improve", { slug }), 450); } });
    items.push({ label: inDock ? "Remove from Dock" : "Keep in Dock", action: () => setDock((d) => (inDock ? d.filter((s) => s !== slug) : [...d, slug])) });
    if (fromDock && running) items.push({ label: "Quit", action: () => openWins.filter((w) => w.slug === slug).forEach((w) => close(w.id)) });
    if (!fromDock && !isDefault(slug)) items.push("sep", { label: "Move to Trash", action: () => removeApp(slug) });
    return items;
  };
  const showCtx = (e: React.MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    const h = items.reduce<number>((n, it) => n + (it === "sep" ? 11 : 22), 10);
    setCtx({ x: Math.min(e.clientX, window.innerWidth - 232), y: Math.min(e.clientY, window.innerHeight - h - 8), items });
  };

  const leftMenus: Menu[] = [
    { key: "logo", title: Glyph.logo, items: [
      { label: "About AI Computer", action: () => setAbout(true) }, "sep",
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      { label: `Sign Out ${user.email}…`, action: signOut },
    ] },
    { key: "app", title: activeWin ? (appOf(activeWin.slug)?.name ?? activeWin.title) : "Finder", bold: true, items: activeWin ? [
      { label: `About ${appOf(activeWin.slug)?.name ?? activeWin.title}`, hint: `version ${appOf(activeWin.slug)?.version ?? "?"}, written by AI`, disabled: true }, "sep",
      { label: "Improve This App…", action: () => winCmd("improve") },
      { label: "Rebuild From Scratch", action: () => winCmd("rebuild") }, "sep",
      { label: dock.includes(activeWin.slug) ? "Remove from Dock" : "Keep in Dock", action: () => { const s = activeWin.slug; setDock((d) => (d.includes(s) ? d.filter((x) => x !== s) : [...d, s])); } }, "sep",
      { label: "Close Window", shortcut: `${K}W`, action: () => close(activeWin.id) },
    ] : [
      { label: "About Finder", disabled: true }, "sep",
      { label: "Empty Trash…", action: () => { openTrash(); } },
    ] },
    { key: "file", title: "File", items: [
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      ...apps.map((a) => ({ label: `Open ${a.name}`, action: () => open(a.slug) })),
    ] },
    { key: "edit", title: "Edit", items: [
      { label: "Undo", shortcut: `${K}Z`, disabled: !activeWin, action: () => winCmd("exec:undo") }, { label: "Redo", shortcut: `⇧${K}Z`, disabled: !activeWin, action: () => winCmd("exec:redo") }, "sep",
      { label: "Cut", shortcut: `${K}X`, disabled: !activeWin, action: () => winCmd("exec:cut") }, { label: "Copy", shortcut: `${K}C`, disabled: !activeWin, action: () => winCmd("exec:copy") }, { label: "Paste", shortcut: `${K}V`, disabled: !activeWin, action: () => winCmd("exec:paste") }, { label: "Select All", shortcut: `${K}A`, disabled: !activeWin, action: () => winCmd("exec:selectAll") },
    ] },
    { key: "view", title: "View", items: [
      { label: "Clean Up", action: () => setSelected(null) }, "sep",
      { label: typeof document !== "undefined" && document.fullscreenElement ? "Exit Full Screen" : "Enter Full Screen", shortcut: `⌃${K}F`, action: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) },
    ] },
    { key: "window", title: "Window", items: [
      { label: "Minimise", shortcut: `${K}M`, disabled: !activeWin, action: () => activeWin && minimise(activeWin.id) },
      { label: "Zoom", disabled: !activeWin, action: () => activeWin && zoom(activeWin.id) }, "sep",
      { label: "Bring All to Front", disabled: !openWins.length, action: () => openWins.forEach((w) => { if (w.state !== "min") focus(w.id); }) },
      ...(openWins.length ? ["sep" as const, ...openWins.map((w) => ({ label: w.title, checked: w.id === activeId, hint: w.state === "min" ? "minimised" : undefined, action: () => focus(w.id) }))] : []),
    ] },
    { key: "help", title: "Help", items: [
      { label: "About AI Computer", action: () => setAbout(true) }, "sep",
      { label: "Open an app", action: () => notify("Double-click an icon on the desktop, click it in the Dock, or press " + K + "Space and type its name. The first open writes the app; after that it opens at once.", "Help") },
      { label: "Make a new app", action: () => notify("Double-click New app (or press " + K + "N), describe what you want in a sentence, and it joins the desktop with its own icon.", "Help") },
      { label: "Change an app", action: () => notify("Hover the window's title bar and click the sparkle, or use the app menu. Describe the change; the app keeps working while the new version is written, and your records are kept.", "Help") },
      { label: "Keep an app in the Dock", action: () => notify("Right-click its icon on the desktop or in the Dock and choose Keep in Dock. Remove from Dock undoes it.", "Help") },
      { label: "Recover an app from the Trash", action: () => notify("Click the Trash in the Dock and choose Put Back next to the app. Its records come back with it.", "Help") }, "sep",
      { label: "Keyboard Shortcuts", action: () => notify(`${K}Space Spotlight, ${K}N new app, ${K}W close window, ${K}M minimise, Escape closes dialogs.`, "Help") },
    ] },
  ];
  const rightMenus: Menu[] = [
    { key: "wifi", title: Glyph.wifi, align: "right", items: [{ label: "Wi-Fi", hint: "On", disabled: true }, "sep", { label: "AI Computer Network", checked: true }] },
    { key: "battery", title: Glyph.battery, align: "right", items: [{ label: "Battery", hint: "100%", disabled: true }, { label: "Power Source: Power Adapter", disabled: true }] },
    { key: "search", title: Glyph.search, align: "right", items: [{ label: "Spotlight Search…", shortcut: `${K}Space`, action: () => { setSpot(""); setSpotIdx(0); } }] },
    { key: "control", title: Glyph.control, align: "right", items: [{ label: "Control Centre", disabled: true }, "sep", { label: "Clean Up Desktop", action: () => setSelected(null) }] },
    { key: "user", title: Glyph.user, align: "right", items: [{ label: user.email, disabled: true }, "sep", { label: "Sign Out…", action: signOut }] },
  ];

  const minWins = openWins.filter((w) => w.state === "min" || w.state === "minimising" || w.state === "minPending");
  const dockEntries: DockEntry[] = useMemo(() => {
    const inDock = dock.map((s) => apps.find((a) => a.slug === s)).filter(Boolean) as AppRow[];
    const running = apps.filter((a) => !dock.includes(a.slug) && openWins.some((w) => w.slug === a.slug));
    const e: DockEntry[] = [...inDock, ...running].map((a) => ({ kind: "app", slug: a.slug, name: a.name, icon: a.icon_url, running: openWins.some((w) => w.slug === a.slug), building: building.has(a.slug) }));
    e.push({ kind: "new" }, { kind: "sep" });
    if (minWins.length) e.push(...minWins.map((w) => ({ kind: "min" as const, winId: w.id, slug: w.slug, name: w.title, icon: apps.find((a) => a.slug === w.slug)?.icon_url || "/icons/new-app.png" })));
    e.push({ kind: "trash" });
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, dock, wins, building]);

  const q = (spot ?? "").trim().toLowerCase();
  // Names first; descriptions only when no name matches, so "notes" does not list every app that mentions notes.
  const byName = spot !== null && q ? [...apps.filter((a) => a.name.toLowerCase().startsWith(q)), ...apps.filter((a) => !a.name.toLowerCase().startsWith(q) && a.name.toLowerCase().includes(q))] : [];
  const spotMatches = byName.length || !q ? byName : apps.filter((a) => a.description.toLowerCase().includes(q));
  const spotSel = Math.min(spotIdx, Math.max(0, spotMatches.length - 1));

  return (
    <div className={styles.desktop} style={{ backgroundImage: `url(${wallpaper})` }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setCtx(null); } }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) showCtx(e, [{ label: "New App…", action: () => setNewOpen(true) }, "sep", { label: "Clean Up", action: () => setSelected(null) }, { label: "Open Trash", action: openTrash }]); }}>
      <MenuBar left={leftMenus} right={rightMenus} clock={clock} />

      <div className={styles.icons}>
        {apps.map((a) => (
          <button key={a.slug} className={`${styles.icon} ${selected === a.slug ? styles.iconSelected : ""}`}
            onMouseDown={(e) => { e.stopPropagation(); setSelected(a.slug); setCtx(null); }}
            onDoubleClick={(e) => { const r = (e.currentTarget.querySelector("img") as HTMLElement).getBoundingClientRect(); open(a.slug, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
            onClick={(e) => { if (e.detail === 1 && window.matchMedia("(pointer: coarse)").matches) open(a.slug); }}
            onContextMenu={(e) => { setSelected(a.slug); showCtx(e, appMenuItems(a.slug)); }}
            title={a.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.icon_url} alt="" width={64} height={64} draggable={false} />
            <span className={styles.iconLabel}>{a.name}</span>
          </button>
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

      {wins.map((w) => (
        <AppWindow key={w.id} win={w} active={w.id === activeId} menuHeight={MENU_H}
          onFocus={() => focus(w.id)} onClose={() => close(w.id)} onMinimise={() => minimise(w.id)} onZoom={() => zoom(w.id)}
          onChange={(p) => update(w.id, p)} onOpen={(s) => open(s)}
          onNotify={(text) => notify(text, w.title, appOf(w.slug)?.icon_url)}
          onBuilt={(kind, version) => { refresh(); const name = appOf(w.slug)?.name ?? w.title; if (kind === "improve") notify(`${name} was updated to version ${version ?? "?"}.`, name, appOf(w.slug)?.icon_url); else if (w.id !== activeId) notify(`${name} is ready.`, name, appOf(w.slug)?.icon_url); }}
          onBuilding={(b) => setBuilding((s) => { if (s.has(w.slug) === b) return s; const n = new Set(s); if (b) n.add(w.slug); else n.delete(w.slug); return n; })} />
      ))}

      <Dock entries={dockEntries} onApp={(s) => open(s)} onMin={(id) => focus(id)} onNew={() => setNewOpen(true)} onTrash={openTrash}
        onContext={(e, entry) => {
          if (entry.kind === "app") showCtx(e, appMenuItems(entry.slug, true));
          else if (entry.kind === "min") showCtx(e, [{ label: "Restore", action: () => focus(entry.winId) }, { label: "Close", action: () => close(entry.winId) }]);
          else if (entry.kind === "trash") showCtx(e, [{ label: "Open Trash", action: openTrash }, { label: "Empty Trash…", action: () => { openTrash(); } }]);
          else showCtx(e, [{ label: "New App…", action: () => setNewOpen(true) }]);
        }} />

      {newOpen ? (
        <div className={styles.sheetBack} onMouseDown={() => !creating && setNewOpen(false)}>
          <form className={styles.alert} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => createApp(e)} aria-busy={creating}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/new-app.png" alt="" width={64} height={64} className={styles.alertIcon} />
            <h2>New App</h2>
            <p>Describe the app you want. It gets a name and an icon now, and is written the first time you open it.</p>
            <textarea autoFocus value={wish} onChange={(e) => setWish(e.target.value)} placeholder="A habit tracker with streaks and a weekly chart" rows={3} disabled={creating} />
            {creating ? <p className={styles.fine}>Designing the app and drawing its icon. This takes about half a minute; the window stays until it is done.</p> : null}
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
                  if (e.key === "Enter") { if (spotMatches[spotSel]) { open(spotMatches[spotSel].slug); setSpot(null); } else if (q.length >= 4) createApp(undefined, spot); }
                }} />
            </div>
            {q ? (
              <div className={styles.spotList} role="listbox">
                {spotMatches.map((a, i) => (
                  <button key={a.slug} role="option" aria-selected={i === spotSel} className={`${styles.spotRow} ${i === spotSel ? styles.spotRowFirst : ""}`} onMouseEnter={() => setSpotIdx(i)} onClick={() => { open(a.slug); setSpot(null); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon_url} alt="" width={28} height={28} /><span>{a.name}</span><em>Application</em>
                  </button>
                ))}
                {!spotMatches.length ? (
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
          <div className={styles.alert} onMouseDown={(e) => e.stopPropagation()} style={{ textAlign: "center" }} role="dialog" aria-label="About AI Computer">
            <span className={styles.aboutLogo} />
            <h2>AI Computer</h2>
            <p>A desktop whose apps are written the moment you open them. Every app is a single file, generated once for you and kept.</p>
            <p className={styles.fine}>Signed in as {user.email}. {apps.length} apps, {apps.filter((a) => a.version).length} built. {K}Space opens Spotlight, {K}N makes a new app, hover a window title bar to improve that app.</p>
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
        <div className={styles.context} style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()} role="menu">
          {ctx.items.map((it, i) => it === "sep" ? <div key={i} className={styles.ctxSep} /> : (
            <button key={i} role="menuitem" disabled={it.disabled} onClick={() => { setCtx(null); it.action?.(); }}>{it.label}{it.hint ? <small> {it.hint}</small> : null}</button>
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
    </div>
  );
}
