"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_MIN, WINDOW_SIZES } from "@/lib/catalog";
import type { Win } from "./Desktop";
import { Spinner } from "./Spinner";
import styles from "./desktop.module.css";

type Props = {
  win: Win;
  active: boolean;
  menuHeight: number;
  onFocus: () => void;
  onClose: () => void;
  onMinimise: () => void;
  onZoom: () => void;
  onChange: (patch: Partial<Win>) => void;
  onOpen: (slug: string) => void;
  onNotify: (text: string) => void;
  onBuilt: (kind: "build" | "improve", version: number | null) => void;
  onBuilding: (building: boolean) => void;
};

type Progress = { kind: "build" | "improve"; status: string; chars: number; lines: string[]; started: number };
type Phase = { kind: "loading" } | { kind: "building"; p: Progress } | { kind: "ready"; html: string; version: string } | { kind: "error"; text: string };
type ResizeMode = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: { mode: ResizeMode; cls: string; cursor: string }[] = [
  { mode: "n", cls: styles.rzN, cursor: "ns-resize" }, { mode: "s", cls: styles.rzS, cursor: "ns-resize" },
  { mode: "e", cls: styles.rzE, cursor: "ew-resize" }, { mode: "w", cls: styles.rzW, cursor: "ew-resize" },
  { mode: "ne", cls: styles.rzNE, cursor: "nesw-resize" }, { mode: "sw", cls: styles.rzSW, cursor: "nesw-resize" },
  { mode: "nw", cls: styles.rzNW, cursor: "nwse-resize" }, { mode: "se", cls: styles.rzSE, cursor: "nwse-resize" },
];
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

