"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { setAppMenus } from "@/lib/appmenus";
import type { Menu } from "./MenuBar";
import styles from "./presentation.module.css";

type Props = { onTitle: (t: string) => void; onClose: () => void; onOpenApp: (slug: string) => void; isMac: boolean; stats?: { apps: number; built: number; versions: number } };

/* ---------- diagrams drawn in SVG so they scale with the slide ---------- */
const Box = ({ x, y, w, h, title, sub, fill = "#fff", stroke = "rgba(0,0,0,.18)", color = "#1d1d1f" }: { x: number; y: number; w: number; h: number; title: string; sub?: string; fill?: string; stroke?: string; color?: string }) => (
  <g>
    <rect x={x} y={y} width={w} height={h} rx="10" fill={fill} stroke={stroke} />
    <text x={x + w / 2} y={y + (sub ? h / 2 - 4 : h / 2 + 5)} textAnchor="middle" fontSize="15" fontWeight="600" fill={color}>{title}</text>
    {sub ? <text x={x + w / 2} y={y + h / 2 + 15} textAnchor="middle" fontSize="12" fill={color} opacity=".65">{sub}</text> : null}
  </g>
);
const Arrow = ({ x1, y1, x2, y2, label }: { x1: number; y1: number; x2: number; y2: number; label?: string }) => (
  <g stroke="rgba(0,0,0,.4)" fill="none">
    <path d={`M${x1} ${y1}L${x2} ${y2}`} strokeWidth="1.5" markerEnd="url(#ah)" />
    {label ? <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" fontSize="11" fill="rgba(0,0,0,.55)" stroke="none">{label}</text> : null}
  </g>
);
const Defs = () => <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="rgba(0,0,0,.4)" /></marker></defs>;

function Architecture() {
  return (
    <svg viewBox="0 0 900 420" className={styles.diagram}>
      <Defs />
      <Box x={40} y={40} w={200} h={64} title="Browser" sub="the desktop you see" fill="#eef4ff" />
      <Box x={40} y={180} w={200} h={64} title="Sandboxed app frames" sub="one per window, opaque origin" fill="#eef4ff" />
      <Box x={350} y={40} w={200} h={64} title="Next.js 16" sub="pages and API routes" />
      <Box x={350} y={180} w={200} h={64} title="Build jobs" sub="survive reloads and double opens" />
      <Box x={350} y={320} w={200} h={64} title="Headless Chromium" sub="runs every build before it is saved" />
      <Box x={660} y={40} w={200} h={64} title="Postgres" sub="users, apps, versions, records" fill="#f3fbf3" />
      <Box x={660} y={180} w={200} h={64} title="OpenAI" sub="gpt-5.5 · gpt-5.4-mini · gpt-image-2" fill="#fff7ea" />
      <Box x={660} y={320} w={200} h={64} title="Shipped templates" sub="reviewed builds of the defaults" fill="#f3fbf3" />
      <Arrow x1={240} y1={72} x2={350} y2={72} label="HTTPS" />
      <Arrow x1={240} y1={212} x2={350} y2={212} label="postMessage bridge" />
      <Arrow x1={550} y1={72} x2={660} y2={72} label="SQL" />
      <Arrow x1={550} y1={212} x2={660} y2={212} label="stream" />
      <Arrow x1={450} y1={244} x2={450} y2={320} label="check" />
      <Arrow x1={550} y1={352} x2={660} y2={352} label="first open" />
      <Arrow x1={140} y1={104} x2={140} y2={180} />
    </svg>
  );
}
function Pipeline() {
  const steps = [["Brief", "catalog or sentence"], ["Design", "name and icon"], ["Write", "one HTML file"], ["Validate", "no reach outside"], ["Run", "headless Chromium"], ["Repair", "one round"], ["Save", "version n"]];
  return (
    <svg viewBox="0 0 900 300" className={styles.diagram}>
      <Defs />
      {steps.map(([t, s], i) => <g key={t}><Box x={16 + i * 126} y={110} w={112} h={70} title={t} sub={s} fill={i === 4 ? "#eef4ff" : "#fff"} />{i < steps.length - 1 ? <Arrow x1={128 + i * 126} y1={145} x2={142 + i * 126} y2={145} /> : null}</g>)}
      <text x="450" y="60" textAnchor="middle" fontSize="14" fill="rgba(0,0,0,.6)">About 60 to 140 seconds the first time. A few hundred milliseconds every time after.</text>
      <text x="450" y="250" textAnchor="middle" fontSize="13" fill="rgba(0,0,0,.55)">Improve sends the current code plus your request through the same path; the old version stays available.</text>
    </svg>
  );
}
function Bridge() {
  return (
    <svg viewBox="0 0 900 360" className={styles.diagram}>
      <Defs />
      <rect x="40" y="30" width="380" height="300" rx="14" fill="#f5f5f7" stroke="rgba(0,0,0,.15)" />
      <text x="230" y="60" textAnchor="middle" fontSize="14" fontWeight="600">App frame (sandbox=&quot;allow-scripts&quot;)</text>
      {["aic.storage.get / set / keys", "aic.ask(prompt)", "aic.open(slug)", "aic.setTitle / setTitlebar", "aic.notify(text)"].map((t, i) => <text key={t} x="70" y={100 + i * 36} fontSize="14" fontFamily="Menlo, monospace" fill="#1d1d1f">{t}</text>)}
      <rect x="480" y="30" width="380" height="300" rx="14" fill="#fff" stroke="rgba(0,0,0,.15)" />
      <text x="670" y="60" textAnchor="middle" fontSize="14" fontWeight="600">Desktop (your session)</text>
      {["PUT /api/apps/:slug/data", "POST /api/apps/:slug/ask", "open the other window", "retitle, recolour the title bar", "banner at the top right"].map((t, i) => <text key={t} x="510" y={100 + i * 36} fontSize="13" fill="rgba(0,0,0,.75)">{t}</text>)}
      {[0, 1, 2, 3, 4].map((i) => <Arrow key={i} x1={420} y1={95 + i * 36} x2={480} y2={95 + i * 36} />)}
      <text x="450" y="350" textAnchor="middle" fontSize="12" fill="rgba(0,0,0,.55)">The frame has no origin, no cookies and no reach into the page. Every call crosses as a message with an id and comes back as a reply.</text>
    </svg>
  );
}
function Review() {
  return (
    <svg viewBox="0 0 900 320" className={styles.diagram}>
      <Defs />
      <Box x={40} y={40} w={240} h={70} title="Screenshots" sub="Playwright, every screen" />
      <Box x={330} y={40} w={240} h={70} title="Codex reviews" sub="pixel differences vs. real macOS" fill="#fff7ea" />
      <Box x={620} y={40} w={240} h={70} title="Briefs and shell" sub="findings folded back in" />
      <Box x={40} y={200} w={240} h={70} title="Three simulated users" sub="designer, shop owner, QA" fill="#fff7ea" />
      <Box x={330} y={200} w={240} h={70} title="REPORT.md each" sub="bugs with repro steps, top 10 asks" />
      <Box x={620} y={200} w={240} h={70} title="Fixes shipped" sub="then round two to verify" />
      <Arrow x1={280} y1={75} x2={330} y2={75} /><Arrow x1={570} y1={75} x2={620} y2={75} /><Arrow x1={280} y1={235} x2={330} y2={235} /><Arrow x1={570} y1={235} x2={620} y2={235} />
      <Arrow x1={740} y1={110} x2={740} y2={200} label="rebuild" />
    </svg>
  );
}

type Slide = { title: string; kicker?: string; body?: React.ReactNode; notes: string };
function buildSlides(stats: Props["stats"], onOpenApp: (s: string) => void): Slide[] {
  return [
    { title: "AI Mac", kicker: "A desktop whose apps are written the moment you open them", body: <div className={styles.hero}><span className={styles.logo} /><p>Everything in this deck is drawn by the desktop itself. Press → to continue.</p></div>, notes: "Title. The whole experiment in one line." },
    { title: "The idea", body: <ul className={styles.bullets}><li>A Mac-style desktop in the browser: menu bar, Dock, windows, Spotlight, System Settings, Terminal, Safari.</li><li>The icons are promises. Double-click one and a model writes that app, in front of you, in about a minute.</li><li>After that it opens from your own cache in a few hundred milliseconds, with your records.</li><li>“New app” turns a sentence into a new icon. “Improve” rewrites any app the way you ask and keeps the old versions.</li></ul>, notes: "The premise: nothing exists until you ask for it, then it is yours." },
    { title: "Architecture", body: <Architecture />, notes: "Next.js serves the desktop and the API. Postgres holds users, apps, versions and records. Apps run in sandboxed frames and talk to the desktop over postMessage." },
    { title: "How an app gets written", body: <Pipeline />, notes: "Brief, design, write, validate, run in headless Chromium, repair once, save as a version." },
    { title: "The bridge", kicker: "What an app is allowed to do", body: <Bridge />, notes: "Five calls. Storage per app and key, a question to a cheaper model, open another app, retitle, notify." },
    { title: "Out of the box", body: <div className={styles.appGrid}>{[["notes", "Notes"], ["calculator", "Calculator"], ["todo", "Reminders"], ["calendar", "Calendar"], ["weather", "Weather"], ["paint", "Freeform"], ["music", "Music"], ["bomberman", "Bomberman"], ["roadrash", "Road Rash"]].map(([s, n]) => <button key={s} onClick={() => onOpenApp(s)}><img src={`/icons/${s}.png`} alt="" /><span>{n}</span></button>)}<p>Each default app ships with a reviewed build in <code>templates/</code>, so a new desktop opens all nine in under half a second. “Rebuild From Scratch” writes a fresh one from the brief. Click an icon to open it.</p></div>, notes: "The nine defaults and the templates mechanism." },
    { title: "Realism was the brief", body: <ul className={styles.bullets}><li>24px menu bar, 28px title bars, 12px traffic lights, dock magnification per frame, zoom from the icon, minimise into the Dock.</li><li>Each default app’s brief names the real macOS app and describes its panes, toolbar, colours and type.</li><li>A macOS baseline stylesheet is injected into every app: overlay scrollbars, AppKit fields, the blue focus ring.</li><li>System Settings has every Sonoma pane; the ones that can mean something here are wired to real preferences.</li></ul>, notes: "Measurements, briefs, baseline CSS, settings." },
    { title: "How it was checked", body: <Review />, notes: "Screenshots reviewed by a second model, three simulated users driving real Chromium sessions, two rounds." },
    { title: "Safari inside a web page", body: <ul className={styles.bullets}><li>Pages load through a server-side proxy that drops frame-blocking headers and points a <code>&lt;base&gt;</code> at the real site.</li><li>An injected script routes link clicks, search forms, find, zoom and titles back to the Safari window.</li><li>The frame has an opaque origin, so a site’s scripts cannot touch this desktop. Private addresses are refused.</li><li>Reader, Reading List, Bookmarks, History, Tab Overview, Private Browsing and Safari’s own menu bar.</li></ul>, notes: "The browser and its limits: reading sites yes, sign-in sites no." },
    { title: "The games", body: <div className={styles.twoCol}><div><h3>Bomberman</h3><p>Built through New App and five Improve rounds. NES frame, bitmap HUD, the 50-stage enemy roster, eight power-ups, synthesised sound. The whole 31-column stage fills the window width.</p></div><div><h3>Road Rash</h3><p>Pseudo-3D segment road with curves and hills, rider with lean, punch and tumble frames, traffic and cops, bottom instrument panel, five tracks, career with bike shop and passwords.</p></div></div>, notes: "Both made through the product's own flows, then scored by Codex against the originals." },
    { title: "By the numbers", body: <div className={styles.numbers}>{[[String(stats?.apps ?? 11), "apps on this desktop"], [String(stats?.versions ?? 0), "versions written"], ["9", "default apps with shipped builds"], ["36", "System Settings panes"], ["3", "simulated users, 2 rounds"], ["1", "cheerful sparkle for Improve"]].map(([n, l]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>, notes: "Live numbers from this desktop." },
    { title: "What is honest to say", body: <ul className={styles.bullets}><li>Generated apps look like the real ones at a glance; they are not pixel copies. A second model scores them 6 to 7 out of 10.</li><li>Sprites, fonts and logos come from the model’s memory, not from the original games.</li><li>Safari works for reading sites, docs and search; sign-in sites and heavy web apps will not run through a proxy.</li><li>It is an experiment. The code is at <code>github.com/jigardafda/ai-mac</code>.</li></ul>, notes: "Limits, plainly." },
    { title: "Thank you", kicker: "Open System Settings › General › About to see this Mac", body: <div className={styles.hero}><span className={styles.logo} /><p>Made on 1 November 2026 with Claude Code and a lot of screenshots.</p></div>, notes: "End." },
  ];
}

/** Keynote-style built-in app: the story of how AI Mac is made, in slides. */
export function Presentation({ onTitle, onClose, onOpenApp, isMac, stats }: Props) {
  const slides = buildSlides(stats, onOpenApp);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState(false);
  const K = isMac ? "⌘" : "Ctrl+";
  const go = useCallback((d: number) => setI((n) => Math.max(0, Math.min(slides.length - 1, n + d))), [slides.length]);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { onTitle("How AI Mac Is Made"); root.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setAppMenus("keynote", {
      menus: [
        { key: "app", title: "Keynote", bold: true, items: [{ label: "About Keynote", hint: "AI Mac 1.0", disabled: true }, "sep", { label: "Close Window", shortcut: `${K}W`, action: () => closeRef.current() }] },
        { key: "play", title: "Play", items: [{ label: playing ? "Exit Slideshow" : "Play Slideshow", shortcut: playing ? "Esc" : `⌥${K}P`, action: () => setPlaying((p) => !p) }, "sep", { label: "Next Slide", shortcut: "→", action: () => go(1) }, { label: "Previous Slide", shortcut: "←", action: () => go(-1) }, { label: "First Slide", shortcut: "Home", action: () => setI(0) }] },
        { key: "view", title: "View", items: [{ label: notes ? "Hide Presenter Notes" : "Show Presenter Notes", checked: notes, action: () => setNotes((n) => !n) }] },
        { key: "window", title: "Window", items: [{ label: "How AI Mac Is Made", checked: true }] },
      ],
      onKey: (e) => { if (e.key.toLowerCase() === "p" && e.altKey) { setPlaying((p) => !p); return true; } return false; },
    });
    return () => setAppMenus("keynote", null);
  }, [playing, notes, go, K]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    else if (e.key === "Home") setI(0);
    else if (e.key === "End") setI(slides.length - 1);
    else if (e.key === "Escape" && playing) setPlaying(false);
  };
  const s = slides[i];
  const slide = (
    <div className={styles.slide} key={i}>
      {s.kicker ? <small>{s.kicker}</small> : null}
      <h1>{s.title}</h1>
      <div className={styles.slideBody}>{s.body}</div>
      <span className={styles.pageNo}>{i + 1} / {slides.length}</span>
    </div>
  );
  return (
    <div className={styles.app} tabIndex={0} onKeyDown={onKey} ref={root}>
      {playing ? (
        <div className={styles.show} onClick={() => go(1)} onContextMenu={(e) => { e.preventDefault(); go(-1); }}>
          <div className={styles.showStage}>{slide}</div>
          <div className={styles.showBar}><button onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button><span>{i + 1} of {slides.length}</span><button onClick={(e) => { e.stopPropagation(); go(1); }}>›</button><button onClick={(e) => { e.stopPropagation(); setPlaying(false); }}>Exit</button></div>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <button className={styles.tb} onClick={() => setNotes((n) => !n)} title="Presenter notes"><svg viewBox="0 0 16 16"><path d="M2 3h12v10H2zM2 9h12" /></svg></button>
            <button className={styles.play} onClick={() => setPlaying(true)}><svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z" fill="currentColor" stroke="none" /></svg>Play</button>
            <span className={styles.docTitle}>How AI Mac Is Made</span>
            <span className={styles.tbRight}><button className={styles.tb} onClick={() => go(-1)} disabled={i === 0}>‹</button><button className={styles.tb} onClick={() => go(1)} disabled={i === slides.length - 1}>›</button></span>
          </div>
          <div className={styles.body}>
            <aside className={styles.nav}>
              {slides.map((sl, n) => (
                <button key={sl.title} className={`${styles.thumb} ${n === i ? styles.thumbOn : ""}`} onClick={() => setI(n)}>
                  <span>{n + 1}</span>
                  <div><b>{sl.title}</b></div>
                </button>
              ))}
            </aside>
            <div className={styles.canvas}>
              <div className={styles.stage}>{slide}</div>
              {notes ? <div className={styles.notes}><h4>Presenter Notes</h4><p>{s.notes}</p></div> : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
