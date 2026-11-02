"use client";

import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import styles from "./terminal.module.css";

/** The slice of the v86 emulator this component uses. */
interface Emulator {
  add_listener(event: string, fn: (...a: never[]) => void): void;
  serial0_send(data: string): void;
  destroy(): Promise<void>;
}

const PROMPT = "[#$%] $";
// The marker lets us hide the setup commands from the screen. The command that prints it is written
// with an empty-string split ('') so the shell's echo of the command does not look like its output.
const READY = "__AIC_READY__";
const READY_CMD = "echo __AIC_RE''ADY__";

/**
 * A real Linux 6.8 (i686) running in this window. The v86 emulator (BSD-2) runs a Buildroot kernel and
 * busybox shell; xterm.js draws its serial console. There is no network, and the disk is RAM, so
 * files are gone when the window closes. Nothing here touches the real machine.
 */
export function LinuxConsole({ visible, onState }: { visible: boolean; onState: (s: "loading" | "ready" | "error") => void }) {
  const host = useRef<HTMLDivElement>(null);
  const fit = useRef<{ fit: () => void; proposeDimensions: () => { cols: number; rows: number } | undefined } | null>(null);
  const [status, setStatus] = useState("Starting Linux…");
  const [error, setError] = useState("");
  const state = useRef({ onState });
  useEffect(() => { state.current.onState = onState; });

  useEffect(() => {
    let dead = false;
    let emu: Emulator | null = null;
    let cleanup = () => {};

    (async () => {
      try {
        // Fail early, and plainly, when the kernel was not fetched at build time.
        const probe = await fetch("/linux/buildroot-bzimage68.bin", { method: "HEAD" });
        if (!probe.ok) throw new Error("The Linux image is not installed on this server. Run `npm run linux:assets`.");

        const [{ Terminal }, { FitAddon }] = await Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]);
        const engineUrl = "/linux/libv86.mjs"; // served from public/, so the bundler must not touch it
        const { V86 } = await import(/* webpackIgnore: true */ engineUrl);
        if (dead || !host.current) return;

        const term = new Terminal({
          fontFamily: 'Menlo, "SF Mono", ui-monospace, Monaco, Consolas, monospace',
          fontSize: 11,
          cursorBlink: true,
          scrollback: 5000,
          theme: { background: "#ffffff", foreground: "#000000", cursor: "#000000", selectionBackground: "#b4d5fe",
            black: "#000000", red: "#c41a16", green: "#00a600", yellow: "#999900", blue: "#0000b2", magenta: "#b200b2", cyan: "#00a6b2", white: "#bfbfbf",
            brightBlack: "#666666", brightRed: "#e50000", brightGreen: "#00d900", brightYellow: "#b3b300", brightBlue: "#0000ff", brightMagenta: "#e500e5", brightCyan: "#00e5e5", brightWhite: "#e5e5e5" },
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(host.current);
        fit.current = fitAddon;
        fitAddon.fit();

        // The VM boots behind a short "booting" message; its own boot log is hidden.
        let booted = false;
        let primed = false;
        let tail = "";
        let pending: number[] = [];
        let raf = 0;
        const flush = () => { raf = 0; if (pending.length) { term.write(new Uint8Array(pending)); pending = []; } };

        const emulator: Emulator = new V86({
          wasm_path: "/linux/v86.wasm",
          bios: { url: "/linux/seabios.bin" },
          vga_bios: { url: "/linux/vgabios.bin" },
          bzimage: { url: "/linux/buildroot-bzimage68.bin" },
          cmdline: "tsc=reliable mitigations=off random.trust_cpu=on console=ttyS0",
          memory_size: 128 * 1024 * 1024,
          vga_memory_size: 2 * 1024 * 1024,
          autostart: true,
          // The screen is not used and the keyboard belongs to the desktop, not to the VM.
          disable_keyboard: true,
          disable_mouse: true,
          disable_speaker: true,
        });
        emu = emulator;

        emulator.add_listener("download-progress", ((e: { file_name: string; loaded: number; total: number }) => {
          if (booted || !e.total) return;
          const name = e.file_name.includes("bzimage") ? "kernel" : e.file_name.replace(/^.*\//, "");
          setStatus(`Downloading ${name} · ${(e.loaded / 1e6).toFixed(1)} of ${(e.total / 1e6).toFixed(1)} MB`);
        }) as never);

        const size = () => { const d = fitAddon.proposeDimensions(); return d ? `stty rows ${d.rows} cols ${d.cols}; ` : ""; };

        emulator.add_listener("serial0-output-byte", ((b: number) => {
          tail = (tail + String.fromCharCode(b)).slice(-200);
          if (!booted) {
            // The first prompt means the system is up: set the prompt and window size, hide the setup.
            if (!primed && new RegExp(PROMPT).test(tail)) {
              primed = true;
              setStatus("Setting up the shell…");
              emulator.serial0_send(`${size()}export PS1='\\[\\e[1;32m\\]root@linux\\[\\e[0m\\]:\\[\\e[1;34m\\]\\w\\[\\e[0m\\]# '; ${READY_CMD}\n`);
              tail = "";
            } else if (tail.includes(`${READY}\r\n`)) {
              booted = true;
              term.write("\x1bc");
              term.write("\x1b[1mLinux 6.8.12 (i686)\x1b[0m, running in your browser. No network; files are kept in RAM.\r\nTry: uname -a, ls /, cat /proc/cpuinfo, free\r\n\r\n");
              emulator.serial0_send("\n");
              setStatus("");
              state.current.onState("ready");
              term.focus();
            }
            return;
          }
          pending.push(b);
          if (!raf) raf = requestAnimationFrame(flush);
        }) as never);

        const input = term.onData((d) => { if (booted) emulator.serial0_send(d); });
        // Window size reaches the guest only at a prompt, so it never types into a running program.
        let resizeTimer = 0;
        const ro = new ResizeObserver(() => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            if (!host.current || host.current.offsetWidth === 0) return;
            fitAddon.fit();
            if (booted && /[#$%] $/.test(tail.replace(/\x1b\[[0-9;]*m/g, ""))) emulator.serial0_send(`\x15${size()}\n`);
          }, 150);
        });
        ro.observe(host.current);

        cleanup = () => { window.clearTimeout(resizeTimer); ro.disconnect(); input.dispose(); if (raf) cancelAnimationFrame(raf); term.dispose(); };
      } catch (e) {
        if (!dead) { setError(e instanceof Error ? e.message : "Could not start Linux."); state.current.onState("error"); }
      }
    })();

    return () => {
      dead = true;
      cleanup();
      emu?.destroy().catch(() => {});
    };
  }, []);

  // Re-measure when the Linux view is shown again after the Mac shell.
  useEffect(() => { if (visible) requestAnimationFrame(() => fit.current?.fit()); }, [visible]);

  return (
    <div className={styles.linux} style={{ display: visible ? undefined : "none" }}>
      <div className={styles.linuxHost} ref={host} />
      {status || error ? <div className={styles.linuxStatus}>{error ? <span className={styles.err}>{error}</span> : status}</div> : null}
    </div>
  );
}
