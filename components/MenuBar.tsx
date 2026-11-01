"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./menubar.module.css";

export type MenuItem = { label: string; shortcut?: string; disabled?: boolean; checked?: boolean; hint?: string; action?: () => void } | "sep";
export type Menu = { key: string; title: React.ReactNode; items: MenuItem[]; bold?: boolean; align?: "left" | "right" };

/** The 24px macOS menu bar: app menus on the left, status items and the clock on the right.
 *  Menus open on click, switch on hover while one is open, blink the chosen item and fade out. */
export function MenuBar({ left, right, clock }: { left: Menu[]; right: Menu[]; clock: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const [blink, setBlink] = useState<{ key: string; i: number; on: boolean } | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);


  function close() {
    if (!open) return;
    const k = open;
    clearTimers(); // a pending selection dies with the menu
    setBlink(null);
    setClosing(k);
    setOpen(null);
    later(() => setClosing((c) => (c === k ? null : c)), 160);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!bar.current?.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function choose(key: string, i: number, item: Exclude<MenuItem, "sep">) {
    if (item.disabled || blink) return;
    // macOS blinks the item twice before the menu goes away
    setBlink({ key, i, on: false });
    later(() => setBlink({ key, i, on: true }), 60);
    later(() => setBlink({ key, i, on: false }), 120);
    later(() => { setBlink(null); setClosing(key); setOpen(null); later(() => setClosing((c) => (c === key ? null : c)), 160); item.action?.(); }, 200);
  }

  const render = (m: Menu) => {
    const isOpen = open === m.key;
    const visible = isOpen || closing === m.key;
    return (
      <div key={m.key} className={`${styles.item} ${m.bold ? styles.bold : ""} ${isOpen ? styles.itemOpen : ""}`}
        onMouseDown={(e) => { e.preventDefault(); if (isOpen) close(); else { setClosing(null); setOpen(m.key); } }}
        onMouseEnter={() => { if (open && open !== m.key) { setClosing(null); setOpen(m.key); } }}>
        <span className={styles.title}>{m.title}</span>
        {visible ? (
          <div className={`${styles.menu} ${m.align === "right" ? styles.menuRight : ""} ${closing === m.key && !isOpen ? styles.menuClosing : ""}`} onMouseDown={(e) => e.stopPropagation()}>
            {m.items.map((it, i) =>
              it === "sep" ? <div key={i} className={styles.sep} /> : (
                <button key={i} type="button" disabled={it.disabled}
                  className={`${styles.row} ${blink && blink.key === m.key && blink.i === i ? (blink.on ? styles.rowBlinkOn : styles.rowBlinkOff) : ""}`}
                  onClick={() => choose(m.key, i, it)}>
                  <span className={styles.check}>{it.checked ? "✓" : ""}</span>
                  <span className={styles.label}>{it.label}</span>
                  {it.hint ? <span className={styles.hint}>{it.hint}</span> : null}
                  {it.shortcut ? <span className={styles.shortcut}>{it.shortcut}</span> : null}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <header ref={bar} className={styles.bar}>
      <div className={styles.left}>{left.map(render)}</div>
      <div className={styles.right}>
        {right.map(render)}
        <span className={styles.clock}>{clock}</span>
      </div>
    </header>
  );
}

export const Glyph = {
  logo: <span className={styles.logo} aria-label="AI Computer" />,
  wifi: (
    <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" aria-label="Wi-Fi"><path d="M8 11.3a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm-3-3.2 1.1 1.1A2.7 2.7 0 0 1 8 8.4c.7 0 1.4.3 1.9.8L11 8.1A4.3 4.3 0 0 0 8 6.8c-1.2 0-2.2.5-3 1.3ZM2.6 5.7l1.1 1.1A6.1 6.1 0 0 1 8 5.1c1.7 0 3.2.6 4.3 1.7l1.1-1.1A7.6 7.6 0 0 0 8 3.5c-2.1 0-4 .9-5.4 2.2ZM.3 3.4l1.1 1.1A9.4 9.4 0 0 1 8 1.8c2.6 0 4.9 1 6.6 2.7l1.1-1.1A11 11 0 0 0 8 .2 11 11 0 0 0 .3 3.4Z" /></svg>
  ),
  battery: (
    <svg width="26" height="12" viewBox="0 0 26 12" aria-label="Battery"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" strokeOpacity=".4" /><rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor" /><path d="M24 4v4a2 2 0 0 0 0-4Z" fill="currentColor" fillOpacity=".4" /></svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-label="Spotlight"><circle cx="6" cy="6" r="4.5" /><path d="m9.5 9.5 3 3" /></svg>
  ),
  control: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-label="Control Centre"><rect x="1" y="2" width="12" height="4" rx="2" /><rect x="1" y="8" width="12" height="4" rx="2" /><circle cx="4" cy="4" r="1" fill="currentColor" /><circle cx="10" cy="10" r="1" fill="currentColor" /></svg>
  ),
  user: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-label="Account"><circle cx="7" cy="4.2" r="3" /><path d="M1.2 13a5.8 5.8 0 0 1 11.6 0Z" /></svg>
  ),
};
