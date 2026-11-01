"use client";

import { useRef, useState } from "react";
import styles from "./dock.module.css";

export type DockEntry =
  | { kind: "app"; slug: string; name: string; icon: string; running: boolean; building: boolean }
  | { kind: "min"; winId: number; slug: string; name: string; icon: string }
  | { kind: "new" }
  | { kind: "sep" };

const BASE = 52; // icon size at rest
const MAX = 92; // icon size under the cursor
const GAP = 6;
const SEP_W = 1 + 2 * 7;
const REACH = 2.6; // how many icons either side feel the cursor

/** The macOS dock: translucent bar, icons that magnify around the cursor, tooltips,
 *  running dots, a bounce while an app is being built, minimised windows on the right. */
export function Dock({ entries, onApp, onMin, onNew }: { entries: DockEntry[]; onApp: (slug: string) => void; onMin: (winId: number) => void; onNew: () => void }) {
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
    if (mouseX === null || entries[i].kind === "sep") return widths[i];
    const d = Math.abs(mouseX - centres[i]) / (BASE + GAP);
    if (d >= REACH) return BASE;
    const t = (Math.cos((d / REACH) * Math.PI) + 1) / 2; // 1 under the cursor, 0 at the reach
    return BASE + (MAX - BASE) * t;
  };

  return (
    <nav ref={el} className={styles.dock} aria-label="Dock" onMouseMove={(e) => setMouseX(e.clientX)} onMouseLeave={() => setMouseX(null)}>
      {entries.map((e, i) => {
        if (e.kind === "sep") return <span key={`sep-${i}`} className={styles.sep} />;
        const s = size(i);
        const common = { className: styles.item, style: { width: s, height: s } as React.CSSProperties };
        if (e.kind === "new") {
          return (
            <button key="new" {...common} onClick={onNew} aria-label="New app" data-dock="new-app">
              <span className={styles.tip}>New app</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/new-app.png" alt="" draggable={false} />
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
