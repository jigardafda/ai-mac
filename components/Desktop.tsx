"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AppRow } from "@/lib/apps";
import { WINDOW_SIZES } from "@/lib/catalog";
import { AppWindow } from "./AppWindow";
import { Dock, type DockEntry } from "./Dock";
import { Glyph, MenuBar, type Menu } from "./MenuBar";
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

export const MENU_H = 24;
const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);

export function Desktop({ user, initialApps, dockSlugs, wallpaper }: { user: { id: number; email: string }; initialApps: AppRow[]; dockSlugs: string[]; wallpaper: string }) {
  const router = useRouter();
  const [apps, setApps] = useState(initialApps);
  const [wins, setWins] = useState<Win[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [clock, setClock] = useState("");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [creating, setCreating] = useState(false);
  const [spot, setSpot] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; slug: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState<Set<string>>(new Set());
  const [about, setAbout] = useState(false);
  const zRef = useRef(10);
  const idRef = useRef(1);
  const nRef = useRef(1);

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

  const notify = useCallback((body: string, title = "AI Computer", icon = "/icons/settings.png") => {
    const id = nRef.current++;
    setNotices((n) => [...n, { id, title, body, icon }]);
    setTimeout(() => setNotices((n) => n.map((x) => (x.id === id ? { ...x, leaving: true } : x))), 4200);
    setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 4600);
  }, []);

  const update = useCallback((id: number, patch: Partial<Win>) => setWins((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w))), []);

  const focus = useCallback((id: number) => {
    zRef.current += 1;
    const z = zRef.current;
    setWins((ws) => ws.map((w) => (w.id === id ? { ...w, z, state: w.state === "min" || w.state === "minimising" ? "open" : w.state } : w)));
    setActive(id);
  }, []);

  const open = useCallback(
    (slug: string, origin?: { x: number; y: number }) => {
      const app = apps.find((a) => a.slug === slug);
      if (!app) return;
      const existing = wins.find((w) => w.slug === slug && w.state !== "closing");
      if (existing) return focus(existing.id);
      const n = wins.length;
      const vw = window.innerWidth, vh = window.innerHeight;
      const want = WINDOW_SIZES[slug] ?? { w: 1040, h: 680 };
      const w = Math.min(want.w, vw - 80), h = Math.min(want.h, vh - MENU_H - 110);
      zRef.current += 1;
      const id = idRef.current++;
      const x = Math.round(Math.max(16, (vw - w) / 2 - 60 + (n % 6) * 28));
      const y = Math.round(Math.max(MENU_H + 12, (vh - h) / 2 - 30 + (n % 6) * 24));
      setWins((ws) => [...ws, { id, slug, title: app.name, x, y, w, h, z: zRef.current, max: false, state: "open", origin, opened: false, zooming: false }]);
      setActive(id);
    },
    [apps, wins, focus],
  );

  const close = useCallback((id: number) => {
    update(id, { state: "closing" });
    setTimeout(() => setWins((ws) => ws.filter((w) => w.id !== id)), 170);
    setActive((a) => (a === id ? null : a));
  }, [update]);

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

  // The desktop falls back to the top-most window when the active one goes away.
  const activeId = wins.some((w) => w.id === active && w.state === "open") ? active : (wins.filter((w) => w.state === "open").sort((a, b) => b.z - a.z)[0]?.id ?? null);

  async function createApp(e?: React.FormEvent, text = wish) {
    e?.preventDefault();
    if (creating || text.trim().length < 4) return;
    setCreating(true);
    const r = await fetch("/api/apps", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wish: text.trim() }) });
    const j = await r.json().catch(() => ({}));
    setCreating(false);
    if (!r.ok) return notify(j.error || "Could not create the app.");
    setNewOpen(false);
    setSpot(null);
    setWish("");
    await refresh();
    notify(`${j.name} is on your desktop. Opening it writes it.`, "New app", "/icons/new-app.png");
    setTimeout(() => window.dispatchEvent(new CustomEvent("aic:open", { detail: j.slug })), 60);
  }

  useEffect(() => {
    const h = (e: Event) => open((e as CustomEvent<string>).detail);
    window.addEventListener("aic:open", h);
    return () => window.removeEventListener("aic:open", h);
  }, [open]);

  async function removeApp(slug: string) {
    setCtx(null);
    const r = await fetch(`/api/apps/${slug}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error || "Could not remove it.");
    wins.filter((w) => w.slug === slug).forEach((w) => close(w.id));
    refresh();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const winCmd = (cmd: "improve" | "rebuild") => { if (activeId !== null) window.dispatchEvent(new CustomEvent("aic:win", { detail: { id: activeId, cmd } })); };

  // Keyboard shortcuts (when the desktop itself has focus; apps inside iframes keep their own keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape") { setNewOpen(false); setSpot(null); setCtx(null); setAbout(false); return; }
      if (!mod) return;
      if (e.key === "n" || e.key === "N") { e.preventDefault(); setNewOpen(true); }
      if (e.key === " ") { e.preventDefault(); setSpot((s) => (s === null ? "" : null)); }
      if (activeId === null) return;
      if (e.key === "w" || e.key === "W") { e.preventDefault(); close(activeId); }
      if (e.key === "m" || e.key === "M") { e.preventDefault(); minimise(activeId); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeId, close, minimise]);

  const activeWin = wins.find((w) => w.id === activeId && w.state === "open");
  const openWins = wins.filter((w) => w.state !== "closing");
  const K = isMac ? "⌘" : "Ctrl+";

  const leftMenus: Menu[] = [
    { key: "logo", title: Glyph.logo, items: [
      { label: "About AI Computer", action: () => setAbout(true) }, "sep",
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      { label: `Sign Out ${user.email}…`, action: signOut },
    ] },
    { key: "app", title: activeWin ? activeWin.title : "Finder", bold: true, items: activeWin ? [
      { label: `About ${activeWin.title}`, hint: `version ${apps.find((a) => a.slug === activeWin.slug)?.version ?? "?"}, written by AI`, disabled: true }, "sep",
      { label: "Improve This App…", action: () => winCmd("improve") },
      { label: "Rebuild From Scratch", action: () => winCmd("rebuild") }, "sep",
      { label: "Close Window", shortcut: `${K}W`, action: () => close(activeWin.id) },
    ] : [
      { label: "About Finder", disabled: true }, "sep",
      { label: "Empty Trash…", disabled: true },
    ] },
    { key: "file", title: "File", items: [
      { label: "New App…", shortcut: `${K}N`, action: () => setNewOpen(true) }, "sep",
      ...apps.map((a) => ({ label: `Open ${a.name}`, action: () => open(a.slug) })),
    ] },
    { key: "edit", title: "Edit", items: [
      { label: "Undo", shortcut: `${K}Z`, disabled: true }, { label: "Redo", shortcut: `⇧${K}Z`, disabled: true }, "sep",
      { label: "Cut", shortcut: `${K}X`, disabled: true }, { label: "Copy", shortcut: `${K}C`, disabled: true }, { label: "Paste", shortcut: `${K}V`, disabled: true }, { label: "Select All", shortcut: `${K}A`, disabled: true },
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
  ];
  const rightMenus: Menu[] = [
    { key: "wifi", title: Glyph.wifi, align: "right", items: [{ label: "Wi-Fi", hint: "On", disabled: true }, "sep", { label: "AI Computer Network", checked: true }] },
    { key: "battery", title: Glyph.battery, align: "right", items: [{ label: "Battery", hint: "100%", disabled: true }, { label: "Power Source: Power Adapter", disabled: true }] },
    { key: "search", title: Glyph.search, align: "right", items: [{ label: "Spotlight Search…", shortcut: `${K}Space`, action: () => setSpot("") }] },
    { key: "control", title: Glyph.control, align: "right", items: [{ label: "Control Centre", disabled: true }, "sep", { label: "Clean Up Desktop", action: () => setSelected(null) }] },
    { key: "user", title: Glyph.user, align: "right", items: [{ label: user.email, disabled: true }, "sep", { label: "Sign Out…", action: signOut }] },
  ];

  const minWins = openWins.filter((w) => w.state === "min" || w.state === "minimising" || w.state === "minPending");
  const dockEntries: DockEntry[] = useMemo(() => {
    const inDock = dockSlugs.map((s) => apps.find((a) => a.slug === s)).filter(Boolean) as AppRow[];
    const running = apps.filter((a) => !dockSlugs.includes(a.slug) && openWins.some((w) => w.slug === a.slug));
    const e: DockEntry[] = [...inDock, ...running].map((a) => ({ kind: "app", slug: a.slug, name: a.name, icon: a.icon_url, running: openWins.some((w) => w.slug === a.slug), building: building.has(a.slug) }));
    if (minWins.length) e.push({ kind: "sep" }, ...minWins.map((w) => ({ kind: "min" as const, winId: w.id, slug: w.slug, name: w.title, icon: apps.find((a) => a.slug === w.slug)?.icon_url || "/icons/new-app.png" })));
    e.push({ kind: "sep" }, { kind: "new" }, { kind: "trash" });
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, dockSlugs, wins, building]);

  const spotMatches = spot !== null ? apps.filter((a) => a.name.toLowerCase().includes(spot.toLowerCase()) || a.description.toLowerCase().includes(spot.toLowerCase())) : [];

  return (
    <div className={styles.desktop} style={{ backgroundImage: `url(${wallpaper})` }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) { setSelected(null); setCtx(null); } }}
      onContextMenu={(e) => { if (e.target === e.currentTarget) e.preventDefault(); }}>
      <MenuBar left={leftMenus} right={rightMenus} clock={clock} />

      <div className={styles.icons}>
        {apps.map((a) => (
          <button key={a.slug} className={`${styles.icon} ${selected === a.slug ? styles.iconSelected : ""}`}
            onMouseDown={(e) => { e.stopPropagation(); setSelected(a.slug); setCtx(null); }}
            onDoubleClick={(e) => { const r = (e.currentTarget.querySelector("img") as HTMLElement).getBoundingClientRect(); open(a.slug, { x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
            onClick={(e) => { if (e.detail === 1 && window.matchMedia("(pointer: coarse)").matches) open(a.slug); }}
            onContextMenu={(e) => { e.preventDefault(); setSelected(a.slug); setCtx({ x: e.clientX, y: e.clientY, slug: a.slug }); }}
            title={a.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.icon_url} alt="" width={64} height={64} draggable={false} />
            <span className={styles.iconLabel}>{a.name}</span>
          </button>
        ))}
        <button className={`${styles.icon} ${selected === "new-app" ? styles.iconSelected : ""}`}
          onMouseDown={(e) => { e.stopPropagation(); setSelected("new-app"); }}
          onDoubleClick={() => setNewOpen(true)}
          onClick={(e) => { if (e.detail === 1 && window.matchMedia("(pointer: coarse)").matches) setNewOpen(true); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/new-app.png" alt="" width={64} height={64} draggable={false} />
          <span className={styles.iconLabel}>New app</span>
        </button>
      </div>

      {wins.map((w) => (
        <AppWindow key={w.id} win={w} active={w.id === activeId} menuHeight={MENU_H}
          onFocus={() => focus(w.id)} onClose={() => close(w.id)} onMinimise={() => minimise(w.id)} onZoom={() => zoom(w.id)}
          onChange={(p) => update(w.id, p)} onOpen={(s) => open(s)}
          onNotify={(text) => notify(text, w.title, apps.find((a) => a.slug === w.slug)?.icon_url)}
          onBuilt={refresh}
          onBuilding={(b) => setBuilding((s) => { const n = new Set(s); if (b) n.add(w.slug); else n.delete(w.slug); return n; })} />
      ))}

      <Dock entries={dockEntries} onApp={(s) => open(s)} onMin={(id) => focus(id)} onNew={() => setNewOpen(true)} onTrash={() => notify("The Trash is empty. Apps you remove from the desktop end up here.", "Trash")} />

      {newOpen ? (
        <div className={styles.sheetBack} onMouseDown={() => !creating && setNewOpen(false)}>
          <form className={styles.alert} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => createApp(e)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/new-app.png" alt="" width={64} height={64} className={styles.alertIcon} />
            <h2>New App</h2>
            <p>Describe the app you want. It gets a name and an icon now, and is written the first time you open it.</p>
            <textarea autoFocus value={wish} onChange={(e) => setWish(e.target.value)} placeholder="A habit tracker with streaks and a weekly chart" rows={3} />
            <div className={styles.alertActions}>
              <button type="button" className={styles.bezel} onClick={() => setNewOpen(false)} disabled={creating}>Cancel</button>
              <button className={styles.bezelDefault} disabled={creating || wish.trim().length < 4}>{creating ? "Designing…" : "Add to Desktop"}</button>
            </div>
          </form>
        </div>
      ) : null}

      {spot !== null ? (
        <div className={styles.sheetBack} onMouseDown={() => setSpot(null)} style={{ alignItems: "flex-start", paddingTop: "18vh" }}>
          <div className={styles.spotlight} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.spotField}>
              {Glyph.search}
              <input autoFocus value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Spotlight Search"
                onKeyDown={(e) => { if (e.key === "Enter") { if (spotMatches[0]) { open(spotMatches[0].slug); setSpot(null); } else if (spot.trim().length >= 4) createApp(undefined, spot); } }} />
            </div>
            {spot ? (
              <div className={styles.spotList}>
                {spotMatches.map((a, i) => (
                  <button key={a.slug} className={`${styles.spotRow} ${i === 0 ? styles.spotRowFirst : ""}`} onClick={() => { open(a.slug); setSpot(null); }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.icon_url} alt="" width={28} height={28} /><span>{a.name}</span><em>Application</em>
                  </button>
                ))}
                {!spotMatches.length ? (
                  <button className={`${styles.spotRow} ${styles.spotRowFirst}`} onClick={() => createApp(undefined, spot)} disabled={creating || spot.trim().length < 4}>
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
          <div className={styles.alert} onMouseDown={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
            <span className={styles.aboutLogo} />
            <h2>AI Computer</h2>
            <p>A desktop whose apps are written the moment you open them. Every app is a single file, generated once for you and kept.</p>
            <p className={styles.fine}>Signed in as {user.email}. {apps.length} apps, {apps.filter((a) => a.version).length} built.</p>
            <div className={styles.alertActions}><button className={styles.bezelDefault} onClick={() => setAbout(false)}>OK</button></div>
          </div>
        </div>
      ) : null}

      {ctx ? (
        <div className={styles.context} style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => { open(ctx.slug); setCtx(null); }}>Open</button>
          <div className={styles.ctxSep} />
          <button onClick={() => { setCtx(null); open(ctx.slug); setTimeout(() => winCmd("improve"), 400); }}>Improve…</button>
          <button onClick={() => removeApp(ctx.slug)}>Move to Trash</button>
        </div>
      ) : null}

      <div className={styles.notices}>
        {notices.map((n) => (
          <div key={n.id} className={`${styles.notice} ${n.leaving ? styles.noticeLeaving : ""}`} role="status">
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