export function AppWindow({ win, active, menuHeight, onFocus, onClose, onMinimise, onZoom, onChange, onOpen, onNotify, onBuilt, onBuilding }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [pending, setPending] = useState<Progress | null>(null); // an update running while the current app stays usable
  const [showCode, setShowCode] = useState(false);
  const [improveOpen, setImproveOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [chrome, setChrome] = useState<{ bg: string; fg: string } | null>(null);
  const [, setTick] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const drag = useRef<{ mode: "move" | ResizeMode; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);
  const limits = { ...DEFAULT_MIN, ...(WINDOW_SIZES[win.slug] ?? {}) };

  // Tell the desktop (dock bounce) while the first build runs; always clear on unmount.
  const building = phase.kind === "building";
  useEffect(() => { onBuilding(building); return () => onBuilding(false); }, [building]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { alive.current = true; return () => { alive.current = false; ctrl.current?.abort(); }; }, []);
  useEffect(() => {
    if (!building && !pending) return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [building, pending]);

  const load = useCallback(async () => {
    setRuntimeError(null);
    try {
      const r = await fetch(`/api/apps/${win.slug}`, { cache: "no-store" });
      if (!alive.current) return;
      if (r.ok) return setPhase({ kind: "ready", html: await r.text(), version: r.headers.get("x-aic-version") || "" });
      if (r.status === 404) return build("build");
      setPhase({ kind: "error", text: `Could not load (${r.status})` });
    } catch (e) {
      if (alive.current) setPhase({ kind: "error", text: e instanceof Error ? e.message : "Could not load" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.slug]);

  /** Builds, rebuilds or improves. If the app is already showing, it stays usable while the new version is written. */
  async function build(kind: "build" | "improve", req?: string) {
    ctrl.current?.abort();
    const ac = new AbortController();
    ctrl.current = ac;
    const inPlace = phase.kind === "ready";
    const p: Progress = { kind, status: kind === "build" ? "Starting" : "Reading the current app", chars: 0, lines: [], started: Date.now() };
    const show = (np: Progress) => (inPlace ? setPending(np) : setPhase({ kind: "building", p: np }));
    const fail = (text: string) => { if (!alive.current) return; if (inPlace) { setPending(null); onNotify(`Update failed: ${text}`); } else setPhase({ kind: "error", text }); };
    show(p);
    try {
      const url = kind === "build" ? `/api/apps/${win.slug}` : `/api/apps/${win.slug}/improve`;
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: kind === "improve" ? JSON.stringify({ request: req }) : undefined, signal: ac.signal });
      if (!r.ok || !r.body) return fail((await r.json().catch(() => ({}))).error || `Build failed (${r.status})`);
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "", code = "", cur = { ...p };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "meta") cur = { ...cur, started: ev.started, kind: ev.kind };
          if (ev.type === "status") cur = { ...cur, status: ev.text };
          if (ev.type === "chunk") { code += ev.text; cur = { ...cur, chars: code.length, lines: code.split("\n").slice(-16) }; }
          if (ev.type === "error") return fail(ev.text);
          if (ev.type === "done") {
            if (!alive.current) return;
            setPending(null);
            await load();
            onBuilt(cur.kind, typeof ev.version === "number" ? ev.version : null);
            return;
          }
          show(cur);
        }
      }
      fail("The build stopped early.");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      fail(e instanceof Error ? e.message : "The build failed");
    }
  }

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  // Commands from the menus: improve, rebuild, and Edit menu commands forwarded into the app.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ id?: number; slug?: string; cmd: string }>).detail;
      if (d.id !== win.id && d.slug !== win.slug) return;
      if (d.cmd.startsWith("exec:")) return frame.current?.contentWindow?.postMessage({ aic: true, command: "exec", name: d.cmd.slice(5) }, "*");
      if (phase.kind !== "ready") return;
      if (d.cmd === "improve") setImproveOpen(true);
      if (d.cmd === "rebuild") build("build");
    };
    window.addEventListener("aic:win", h);
    return () => window.removeEventListener("aic:win", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id, win.slug, phase.kind]);

  // Bridge: answer requests from the sandboxed app.
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      const source = frame.current?.contentWindow;
      if (!source || e.source !== source) return;
      const m = e.data;
      if (!m || !m.aic) return;
      if (m.event === "error") return setRuntimeError(m.message);
      if (m.event === "focus") return onFocus();
      if (m.event === "key") { window.dispatchEvent(new KeyboardEvent("keydown", { key: m.key, ctrlKey: !!m.ctrl, metaKey: !!m.meta, bubbles: true })); return; }
      const reply = (result?: unknown, error?: string) => source.postMessage({ aic: true, id: m.id, result, error }, "*");
      try {
        const p = m.payload || {};
        switch (m.type) {
          case "storage.get": { const r = await fetch(`/api/apps/${win.slug}/data?key=${encodeURIComponent(p.key)}`); if (!r.ok) throw new Error(`storage ${r.status}`); reply((await r.json()).value); break; }
          case "storage.set": { const r = await fetch(`/api/apps/${win.slug}/data`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: p.key, value: p.value }) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `save failed (${r.status})`); reply(true); break; }
          case "storage.keys": { const r = await fetch(`/api/apps/${win.slug}/data`); if (!r.ok) throw new Error(`storage ${r.status}`); reply((await r.json()).keys); break; }
          case "ai.ask": { const r = await fetch(`/api/apps/${win.slug}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p.prompt, options: p.options }) }); const j = await r.json(); if (r.ok) reply(j.text); else reply(undefined, j.error || "ask failed"); break; }
          case "app.open": onOpen(p.slug); reply(true); break;
          case "window.title": onChange({ title: String(p.title || win.title).slice(0, 60) }); reply(true); break;
          case "window.titlebar": { const ok = (c: unknown) => typeof c === "string" && /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|[a-z]+)$/i.test(c); setChrome(ok(p.background) && ok(p.foreground) ? { bg: p.background, fg: p.foreground } : null); reply(true); break; }
          case "notify": onNotify(String(p.text || "").slice(0, 200)); reply(true); break;
          default: reply(undefined, `Unknown call ${m.type}`);
        }
      } catch (err) {
        reply(undefined, err instanceof Error ? err.message : "failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [win.slug, win.title, onOpen, onChange, onNotify, onFocus]);

  // Drag to move; drag any edge or corner to resize with the opposite side anchored.
  function start(mode: "move" | ResizeMode) {
    return (e: React.PointerEvent) => {
      if (win.max || e.button !== 0) return;
      onFocus();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { mode, sx: e.clientX, sy: e.clientY, x: win.x, y: win.y, w: win.w, h: win.h };
    };
  }
  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.mode === "move") return onChange({ x: Math.max(-d.w + 120, d.x + dx), y: Math.max(menuHeight, d.y + dy) });
    let { x, y, w, h } = d;
    if (d.mode.includes("e")) w = Math.max(limits.minW, d.w + dx);
    if (d.mode.includes("s")) h = Math.max(limits.minH, d.h + dy);
    if (d.mode.includes("w")) { w = Math.max(limits.minW, d.w - dx); x = d.x + (d.w - w); }
    if (d.mode.includes("n")) { h = Math.max(limits.minH, d.h - dy); y = Math.max(menuHeight, d.y + (d.h - h)); h = d.h - (y - d.y); }
    onChange({ x, y, w, h });
  }
  const end = () => { drag.current = null; };

  // Geometry and the animated states: zoom out from the icon, shrink to the dock, fade on close.
  const geo = win.max ? { left: 0, top: menuHeight, width: window.innerWidth, height: window.innerHeight - menuHeight } : { left: win.x, top: win.y, width: win.w, height: win.h };
  const style: React.CSSProperties = { ...geo, zIndex: win.z };
  if (win.max) style.borderRadius = 0;
  if (!win.opened && win.origin) style.transformOrigin = `${win.origin.x - geo.left}px ${win.origin.y - geo.top}px`;
  const shrunk = win.state === "minimising" || win.state === "min";
  if (shrunk && win.target) {
    style.transform = `translate(${win.target.x - (geo.left + geo.width / 2)}px, ${win.target.y - (geo.top + geo.height / 2)}px) scale(0.06)`;
    style.opacity = 0;
  }
  const cls = [styles.window, active ? styles.windowActive : "", !win.opened ? styles.windowOpening : "", win.state === "closing" ? styles.windowClosing : "", shrunk ? styles.windowShrunk : "", win.state === "min" ? styles.windowMin : "", win.zooming ? styles.windowZooming : ""].join(" ");
  const barStyle: React.CSSProperties | undefined = chrome ? { background: chrome.bg, borderBottomColor: "transparent", color: chrome.fg } : undefined;
  const progress = phase.kind === "building" ? phase.p : pending;
  const stage = progress ? (progress.chars ? "write" : "design") : null;

  return (
    <section className={cls} style={style} onPointerDown={onFocus} onAnimationEnd={() => !win.opened && onChange({ opened: true })} aria-label={win.title} data-slug={win.slug}>
      <div className={`${styles.titlebar} ${chrome ? styles.titlebarCustom : ""}`} style={barStyle} onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onDoubleClick={onZoom}>
        <span className={styles.lights} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button className={styles.close} onClick={onClose} aria-label="Close"><svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg></button>
          <button className={styles.mini} onClick={onMinimise} aria-label="Minimise"><svg viewBox="0 0 12 12"><path d="M2.5 6h7" /></svg></button>
          <button className={styles.zoom} onClick={onZoom} aria-label="Zoom"><svg viewBox="0 0 12 12"><path d="M3 7.6V9h1.4L3 7.6zM9 4.4V3H7.6L9 4.4z" fill="currentColor" stroke="none" /><path d="M3.2 8.8l2.3-2.3M8.8 3.2L6.5 5.5" /></svg></button>
        </span>
        <span className={styles.title} style={chrome ? { color: chrome.fg } : undefined}>{win.title}</span>
        <span className={styles.tools} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {phase.kind === "ready" && !pending ? (
            // One quiet control, shown when the pointer is on the title bar. Rebuild and the version live in the app menu.
            <button className={styles.tool} style={chrome ? { color: chrome.fg } : undefined} onClick={() => setImproveOpen((v) => !v)} title={`Improve this app (version ${phase.version})`} aria-label="Improve this app">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0l1.2 3.4L10.5 4.5 7.2 5.7 6 9 4.8 5.7 1.5 4.5l3.3-1.1zM10 7l.6 1.6 1.4.4-1.4.5L10 11l-.6-1.5L8 9l1.4-.4z" /></svg>
            </button>
          ) : null}
        </span>
      </div>

      {improveOpen && phase.kind === "ready" ? (
        <form className={styles.improve} onSubmit={(e) => { e.preventDefault(); if (request.trim().length < 3) return; setImproveOpen(false); build("improve", request.trim()); setRequest(""); }}>
          <input autoFocus value={request} onChange={(e) => setRequest(e.target.value)} placeholder="What should change? For example: add a dark mode toggle" onKeyDown={(e) => e.key === "Escape" && setImproveOpen(false)} />
          <button type="button" className={styles.bezel} onClick={() => setImproveOpen(false)}>Cancel</button>
          <button className={styles.bezelDefault}>Update</button>
        </form>
      ) : null}

      {pending && phase.kind === "ready" ? (
        <div className={styles.updating} role="status">
          <Spinner size={14} />
          <span>{pending.kind === "improve" ? "Updating" : "Rewriting"} {win.title}{pending.chars ? `: ${pending.chars.toLocaleString()} characters written` : "…"}</span>
          <em>{mmss(Date.now() - pending.started)}</em>
          <span className={styles.updatingHint}>You can keep using it; the new version replaces it when ready.</span>
        </div>
      ) : null}

      <div className={styles.body}>
        {phase.kind === "ready" ? (
          <iframe ref={frame} className={styles.frame} title={win.title} data-slug={win.slug} sandbox="allow-scripts allow-forms allow-downloads allow-pointer-lock" allow="clipboard-read; clipboard-write" srcDoc={phase.html} />
        ) : phase.kind === "building" ? (
          <div className={styles.building}>
            <Spinner size={30} />
            <strong>{stage === "design" ? `Designing ${win.title}` : `Writing ${win.title}`}</strong>
            <span className={styles.muted}>{mmss(Date.now() - phase.p.started)} elapsed. The first open usually takes 1 to 2 minutes; you can use other apps meanwhile.</span>
            <ol className={styles.stages}>
              <li className={stage === "design" ? styles.stageNow : styles.stageDone}>Design the app</li>
              <li className={stage === "write" ? styles.stageNow : ""}>Write the code{phase.p.chars ? ` (${phase.p.chars.toLocaleString()} characters so far)` : ""}</li>
              <li>Check it and save it to your desktop</li>
            </ol>
            <button className={styles.linkBtn} onClick={() => setShowCode((v) => !v)}>{showCode ? "Hide the code" : "Show the code as it is written"}</button>
            <div className={`${styles.codeCard} ${showCode && phase.p.chars ? styles.codeCardShown : ""}`} aria-hidden="true">
              <div className={styles.codeHead}><i /><i /><i /><span>{win.slug}.html</span></div>
              <pre className={styles.code}>{phase.p.lines.join("\n")}</pre>
            </div>
          </div>
        ) : phase.kind === "error" ? (
          <div className={styles.building}>
            <strong>Something went wrong</strong>
            <span className={styles.muted}>{phase.text}</span>
            <button className={styles.bezelDefault} onClick={() => build("build")}>Try Again</button>
          </div>
        ) : (
          <div className={styles.building}><Spinner size={24} /></div>
        )}
        {runtimeError && phase.kind === "ready" && !pending ? (
          <div className={styles.errorBar}>
            <span>This app hit an error: {runtimeError}</span>
            <button className={styles.bezelDefault} onClick={() => build("improve", `Fix this runtime error and make sure it cannot happen again: ${runtimeError}`)}>Fix It</button>
          </div>
        ) : null}
      </div>
      {!win.max ? HANDLES.map((h) => <div key={h.mode} className={`${styles.rz} ${h.cls}`} style={{ cursor: h.cursor }} onPointerDown={start(h.mode)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />) : null}
    </section>
  );
}
