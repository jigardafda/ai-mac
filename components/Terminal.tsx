"use client";

import { useEffect, useRef, useState } from "react";
import type { AppRow } from "@/lib/apps";
import { LinuxConsole } from "./LinuxConsole";
import styles from "./terminal.module.css";

type Props = { user: { id: number; email: string; name?: string }; apps: AppRow[]; hostname: string; onOpen: (slug: string) => void; onClose: () => void; onTitle: (t: string) => void };
type Line = { text: string; kind?: "in" | "err" };

/**
 * The Linux app. It opens into a real Linux (LinuxConsole); this file is also the macOS-style shell
 * behind its "← macOS shell" button: a zsh-looking shell over a virtual disk: your apps live in /Applications and
 * on the Desktop, their saved records under ~/Documents/<app>/<key>.json.
 * Nothing here touches the real machine. `linux` boots a real Linux in the same window (LinuxConsole).
 */
export function Terminal({ user, apps, hostname, onOpen, onClose, onTitle }: Props) {
  const name = user.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").toLowerCase() || "user";
  const home = `/Users/${name}`;
  const [lines, setLines] = useState<Line[]>([{ text: `Last login: ${new Date().toLocaleString("en-GB", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })} on ttys000` }]);
  const [cwd, setCwd] = useState(home);
  const [input, setInput] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const [busy, setBusy] = useState(false);
  // The Terminal opens straight into Linux; the macOS-style shell is one click away, and is what you get if Linux cannot start.
  const [linuxOn, setLinuxOn] = useState(true); // kept alive while the window is open
  const [mode, setModeState] = useState<"mac" | "linux">("linux");
  const setMode = (m: "mac" | "linux") => { modeRef.current = m; setModeState(m); };
  const [linuxState, setLinuxState] = useState<"loading" | "ready" | "error">("loading");
  const macTitle = `${name} — -zsh — 80×24`;
  const host = hostname.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 30) || "ai-mac";
  const sizeRef = useRef("80×24");
  const modeRef = useRef<"mac" | "linux">("linux");
  const linuxTitle = `root@${host} — -sh — ${sizeRef.current}`;
  const cache = useRef<Record<string, Record<string, unknown>>>({});
  const box = useRef<HTMLDivElement>(null);
  const inp = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- set once; onTitle is a fresh closure every render
  useEffect(() => { onTitle(linuxTitle); }, [name]);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [lines, busy]);

  const prompt = `${name}@${hostname} ${cwd === home ? "~" : cwd.startsWith(home + "/") ? "~" + cwd.slice(home.length) : cwd} %`;
  const print = (text: string, kind?: Line["kind"]) => setLines((l) => [...l, ...text.split("\n").map((t) => ({ text: t, kind }))]);

  // Virtual disk
  const appDir = (a: AppRow) => `${a.name}.app`;
  const findApp = (n: string) => apps.find((a) => a.slug === n || a.name.toLowerCase() === n.toLowerCase() || appDir(a).toLowerCase() === n.toLowerCase() || a.name.toLowerCase() === n.replace(/\.app$/i, "").toLowerCase());
  function resolve(p: string) {
    let path = p.startsWith("~") ? home + p.slice(1) : p.startsWith("/") ? p : `${cwd}/${p}`;
    const parts: string[] = [];
    for (const seg of path.split("/")) { if (!seg || seg === ".") continue; if (seg === "..") parts.pop(); else parts.push(seg); }
    path = "/" + parts.join("/");
    return path;
  }
  async function listDir(path: string): Promise<string[] | null> {
    if (path === "/") return ["Applications", "Library", "System", "Users", "bin", "etc", "tmp"];
    if (path === "/Users") return [name, "Shared"];
    if (path === home) return ["Applications", "Desktop", "Documents", "Downloads", "Library", "Movies", "Music", "Pictures", "Public"];
    if (path === "/Applications" || path === `${home}/Desktop` || path === `${home}/Applications`) return apps.map(appDir);
    if (path === `${home}/Documents`) return apps.map((a) => a.slug);
    const m = path.match(new RegExp(`^${home}/Documents/([a-z0-9-]+)$`));
    if (m) { const a = findApp(m[1]); if (!a) return null; const d = await data(a.slug); return Object.keys(d).map((k) => `${k}.json`); }
    const app = path.match(/^(?:\/Applications|\/Users\/[^/]+\/(?:Desktop|Applications))\/(.+\.app)$/);
    if (app && findApp(app[1])) return ["Contents"];
    if (app && !findApp(app[1])) return null;
    if (/\.app\/Contents$/.test(path)) return ["Info.txt", "Resources", "MacOS"];
    if (["/Library", "/System", "/bin", "/etc", "/tmp", "/Users/Shared", `${home}/Downloads`, `${home}/Library`, `${home}/Movies`, `${home}/Music`, `${home}/Pictures`, `${home}/Public`].includes(path) || /\.app\/Contents\/(Resources|MacOS)$/.test(path)) return [];
    return null;
  }
  async function data(slug: string) {
    if (cache.current[slug]) return cache.current[slug];
    const r = await fetch(`/api/apps/${slug}/data`);
    const keys: string[] = r.ok ? (await r.json()).keys : [];
    const out: Record<string, unknown> = {};
    for (const k of keys) { const rr = await fetch(`/api/apps/${slug}/data?key=${encodeURIComponent(k)}`); out[k] = rr.ok ? (await rr.json()).value : null; }
    cache.current[slug] = out;
    return out;
  }
  async function readFile(path: string): Promise<string | null> {
    const m = path.match(new RegExp(`^${home}/Documents/([a-z0-9-]+)/(.+)\\.json$`));
    if (m) { const a = findApp(m[1]); if (!a) return null; const d = await data(a.slug); return m[2] in d ? JSON.stringify(d[m[2]], null, 2) : null; }
    const info = path.match(/\/(.+\.app)\/Contents\/Info\.txt$/);
    if (info) { const a = findApp(info[1]); return a ? `Name: ${a.name}\nIdentifier: ai.mac.${a.slug}\nVersion: ${a.version ?? "not built yet"}\nDescription: ${a.description}` : null; }
    return null;
  }

  const HELP = `AI Mac shell. Commands:
  ls [path]      list a folder          cd [path]      change folder
  pwd            where you are           cat <file>     print a file (app data is JSON)
  open <app>     open an app window      apps           list your apps and versions
  ask <text>     ask the AI              calc <expr>    arithmetic
  linux          boot a real Linux system in this window
  echo, date, whoami, hostname, uname, uptime, sw_vers, history, clear, exit
Your apps are in /Applications; their saved records are in ~/Documents/<app>/.`;

  async function run(raw: string) {
    const cmd = raw.trim();
    print(`${prompt} ${raw}`, "in");
    if (!cmd) return;
    setHist((h) => [...h.filter((x) => x !== cmd), cmd].slice(-200));
    const [c, ...args] = cmd.match(/(?:[^\s"]+|"[^"]*")+/g)!.map((a) => a.replace(/^"|"$/g, ""));
    const arg = args.join(" ");
    switch (c) {
      case "help": case "man": return print(HELP);
      case "clear": return setLines([]);
      case "linux": { setLinuxOn(true); setMode("linux"); onTitle(linuxTitle); return; }
      case "pwd": return print(cwd);
      case "whoami": return print(name);
      case "hostname": return print(`${hostname}.local`);
      case "date": return print(new Date().toString());
      case "uname": return print(args.includes("-a") ? `Darwin ${hostname}.local 24.0.0 AI Mac Kernel Version 1.0: root:xnu/RELEASE_AIMAC arm64` : "Darwin");
      case "sw_vers": return print(`ProductName:\tAI Mac\nProductVersion:\t1.0\nBuildVersion:\tweb`);
      case "uptime": return print(`${new Date().toLocaleTimeString("en-GB")}  up since you signed in, 1 user, load averages: 0.42 0.31 0.25`);
      case "echo": return print(arg);
      case "history": return print(hist.map((h, i) => `${String(i + 1).padStart(5)}  ${h}`).join("\n"));
      case "exit": case "logout": onClose(); return;
      case "apps": return print(apps.map((a) => `${a.name.padEnd(18)} ${a.slug.padEnd(16)} ${a.version ? "v" + a.version : "not built yet"}`).join("\n"));
      case "open": { const a = findApp(arg.replace(/^-a\s+/, "")); if (!a) return print(`open: ${arg}: no such app`, "err"); onOpen(a.slug); return print(`Opening ${a.name}`); }
      case "cd": { const t = arg ? resolve(arg) : home; const l = await listDir(t); if (l === null) return print(`cd: no such file or directory: ${arg}`, "err"); setCwd(t); return; }
      case "ls": {
        const t = arg && !arg.startsWith("-") ? resolve(arg.split(" ").filter((x) => !x.startsWith("-"))[0] || ".") : cwd;
        const l = await listDir(t);
        if (l === null) return print(`ls: ${arg}: No such file or directory`, "err");
        if (args.includes("-l") || args.includes("-la")) return print(l.map((x) => `${x.includes(".") && !x.endsWith(".app") ? "-rw-r--r--" : "drwxr-xr-x"}  1 ${name}  staff  ${String(x.length * 97).padStart(6)} ${new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${x}`).join("\n"));
        return print(l.join("   "));
      }
      case "cat": case "less": case "more": case "head": { if (!arg) return print(`usage: cat <file>`, "err"); const f = await readFile(resolve(arg)); return f === null ? print(`cat: ${arg}: No such file or directory`, "err") : print(f); }
      case "calc": case "bc": { if (!/^[\d\s+\-*/().%^]+$/.test(arg)) return print("calc: numbers and + - * / ( ) only", "err"); try { return print(String(Function(`"use strict";return (${arg.replace(/\^/g, "**")})`)())); } catch { return print("calc: bad expression", "err"); } }
      case "say": { try { speechSynthesis.speak(new SpeechSynthesisUtterance(arg)); } catch { /* no voices */ } return; }
      case "ask": { if (!arg) return print("usage: ask <question>", "err"); setBusy(true); try { const r = await fetch("/api/system/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: arg }) }); const j = await r.json(); print(r.ok ? j.text : `ask: ${j.error}`, r.ok ? undefined : "err"); } finally { setBusy(false); } return; }
      case "neofetch": case "about": return print(`        .:'      ${name}@${hostname}\n    __ :'__      ----------------\n .'\`__\`-'__\`\`.   OS: AI Mac 1.0\n:__________.-'   Host: AI Mac (web)\n:_________:      Shell: zsh (virtual)\n :_________\`-;   Apps: ${apps.length} (${apps.filter((a) => a.version).length} built)\n  \`.__.-.__.'    Terminal: AI Mac Terminal`);
      case "mkdir": case "touch": case "rm": case "mv": case "cp": return print(`${c}: read-only file system; use the apps to change their records`, "err");
      case "sudo": return print(`${name} is not in the sudoers file. This incident will be reported.`, "err");
      case "vim": case "vi": case "nano": case "emacs": return print(`${c}: this terminal has no editors; records are edited in their apps`, "err");
      default: return print(`zsh: command not found: ${c}`, "err");
    }
  }

  async function complete() {
    const parts = input.split(" ");
    const last = parts[parts.length - 1];
    if (parts.length === 1) { const cmds = ["help", "ls", "cd", "pwd", "cat", "open", "apps", "ask", "calc", "echo", "date", "whoami", "hostname", "uname", "uptime", "sw_vers", "history", "clear", "exit", "neofetch", "linux"]; const m = cmds.filter((x) => x.startsWith(last)); if (m.length === 1) setInput(m[0] + " "); else if (m.length) print(m.join("  ")); return; }
    const dir = last.includes("/") ? resolve(last.slice(0, last.lastIndexOf("/") + 1)) : cwd;
    const base = last.includes("/") ? last.slice(last.lastIndexOf("/") + 1) : last;
    const l = parts[0] === "open" ? apps.map((a) => a.name) : (await listDir(dir)) || [];
    const m = l.filter((x) => x.toLowerCase().startsWith(base.toLowerCase()));
    if (m.length === 1) { const v = m[0].includes(" ") ? `"${m[0]}"` : m[0]; parts[parts.length - 1] = last.slice(0, last.length - base.length) + v; setInput(parts.join(" ") + (parts[0] === "cd" || parts[0] === "ls" ? "/" : " ")); } else if (m.length) print(m.join("   "));
  }

  return (
    <div className={styles.wrap}>
    {linuxOn ? (
      <div className={styles.linuxBar} style={{ display: mode === "linux" ? undefined : "none" }}>
        <span>Linux 6.8.12 on AI Mac · i686 · {linuxState === "ready" ? "running" : linuxState === "error" ? "stopped" : "starting"}</span>
        <button onClick={() => { setMode("mac"); onTitle(macTitle); setTimeout(() => inp.current?.focus(), 0); }}>← macOS shell</button>
      </div>
    ) : null}
    {linuxOn ? <LinuxConsole hostname={host} visible={mode === "linux"} onSize={(c, r) => { sizeRef.current = `${c}×${r}`; if (modeRef.current === "linux") onTitle(`root@${host} — -sh — ${c}×${r}`); }}
      bridge={{
        open: (n) => { const a = findApp(n.replace(/^-a\s+/, "")); if (!a) return `open: ${n}: no such app`; onOpen(a.slug); return null; },
        ask: async (q) => { const r = await fetch("/api/system/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: q }) }); const j = await r.json().catch(() => ({})); return r.ok ? j.text : `ask: ${j.error || "failed"}`; },
      }} onState={(s, why) => {
      setLinuxState(s);
      if (s === "error") { setMode("mac"); setLinuxOn(false); onTitle(macTitle); print(`linux: ${why || "could not start"}. Using the macOS shell.`, "err"); }
    }} /> : null}
    <div className={styles.term} ref={box} style={{ display: mode === "mac" ? undefined : "none" }} onClick={() => inp.current?.focus()}>
      {lines.map((l, i) => <div key={i} className={`${styles.line} ${l.kind === "err" ? styles.err : ""} ${l.kind === "in" ? styles.in : ""}`}>{l.text || " "}</div>)}
      {busy ? <div className={styles.line}>…</div> : (
        <div className={styles.promptLine}>
          <span className={styles.prompt}>{prompt}</span>
          <input ref={inp} autoFocus className={styles.input} value={input} spellCheck={false} autoCapitalize="off" autoComplete="off"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") { const v = input; setInput(""); setHi(-1); await run(v); }
              else if (e.key === "ArrowUp") { e.preventDefault(); const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1); if (hist[n] !== undefined) { setHi(n); setInput(hist[n]); } }
              else if (e.key === "ArrowDown") { e.preventDefault(); if (hi < 0) return; const n = hi + 1; if (n >= hist.length) { setHi(-1); setInput(""); } else { setHi(n); setInput(hist[n]); } }
              else if (e.key === "Tab") { e.preventDefault(); await complete(); }
              else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); setLines([]); }
              else if (e.key === "c" && e.ctrlKey) { e.preventDefault(); print(`${prompt} ${input}^C`, "in"); setInput(""); }
              else if (e.key === "d" && e.ctrlKey && !input) { e.preventDefault(); onClose(); }
            }} />
        </div>
      )}
    </div>
    </div>
  );
}
