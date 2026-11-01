"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRow } from "@/lib/apps";
import { setAppMenus } from "@/lib/appmenus";
import type { Menu, MenuItem } from "./MenuBar";
import styles from "./finder.module.css";

export type FileItem = { path: string; name: string; kind: "file" | "folder" | "app"; mime: string; size: number; updated_at: string; icon?: string; slug?: string };
type View = "icons" | "list" | "columns";
type Ctx = { x: number; y: number; items: MenuItem[] };
type Props = { apps: AppRow[]; initialPath?: string; onTitle: (t: string) => void; onClose: () => void; onOpenApp: (slug: string, arg?: string) => void; notify: (t: string) => void; isMac: boolean; userName: string };

const HOME = "/";
const SIDEBAR: { name: string; path: string; glyph: string }[] = [
  { name: "Recents", path: "recents", glyph: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2M8 5v3l2 1.5" },
  { name: "Applications", path: "/Applications", glyph: "M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z" },
  { name: "Desktop", path: "/Desktop", glyph: "M2 3h12v8H2zM6 14h4" },
  { name: "Documents", path: "/Documents", glyph: "M4 2h5l3 3v9H4zM9 2v3h3" },
  { name: "Downloads", path: "/Downloads", glyph: "M8 2v8M5 7l3 3 3-3M3 13h10" },
  { name: "Movies", path: "/Movies", glyph: "M2 4h12v9H2zM2 7h12M5 4v3M11 4v3" },
  { name: "Music", path: "/Music", glyph: "M6 13V4l7-2v9M6 13a2 2 0 1 1-4 0 2 2 0 0 1 4 0M13 11a2 2 0 1 1-4 0 2 2 0 0 1 4 0" },
  { name: "Pictures", path: "/Pictures", glyph: "M2 3h12v10H2zM2 11l4-4 3 3 2-2 3 3" },
];
const fmtSize = (n: number) => (n < 1024 ? `${n} bytes` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const fmtDate = (s: string) => { const d = new Date(s), now = new Date(); const same = d.toDateString() === now.toDateString(); return (same ? "Today" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })) + " at " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); };
const kindOf = (f: FileItem) => f.kind === "folder" ? "Folder" : f.kind === "app" ? "Application" : /\.rtf$|text\/html/.test(f.name + f.mime) ? "Rich Text Document" : /\.md$/.test(f.name) ? "Markdown Document" : /\.(js|ts|py|json|css|html)$/.test(f.name) ? "Source Code" : "Plain Text Document";
const parentOf = (p: string) => p.split("/").slice(0, -1).join("/") || "/";
const crumbs = (p: string) => { const parts = p.split("/").filter(Boolean); return [{ name: "AI Mac HD", path: "/" }, ...parts.map((x, i) => ({ name: x, path: "/" + parts.slice(0, i + 1).join("/") }))]; };

