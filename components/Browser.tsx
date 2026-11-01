"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./browser.module.css";

type Tab = { id: number; url: string; title: string; hist: string[]; idx: number; loading: boolean };
type Props = { onTitle: (t: string) => void; onClose: () => void };

const FAVOURITES: { name: string; url: string; color: string; letter: string }[] = [
  { name: "Wikipedia", url: "https://en.wikipedia.org", color: "#f4f4f4", letter: "W" },
  { name: "Hacker News", url: "https://news.ycombinator.com", color: "#ff6600", letter: "Y" },
  { name: "DuckDuckGo", url: "https://html.duckduckgo.com/html/", color: "#de5833", letter: "D" },
  { name: "BBC News", url: "https://www.bbc.com/news", color: "#bb1919", letter: "B" },
  { name: "MDN", url: "https://developer.mozilla.org", color: "#1b1b1b", letter: "M" },
  { name: "GitHub", url: "https://github.com", color: "#24292f", letter: "G" },
  { name: "Open-Meteo", url: "https://open-meteo.com", color: "#2a6fdb", letter: "O" },
  { name: "Lobsters", url: "https://lobste.rs", color: "#ac130d", letter: "L" },
];

const toUrl = (raw: string) => {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/i.test(t) || t.startsWith("localhost")) return `https://${t}`;
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(t)}`;
};
const pretty = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, "") + (x.pathname !== "/" ? x.pathname : ""); } catch { return u; } };

/** A Safari-style browser. Pages load through /api/browse in a sandboxed frame. */
export function Browser({ onTitle, onClose }: Props) {
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, url: "", title: "Start Page", hist: [""], idx: 0, loading: false }]);
  const [cur, setCur] = useState(1);
  const [field, setField] = useState("");
  const [editing, setEditing] = useState(false);
  const nextId = useRef(2);
  const frame = useRef<HTMLIFrameElement>(null);
  const tab = tabs.find((t) => t.id === cur) ?? tabs[0];

  const patch = useCallback((id: number, p: Partial<Tab> | ((t: Tab) => Partial<Tab>)) => setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, ...(typeof p === "function" ? p(t) : p) } : t))), []);
  const navigate = useCallback((url: string, id = cur) => {
    patch(id, (t) => ({ url, title: url ? pretty(url) : "Start Page", loading: !!url, hist: [...t.hist.slice(0, t.idx + 1), url], idx: t.idx + 1 }));
  }, [cur, patch]);
  const back = () => patch(cur, (t) => (t.idx > 0 ? { idx: t.idx - 1, url: t.hist[t.idx - 1], loading: !!t.hist[t.idx - 1] } : {}));
  const fwd = () => patch(cur, (t) => (t.idx < t.hist.length - 1 ? { idx: t.idx + 1, url: t.hist[t.idx + 1], loading: !!t.hist[t.idx + 1] } : {}));
  const reload = () => { if (frame.current && tab.url) { patch(cur, { loading: true }); frame.current.src = `/api/browse?url=${encodeURIComponent(tab.url)}&t=${Date.now()}`; } };
  const newTab = () => { const id = nextId.current++; setTabs((ts) => [...ts, { id, url: "", title: "Start Page", hist: [""], idx: 0, loading: false }]); setCur(id); setEditing(true); setField(""); };
  const closeTab = (id: number) => {
    if (tabs.length === 1) return onClose();
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (id === cur) setCur(rest[Math.max(0, i - 1)].id);
  };

  useEffect(() => { onTitle(tab.title ? `${tab.title} — Safari` : "Safari"); }, [tab.title]); // eslint-disable-line react-hooks/exhaustive-deps

  // Messages from the page: link clicks, form submissions, titles.
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data;
      if (!m || !m.aicBrowse) return;
      if (m.type === "navigate" && typeof m.url === "string") navigate(m.url);
      if (m.type === "title" && typeof m.title === "string" && m.title) patch(cur, { title: m.title.slice(0, 80) });
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, [navigate, patch, cur]);

  const submit = (e: React.FormEvent) => { e.preventDefault(); const u = toUrl(field); if (u) navigate(u); setEditing(false); (document.activeElement as HTMLElement | null)?.blur(); };
  const secure = tab.url.startsWith("https://");

  return (
    <div className={styles.browser}>
      <div className={styles.toolbar}>
        <button className={styles.tb} title="Show sidebar" aria-label="Sidebar"><svg viewBox="0 0 16 16"><rect x="1.5" y="3" width="13" height="10" rx="2" /><path d="M5.5 3v10" /></svg></button>
        <span className={styles.navBtns}>
          <button className={styles.tb} onClick={back} disabled={tab.idx <= 0} aria-label="Back"><svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg></button>
          <button className={styles.tb} onClick={fwd} disabled={tab.idx >= tab.hist.length - 1} aria-label="Forward"><svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg></button>
        </span>
        <form className={`${styles.address} ${editing ? styles.addressEditing : ""}`} onSubmit={submit}>
          {!editing && tab.url ? <span className={styles.lock} title={secure ? "Secure connection" : "Not secure"}><svg viewBox="0 0 16 16">{secure ? <><rect x="3.5" y="7" width="9" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></> : <circle cx="8" cy="8" r="5" />}</svg></span> : null}
          <input value={editing ? field : (tab.url ? pretty(tab.url) : "")} placeholder="Search or enter website name" spellCheck={false} autoComplete="off"
            onFocus={(e) => { setEditing(true); setField(tab.url); requestAnimationFrame(() => e.target.select()); }}
            onBlur={() => setEditing(false)} onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setEditing(false); (e.target as HTMLInputElement).blur(); } }} />
          {tab.url ? <button type="button" className={styles.reload} onClick={reload} aria-label="Reload">{tab.loading ? <svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" /></svg> : <svg viewBox="0 0 16 16"><path d="M13 8a5 5 0 1 1-1.5-3.6" /><path d="M13 3v3h-3" /></svg>}</button> : null}
        </form>
        <button className={styles.tb} title="Share" aria-label="Share"><svg viewBox="0 0 16 16"><path d="M8 10V2M5 5l3-3 3 3M3 8v6h10V8" /></svg></button>
        <button className={styles.tb} onClick={newTab} title="New tab" aria-label="New tab"><svg viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" /></svg></button>
      </div>
      {tabs.length > 1 ? (
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <div key={t.id} className={`${styles.tab} ${t.id === cur ? styles.tabOn : ""}`} onClick={() => setCur(t.id)}>
              <button className={styles.tabClose} onClick={(e) => { e.stopPropagation(); closeTab(t.id); }} aria-label="Close tab">×</button>
              <span>{t.title || "Start Page"}</span>
            </div>
          ))}
        </div>
      ) : null}
      <div className={styles.content}>
        {tabs.map((t) => t.id !== cur ? null : t.url ? (
          <iframe key={t.id} ref={frame} className={styles.frame} title={t.title} sandbox="allow-scripts allow-forms" referrerPolicy="no-referrer"
            src={`/api/browse?url=${encodeURIComponent(t.url)}`} onLoad={() => patch(t.id, { loading: false })} />
        ) : (
          <div key={t.id} className={styles.start}>
            <h2>Favourites</h2>
            <div className={styles.favs}>
              {FAVOURITES.map((f) => (
                <button key={f.url} className={styles.fav} onClick={() => navigate(f.url)}>
                  <span style={{ background: f.color, color: f.color === "#f4f4f4" ? "#222" : "#fff" }}>{f.letter}</span>
                  <small>{f.name}</small>
                </button>
              ))}
            </div>
            <h2>Privacy Report</h2>
            <div className={styles.report}><svg viewBox="0 0 16 16"><path d="M8 1l5 2v4c0 4-2 6-5 8-3-2-5-4-5-8V3z" /></svg><div><b>Pages open through AI Mac</b><span>Sites never see this desktop; page scripts run in a sealed frame with no access to your apps or sign-in.</span></div></div>
          </div>
        ))}
        {tab.loading ? <div className={styles.progress} /> : null}
      </div>
    </div>
  );
}
