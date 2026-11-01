"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  onBuilt: () => void;
  onBuilding: (building: boolean) => void;
};

type Phase = { kind: "loading" } | { kind: "building"; status: string; lines: string[]; chars: number } | { kind: "ready"; html: string; version: string } | { kind: "error"; text: string };

export function AppWindow({ win, active, menuHeight, onFocus, onClose, onMinimise, onZoom, onChange, onOpen, onNotify, onBuilt, onBuilding }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [improveOpen, setImproveOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const drag = useRef<{ mode: "move" | "e" | "s" | "se"; sx: number; sy: number; x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => { onBuilding(phase.kind === "building"); }, [phase.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setRuntimeError(null);
    const r = await fetch(`/api/apps/${win.slug}`, { cache: "no-store" });
    if (r.ok) return setPhase({ kind: "ready", html: await r.text(), version: r.headers.get("x-aic-version") || "" });
    if (r.status === 404) return build("build");
    setPhase({ kind: "error", text: `Could not load (${r.status})` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.slug]);

  async function build(kind: "build" | "improve", req?: string) {
    setPhase({ kind: "building", status: kind === "build" ? "Starting" : "Reading the current app", lines: [], chars: 0 });
    const url = kind === "build" ? `/api/apps/${win.slug}` : `/api/apps/${win.slug}/improve`;
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: kind === "improve" ? JSON.stringify({ request: req }) : undefined });
    if (r.status === 409) {
      // Another window (or React's dev double mount) is already building it: wait for that one.
      setPhase({ kind: "building", status: "Already being written", lines: [], chars: 0 });
      for (let i = 0; i < 150; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const probe = await fetch(`/api/apps/${win.slug}`, { cache: "no-store" });
        if (probe.ok) { onBuilt(); return setPhase({ kind: "ready", html: await probe.text(), version: probe.headers.get("x-aic-version") || "" }); }
      }
      return setPhase({ kind: "error", text: "The build took too long." });
    }
    if (!r.ok || !r.body) return setPhase({ kind: "error", text: (await r.json().catch(() => ({}))).error || `Build failed (${r.status})` });
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", code = "";
    let status = "Writing the code";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const ev = JSON.parse(line);
        if (ev.type === "status") status = ev.text;
        if (ev.type === "chunk") code += ev.text;
        if (ev.type === "error") return setPhase({ kind: "error", text: ev.text });
        if (ev.type === "done") { onBuilt(); await load(); return; }
        const lines = code.split("\n");
        setPhase({ kind: "building", status, lines: lines.slice(-16), chars: code.length });
      }
    }
    setPhase({ kind: "error", text: "The build stopped early." });
  }

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  // Commands from the app menu
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; cmd: string }>).detail;
      if (d.id !== win.id || phase.kind !== "ready") return;
      if (d.cmd === "improve") setImproveOpen(true);
      if (d.cmd === "rebuild") build("build");
    };
    window.addEventListener("aic:win", h);
    return () => window.removeEventListener("aic:win", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.id, phase.kind]);

  // Bridge: answer requests from the sandboxed app.
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = e.data;
      if (!m || !m.aic) return;
      if (m.event === "error") return setRuntimeError(m.message);
      const reply = (result?: unknown, error?: string) => frame.current?.contentWindow?.postMessage({ aic: true, id: m.id, result, error }, "*");
      try {
        const p = m.payload || {};
        switch (m.type) {
          case "storage.get": { const r = await fetch(`/api/apps/${win.slug}/data?key=${encodeURIComponent(p.key)}`); reply((await r.json()).value); break; }
          case "storage.set": { await fetch(`/api/apps/${win.slug}/data`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: p.key, value: p.value }) }); reply(true); break; }
          case "storage.keys": { const r = await fetch(`/api/apps/${win.slug}/data`); reply((await r.json()).keys); break; }
          case "ai.ask": { const r = await fetch(`/api/apps/${win.slug}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: p.prompt, options: p.options }) }); const j = await r.json(); if (r.ok) reply(j.text); else reply(undefined, j.error || "ask failed"); break; }
          case "app.open": onOpen(p.slug); reply(true); break;
          case "window.title": onChange({ title: String(p.title || win.title).slice(0, 60) }); reply(true); break;
          case "notify": onNotify(String(p.text || "").slice(0, 200)); reply(true); break;
          default: reply(undefined, `Unknown call ${m.type}`);
        }
      } catch (err) {
        reply(undefined, err instanceof Error ? err.message : "failed");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [win.slug, win.title, onOpen, onChange, onNotify]);

  // Drag to move, drag the right edge, bottom edge or corner to resize.
  function start(mode: "move" | "e" | "s" | "se") {
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
    if (d.mode === "move") onChange({ x: Math.max(-d.w + 120, d.x + dx), y: Math.max(menuHeight, d.y + dy) });
    else onChange({ w: d.mode === "s" ? d.w : Math.max(420, d.w + dx), h: d.mode === "e" ? d.h : Math.max(260, d.h + dy) });
  }
  const end = () => { drag.current = null; };

  // Geometry and the three animated states: zoom out from the icon, shrink to the dock, fade on close.
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

  return (
    <section className={cls} style={style} onPointerDown={onFocus} onAnimationEnd={() => !win.opened && onChange({ opened: true })} aria-label={win.title} data-slug={win.slug}>
      <div className={`${styles.titlebar} ${improveOpen ? styles.titlebarTall : ""}`} onPointerDown={start("move")} onPointerMove={move} onPointerUp={end} onDoubleClick={onZoom}>
        <span className={styles.lights} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <button className={styles.close} onClick={onClose} aria-label="Close"><svg viewBox="0 0 12 12"><path d="M3.5 3.5l5 5M8.5 3.5l-5 5" /></svg></button>
          <button className={styles.mini} onClick={onMinimise} aria-label="Minimise"><svg viewBox="0 0 12 12"><path d="M2.5 6h7" /></svg></button>
          <button className={styles.zoom} onClick={onZoom} aria-label="Zoom"><svg viewBox="0 0 12 12"><path d="M3 7.6V9h1.4L3 7.6zM9 4.4V3H7.6L9 4.4z" fill="currentColor" stroke="none" /><path d="M3.2 8.8l2.3-2.3M8.8 3.2L6.5 5.5" /></svg></button>
        </span>
        <span className={styles.title}>{win.title}</span>
        <span className={styles.tools} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {phase.kind === "ready" ? <>
            <button className={styles.tool} onClick={() => setImproveOpen((v) => !v)} title="Describe a change and the app is rewritten">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 0l1.2 3.4L10.5 4.5 7.2 5.7 6 9 4.8 5.7 1.5 4.5l3.3-1.1zM10 7l.6 1.6 1.4.4-1.4.5L10 11l-.6-1.5L8 9l1.4-.4z" /></svg>
              Improve
            </button>
            <button className={styles.tool} onClick={() => build("build")} title="Throw the code away and write it again">Rebuild</button>
            {phase.version ? <span className={styles.ver}>v{phase.version}</span> : null}
          </> : null}
        </span>
      </div>

      {improveOpen && phase.kind === "ready" ? (
        <form className={styles.improve} onSubmit={(e) => { e.preventDefault(); if (request.trim().length < 3) return; setImproveOpen(false); build("improve", request.trim()); setRequest(""); }}>
          <input autoFocus value={request} onChange={(e) => setRequest(e.target.value)} placeholder="What should change? For example: add a dark mode toggle" onKeyDown={(e) => e.key === "Escape" && setImproveOpen(false)} />
          <button type="button" className={styles.bezel} onClick={() => setImproveOpen(false)}>Cancel</button>
          <button className={styles.bezelDefault}>Update</button>
        </form>
      ) : null}

      <div className={styles.body}>
        {phase.kind === "ready" ? (
          <iframe ref={frame} className={styles.frame} title={win.title} data-slug={win.slug} sandbox="allow-scripts allow-forms allow-downloads allow-pointer-lock" srcDoc={phase.html} />
        ) : phase.kind === "building" ? (
          <div className={styles.building}>
            <Spinner size={30} />
            <strong>{phase.status}</strong>
            <span className={styles.muted}>{phase.chars ? `${phase.chars.toLocaleString()} characters written` : "Thinking about the design"}</span>
            <div className={`${styles.codeCard} ${phase.chars ? styles.codeCardShown : ""}`} aria-hidden="true">
              <div className={styles.codeHead}><i /><i /><i /><span>{win.slug}.html</span></div>
              <pre className={styles.code}>{phase.lines.join("\n")}</pre>
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
        {runtimeError && phase.kind === "ready" ? (
          <div className={styles.errorBar}>
            <span>This app hit an error: {runtimeError}</span>
            <button className={styles.bezelDefault} onClick={() => build("improve", `Fix this runtime error and make sure it cannot happen again: ${runtimeError}`)}>Fix It</button>
          </div>
        ) : null}
      </div>
      {!win.max ? <>
        <div className={styles.resizeE} onPointerDown={start("e")} onPointerMove={move} onPointerUp={end} />
        <div className={styles.resizeS} onPointerDown={start("s")} onPointerMove={move} onPointerUp={end} />
        <div className={styles.resizeSE} onPointerDown={start("se")} onPointerMove={move} onPointerUp={end} />
      </> : null}
    </section>
  );
}
