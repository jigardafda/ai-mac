"use client";

import { useRef, useState } from "react";
import styles from "./dock.module.css";

export type DockEntry =
  | { kind: "app"; slug: string; name: string; icon: string; running: boolean; building: boolean }
  | { kind: "min"; winId: number; slug: string; name: string; icon: string }
  | { kind: "new" }
  | { kind: "trash" }
  | { kind: "sep" };

const GAP = 6;
const SEP_W = 1 + 2 * 7;
const REACH = 2.6; // how many icons either side feel the cursor

/** The macOS dock: translucent bar, icons that magnify around the cursor, tooltips,
 *  running dots, a bounce while an app is being built, minimised windows on the right. */
export function Dock({ entries, size: iconSize = 52, magnify = true, maxSize = 92, onApp, onMin, onNew, onTrash, onContext }: { entries: DockEntry[]; size?: number; magnify?: boolean; maxSize?: number; onApp: (slug: string) => void; onMin: (winId: number) => void; onNew: () => void; onTrash: () => void; onContext: (e: React.MouseEvent, entry: DockEntry) => void }) {
  const BASE = iconSize, MAX = Math.max(iconSize, maxSize);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const el = useRef<HTMLElement>(null);

  // Base centre of every entry in page coordinates. The dock is centred on the
  // viewport and only grows outward, so positions computed from the rest sizes
  // stay stable while icons magnify. That keeps the magnification jitter free.
  const widths = entries.map((e) => (e.kind === "sep" ? SEP_W : BASE));
  const total = widths.reduce((a, b) => a + b, 0) + GAP * (entries.length - 1);
  const start = (typeof window !== "undefined" ? window.innerWidth : 1440) / 2 - total / 2;
  const centres = widths.reduce<{ acc: number; out: number[] }>((s, w) => ({ acc: s.acc + w + GAP, out: [...s.out, s.acc + w / 2] }), { acc: start, out: [] }).out;

  const size = (i: number) => {
    if (!magnify || mouseX === null || entries[i].kind === "sep") return widths[i];
    const d = Math.abs(mouseX - centres[i]) / (BASE + GAP);
    if (d >= REACH) return BASE;
    const t = (Math.cos((d / REACH) * Math.PI) + 1) / 2; // 1 under the cursor, 0 at the reach
    return BASE + (MAX - BASE) * t;
  };

  return (
    <nav ref={el} className={styles.dock} style={{ height: BASE + 16 }} aria-label="Dock" onMouseMove={(e) => setMouseX(e.clientX)} onMouseLeave={() => setMouseX(null)}>
      {entries.map((e, i) => {
        if (e.kind === "sep") return <span key={`sep-${i}`} className={styles.sep} />;
        const s = size(i);
        const common = { className: styles.item, style: { width: s, height: s } as React.CSSProperties, onContextMenu: (ev: React.MouseEvent) => { ev.preventDefault(); onContext(ev, e); } };
        if (e.kind === "new") {
          return (
            <button key="new" {...common} onClick={onNew} aria-label="New app" data-dock="new-app">
              <span className={styles.tip}>New app</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/new-app.png" alt="" draggable={false} />
            </button>
          );
        }
        if (e.kind === "trash") {
          return (
            <button key="trash" {...common} onClick={onTrash} aria-label="Trash" data-dock="trash">
              <span className={styles.tip}>Trash</span>
              <span className={styles.trash}>
                <svg viewBox="0 0 48 56" fill="none"><path d="M9 14h30l-2.4 36.2A3 3 0 0 1 33.6 53H14.4a3 3 0 0 1-3-2.8L9 14Z" fill="url(#tg)" /><rect x="6" y="9" width="36" height="5" rx="2" fill="#f3f3f6" /><path d="M18 9V6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3" stroke="#d6d6dc" strokeWidth="2.5" /><path d="M17 20v28M24 20v28M31 20v28" stroke="rgba(0,0,0,0.12)" strokeWidth="2" strokeLinecap="round" /><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stopColor="#dedee4" /><stop offset=".5" stopColor="#f4f4f7" /><stop offset="1" stopColor="#d4d4db" /></linearGradient></defs></svg>
              </span>
            </button>
          );
        }
        if (e.kind === "min") {
          return (
            <button key={`min-${e.winId}`} {...common} onClick={() => onMin(e.winId)} aria-label={`${e.name} (minimised)`} data-dock-min={e.winId}>
              <span className={styles.tip}>{e.name}</span>
              <span className={styles.minFrame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={e.icon} alt="" draggable={false} className={styles.minIcon} />
              </span>
            </button>
          );
        }
        return (
          <button key={e.slug} {...common} onClick={() => onApp(e.slug)} aria-label={e.name} data-dock={e.slug}>
            <span className={styles.tip}>{e.name}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={e.icon} alt="" draggable={false} className={e.building ? styles.bounce : ""} />
            {e.running ? <span className={styles.dot} /> : null}
          </button>
        );
      })}
    </nav>
  );
}
