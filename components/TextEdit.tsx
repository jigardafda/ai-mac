"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { setAppMenus } from "@/lib/appmenus";
import type { Menu } from "./MenuBar";
import styles from "./textedit.module.css";

type Doc = { path: string | null; name: string; rich: boolean; html: string; text: string; dirty: boolean };
type Props = { initialPath?: string; onTitle: (t: string) => void; onClose: () => void; notify: (t: string) => void; isMac: boolean };
type Entry = { path: string; name: string; kind: string; updated_at: string };

const FONTS = ["Helvetica", "Helvetica Neue", "Times New Roman", "Georgia", "Courier New", "Menlo", "Arial", "Verdana", "Palatino", "Trebuchet MS"];
const SIZES = [9, 10, 11, 12, 13, 14, 18, 24, 36, 48, 64, 72];
const fresh = (): Doc => ({ path: null, name: "Untitled", rich: true, html: "", text: "", dirty: false });
const isRich = (p: string, mime?: string) => /\.(rtf|html?)$/i.test(p) || mime === "text/html";

/** TextEdit for AI Mac: rich or plain text documents saved into your files. */
export function TextEdit({ initialPath, onTitle, onClose, notify, isMac }: Props) {
  const [doc, setDoc] = useState<Doc>(fresh());
  const [font, setFont] = useState("Helvetica");
  const [size, setSize] = useState(12);
  const [sheet, setSheet] = useState<null | "save" | "open">(null);
  const [saveName, setSaveName] = useState("");
  const [saveDir, setSaveDir] = useState("/Documents");
  const [openList, setOpenList] = useState<Entry[]>([]);
  const [openDir, setOpenDir] = useState("/Documents");
  const [findQ, setFindQ] = useState<string | null>(null);
  const [stats, setStats] = useState({ words: 0, chars: 0 });
  const editor = useRef<HTMLDivElement>(null);
  const plain = useRef<HTMLTextAreaElement>(null);
  const K = isMac ? "⌘" : "Ctrl+";
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const docRef = useRef(doc); useEffect(() => { docRef.current = doc; }, [doc]);

  const load = useCallback(async (path: string) => {
    const r = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.file) return notify("That document could not be opened.");
    const rich = isRich(path, j.file.mime);
    setDoc({ path, name: j.file.name, rich, html: rich ? j.file.content : "", text: rich ? "" : j.file.content, dirty: false });
    if (rich && editor.current) editor.current.innerHTML = j.file.content;
  }, [notify]);
  useEffect(() => { if (!initialPath) return; const t = setTimeout(() => load(initialPath), 0); return () => clearTimeout(t); }, [initialPath]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onTitle(`${doc.name}${doc.dirty ? " — Edited" : ""}`); }, [doc.name, doc.dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doc.rich && editor.current && editor.current.innerHTML !== doc.html && !doc.dirty) editor.current.innerHTML = doc.html; }, [doc.rich, doc.html, doc.dirty]);

  const content = () => (docRef.current.rich ? editor.current?.innerHTML ?? "" : plain.current?.value ?? docRef.current.text);
  const countWords = useCallback(() => { const t = docRef.current.rich ? editor.current?.innerText ?? "" : plain.current?.value ?? ""; setStats({ words: (t.trim().match(/\S+/g) || []).length, chars: t.length }); }, []);
  const markDirty = () => { setDoc((d) => (d.dirty ? d : { ...d, dirty: true })); countWords(); };

  const saveTo = useCallback(async (path: string) => {
    const d = docRef.current;
    const body = content();
    const r = await fetch("/api/files", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ path, content: body, mime: d.rich ? "text/html" : "text/plain" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return notify(j.error || "Could not save.");
    setDoc((x) => ({ ...x, path, name: j.file.name, dirty: false, html: d.rich ? body : "", text: d.rich ? "" : body }));
    setSheet(null);
  }, [notify]);
  const save = useCallback(() => { const d = docRef.current; if (d.path) return saveTo(d.path); setSaveName(d.name === "Untitled" ? (d.rich ? "Untitled.rtf" : "Untitled.txt") : d.name); setSheet("save"); }, [saveTo]);
  const saveAs = useCallback(() => { const d = docRef.current; setSaveName(d.name.replace(/\.(rtf|txt|md|html?)$/i, "") + (d.rich ? ".rtf" : ".txt")); setSaveDir(d.path ? d.path.split("/").slice(0, -1).join("/") || "/" : "/Documents"); setSheet("save"); }, []);
  const newDoc = useCallback(() => { setDoc(fresh()); if (editor.current) editor.current.innerHTML = ""; setStats({ words: 0, chars: 0 }); setTimeout(() => editor.current?.focus(), 30); }, []);
  const browse = useCallback(async (dir: string) => { const r = await fetch(`/api/files?path=${encodeURIComponent(dir)}`); const j = await r.json().catch(() => ({ items: [] })); setOpenDir(dir); setOpenList((j.items ?? []).filter((e: Entry) => e.kind === "folder" || /\.(txt|rtf|md|html?|json|js|ts|css|csv|log)$/i.test(e.name) || !/\./.test(e.name))); }, []);
  const openSheet = useCallback(() => { browse("/Documents"); setSheet("open"); }, [browse]);
  const toggleRich = useCallback(() => {
    const d = docRef.current;
    if (d.rich) { const text = editor.current?.innerText ?? ""; setDoc({ ...d, rich: false, text, html: "", dirty: true, name: d.name.replace(/\.rtf$/i, ".txt") }); }
    else { const html = (plain.current?.value ?? d.text).split(/\n/).map((l) => `<div>${l.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!) || "<br>"}</div>`).join(""); setDoc({ ...d, rich: true, html, text: "", dirty: true, name: d.name.replace(/\.txt$/i, ".rtf") }); setTimeout(() => { if (editor.current) editor.current.innerHTML = html; }, 0); }
  }, []);
  const cmd = (c: string, v?: string) => { editor.current?.focus(); document.execCommand(c, false, v); markDirty(); };
  const setFontFamily = (f: string) => { setFont(f); cmd("fontName", f); };
  const setFontSize = (s: number) => { setSize(s); editor.current?.focus(); document.execCommand("fontSize", false, "7"); editor.current?.querySelectorAll('font[size="7"]').forEach((el) => { (el as HTMLElement).removeAttribute("size"); (el as HTMLElement).style.fontSize = `${s}px`; }); markDirty(); };
  const find = () => { const q = findQ ?? ""; if (!q) return; const ok = (window as unknown as { find: (...a: unknown[]) => boolean }).find(q, false, false, true, false, true, false); if (!ok) notify("Not found."); };

  // Autosave named documents a second after typing stops.
  useEffect(() => {
    if (!doc.dirty || !doc.path) return;
    const t = setTimeout(() => saveTo(doc.path!), 1200);
    return () => clearTimeout(t);
  }, [doc.dirty, doc.path, stats, saveTo]);

  useEffect(() => {
    const menus: Menu[] = [
      { key: "app", title: "TextEdit", bold: true, items: [{ label: "About TextEdit", hint: "AI Mac 1.0", disabled: true }, "sep", { label: "Close Window", shortcut: `${K}W`, action: () => closeRef.current() }] },
      { key: "file", title: "File", items: [{ label: "New", shortcut: `${K}N`, action: newDoc }, { label: "Open…", shortcut: `${K}O`, action: openSheet }, "sep", { label: "Save", shortcut: `${K}S`, action: save }, { label: "Save As…", shortcut: `⇧${K}S`, action: saveAs }, "sep", { label: "Print…", shortcut: `${K}P`, disabled: true }] },
      { key: "edit", title: "Edit", items: [{ label: "Undo", shortcut: `${K}Z`, action: () => cmd("undo") }, { label: "Redo", shortcut: `⇧${K}Z`, action: () => cmd("redo") }, "sep", { label: "Cut", shortcut: `${K}X`, action: () => cmd("cut") }, { label: "Copy", shortcut: `${K}C`, action: () => cmd("copy") }, { label: "Paste", shortcut: `${K}V`, action: () => cmd("paste") }, { label: "Select All", shortcut: `${K}A`, action: () => cmd("selectAll") }, "sep", { label: "Find…", shortcut: `${K}F`, action: () => setFindQ((q) => q ?? "") }] },
      { key: "format", title: "Format", items: [
        { label: doc.rich ? "Make Plain Text" : "Make Rich Text", shortcut: `⇧${K}T`, action: toggleRich }, "sep",
        { label: "Bold", shortcut: `${K}B`, disabled: !doc.rich, action: () => cmd("bold") }, { label: "Italic", shortcut: `${K}I`, disabled: !doc.rich, action: () => cmd("italic") }, { label: "Underline", shortcut: `${K}U`, disabled: !doc.rich, action: () => cmd("underline") }, "sep",
        { label: "Align Left", shortcut: `${K}{`, disabled: !doc.rich, action: () => cmd("justifyLeft") }, { label: "Centre", shortcut: `${K}|`, disabled: !doc.rich, action: () => cmd("justifyCenter") }, { label: "Align Right", shortcut: `${K}}`, disabled: !doc.rich, action: () => cmd("justifyRight") }, "sep",
        { label: "Bulleted List", disabled: !doc.rich, action: () => cmd("insertUnorderedList") }, { label: "Numbered List", disabled: !doc.rich, action: () => cmd("insertOrderedList") }, { label: "Insert Link…", disabled: !doc.rich, action: () => cmd("createLink", "https://") },
      ] },
      { key: "view", title: "View", items: [{ label: "Show Word Count", checked: true, disabled: true }] },
      { key: "window", title: "Window", items: [{ label: doc.name, checked: true }] },
      { key: "help", title: "Help", items: [{ label: "TextEdit Help", action: () => notify(`${K}S saves into Documents, ${K}O opens, ⇧${K}T switches between rich and plain text. Named documents autosave.`) }] },
    ];
    setAppMenus("textedit", { menus, onKey: (e) => {
      const k = e.key.toLowerCase();
      if (k === "s" && e.shiftKey) { saveAs(); return true; }
      if (k === "s") { save(); return true; }
      if (k === "n") { newDoc(); return true; }
      if (k === "o") { openSheet(); return true; }
      if (k === "f") { setFindQ((q) => q ?? ""); return true; }
      if (k === "t" && e.shiftKey) { toggleRich(); return true; }
      if (k === "b" && docRef.current.rich) { cmd("bold"); return true; }
      if (k === "i" && docRef.current.rich) { cmd("italic"); return true; }
      if (k === "u" && docRef.current.rich) { cmd("underline"); return true; }
      return false;
    } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.rich, doc.name, doc.dirty]);
  useEffect(() => () => setAppMenus("textedit", null), []);

  const saveSubmit = (e: React.FormEvent) => { e.preventDefault(); const n = saveName.trim().replace(/[/\\]/g, ""); if (!n) return; const name = /\.[a-z0-9]+$/i.test(n) ? n : n + (doc.rich ? ".rtf" : ".txt"); if (!isRich(name) && doc.rich) { setDoc((d) => ({ ...d, rich: false, text: editor.current?.innerText ?? "" })); } saveTo(`${saveDir === "/" ? "" : saveDir}/${name}`); };

  return (
    <div className={styles.app}>
      {doc.rich ? (
        <div className={styles.toolbar}>
          <select className={styles.styleSel} defaultValue="body" onChange={(e) => { const v = e.target.value; cmd("formatBlock", v === "body" ? "div" : v === "title" ? "h1" : v === "heading" ? "h2" : v === "subheading" ? "h3" : "div"); e.target.value = "body"; }}><option value="body">Body</option><option value="title">Title</option><option value="heading">Heading</option><option value="subheading">Subheading</option></select>
          <select className={styles.fontSel} value={font} onChange={(e) => setFontFamily(e.target.value)}>{FONTS.map((f) => <option key={f}>{f}</option>)}</select>
          <select className={styles.sizeSel} value={size} onChange={(e) => setFontSize(Number(e.target.value))}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select>
          <span className={styles.group}><button onClick={() => cmd("bold")} title="Bold"><b>B</b></button><button onClick={() => cmd("italic")} title="Italic"><i>I</i></button><button onClick={() => cmd("underline")} title="Underline"><u>U</u></button><button onClick={() => cmd("strikeThrough")} title="Strikethrough"><s>S</s></button></span>
          <span className={styles.group}><button onClick={() => cmd("justifyLeft")} title="Align left"><svg viewBox="0 0 16 16"><path d="M2 4h12M2 7h8M2 10h12M2 13h8" /></svg></button><button onClick={() => cmd("justifyCenter")} title="Centre"><svg viewBox="0 0 16 16"><path d="M2 4h12M4 7h8M2 10h12M4 13h8" /></svg></button><button onClick={() => cmd("justifyRight")} title="Align right"><svg viewBox="0 0 16 16"><path d="M2 4h12M6 7h8M2 10h12M6 13h8" /></svg></button><button onClick={() => cmd("justifyFull")} title="Justify"><svg viewBox="0 0 16 16"><path d="M2 4h12M2 7h12M2 10h12M2 13h12" /></svg></button></span>
          <span className={styles.group}><button onClick={() => cmd("insertUnorderedList")} title="Bulleted list"><svg viewBox="0 0 16 16"><path d="M6 4h8M6 8h8M6 12h8" /><circle cx="3" cy="4" r="1" fill="currentColor" /><circle cx="3" cy="8" r="1" fill="currentColor" /><circle cx="3" cy="12" r="1" fill="currentColor" /></svg></button><button onClick={() => cmd("insertOrderedList")} title="Numbered list"><svg viewBox="0 0 16 16"><path d="M6 4h8M6 8h8M6 12h8" /><text x="1" y="6" fontSize="5" fill="currentColor" stroke="none">1</text><text x="1" y="10" fontSize="5" fill="currentColor" stroke="none">2</text><text x="1" y="14" fontSize="5" fill="currentColor" stroke="none">3</text></svg></button></span>
          <input type="color" className={styles.color} title="Text colour" defaultValue="#000000" onChange={(e) => cmd("foreColor", e.target.value)} />
        </div>
      ) : null}
      {doc.rich ? <div className={styles.ruler}>{Array.from({ length: 17 }, (_, i) => <i key={i} className={i % 2 ? styles.tick : styles.tickBig} />)}</div> : null}
      <div className={styles.page}>
        {doc.rich ? (
          <div ref={editor} className={styles.editor} contentEditable suppressContentEditableWarning spellCheck={false} style={{ fontFamily: font, fontSize: size }} onInput={markDirty} onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); cmd("insertHTML", "&emsp;"); } }} />
        ) : (
          <textarea ref={plain} className={styles.plain} value={doc.text} spellCheck={false} onChange={(e) => { setDoc((d) => ({ ...d, text: e.target.value, dirty: true })); countWords(); }} />
        )}
      </div>
      <div className={styles.status}><span>{stats.words} words · {stats.chars} characters</span><span className={styles.flex} />{doc.path ? <span>{doc.dirty ? "Saving…" : `Saved in ${doc.path.split("/").slice(0, -1).join("/") || "/"}`}</span> : <span>Not saved yet. {K}S to save.</span>}</div>

      {findQ !== null ? (
        <form className={styles.find} onSubmit={(e) => { e.preventDefault(); find(); }}>
          <span>Find</span><input autoFocus value={findQ} onChange={(e) => setFindQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") setFindQ(null); }} /><button type="submit">Next</button><button type="button" onClick={() => setFindQ(null)}>Done</button>
        </form>
      ) : null}

      {sheet === "save" ? (
        <div className={styles.sheetBack}>
          <form className={styles.sheet} onSubmit={saveSubmit}>
            <label>Save As: <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} onFocus={(e) => { const i = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length); }} /></label>
            <label>Where: <select value={saveDir} onChange={(e) => setSaveDir(e.target.value)}>{["/Documents", "/Desktop", "/Downloads", "/"].map((d) => <option key={d} value={d}>{d === "/" ? "AI Mac HD" : d.slice(1)}</option>)}</select></label>
            <label>Format: <select value={doc.rich ? "rtf" : "txt"} onChange={(e) => { if ((e.target.value === "rtf") !== doc.rich) toggleRich(); setSaveName((n) => n.replace(/\.(rtf|txt)$/i, "") + "." + e.target.value); }}><option value="rtf">Rich Text Document</option><option value="txt">Plain Text</option></select></label>
            <div className={styles.sheetBtns}><button type="button" onClick={() => setSheet(null)}>Cancel</button><button type="submit" className={styles.primary}>Save</button></div>
          </form>
        </div>
      ) : null}
      {sheet === "open" ? (
        <div className={styles.sheetBack}>
          <div className={styles.sheet}>
            <div className={styles.openHead}><button type="button" onClick={() => browse(openDir.split("/").slice(0, -1).join("/") || "/")} disabled={openDir === "/"}>‹</button><b>{openDir === "/" ? "AI Mac HD" : openDir.split("/").pop()}</b></div>
            <div className={styles.openList}>{openList.length ? openList.map((e) => <button key={e.path} type="button" className={styles.openRow} onClick={() => (e.kind === "folder" ? browse(e.path) : (load(e.path), setSheet(null)))}><span>{e.kind === "folder" ? "📁" : "📄"}</span>{e.name}</button>) : <p>Nothing to open here.</p>}</div>
            <div className={styles.sheetBtns}><button type="button" onClick={() => setSheet(null)}>Cancel</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