export function FileIcon({ f, size = 64 }: { f: FileItem; size?: number }) {
  if (f.kind === "app" && f.icon) return <img src={f.icon} alt="" width={size} height={size} className={styles.appIcon} draggable={false} />;
  if (f.kind === "folder") {
    const special = f.path === "/Trash";
    return <svg width={size} height={size} viewBox="0 0 64 64" className={styles.fileIcon}>{special ? <g><rect x="18" y="16" width="28" height="36" rx="3" fill="#d9d9de" /><rect x="14" y="12" width="36" height="5" rx="2" fill="#efeff2" /></g> : <g><path d="M6 16a4 4 0 0 1 4-4h14l5 5h25a4 4 0 0 1 4 4v29a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#5fb5f6" /><path d="M6 24h52v26a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill="#8fd0fb" /></g>}</svg>;
  }
  const rich = /\.rtf$/.test(f.name) || f.mime === "text/html";
  return <svg width={size} height={size} viewBox="0 0 64 64" className={styles.fileIcon}><path d="M14 4h24l12 12v44H14z" fill="#fff" stroke="#c9c9ce" /><path d="M38 4v12h12" fill="#e6e6ea" stroke="#c9c9ce" /><g stroke={rich ? "#4a7bd6" : "#9a9aa0"} strokeWidth="2.2" strokeLinecap="round">{[26, 32, 38, 44, 50].map((y, i) => <path key={y} d={`M20 ${y}h${i === 4 ? 14 : 24}`} />)}</g>{/\.md$/.test(f.name) ? <text x="20" y="22" fontSize="9" fontWeight="700" fill="#555">MD</text> : null}</svg>;
}

/** Finder for AI Mac: sidebar, toolbar, icon and list views, path bar, context menus, Quick Look. */
export function Finder({ apps, initialPath = "/Documents", onTitle, onClose, onOpenApp, notify, isMac, userName }: Props) {
  const [path, setPath] = useState(initialPath);
  const [hist, setHist] = useState<string[]>([initialPath]);
  const [hi, setHi] = useState(0);
  const [items, setItems] = useState<FileItem[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [view, setView] = useState<View>("icons");
  const [q, setQ] = useState("");
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [ql, setQl] = useState<{ f: FileItem; content: string } | null>(null);
  const [sort, setSort] = useState<"name" | "date" | "size" | "kind">("name");
  const [info, setInfo] = useState<FileItem | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const K = isMac ? "⌘" : "Ctrl+";
  const recents = path === "recents";
  const inApps = path === "/Applications";
  const inTrash = path === "/Trash" || path.startsWith("/Trash/");

  const load = useCallback(async (p = path) => {
    if (p === "recents") { const r = await fetch("/api/files?search=."); const j = r.ok ? await r.json() : { items: [] }; setItems((j.items as FileItem[]).filter((f) => f.kind === "file").sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 40)); return; }
    if (p === "/Applications") { setItems(apps.map((a) => ({ path: `/Applications/${a.name}.app`, name: `${a.name}.app`, kind: "app", mime: "application/x-app", size: 0, updated_at: new Date().toISOString(), icon: a.icon_url, slug: a.slug }))); return; }
    const r = await fetch(`/api/files?path=${encodeURIComponent(p)}`);
    if (!r.ok) { notify("That folder does not exist any more."); return setPath("/Documents"); }
    const j = await r.json();
    setItems((j.items as FileItem[]).filter((f) => !(p === "/" && f.path === "/Trash")));
  }, [path, apps, notify]);
  useEffect(() => { const t = setTimeout(() => { load(); setSel(new Set()); setRenaming(null); }, 0); return () => clearTimeout(t); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onTitle(recents ? "Recents" : inApps ? "Applications" : path === "/" ? "AI Mac HD" : path.split("/").pop()!); }, [path]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = useCallback((p: string) => { setHist((h) => [...h.slice(0, hi + 1), p]); setHi((i) => i + 1); setPath(p); setQ(""); }, [hi]);
  const back = useCallback(() => { if (hi > 0) { setHi(hi - 1); setPath(hist[hi - 1]); } }, [hi, hist]);
  const fwd = useCallback(() => { if (hi < hist.length - 1) { setHi(hi + 1); setPath(hist[hi + 1]); } }, [hi, hist]);
  const up = useCallback(() => { if (path !== "/" && !recents && !inApps) go(parentOf(path)); }, [path, recents, inApps, go]);

  const op = useCallback(async (body: Record<string, unknown>) => { const r = await fetch("/api/files", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) notify(j.error || "That did not work."); await load(); return j; }, [load, notify]);
  const openItem = useCallback(async (f: FileItem) => {
    if (f.kind === "folder") return go(f.path);
    if (f.kind === "app" && f.slug) return onOpenApp(f.slug);
    onOpenApp("textedit", f.path);
  }, [go, onOpenApp]);
  const selected = useMemo(() => items.filter((f) => sel.has(f.path)), [items, sel]);
  const newFolder = useCallback(async () => { if (recents || inApps) return; const j = await op({ op: "mkdir", dir: path, name: "untitled folder" }); if (j.path) { setSel(new Set([j.path])); setRenaming(j.path); setRenameVal("untitled folder"); } }, [op, path, recents, inApps]);
  const newDoc = useCallback(async () => { const dir = recents || inApps ? "/Documents" : path; const j = await op({ op: "new-file", dir, name: "Untitled.txt" }); if (j.path) onOpenApp("textedit", j.path); }, [op, path, recents, inApps, onOpenApp]);
  const trashSel = useCallback(async () => { for (const f of selected) { if (f.kind === "app") continue; if (inTrash) await fetch(`/api/files?path=${encodeURIComponent(f.path)}`, { method: "DELETE" }); else await op({ op: "trash", path: f.path }); } await load(); setSel(new Set()); }, [selected, inTrash, op, load]);
  const startRename = useCallback((f: FileItem) => { if (f.kind === "app") return; setRenaming(f.path); setRenameVal(f.name); }, []);
  const commitRename = useCallback(async () => { if (!renaming) return; const f = items.find((x) => x.path === renaming); setRenaming(null); if (f && renameVal.trim() && renameVal !== f.name) { const j = await op({ op: "rename", path: f.path, name: renameVal.trim() }); if (j.path) setSel(new Set([j.path])); } }, [renaming, renameVal, items, op]);
  const quickLook = useCallback(async () => { const f = selected[0]; if (!f) return; if (ql) return setQl(null); if (f.kind !== "file") return setQl({ f, content: "" }); const r = await fetch(`/api/files?path=${encodeURIComponent(f.path)}`); const j = await r.json(); setQl({ f, content: j.file?.content ?? "" }); }, [selected, ql]);
  const getInfo = useCallback(() => { const f = selected[0]; if (f) setInfo(f); }, [selected]);

  const sorted = useMemo(() => {
    let list = items.filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
    const cmp = { name: (a: FileItem, b: FileItem) => a.name.localeCompare(b.name, undefined, { numeric: true }), date: (a: FileItem, b: FileItem) => b.updated_at.localeCompare(a.updated_at), size: (a: FileItem, b: FileItem) => b.size - a.size, kind: (a: FileItem, b: FileItem) => kindOf(a).localeCompare(kindOf(b)) }[sort];
    list = [...list].sort((a, b) => (a.kind === "folder") === (b.kind === "folder") ? cmp(a, b) : a.kind === "folder" ? -1 : 1);
    return list;
  }, [items, q, sort]);

  const itemMenu = (f: FileItem): MenuItem[] => [
    { label: "Open", action: () => openItem(f) },
    ...(f.kind === "file" ? [{ label: "Open With TextEdit", action: () => onOpenApp("textedit", f.path) }] : []),
    "sep",
    { label: "Get Info", shortcut: `${K}I`, action: () => setInfo(f) },
    { label: "Quick Look", shortcut: "Space", disabled: f.kind === "app", action: () => { setSel(new Set([f.path])); setTimeout(quickLook, 0); } },
    { label: "Rename", disabled: f.kind === "app", action: () => startRename(f) },
    { label: "Duplicate", shortcut: `${K}D`, disabled: f.kind === "app", action: () => op({ op: "duplicate", path: f.path }) },
    "sep",
    ...(inTrash ? [{ label: "Put Back", action: () => op({ op: "restore", path: f.path, dir: "/Documents" }) }, { label: "Delete Immediately…", action: async () => { await fetch(`/api/files?path=${encodeURIComponent(f.path)}`, { method: "DELETE" }); load(); } }]
      : [{ label: "Move to Trash", shortcut: `${K}⌫`, disabled: f.kind === "app", action: () => op({ op: "trash", path: f.path }) }]),
  ];
  const bgMenu = (): MenuItem[] => [
    { label: "New Folder", shortcut: `⇧${K}N`, disabled: recents || inApps || inTrash, action: newFolder },
    { label: "New Document", disabled: inTrash, action: newDoc }, "sep",
    { label: "Get Info", action: () => setInfo({ path, name: path.split("/").pop() || "AI Mac HD", kind: "folder", mime: "", size: items.reduce((n, f) => n + f.size, 0), updated_at: new Date().toISOString() }) }, "sep",
    { label: "View as Icons", checked: view === "icons", action: () => setView("icons") }, { label: "View as List", checked: view === "list", action: () => setView("list") }, "sep",
    { label: "Sort By Name", checked: sort === "name", action: () => setSort("name") }, { label: "Sort By Date Modified", checked: sort === "date", action: () => setSort("date") }, { label: "Sort By Size", checked: sort === "size", action: () => setSort("size") }, { label: "Sort By Kind", checked: sort === "kind", action: () => setSort("kind") },
    ...(inTrash ? ["sep" as const, { label: "Empty Trash…", action: () => op({ op: "empty-trash" }) }] : []),
  ];
  const showCtx = (e: React.MouseEvent, menu: MenuItem[]) => { e.preventDefault(); e.stopPropagation(); const r = root.current!.getBoundingClientRect(); setCtx({ x: e.clientX - r.left, y: e.clientY - r.top, items: menu }); };

  // Menu bar
  useEffect(() => {
    const one = selected.length === 1 ? selected[0] : null;
    const menus: Menu[] = [
      { key: "app", title: "Finder", bold: true, items: [{ label: "About Finder", hint: "AI Mac 1.0", disabled: true }, "sep", { label: "Empty Trash…", action: () => op({ op: "empty-trash" }) }, "sep", { label: "Close Window", shortcut: `${K}W`, action: () => closeRef.current() }] },
      { key: "file", title: "File", items: [
        { label: "New Finder Window", shortcut: `${K}N`, action: () => go("/Documents") }, { label: "New Folder", shortcut: `⇧${K}N`, disabled: recents || inApps || inTrash, action: newFolder }, { label: "New Document", action: newDoc }, "sep",
        { label: "Open", shortcut: `${K}O`, disabled: !one, action: () => one && openItem(one) }, { label: "Get Info", shortcut: `${K}I`, disabled: !one, action: getInfo }, { label: "Rename", disabled: !one || one.kind === "app", action: () => one && startRename(one) }, { label: "Duplicate", shortcut: `${K}D`, disabled: !one || one.kind === "app", action: () => one && op({ op: "duplicate", path: one.path }) }, { label: "Quick Look", shortcut: "Space", disabled: !one, action: quickLook }, "sep",
        { label: "Move to Trash", shortcut: `${K}⌫`, disabled: !selected.length, action: trashSel }, "sep",
        { label: "Find", shortcut: `${K}F`, action: () => (root.current?.querySelector("input[type=search]") as HTMLInputElement | null)?.focus() },
      ] },
      { key: "edit", title: "Edit", items: [{ label: "Select All", shortcut: `${K}A`, action: () => setSel(new Set(items.map((f) => f.path))) }, { label: "Deselect All", action: () => setSel(new Set()) }] },
      { key: "view", title: "View", items: [{ label: "as Icons", shortcut: `${K}1`, checked: view === "icons", action: () => setView("icons") }, { label: "as List", shortcut: `${K}2`, checked: view === "list", action: () => setView("list") }, "sep", { label: "Sort By Name", checked: sort === "name", action: () => setSort("name") }, { label: "Sort By Date Modified", checked: sort === "date", action: () => setSort("date") }, { label: "Sort By Size", checked: sort === "size", action: () => setSort("size") }, { label: "Sort By Kind", checked: sort === "kind", action: () => setSort("kind") }] },
      { key: "go", title: "Go", items: [{ label: "Back", shortcut: `${K}[`, disabled: hi <= 0, action: back }, { label: "Forward", shortcut: `${K}]`, disabled: hi >= hist.length - 1, action: fwd }, { label: "Enclosing Folder", shortcut: `${K}↑`, disabled: path === "/" || recents || inApps, action: up }, "sep", { label: "Recents", action: () => go("recents") }, { label: "Documents", shortcut: `⇧${K}O`, action: () => go("/Documents") }, { label: "Desktop", shortcut: `⇧${K}D`, action: () => go("/Desktop") }, { label: "Downloads", shortcut: `⌥${K}L`, action: () => go("/Downloads") }, { label: "Home", shortcut: `⇧${K}H`, action: () => go("/") }, { label: "Applications", shortcut: `⇧${K}A`, action: () => go("/Applications") }, "sep", { label: "Trash", action: () => go("/Trash") }] },
      { key: "window", title: "Window", items: [{ label: path === "/" ? "AI Mac HD" : path.split("/").pop() || path, checked: true }] },
      { key: "help", title: "Help", items: [{ label: "Finder Help", action: () => notify("Double-click to open, Space for Quick Look, Enter to rename, Cmd+Backspace to trash. Files you make here show in the Terminal too.") }] },
    ];
    setAppMenus("finder", { menus, onKey: (e) => {
      const k = e.key.toLowerCase();
      if (k === "n" && e.shiftKey) { newFolder(); return true; }
      if (k === "n") { go("/Documents"); return true; }
      if (k === "i") { getInfo(); return true; }
      if (k === "d") { if (one && one.kind !== "app") op({ op: "duplicate", path: one.path }); return true; }
      if (k === "backspace") { trashSel(); return true; }
      if (k === "[") { back(); return true; }
      if (k === "]") { fwd(); return true; }
      if (k === "arrowup") { up(); return true; }
      if (k === "1") { setView("icons"); return true; }
      if (k === "2") { setView("list"); return true; }
      if (k === "a") { setSel(new Set(items.map((f) => f.path))); return true; }
      if (k === "o") { if (one) openItem(one); return true; }
      return false;
    } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items, view, sort, path, hi, hist, recents, inApps, inTrash]);
  useEffect(() => () => setAppMenus("finder", null), []);

  const onKey = (e: React.KeyboardEvent) => {
    if (renaming || (e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === " ") { e.preventDefault(); quickLook(); }
    else if (e.key === "Enter" && selected.length === 1) { e.preventDefault(); startRename(selected[0]); }
    else if (e.key === "Escape") { setQl(null); setCtx(null); setInfo(null); }
    else if (e.key === "ArrowRight" || e.key === "ArrowLeft" || e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const i = sorted.findIndex((f) => sel.has(f.path));
      const step = view === "list" ? 1 : (e.key === "ArrowDown" || e.key === "ArrowUp" ? Math.max(1, Math.floor(((root.current?.querySelector(`.${styles.grid}`) as HTMLElement)?.clientWidth ?? 600) / 112)) : 1);
      const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? step : -step;
      const n = Math.max(0, Math.min(sorted.length - 1, (i < 0 ? 0 : i + d)));
      if (sorted[n]) setSel(new Set([sorted[n].path]));
    }
  };
  const clickItem = (e: React.MouseEvent, f: FileItem) => { e.stopPropagation(); setCtx(null); if (e.metaKey || e.ctrlKey) setSel((s) => { const n = new Set(s); if (n.has(f.path)) n.delete(f.path); else n.add(f.path); return n; }); else setSel(new Set([f.path])); };
  const count = `${sorted.length} item${sorted.length === 1 ? "" : "s"}`;

  return (
    <div ref={root} className={styles.finder} tabIndex={0} onKeyDown={onKey} onMouseDown={() => setCtx(null)}>
      <aside className={styles.sidebar}>
        <h4>Favourites</h4>
        {SIDEBAR.map((s) => <button key={s.path} className={`${styles.side} ${path === s.path ? styles.sideOn : ""}`} onClick={() => go(s.path)}><svg viewBox="0 0 16 16"><path d={s.glyph} /></svg>{s.name}</button>)}
        <h4>Locations</h4>
        <button className={`${styles.side} ${path === "/" ? styles.sideOn : ""}`} onClick={() => go("/")}><svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" rx="2" /><circle cx="11" cy="8" r="1" /></svg>AI Mac HD</button>
        <button className={`${styles.side} ${inTrash ? styles.sideOn : ""}`} onClick={() => go("/Trash")}><svg viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10" /></svg>Trash</button>
        <h4>Tags</h4>
        {[["Red", "#ff5257"], ["Orange", "#f7821b"], ["Yellow", "#ffc600"], ["Green", "#62ba46"], ["Blue", "#0a60ff"]].map(([n, c]) => <button key={n} className={styles.side} onClick={() => notify("Tags are not available yet.")}><i style={{ background: c }} />{n}</button>)}
      </aside>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <span className={styles.nav}><button className={styles.tb} onClick={back} disabled={hi <= 0} aria-label="Back"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg></button><button className={styles.tb} onClick={fwd} disabled={hi >= hist.length - 1} aria-label="Forward"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg></button></span>
          <strong className={styles.where}>{recents ? "Recents" : inApps ? "Applications" : path === "/" ? "AI Mac HD" : path.split("/").pop()}</strong>
          <span className={styles.seg}>{(["icons", "list"] as View[]).map((v) => <button key={v} className={view === v ? styles.segOn : ""} onClick={() => setView(v)} title={v === "icons" ? "Icon view" : "List view"}>{v === "icons" ? <svg viewBox="0 0 16 16"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg> : <svg viewBox="0 0 16 16"><path d="M2 4h12M2 8h12M2 12h12" /></svg>}</button>)}</span>
          <button className={styles.tb} title="Group by" onClick={(e) => showCtx(e, [{ label: "Name", checked: sort === "name", action: () => setSort("name") }, { label: "Date Modified", checked: sort === "date", action: () => setSort("date") }, { label: "Size", checked: sort === "size", action: () => setSort("size") }, { label: "Kind", checked: sort === "kind", action: () => setSort("kind") }])}><svg viewBox="0 0 16 16"><path d="M2 4h8M2 8h12M2 12h5" /></svg></button>
          <button className={styles.tb} title="Share" disabled={!selected.length} onClick={() => notify("Sharing is not available on this Mac.")}><svg viewBox="0 0 16 16"><path d="M8 10V2M5 5l3-3 3 3M3 8v6h10V8" /></svg></button>
          <button className={styles.tb} title="Action" onClick={(e) => showCtx(e, selected.length === 1 ? itemMenu(selected[0]) : bgMenu())}><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><circle cx="5" cy="8" r=".8" fill="currentColor" /><circle cx="8" cy="8" r=".8" fill="currentColor" /><circle cx="11" cy="8" r=".8" fill="currentColor" /></svg></button>
          <span className={styles.flex} />
          <div className={styles.search}><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></div>
        </div>
        <div className={`${styles.content} ${view === "list" ? styles.listMode : ""}`} onClick={() => { setSel(new Set()); setCtx(null); }} onContextMenu={(e) => showCtx(e, bgMenu())}>
          {sorted.length === 0 ? <p className={styles.empty}>{q ? "No results" : inTrash ? "Trash is empty" : "Folder is empty"}</p> : view === "icons" ? (
            <div className={styles.grid}>
              {sorted.map((f) => (
                <div key={f.path} className={`${styles.item} ${sel.has(f.path) ? styles.itemOn : ""}`} onClick={(e) => clickItem(e, f)} onDoubleClick={() => openItem(f)} onContextMenu={(e) => { setSel(new Set([f.path])); showCtx(e, itemMenu(f)); }}>
                  <FileIcon f={f} />
                  {renaming === f.path ? <input className={styles.rename} autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} onFocus={(e) => { const i = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} onClick={(e) => e.stopPropagation()} /> : <span className={styles.label}>{f.name}</span>}
                </div>
              ))}
            </div>
          ) : (
            <table className={styles.table}>
              <thead><tr>{([["name", "Name"], ["date", "Date Modified"], ["size", "Size"], ["kind", "Kind"]] as const).map(([k, l]) => <th key={k} className={sort === k ? styles.thOn : ""} onClick={(e) => { e.stopPropagation(); setSort(k); }}>{l}</th>)}</tr></thead>
              <tbody>
                {sorted.map((f, i) => (
                  <tr key={f.path} className={`${sel.has(f.path) ? styles.rowOn : ""} ${i % 2 ? styles.alt : ""}`} onClick={(e) => clickItem(e, f)} onDoubleClick={() => openItem(f)} onContextMenu={(e) => { setSel(new Set([f.path])); showCtx(e, itemMenu(f)); }}>
                    <td><FileIcon f={f} size={16} />{renaming === f.path ? <input className={styles.renameRow} autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onBlur={commitRename} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenaming(null); }} onClick={(e) => e.stopPropagation()} /> : f.name}</td>
                    <td>{fmtDate(f.updated_at)}</td><td>{f.kind === "file" ? fmtSize(f.size) : "--"}</td><td>{kindOf(f)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.pathbar}>
          {!recents && !inApps ? crumbs(path).map((c, i, a) => <span key={c.path}><button onClick={() => go(c.path)}>{c.name}</button>{i < a.length - 1 ? <i>›</i> : null}</span>) : <span><button>{recents ? "Recents" : "Applications"}</button></span>}
          <span className={styles.flex} />
          <span className={styles.count}>{selected.length ? `${selected.length} of ${count} selected` : count}</span>
        </div>
      </div>

      {ctx ? <div className={styles.context} style={{ left: ctx.x, top: ctx.y }} onMouseDown={(e) => e.stopPropagation()}>{ctx.items.map((it, i) => it === "sep" ? <div key={i} className={styles.ctxSep} /> : <button key={i} disabled={it.disabled} onClick={() => { setCtx(null); it.action?.(); }}><span>{it.checked ? "✓" : ""}</span>{it.label}{it.shortcut ? <small>{it.shortcut}</small> : null}</button>)}</div> : null}

      {ql ? (
        <div className={styles.qlBack} onMouseDown={() => setQl(null)}>
          <div className={styles.ql} onMouseDown={(e) => e.stopPropagation()}>
            <header><button onClick={() => setQl(null)} aria-label="Close">×</button><b>{ql.f.name}</b><button className={styles.qlOpen} onClick={() => { setQl(null); openItem(ql.f); }}>Open with {ql.f.kind === "folder" ? "Finder" : "TextEdit"}</button></header>
            {ql.f.kind === "file" ? (ql.f.mime === "text/html" ? <div className={styles.qlRich} dangerouslySetInnerHTML={{ __html: ql.content }} /> : <pre>{ql.content}</pre>) : <div className={styles.qlFolder}><FileIcon f={ql.f} size={120} /><p>{ql.f.name}</p></div>}
          </div>
        </div>
      ) : null}

      {info ? (
        <div className={styles.infoBack} onMouseDown={() => setInfo(null)}>
          <div className={styles.info} onMouseDown={(e) => e.stopPropagation()}>
            <header><FileIcon f={info} size={32} /><div><b>{info.name}</b><small>{fmtSize(info.size)}</small></div><button onClick={() => setInfo(null)} aria-label="Close">×</button></header>
            <dl>
              <dt>Kind</dt><dd>{kindOf(info)}</dd>
              <dt>Size</dt><dd>{info.kind === "folder" ? `${fmtSize(info.size)} in ${items.length} items` : fmtSize(info.size)}</dd>
              <dt>Where</dt><dd>{info.kind === "app" ? "Applications" : `AI Mac HD${parentOf(info.path) === "/" ? "" : parentOf(info.path).replace(/\//g, " › ")}`}</dd>
              <dt>Modified</dt><dd>{fmtDate(info.updated_at)}</dd>
              <dt>Owner</dt><dd>{userName} (Read & Write)</dd>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
