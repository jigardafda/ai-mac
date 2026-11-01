"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Prefs } from "@/lib/apps";
import { setAppMenus } from "@/lib/appmenus";
import type { Menu, MenuItem } from "./MenuBar";
import styles from "./browser.module.css";

type Tab = { id: number; url: string; title: string; icon?: string; hist: string[]; idx: number; loading: boolean; readerable: boolean; reader: boolean; zoom: number };
type Entry = { url: string; title: string; icon?: string; at: number };
type Store = { history: Entry[]; bookmarks: Entry[]; reading: Entry[]; favbar: boolean };
type Pop = "share" | "aa" | "tabs" | "find" | null;
type Ctx = { x: number; y: number; items: MenuItem[] };
type Props = { prefs: Prefs; setPrefs: (p: Prefs) => void; onTitle: (t: string) => void; onClose: () => void; notify: (text: string) => void; isMac: boolean };

const FAVOURITES: Entry[] = [
  { url: "https://en.wikipedia.org", title: "Wikipedia", at: 0 }, { url: "https://news.ycombinator.com", title: "Hacker News", at: 0 },
  { url: "https://html.duckduckgo.com/html/", title: "DuckDuckGo", at: 0 }, { url: "https://www.bbc.com/news", title: "BBC News", at: 0 },
  { url: "https://developer.mozilla.org", title: "MDN Web Docs", at: 0 }, { url: "https://github.com", title: "GitHub", at: 0 },
  { url: "https://open-meteo.com", title: "Open-Meteo", at: 0 }, { url: "https://lobste.rs", title: "Lobsters", at: 0 },
  { url: "https://www.theguardian.com", title: "The Guardian", at: 0 }, { url: "https://arxiv.org", title: "arXiv", at: 0 },
];
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const favicon = (u: string) => `https://icons.duckduckgo.com/ip3/${host(u)}.ico`;
const toUrl = (raw: string) => {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(t)) return `https://${t}`;
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(t)}`;
};
const when = (t: number) => { const d = new Date(t), now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }); };
const blank = (id: number): Tab => ({ id, url: "", title: "Start Page", hist: [""], idx: 0, loading: false, readerable: false, reader: false, zoom: 1 });

function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}
const I = {
  sidebar: "M1.5 3h13v10h-13zM5.5 3v10", back: "M10 3L5 8l5 5", fwd: "M6 3l5 5-5 5", share: "M8 10V2M5 5l3-3 3 3M3 8v6h10V8", plus: "M8 3v10M3 8h10",
  grid: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z", reload: "M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3", stop: "M4 4l8 8M12 4l-8 8", lock: "M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2",
  reader: "M2 4h12M2 8h12M2 12h8", book: "M2 3h5a2 2 0 0 1 2 2v9a1.5 1.5 0 0 0-1.5-1.5H2zM14 3H9a2 2 0 0 0-2 2v9a1.5 1.5 0 0 1 1.5-1.5H14z", glasses: "M2 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0M9 10a2.5 2.5 0 1 0 5 0 2.5 2.5 0 0 0-5 0M7 10h2M2 10l1.5-5M14 10l-1.5-5",
  clock: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 5v3l2 1.5", x: "M4 4l8 8M12 4l-8 8", search: "M7 2a5 5 0 1 0 0 10A5 5 0 0 0 7 2M10.5 10.5L14 14", shield: "M8 1l5 2v4c0 4-2 6-5 8-3-2-5-4-5-8V3z",
};

/** Safari for AI Mac. Pages load through /api/browse in a sandboxed frame. */
export function Browser({ prefs, setPrefs, onTitle, onClose, notify, isMac }: Props) {
  const store: Store = useMemo(() => ({ history: [], bookmarks: [], reading: [], favbar: false, ...((prefs.safari as Partial<Store>) ?? {}) }), [prefs.safari]);
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; }, [store]);
  const save = useCallback((patch: Partial<Store>) => setPrefs({ safari: { ...storeRef.current, ...patch } }), [setPrefs]);
  const [tabs, setTabs] = useState<Tab[]>([blank(1)]);
  const [cur, setCur] = useState(1);
  const [field, setField] = useState("");
  const [editing, setEditing] = useState(false);
  const [pop, setPop] = useState<Pop>(null);
  const [sidebar, setSidebar] = useState<null | "bookmarks" | "reading" | "history">(null);
  const [findQ, setFindQ] = useState("");
  const [findOk, setFindOk] = useState<boolean | null>(null);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [priv, setPriv] = useState(false);
  const nextId = useRef(2);
  const frame = useRef<HTMLIFrameElement>(null);
  const addr = useRef<HTMLInputElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const tab = tabs.find((t) => t.id === cur) ?? tabs[0];
  const K = isMac ? "⌘" : "Ctrl+";

  const patch = useCallback((id: number, p: Partial<Tab> | ((t: Tab) => Partial<Tab>)) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...(typeof p === "function" ? p(t) : p) } : t))), []);
  const navigate = useCallback((url: string, id = cur) => {
    patch(id, (t) => ({ url, title: url ? host(url) : "Start Page", icon: undefined, loading: !!url, readerable: false, reader: false, hist: [...t.hist.slice(0, t.idx + 1), url], idx: t.idx + 1 }));
    setPop(null); setCtx(null); setEditing(false);
  }, [cur, patch]);
  const openInNewTab = useCallback((url: string, focusIt = false) => {
    const id = nextId.current++;
    setTabs((ts) => [...ts, { ...blank(id), url, title: host(url), hist: ["", url], idx: 1, loading: true }]);
    if (focusIt) setCur(id);
  }, []);
  const back = useCallback(() => patch(cur, (t) => (t.idx > 0 ? { idx: t.idx - 1, url: t.hist[t.idx - 1], loading: !!t.hist[t.idx - 1], reader: false } : {})), [cur, patch]);
  const fwd = useCallback(() => patch(cur, (t) => (t.idx < t.hist.length - 1 ? { idx: t.idx + 1, url: t.hist[t.idx + 1], loading: !!t.hist[t.idx + 1], reader: false } : {})), [cur, patch]);
  const reload = useCallback(() => { if (frame.current && tab.url) { patch(cur, { loading: true }); frame.current.src = `/api/browse?url=${encodeURIComponent(tab.url)}${tab.reader ? "&reader=1" : ""}&t=${Date.now()}`; } }, [cur, patch, tab.url, tab.reader]);
  const stop = useCallback(() => patch(cur, { loading: false }), [cur, patch]);
  const newTab = useCallback(() => { const id = nextId.current++; setTabs((ts) => [...ts, blank(id)]); setCur(id); setEditing(true); setField(""); setTimeout(() => addr.current?.focus(), 30); }, []);
  const closeTab = useCallback((id: number) => {
    setTabs((ts) => {
      if (ts.length === 1) { setTimeout(onClose, 0); return ts; }
      const i = ts.findIndex((t) => t.id === id);
      const rest = ts.filter((t) => t.id !== id);
      setCur((c) => (c === id ? rest[Math.max(0, i - 1)].id : c));
      return rest;
    });
  }, [onClose]);
  const focusAddress = useCallback(() => { setEditing(true); setField(tab.url); setTimeout(() => { addr.current?.focus(); addr.current?.select(); }, 20); }, [tab.url]);
  const post = useCallback((m: Record<string, unknown>) => frame.current?.contentWindow?.postMessage({ aicBrowse: true, ...m }, "*"), []);
  const setZoom = useCallback((z: number) => { const zoom = Math.min(3, Math.max(0.5, Math.round(z * 10) / 10)); patch(cur, { zoom }); post({ type: "zoom", zoom }); }, [cur, patch, post]);
  const toggleReader = useCallback(() => { if (tab.readerable || tab.reader) patch(cur, { reader: !tab.reader, loading: true }); }, [cur, patch, tab.readerable, tab.reader]);
  const isBookmarked = !!tab.url && store.bookmarks.some((b) => b.url === tab.url);
  const addBookmark = useCallback(() => { if (!tab.url) return; if (isBookmarked) { save({ bookmarks: storeRef.current.bookmarks.filter((b) => b.url !== tab.url) }); notify("Bookmark removed."); } else { save({ bookmarks: [...storeRef.current.bookmarks, { url: tab.url, title: tab.title, icon: tab.icon, at: Date.now() }] }); notify(`“${tab.title}” was added to your bookmarks.`); } }, [tab, isBookmarked, save, notify]);
  const addReading = useCallback((url = tab.url, title = tab.title, icon = tab.icon) => { if (!url || storeRef.current.reading.some((r) => r.url === url)) return; save({ reading: [{ url, title, icon, at: Date.now() }, ...storeRef.current.reading].slice(0, 100) }); notify(`“${title}” was added to your Reading List.`); }, [tab, save, notify]);
  const clearHistory = useCallback(() => { save({ history: [] }); notify("History cleared."); }, [save, notify]);
  const copyLink = useCallback(() => { navigator.clipboard?.writeText(tab.url).then(() => notify("Link copied.")).catch(() => notify("Could not copy.")); }, [tab.url, notify]);
  const cycle = useCallback((d: number) => { const i = tabs.findIndex((t) => t.id === cur); setCur(tabs[(i + d + tabs.length) % tabs.length].id); }, [tabs, cur]);

  useEffect(() => { onTitle(priv ? `${tab.title || "Start Page"} — Private` : tab.title || "Safari"); }, [tab.title, priv]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- keyboard ---------- */
  const handleKey = useCallback((e: { key: string; shiftKey: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }, fromPage = false): boolean => {
    const mod = fromPage || (isMac ? e.metaKey : e.ctrlKey);
    if (!mod) return false;
    const k = e.key.toLowerCase();
    if (k === "t") newTab();
    else if (k === "w") closeTab(cur);
    else if (k === "l") focusAddress();
    else if (k === "r" && e.shiftKey) toggleReader();
    else if (k === "r") reload();
    else if (k === "f") { setPop("find"); setTimeout(() => findRef.current?.focus(), 20); }
    else if (k === "d" && e.shiftKey) addReading();
    else if (k === "d") addBookmark();
    else if (k === "y") setSidebar("history");
    else if (k === "[") back();
    else if (k === "]") fwd();
    else if (k === "=" || k === "+") setZoom(tab.zoom + 0.1);
    else if (k === "-") setZoom(tab.zoom - 0.1);
    else if (k === "0") setZoom(1);
    else if (k === "\\" && e.shiftKey) setPop((p) => (p === "tabs" ? null : "tabs"));
    else if (k === "n" && e.shiftKey) setPriv((p) => !p);
    else if (k === "tab") cycle(e.shiftKey ? -1 : 1);
    else return false;
    return true;
  }, [isMac, newTab, closeTab, cur, focusAddress, toggleReader, reload, addReading, addBookmark, back, fwd, setZoom, tab.zoom, cycle]);

  /* ---------- messages from the page ---------- */
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data;
      if (!m || !m.aicBrowse) return;
      if (m.type === "navigate" && typeof m.url === "string") { if (m.newTab) openInNewTab(m.url); else navigate(m.url); }
      if (m.type === "meta") {
        const title = String(m.title || host(tab.url)).slice(0, 80);
        const icon = typeof m.icon === "string" ? m.icon : undefined;
        patch(cur, { title, icon, readerable: !!m.readerable, loading: false });
        if (!priv && tab.url && !tab.reader) save({ history: [{ url: tab.url, title, icon, at: Date.now() }, ...storeRef.current.history.filter((x) => x.url !== tab.url)].slice(0, 300) });
        if (tab.zoom !== 1) post({ type: "zoom", zoom: tab.zoom });
      }
      if (m.type === "found") setFindOk(!!m.ok);
      if (m.type === "key") handleKey({ key: m.key, shiftKey: !!m.shift }, true);
      if (m.type === "contextmenu") {
        const r = frame.current.getBoundingClientRect();
        const root = frame.current.closest("section")?.getBoundingClientRect();
        const items: MenuItem[] = [];
        if (m.link) items.push({ label: "Open Link in New Tab", action: () => openInNewTab(m.link, true) }, { label: "Open Link in Background", action: () => openInNewTab(m.link) }, { label: "Add Link to Reading List", action: () => addReading(m.link, host(m.link), undefined) }, { label: "Copy Link", action: () => navigator.clipboard?.writeText(m.link) }, "sep");
        if (m.image) items.push({ label: "Open Image in New Tab", action: () => openInNewTab(m.image, true) }, { label: "Copy Image Address", action: () => navigator.clipboard?.writeText(m.image) }, "sep");
        if (m.selection) items.push({ label: `Search DuckDuckGo for “${String(m.selection).slice(0, 24)}${String(m.selection).length > 24 ? "…" : ""}”`, action: () => openInNewTab(toUrl(String(m.selection)), true) }, { label: "Copy", action: () => navigator.clipboard?.writeText(String(m.selection)) }, "sep");
        items.push({ label: "Back", disabled: tab.idx <= 0, action: back }, { label: "Forward", disabled: tab.idx >= tab.hist.length - 1, action: fwd }, { label: "Reload Page", action: reload }, "sep", { label: isBookmarked ? "Remove Bookmark" : "Add Bookmark…", action: addBookmark }, { label: "Add to Reading List", action: () => addReading() }, "sep", { label: "Show Reader", disabled: !tab.readerable, action: toggleReader });
        setCtx({ x: r.left + m.x - (root?.left ?? 0), y: r.top + m.y - (root?.top ?? 0), items });
      }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  });

  /* ---------- menu bar ---------- */
  useEffect(() => {
    const recent = store.history.slice(0, 10);
    const menus: Menu[] = [
      { key: "app", title: "Safari", bold: true, items: [
        { label: "About Safari", hint: "AI Mac 1.0", disabled: true }, "sep",
        { label: "Clear History…", action: clearHistory }, "sep",
        { label: priv ? "Leave Private Browsing" : "Private Browsing", shortcut: `⇧${K}N`, checked: priv, action: () => setPriv((p) => !p) }, "sep",
        { label: "Close Window", action: onClose },
      ] },
      { key: "file", title: "File", items: [
        { label: "New Tab", shortcut: `${K}T`, action: newTab }, { label: "New Private Window", shortcut: `⇧${K}N`, action: () => { setPriv(true); newTab(); } }, { label: "Open Location…", shortcut: `${K}L`, action: focusAddress }, "sep",
        { label: "Close Tab", shortcut: `${K}W`, action: () => closeTab(cur) }, "sep",
        { label: "Share…", disabled: !tab.url, action: () => setPop("share") }, { label: "Print…", shortcut: `${K}P`, disabled: true },
      ] },
      { key: "edit", title: "Edit", items: [
        { label: "Copy Address", disabled: !tab.url, action: copyLink }, "sep",
        { label: "Find…", shortcut: `${K}F`, disabled: !tab.url, action: () => { setPop("find"); setTimeout(() => findRef.current?.focus(), 20); } },
        { label: "Find Next", shortcut: `${K}G`, disabled: !findQ, action: () => post({ type: "find", q: findQ }) },
        { label: "Find Previous", shortcut: `⇧${K}G`, disabled: !findQ, action: () => post({ type: "find", q: findQ, back: true }) },
      ] },
      { key: "view", title: "View", items: [
        { label: sidebar ? "Hide Sidebar" : "Show Sidebar", shortcut: `⇧${K}L`, action: () => setSidebar((s) => (s ? null : "bookmarks")) },
        { label: store.favbar ? "Hide Favourites Bar" : "Show Favourites Bar", shortcut: `⇧${K}B`, action: () => save({ favbar: !store.favbar }) },
        { label: "Show Tab Overview", shortcut: `⇧${K}\\`, action: () => setPop("tabs") }, "sep",
        { label: tab.reader ? "Hide Reader" : "Show Reader", shortcut: `⇧${K}R`, disabled: !tab.readerable && !tab.reader, action: toggleReader }, "sep",
        { label: "Actual Size", shortcut: `${K}0`, disabled: !tab.url, action: () => setZoom(1) }, { label: "Zoom In", shortcut: `${K}+`, disabled: !tab.url, action: () => setZoom(tab.zoom + 0.1) }, { label: "Zoom Out", shortcut: `${K}-`, disabled: !tab.url, action: () => setZoom(tab.zoom - 0.1) }, "sep",
        { label: tab.loading ? "Stop" : "Reload Page", shortcut: `${K}R`, disabled: !tab.url, action: tab.loading ? stop : reload },
      ] },
      { key: "history", title: "History", items: [
        { label: "Back", shortcut: `${K}[`, disabled: tab.idx <= 0, action: back }, { label: "Forward", shortcut: `${K}]`, disabled: tab.idx >= tab.hist.length - 1, action: fwd }, { label: "Home", shortcut: `⇧${K}H`, action: () => navigate("") }, "sep",
        { label: "Show All History", shortcut: `${K}Y`, action: () => setSidebar("history") }, "sep",
        ...(recent.length ? recent.map((h) => ({ label: h.title.slice(0, 48), hint: when(h.at), action: () => navigate(h.url) })) : [{ label: "No history yet", disabled: true } as MenuItem]), "sep",
        { label: "Clear History…", action: clearHistory },
      ] },
      { key: "bookmarks", title: "Bookmarks", items: [
        { label: "Show Bookmarks", shortcut: `⌃${K}1`, action: () => setSidebar("bookmarks") }, { label: "Show Reading List", shortcut: `⌃${K}2`, action: () => setSidebar("reading") }, "sep",
        { label: isBookmarked ? "Remove Bookmark" : "Add Bookmark…", shortcut: `${K}D`, disabled: !tab.url, action: addBookmark }, { label: "Add to Reading List", shortcut: `⇧${K}D`, disabled: !tab.url, action: () => addReading() }, "sep",
        { label: "Favourites", disabled: true }, ...FAVOURITES.map((f) => ({ label: f.title, action: () => navigate(f.url) })),
        ...(store.bookmarks.length ? ["sep" as const, ...store.bookmarks.slice(0, 15).map((b) => ({ label: b.title.slice(0, 48), action: () => navigate(b.url) }))] : []),
      ] },
      { key: "window", title: "Window", items: [
        { label: "Show Previous Tab", shortcut: "⌃⇧⇥", disabled: tabs.length < 2, action: () => cycle(-1) }, { label: "Show Next Tab", shortcut: "⌃⇥", disabled: tabs.length < 2, action: () => cycle(1) }, "sep",
        ...tabs.map((t) => ({ label: t.title || "Start Page", checked: t.id === cur, action: () => setCur(t.id) })),
      ] },
      { key: "help", title: "Help", items: [{ label: "Safari Help", action: () => notify(`${K}L address, ${K}T new tab, ${K}W close tab, ${K}F find, ${K}D bookmark, ⇧${K}R reader, ${K}+ and ${K}- zoom, ⇧${K}\\ tab overview.`) }] },
    ];
    setAppMenus("browser", { menus, onKey: (e) => handleKey(e) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- republish only when something a menu shows or does has changed
  }, [tabs, cur, store, sidebar, priv, findQ]);
  useEffect(() => () => setAppMenus("browser", null), []);

  const submit = (e: React.FormEvent) => { e.preventDefault(); const u = toUrl(field); if (u) navigate(u); setEditing(false); addr.current?.blur(); };
  const secure = tab.url.startsWith("https://");
  const frequent = useMemo(() => { const m = new Map<string, Entry & { n: number }>(); for (const h of store.history) { const k = host(h.url); const e = m.get(k); if (e) e.n++; else m.set(k, { ...h, url: `https://${host(h.url)}`, title: k, n: 1 }); } return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8); }, [store.history]);
  const side = sidebar === "history" ? store.history : sidebar === "reading" ? store.reading : store.bookmarks;
  const suggestions = editing && field ? [...store.bookmarks, ...store.history].filter((h, i, a) => (h.title.toLowerCase().includes(field.toLowerCase()) || h.url.toLowerCase().includes(field.toLowerCase())) && a.findIndex((x) => x.url === h.url) === i).slice(0, 6) : [];

  return (
    <div className={`${styles.browser} ${priv ? styles.private : ""}`} onMouseDown={() => { setCtx(null); if (pop !== "find") setPop(null); }} onKeyDown={(e) => { if (handleKey(e)) { e.preventDefault(); e.stopPropagation(); } }}>
      <div className={styles.toolbar}>
        <button className={`${styles.tb} ${sidebar ? styles.tbOn : ""}`} onClick={() => setSidebar((s) => (s ? null : "bookmarks"))} title="Show sidebar"><Icon d={I.sidebar} /></button>
        <span className={styles.navBtns}>
          <button className={styles.tb} onClick={back} disabled={tab.idx <= 0} title="Show the previous page"><Icon d={I.back} /></button>
          <button className={styles.tb} onClick={fwd} disabled={tab.idx >= tab.hist.length - 1} title="Show the next page"><Icon d={I.fwd} /></button>
        </span>
        <span className={styles.flex} />
        <form className={`${styles.address} ${editing ? styles.addressEditing : ""}`} onSubmit={submit} onMouseDown={(e) => e.stopPropagation()}>
          {!editing ? <button type="button" className={styles.aa} onClick={() => setPop(pop === "aa" ? null : "aa")} title="Page settings" disabled={!tab.url}>aA</button> : null}
          {!editing && tab.url ? <span className={styles.lock} title={secure ? "Safari is using an encrypted connection" : "Not secure"}><Icon d={secure ? I.lock : I.stop} size={12} /></span> : null}
          <input ref={addr} value={editing ? field : (tab.url ? host(tab.url) : "")} placeholder="Search or enter website name" spellCheck={false} autoComplete="off"
            onFocus={(e) => { setEditing(true); setField(tab.url); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => setTimeout(() => setEditing(false), 120)} onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); (e.target as HTMLInputElement).blur(); } }} />
          {!editing && tab.url ? <>
            <button type="button" className={styles.inField} onClick={tab.loading ? stop : reload} title={tab.loading ? "Stop loading" : "Reload this page"}><Icon d={tab.loading ? I.stop : I.reload} size={14} /></button>
            {tab.readerable || tab.reader ? <button type="button" className={`${styles.inField} ${tab.reader ? styles.inFieldOn : ""}`} onClick={toggleReader} title={tab.reader ? "Hide Reader" : "Show Reader"}><Icon d={I.reader} size={14} /></button> : null}
          </> : null}
          {tab.loading ? <span className={styles.progress} /> : null}
          {suggestions.length || (editing && field) ? (
            <div className={styles.suggest}>
              <button type="button" className={styles.sugRow} onMouseDown={(e) => { e.preventDefault(); navigate(toUrl(field)); }}><Icon d={I.search} size={14} /><span>{field}</span><em>{/^https?:|^[\w-]+(\.[\w-]+)+/.test(field) ? "Go to site" : "Search DuckDuckGo"}</em></button>
              {suggestions.map((h) => <button type="button" key={h.url} className={styles.sugRow} onMouseDown={(e) => { e.preventDefault(); navigate(h.url); }}><img src={favicon(h.url)} alt="" width={14} height={14} /><span>{h.title}</span><em>{host(h.url)}</em></button>)}
            </div>
          ) : null}
        </form>
        <span className={styles.flex} />
        <button className={styles.tb} onClick={(e) => { e.stopPropagation(); setPop(pop === "share" ? null : "share"); }} disabled={!tab.url} title="Share"><Icon d={I.share} /></button>
        <button className={styles.tb} onClick={newTab} title="New tab"><Icon d={I.plus} /></button>
        <button className={`${styles.tb} ${pop === "tabs" ? styles.tbOn : ""}`} onClick={(e) => { e.stopPropagation(); setPop(pop === "tabs" ? null : "tabs"); }} title="Show tab overview"><Icon d={I.grid} /></button>
      </div>

      {store.favbar ? <div className={styles.favbar}>{[...FAVOURITES.slice(0, 6), ...store.bookmarks.slice(0, 6)].map((b) => <button key={b.url} onClick={() => navigate(b.url)}><img src={favicon(b.url)} alt="" width={12} height={12} />{b.title}</button>)}</div> : null}

      {tabs.length > 1 ? (
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <div key={t.id} className={`${styles.tab} ${t.id === cur ? styles.tabOn : ""}`} onClick={() => setCur(t.id)} onAuxClick={(e) => { if (e.button === 1) closeTab(t.id); }} title={t.url || "Start Page"}>
              <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label="Close tab"><Icon d={I.x} size={10} /></button>
              {t.url ? <img src={t.icon || favicon(t.url)} alt="" width={14} height={14} onError={(e) => { (e.target as HTMLImageElement).style.visibility = "hidden"; }} /> : null}
              <span>{t.title || "Start Page"}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className={styles.main}>
        {sidebar ? (
          <aside className={styles.side}>
            <div className={styles.sideSeg}>{(["bookmarks", "reading", "history"] as const).map((s) => <button key={s} className={sidebar === s ? styles.segOn : ""} onClick={() => setSidebar(s)} title={s === "bookmarks" ? "Bookmarks" : s === "reading" ? "Reading List" : "History"}><Icon d={s === "bookmarks" ? I.book : s === "reading" ? I.glasses : I.clock} /></button>)}</div>
            <h3>{sidebar === "bookmarks" ? "Bookmarks" : sidebar === "reading" ? "Reading List" : "History"}</h3>
            {sidebar === "bookmarks" ? <><h4>Favourites</h4>{FAVOURITES.map((f) => <button key={f.url} className={styles.sideRow} onClick={() => navigate(f.url)}><img src={favicon(f.url)} alt="" width={16} height={16} /><span>{f.title}</span></button>)}<h4>Bookmarks</h4></> : null}
            {side.length ? side.map((h) => (
              <button key={h.url + h.at} className={styles.sideRow} onClick={() => navigate(h.url)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); const r = (e.currentTarget.closest("section") as HTMLElement)?.getBoundingClientRect(); setCtx({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), items: [{ label: "Open in New Tab", action: () => openInNewTab(h.url, true) }, { label: "Copy Link", action: () => navigator.clipboard?.writeText(h.url) }, "sep", { label: "Remove", action: () => save(sidebar === "history" ? { history: store.history.filter((x) => x !== h) } : sidebar === "reading" ? { reading: store.reading.filter((x) => x !== h) } : { bookmarks: store.bookmarks.filter((x) => x !== h) }) }] }); }}>
                <img src={h.icon || favicon(h.url)} alt="" width={16} height={16} onError={(e) => { (e.target as HTMLImageElement).src = favicon(h.url); }} /><span>{h.title}<small>{sidebar === "history" ? `${host(h.url)} · ${when(h.at)}` : host(h.url)}</small></span>
              </button>
            )) : sidebar !== "bookmarks" ? <p className={styles.empty}>{sidebar === "reading" ? "Pages you add to your Reading List appear here." : "Pages you visit appear here."}</p> : <p className={styles.empty}>Press {K}D on a page to bookmark it.</p>}
            {sidebar === "history" && store.history.length ? <button className={styles.sideClear} onClick={clearHistory}>Clear History</button> : null}
          </aside>
        ) : null}

        <div className={styles.content}>
          {tabs.map((t) => t.id !== cur ? null : t.url ? (
            <iframe key={`${t.id}-${t.reader ? "r" : "p"}`} ref={frame} className={styles.frame} title={t.title} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"
              src={`/api/browse?url=${encodeURIComponent(t.url)}${t.reader ? "&reader=1" : ""}`} onLoad={() => patch(t.id, { loading: false })} />
          ) : (
            <div key={t.id} className={styles.start}>
              <section><h2>Favourites</h2><div className={styles.favs}>{FAVOURITES.map((f) => <button key={f.url} className={styles.fav} onClick={() => navigate(f.url)}><span><img src={favicon(f.url)} alt="" width={32} height={32} /></span><small>{f.title}</small></button>)}</div></section>
              {frequent.length ? <section><h2>Frequently Visited</h2><div className={styles.favs}>{frequent.map((f) => <button key={f.url} className={styles.fav} onClick={() => navigate(f.url)}><span><img src={favicon(f.url)} alt="" width={32} height={32} /></span><small>{f.title}</small></button>)}</div></section> : null}
              {store.reading.length ? <section><h2>Reading List</h2><div className={styles.cards}>{store.reading.slice(0, 4).map((r) => <button key={r.url} className={styles.card} onClick={() => navigate(r.url)}><img src={r.icon || favicon(r.url)} alt="" width={20} height={20} /><b>{r.title}</b><small>{host(r.url)}</small></button>)}</div></section> : null}
              <section><h2>Privacy Report</h2><div className={styles.report}><Icon d={I.shield} size={28} /><div><b>{store.history.length} pages opened through AI Mac</b><span>Sites never see this desktop; page scripts run in a sealed frame with no access to your apps or sign-in.</span></div></div></section>
              {priv ? <p className={styles.privNote}>Private Browsing is on. Pages you open in this window are not added to History.</p> : null}
            </div>
          ))}

          {pop === "find" ? (
            <form className={styles.findBar} onMouseDown={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); post({ type: "find", q: findQ }); }}>
              <span>Find</span><input ref={findRef} value={findQ} onChange={(e) => { setFindQ(e.target.value); setFindOk(null); if (e.target.value) post({ type: "find", q: e.target.value }); }} placeholder="Search in page" onKeyDown={(e) => { if (e.key === "Escape") setPop(null); if (e.key === "Enter" && e.shiftKey) { e.preventDefault(); post({ type: "find", q: findQ, back: true }); } }} />
              <em>{findOk === false && findQ ? "Not found" : ""}</em>
              <button type="button" onClick={() => post({ type: "find", q: findQ, back: true })} aria-label="Previous"><Icon d={I.back} size={12} /></button>
              <button type="button" onClick={() => post({ type: "find", q: findQ })} aria-label="Next"><Icon d={I.fwd} size={12} /></button>
              <button type="button" onClick={() => setPop(null)}>Done</button>
            </form>
          ) : null}
        </div>
      </div>

      {pop === "share" ? (
        <div className={`${styles.popover} ${styles.popShare}`} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.popHead}><img src={tab.icon || favicon(tab.url)} alt="" width={28} height={28} /><div><b>{tab.title}</b><small>{host(tab.url)}</small></div></div>
          <button onClick={() => { copyLink(); setPop(null); }}>Copy Link</button>
          <button onClick={() => { addReading(); setPop(null); }}>Add to Reading List</button>
          <button onClick={() => { addBookmark(); setPop(null); }}>{isBookmarked ? "Remove Bookmark" : "Add Bookmark"}</button>
          <button onClick={() => { openInNewTab(tab.url, true); setPop(null); }}>Open in New Tab</button>
          <button onClick={() => { window.open(tab.url, "_blank", "noopener"); setPop(null); }}>Open in Your Real Browser</button>
        </div>
      ) : null}
      {pop === "aa" ? (
        <div className={`${styles.popover} ${styles.popAa}`} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.zoomRow}><button onClick={() => setZoom(tab.zoom - 0.1)}>A</button><span>{Math.round(tab.zoom * 100)}%</span><button onClick={() => setZoom(tab.zoom + 0.1)} style={{ fontSize: 17 }}>A</button></div>
          <button disabled={!tab.readerable && !tab.reader} onClick={() => { toggleReader(); setPop(null); }}>{tab.reader ? "Hide Reader" : tab.readerable ? "Show Reader" : "Reader Not Available"}</button>
          <button onClick={() => { setZoom(1); setPop(null); }}>Actual Size</button>
          <button onClick={() => { reload(); setPop(null); }}>Reload Page</button>
          <button onClick={() => { post({ type: "scrollTop" }); setPop(null); }}>Scroll to Top</button>
        </div>
      ) : null}
      {pop === "tabs" ? (
        <div className={styles.overview} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.overviewGrid}>
            {tabs.map((t) => (
              <div key={t.id} className={`${styles.ovCard} ${t.id === cur ? styles.ovOn : ""}`} onClick={() => { setCur(t.id); setPop(null); }}>
                <button className={styles.ovClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label="Close tab"><Icon d={I.x} size={10} /></button>
                <div className={styles.ovThumb}>{t.url ? <><img src={t.icon || favicon(t.url)} alt="" width={40} height={40} /><span>{host(t.url)}</span></> : <span className={styles.ovStart}>Start Page</span>}</div>
                <b>{t.title || "Start Page"}</b>
              </div>
            ))}
            <button className={`${styles.ovCard} ${styles.ovNew}`} onClick={() => { newTab(); setPop(null); }}><Icon d={I.plus} size={28} /></button>
          </div>
        </div>
      ) : null}
      {ctx ? (
        <div className={styles.context} style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()} role="menu">
          {ctx.items.map((it, i) => it === "sep" ? <div key={i} className={styles.ctxSep} /> : <button key={i} disabled={it.disabled} onClick={() => { setCtx(null); it.action?.(); }}>{it.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}
