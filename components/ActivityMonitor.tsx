"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import type { AppRow } from "@/lib/apps";
import type { Win } from "./Desktop";
import { setAppMenus } from "@/lib/appmenus";
import type { Menu } from "./MenuBar";
import styles from "./activity.module.css";

type Sample = { at: number; server: { pid: number; cpu: number; rss: number; heapUsed: number; heapTotal: number; external: number; uptime: number; node: string }; machine: { cores: number; load1: number; load5: number; load15: number; totalMem: number; freeMem: number; platform: string; hostUptime: number }; db: { size: string; connections: number }; user: { apps: number; built: number; versions: number; records: number; bytes: number }; building: { slug: string; name: string; kind: string; started: number; chars: number; status: string }[] };
type Proc = { pid: number; name: string; icon?: string; cpu: number; mem: number; threads: number; kind: "app" | "system" | "window"; state: string; slug?: string; winId?: number };
type Tab = "cpu" | "memory" | "energy" | "disk" | "network";
type Props = { apps: AppRow[]; wins: Win[]; onCloseWindow: (id: number) => void; onOpenApp: (slug: string) => void; onTitle: (t: string) => void; onClose: () => void; isMac: boolean; userName: string };

const fmtMB = (b: number) => (b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`);
const fmtUp = (s: number) => { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };

// Browser-side numbers: how much of the page's JS heap and frame budget we use.
function useFrameLoad() {
  const [v, setV] = useState({ fps: 60, busy: 0 });
  useEffect(() => {
    let frames = 0, last = performance.now(), longest = 0, raf = 0;
    const tick = (t: number) => { frames++; const dt = t - last; if (dt > longest) longest = dt; last = t; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const i = setInterval(() => { setV({ fps: Math.min(60, frames), busy: Math.min(100, Math.max(0, (longest - 16.7) * 2)) }); frames = 0; longest = 0; }, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(i); };
  }, []);
  return v;
}

function Graph({ data, max, color, color2, data2 }: { data: number[]; max: number; color: string; color2?: string; data2?: number[] }) {
    const w = 60, h = 36;
    const pts = (d: number[]) => d.map((v, i) => `${(i / 59) * w},${h - Math.min(h, (v / max) * h)}`).join(" ");
    const pad = (d: number[]) => [...Array(Math.max(0, 60 - d.length)).fill(0), ...d];
    return <svg viewBox={`0 0 ${w} ${h}`} className={styles.graph} preserveAspectRatio="none"><polyline points={pts(pad(data))} fill="none" stroke={color} strokeWidth="1.2" />{data2 ? <polyline points={pts(pad(data2))} fill="none" stroke={color2} strokeWidth="1.2" /> : null}</svg>;
  }

export function ActivityMonitor({ apps, wins, onCloseWindow, onOpenApp, onTitle, onClose, isMac, userName }: Props) {
  const [tab, setTab] = useState<Tab>("cpu");
  const [samples, setSamples] = useState<Sample[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"cpu" | "mem" | "name">("cpu");
  const frame = useFrameLoad();
  const [heap, setHeap] = useState<{ used: number; total: number } | null>(null);
  const K = isMac ? "⌘" : "Ctrl+";
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const [every, setEvery] = useState(2000);

  useEffect(() => { onTitle("Activity Monitor (All Processes)"); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try { const r = await fetch("/api/system/activity"); if (!r.ok || !alive) return; const s = (await r.json()) as Sample; setSamples((a) => [...a.slice(-59), s]); } catch { /* server away */ }
      const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
      if (m) setHeap({ used: m.usedJSHeapSize, total: m.totalJSHeapSize });
    };
    pull();
    timer.current = setInterval(pull, every);
    return () => { alive = false; if (timer.current) clearInterval(timer.current); };
  }, [every]);
  const cur = samples[samples.length - 1];

  // The process list: the desktop, each open window as its app, each build job, and the system pieces.
  const now = cur?.at ?? 0;
  const procs: Proc[] = useMemo(() => {
    const list: Proc[] = [];
    const open = wins.filter((w) => w.state !== "closing");
    list.push({ pid: 1, name: "AI Mac Desktop", icon: "/icons/settings.png", cpu: frame.busy, mem: heap ? heap.used * 0.4 : 42e6, threads: 4 + open.length, kind: "system", state: "Running" });
    list.push({ pid: 2, name: "WindowServer", cpu: Math.min(30, open.length * 1.5 + frame.busy * 0.2), mem: 18e6 + open.length * 2e6, threads: 6, kind: "system", state: "Running" });
    list.push({ pid: 3, name: "Dock", cpu: 0.3, mem: 12e6, threads: 3, kind: "system", state: "Running" });
    list.push({ pid: 4, name: "SystemUIServer", cpu: 0.1, mem: 9e6, threads: 2, kind: "system", state: "Running" });
    list.push({ pid: 10, name: `aicd (server, pid ${cur?.server.pid ?? "…"})`, cpu: cur?.server.cpu ?? 0, mem: cur?.server.rss ?? 0, threads: 11, kind: "system", state: cur?.building.length ? "Building" : "Running" });
    list.push({ pid: 11, name: "postgres", cpu: 0.4 + (cur?.db.connections ?? 0) * 0.2, mem: 64e6, threads: cur?.db.connections ?? 1, kind: "system", state: "Running" });
    open.forEach((w, i) => { const a = apps.find((x) => x.slug === w.slug) ?? ({ finder: { name: "Finder", icon_url: "/icons/finder.png" }, textedit: { name: "TextEdit", icon_url: "/icons/textedit.png" }, activity: { name: "Activity Monitor", icon_url: "/icons/activity.png" }, settings: { name: "System Settings", icon_url: "/icons/settings.png" }, terminal: { name: "Linux", icon_url: "/icons/linux.png" }, browser: { name: "Safari", icon_url: "/icons/browser.png" }, keynote: { name: "How It's Made", icon_url: "/icons/keynote.png" } } as Record<string, { name: string; icon_url: string }>)[w.slug] as AppRow | undefined; const building = cur?.building.find((b) => b.slug === w.slug); list.push({ pid: 100 + w.id, name: a?.name ?? w.slug, icon: a?.icon_url, cpu: building ? 12 + ((now % 1000) / 1000) * 6 : w.state === "min" ? 0 : 0.5 + (i === 0 ? 1.5 : 0.3) + ((now % 500) / 500) * 0.6, mem: 24e6 + (a?.version ?? 1) * 1.5e6 + (building ? building.chars * 2 : 0), threads: building ? 9 : 5, kind: "app", state: building ? `Writing (${building.chars.toLocaleString()} chars)` : w.state === "min" ? "Minimised" : "Running", slug: w.slug, winId: w.id }); });
    cur?.building.filter((b) => !open.some((w) => w.slug === b.slug)).forEach((b, i) => list.push({ pid: 300 + i, name: `${b.name} (build)`, icon: apps.find((a) => a.slug === b.slug)?.icon_url, cpu: 14 + ((now % 700) / 700) * 5, mem: 20e6 + b.chars * 2, threads: 8, kind: "app", state: b.status, slug: b.slug }));
    return list.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : sort === "mem" ? b.mem - a.mem : b.cpu - a.cpu));
  }, [wins, apps, cur, frame.busy, heap, q, sort, now]);
  const selected = procs.find((p) => p.pid === sel) ?? null;
  const totalCpu = Math.min(100, procs.reduce((n, p) => n + p.cpu, 0));
  const sysCpu = Math.min(100 - totalCpu * 0.6, (cur?.machine.load1 ?? 0) / (cur?.machine.cores ?? 1) * 100);
  const memUsed = cur ? cur.machine.totalMem - cur.machine.freeMem : 0;

  useEffect(() => {
    const menus: Menu[] = [
      { key: "app", title: "Activity Monitor", bold: true, items: [{ label: "About Activity Monitor", hint: "AI Mac 1.0", disabled: true }, "sep", { label: "Close Window", shortcut: `${K}W`, action: () => closeRef.current() }] },
      { key: "view", title: "View", items: [
        { label: "CPU", shortcut: `${K}1`, checked: tab === "cpu", action: () => setTab("cpu") }, { label: "Memory", shortcut: `${K}2`, checked: tab === "memory", action: () => setTab("memory") }, { label: "Energy", shortcut: `${K}3`, checked: tab === "energy", action: () => setTab("energy") }, { label: "Disk", shortcut: `${K}4`, checked: tab === "disk", action: () => setTab("disk") }, { label: "Network", shortcut: `${K}5`, checked: tab === "network", action: () => setTab("network") }, "sep",
        { label: "Update Frequency: Very Often (1 sec)", checked: every === 1000, action: () => setEvery(1000) }, { label: "Update Frequency: Often (2 sec)", checked: every === 2000, action: () => setEvery(2000) }, { label: "Update Frequency: Normally (5 sec)", checked: every === 5000, action: () => setEvery(5000) },
      ] },
      { key: "window", title: "Window", items: [{ label: "Activity Monitor", checked: true }] },
      { key: "help", title: "Help", items: [{ label: "Activity Monitor Help", action: () => {} }] },
    ];
    setAppMenus("activity", { menus, onKey: (e) => { const k = e.key; const t = (["cpu", "memory", "energy", "disk", "network"] as Tab[])[Number(k) - 1]; if (t) { setTab(t); return true; } return false; } });
  }, [tab, every, K]);
  useEffect(() => () => setAppMenus("activity", null), []);

  const quit = () => { if (selected?.winId !== undefined) onCloseWindow(selected.winId); else if (selected?.kind === "system") { /* system processes stay */ } setSel(null); };
  const hist = (f: (s: Sample) => number) => samples.map(f);
  const cols: { k: string; l: string; w: string; v: (p: Proc) => string | number }[] = tab === "memory"
    ? [{ k: "name", l: "Process Name", w: "40%", v: (p) => p.name }, { k: "mem", l: "Memory", w: "15%", v: (p) => fmtMB(p.mem) }, { k: "threads", l: "Threads", w: "12%", v: (p) => p.threads }, { k: "pid", l: "PID", w: "10%", v: (p) => p.pid }, { k: "user", l: "User", w: "15%", v: () => userName }]
    : tab === "energy"
      ? [{ k: "name", l: "App Name", w: "40%", v: (p) => p.name }, { k: "energy", l: "Energy Impact", w: "16%", v: (p) => (p.cpu * 1.3 + p.threads * 0.2).toFixed(1) }, { k: "state", l: "App Nap", w: "16%", v: (p) => (p.state === "Minimised" ? "Yes" : "No") }, { k: "pid", l: "PID", w: "10%", v: (p) => p.pid }]
      : [{ k: "name", l: "Process Name", w: "40%", v: (p) => p.name }, { k: "cpu", l: "% CPU", w: "12%", v: (p) => p.cpu.toFixed(1) }, { k: "time", l: "CPU Time", w: "14%", v: (p) => { const s = Math.floor((cur?.server.uptime ?? 0) * p.cpu / 100); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}.00`; } }, { k: "threads", l: "Threads", w: "10%", v: (p) => p.threads }, { k: "pid", l: "PID", w: "10%", v: (p) => p.pid }, { k: "user", l: "User", w: "14%", v: (p) => (p.kind === "system" ? "root" : userName) }];

  return (
    <div className={styles.app}>
      <div className={styles.toolbar}>
        <button className={styles.tb} title="Quit the selected process" disabled={!selected || selected.kind === "system"} onClick={quit}><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" /></svg></button>
        <button className={styles.tb} title="Inspect the selected process" disabled={!selected} onClick={() => {}}><svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5v.5" /></svg></button>
        <span className={styles.seg}>{(["cpu", "memory", "energy", "disk", "network"] as Tab[]).map((t) => <button key={t} className={tab === t ? styles.segOn : ""} onClick={() => setTab(t)}>{t === "cpu" ? "CPU" : t[0].toUpperCase() + t.slice(1)}</button>)}</span>
        <span className={styles.flex} />
        <div className={styles.search}><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="m10.5 10.5 3 3" /></svg><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></div>
      </div>
      <div className={styles.table}>
        <div className={styles.thead}>{cols.map((c) => <span key={c.k} style={{ width: c.w }} className={sort === c.k || (c.k === "name" && sort === "name") ? styles.thOn : ""} onClick={() => setSort(c.k === "mem" ? "mem" : c.k === "name" ? "name" : "cpu")}>{c.l}</span>)}</div>
        <div className={styles.tbody}>
          {procs.map((p, i) => (
            <div key={p.pid} className={`${styles.row} ${i % 2 ? styles.alt : ""} ${sel === p.pid ? styles.rowOn : ""}`} onClick={() => setSel(p.pid)} onDoubleClick={() => p.slug && onOpenApp(p.slug)}>
              {cols.map((c, ci) => <span key={c.k} style={{ width: c.w }} className={ci > 0 ? styles.num : ""}>{ci === 0 ? <>{p.icon ? <img src={p.icon} alt="" width={16} height={16} /> : <i className={styles.sysIcon} />}{p.name}</> : c.v(p)}</span>)}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        {tab === "cpu" ? <>
          <div className={styles.graphBox}><b>CPU LOAD</b><Graph data={hist(() => totalCpu)} data2={hist((s) => (s.machine.load1 / s.machine.cores) * 100)} max={100} color="#ff3b30" color2="#0a84ff" /></div>
          <dl><dt>System:</dt><dd><i style={{ background: "#ff3b30" }} />{sysCpu.toFixed(2)}%</dd><dt>User:</dt><dd><i style={{ background: "#0a84ff" }} />{totalCpu.toFixed(2)}%</dd><dt>Idle:</dt><dd>{Math.max(0, 100 - totalCpu - sysCpu).toFixed(2)}%</dd></dl>
          <dl><dt>Threads:</dt><dd>{procs.reduce((n, p) => n + p.threads, 0)}</dd><dt>Processes:</dt><dd>{procs.length}</dd><dt>Frame rate:</dt><dd>{frame.fps} fps</dd></dl>
          <dl><dt>Cores:</dt><dd>{cur?.machine.cores ?? "…"}</dd><dt>Load (1/5/15):</dt><dd>{cur ? `${cur.machine.load1.toFixed(2)} ${cur.machine.load5.toFixed(2)} ${cur.machine.load15.toFixed(2)}` : "…"}</dd><dt>Up:</dt><dd>{cur ? fmtUp(cur.machine.hostUptime) : "…"}</dd></dl>
        </> : tab === "memory" ? <>
          <div className={styles.graphBox}><b>MEMORY PRESSURE</b><Graph data={hist((s) => ((s.machine.totalMem - s.machine.freeMem) / s.machine.totalMem) * 100)} max={100} color="#34c759" /></div>
          <dl><dt>Physical Memory:</dt><dd>{cur ? fmtMB(cur.machine.totalMem) : "…"}</dd><dt>Memory Used:</dt><dd>{cur ? fmtMB(memUsed) : "…"}</dd><dt>Free:</dt><dd>{cur ? fmtMB(cur.machine.freeMem) : "…"}</dd></dl>
          <dl><dt>Server (RSS):</dt><dd>{cur ? fmtMB(cur.server.rss) : "…"}</dd><dt>Server heap:</dt><dd>{cur ? `${fmtMB(cur.server.heapUsed)} of ${fmtMB(cur.server.heapTotal)}` : "…"}</dd><dt>Page heap:</dt><dd>{heap ? `${fmtMB(heap.used)} of ${fmtMB(heap.total)}` : "n/a"}</dd></dl>
          <dl><dt>Database:</dt><dd>{cur?.db.size ?? "…"}</dd><dt>Connections:</dt><dd>{cur?.db.connections ?? "…"}</dd><dt>Node:</dt><dd>{cur?.server.node ?? "…"}</dd></dl>
        </> : tab === "energy" ? <>
          <div className={styles.graphBox}><b>ENERGY IMPACT</b><Graph data={hist(() => totalCpu * 1.3)} max={120} color="#34c759" /></div>
          <dl><dt>Energy Impact:</dt><dd>{(totalCpu * 1.3).toFixed(1)}</dd><dt>Apps napping:</dt><dd>{procs.filter((p) => p.state === "Minimised").length}</dd></dl>
          <dl><dt>Builds running:</dt><dd>{cur?.building.length ?? 0}</dd><dt>Battery:</dt><dd>100% (Power Adapter)</dd></dl>
          <dl><dt>Remaining charge:</dt><dd>n/a</dd><dt>Time on AC:</dt><dd>{cur ? fmtUp(cur.server.uptime) : "…"}</dd></dl>
        </> : tab === "disk" ? <>
          <div className={styles.graphBox}><b>IO</b><Graph data={hist((s) => s.user.bytes / 1e6)} max={Math.max(1, (cur?.user.bytes ?? 1) / 1e6) * 1.2} color="#0a84ff" /></div>
          <dl><dt>Apps:</dt><dd>{cur?.user.apps ?? "…"}</dd><dt>Built:</dt><dd>{cur?.user.built ?? "…"}</dd><dt>Versions:</dt><dd>{cur?.user.versions ?? "…"}</dd></dl>
          <dl><dt>Records:</dt><dd>{cur?.user.records ?? "…"}</dd><dt>Code stored:</dt><dd>{cur ? fmtMB(cur.user.bytes) : "…"}</dd><dt>Database:</dt><dd>{cur?.db.size ?? "…"}</dd></dl>
          <dl><dt>Reads in:</dt><dd>{samples.length * 3}</dd><dt>Writes out:</dt><dd>{cur?.user.versions ?? 0}</dd></dl>
        </> : <>
          <div className={styles.graphBox}><b>PACKETS</b><Graph data={hist((s, i = 0) => (s.at % 1000) / 20 + i)} max={60} color="#ff3b30" color2="#0a84ff" data2={hist((s) => (s.at % 700) / 20)} /></div>
          <dl><dt>Packets in:</dt><dd>{samples.length * 12}</dd><dt>Packets out:</dt><dd>{samples.length * 9}</dd></dl>
          <dl><dt>Data received:</dt><dd>{fmtMB(samples.length * 2400)}</dd><dt>Data sent:</dt><dd>{fmtMB(samples.length * 800)}</dd></dl>
          <dl><dt>Interface:</dt><dd>AI Mac Network (Wi‑Fi)</dd><dt>Sample every:</dt><dd>{every / 1000} s</dd></dl>
        </>}
      </div>
    </div>
  );
}
