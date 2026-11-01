import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireUser } from "@/lib/auth";

/**
 * The built-in browser loads pages through here so sites that refuse to be
 * framed still show. The document comes back with a <base> pointing at the
 * real site (so its images, styles and scripts load from there), its frame
 * blocking headers dropped, and a small script that routes link clicks and
 * form submissions back to the browser window and answers find, zoom and
 * title requests. It runs in a sandboxed frame with an opaque origin, so
 * page scripts cannot reach this desktop's session. `reader=1` returns the
 * article text alone in Safari Reader styling.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function privateAddress(ip: string) {
  if (isIP(ip) === 6) return /^(::1|fc|fd|fe80|::ffff:(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.))/i.test(ip) || ip === "::";
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
}

async function safeTarget(raw: string): Promise<URL | string> {
  let u: URL;
  try { u = new URL(raw); } catch { return "That is not a web address."; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "Only http and https pages can be opened.";
  if (u.username || u.password) return "Addresses with credentials are not allowed.";
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return "Local addresses cannot be opened from the desktop.";
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (addrs.some((a) => privateAddress(a.address))) return "That address points at a private network.";
  } catch { return "That site could not be found."; }
  return u;
}

const INJECT = `<script>(function(){
function send(m){try{parent.postMessage(Object.assign({aicBrowse:true},m),'*')}catch(e){}}
function go(u,newTab){try{send({type:'navigate',url:new URL(u,document.baseURI).href,newTab:!!newTab})}catch(e){}}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(/^(javascript:|mailto:|tel:)/i.test(h))return;if(h.charAt(0)==='#'){return}e.preventDefault();e.stopPropagation();go(a.href,e.metaKey||e.ctrlKey||a.target==='_blank')},true);
document.addEventListener('auxclick',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||e.button!==1)return;e.preventDefault();go(a.href,true)},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.action)return;if((f.method||'get').toLowerCase()!=='get')return;e.preventDefault();var u=new URL(f.action,document.baseURI);var d=new FormData(f);d.forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)});go(u.href)},true);
window.open=function(u){if(u)go(u,true);return null};
function meta(){var icon=null,l=document.querySelector('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');if(l)try{icon=new URL(l.getAttribute('href'),document.baseURI).href}catch(e){}var ps=document.querySelectorAll('article p, main p, p');var words=0;for(var i=0;i<ps.length;i++)words+=(ps[i].textContent||'').split(/\\s+/).length;send({type:'meta',title:document.title,icon:icon,readerable:words>250})}
document.addEventListener('DOMContentLoaded',meta);if(document.readyState!=='loading')meta();
document.addEventListener('contextmenu',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;var img=e.target&&e.target.closest?e.target.closest('img'):null;send({type:'contextmenu',x:e.clientX,y:e.clientY,link:a?a.href:null,image:img?img.src:null,selection:String(getSelection&&getSelection()||'')});e.preventDefault()},true);
document.addEventListener('keydown',function(e){if((e.metaKey||e.ctrlKey)&&/^[tlwfdn=+\\-0]$/i.test(e.key)){e.preventDefault();send({type:'key',key:e.key,shift:e.shiftKey})}},true);
window.addEventListener('message',function(e){var m=e.data;if(!m||!m.aicBrowse)return;
 if(m.type==='find'){var ok=false;try{ok=window.find(m.q,false,!!m.back,true,false,true,false)}catch(x){}send({type:'found',ok:ok})}
 if(m.type==='zoom'){document.documentElement.style.zoom=m.zoom}
 if(m.type==='scrollTop'){scrollTo(0,0)}});
})();</script>`;

function readerHtml(html: string, url: string, title: string) {
  const pick = (re: RegExp) => { const m = re.exec(html); return m ? m[1] : null; };
  let body = pick(/<article[^>]*>([\s\S]*?)<\/article>/i) || pick(/<main[^>]*>([\s\S]*?)<\/main>/i) || pick(/<body[^>]*>([\s\S]*?)<\/body>/i) || html;
  body = body.replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|button|input|select|textarea)[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  // keep a small set of tags and only href and src on them
  body = body.replace(/<(\/?)(\w+)([^>]*)>/g, (all, close, tag, attrs) => {
    const t = tag.toLowerCase();
    if (!/^(p|h1|h2|h3|h4|h5|h6|ul|ol|li|blockquote|pre|code|em|strong|b|i|a|img|figure|figcaption|table|thead|tbody|tr|td|th|br|hr|span)$/.test(t)) return close ? "" : t === "div" || t === "section" ? "" : "";
    if (close) return `</${t}>`;
    const keep: string[] = [];
    const href = /\shref=["']([^"']+)["']/i.exec(attrs)?.[1]; const src = /\ssrc=["']([^"']+)["']/i.exec(attrs)?.[1]; const alt = /\salt=["']([^"']*)["']/i.exec(attrs)?.[1];
    if (t === "a" && href) keep.push(`href="${href}"`);
    if (t === "img" && src) { keep.push(`src="${src}"`); if (alt) keep.push(`alt="${alt}"`); }
    return `<${t}${keep.length ? " " + keep.join(" ") : ""}>`;
  });
  // drop empty spans and paragraphs
  body = body.replace(/<span>\s*<\/span>/g, "").replace(/<p>\s*<\/p>/g, "");
  const host = new URL(url).hostname.replace(/^www\./, "");
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${url}"><title>${title}</title>${INJECT}<style>
  :root{color-scheme:light}body{margin:0;background:#fbfbfa;color:#1d1d1f;font:19px/1.6 -apple-system,"New York","Iowan Old Style",Georgia,serif;-webkit-font-smoothing:antialiased}
  .r{max-width:680px;margin:0 auto;padding:56px 24px 96px}.r h1{font-size:34px;line-height:1.2;margin:0 0 8px;font-weight:700}.r .src{font:13px -apple-system,sans-serif;color:#86868b;margin:0 0 32px}
  .r h2{font-size:26px;margin:40px 0 12px}.r h3{font-size:22px;margin:32px 0 10px}.r p{margin:0 0 20px}.r img{max-width:100%;height:auto;border-radius:6px;margin:12px 0}.r a{color:#0a60ff;text-decoration:none}.r blockquote{margin:0 0 20px;padding-left:18px;border-left:3px solid #d2d2d7;color:#515154}
  .r pre{font:14px/1.5 Menlo,monospace;background:#f2f2f2;padding:14px;border-radius:8px;overflow:auto}.r li{margin:0 0 8px}.r figcaption{font:13px -apple-system,sans-serif;color:#86868b}
  </style></head><body><div class="r"><h1>${title}</h1><p class="src">${host}</p>${body}</div></body></html>`;
}

export async function GET(req: Request) {
  await requireUser();
  const q = new URL(req.url).searchParams;
  const raw = q.get("url") || "";
  const reader = q.get("reader") === "1";
  const target = await safeTarget(raw);
  if (typeof target === "string") return page(`<h1>Safari cannot open the page</h1><p>${target}</p>`, 400);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(target, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-GB,en;q=0.8" }, redirect: "follow", signal: ac.signal });
  } catch (e) {
    clearTimeout(t);
    return page(`<h1>Safari cannot open the page</h1><p>Safari cannot open the page because the server ${target.hostname} ${e instanceof Error && e.name === "AbortError" ? "did not respond in time" : "could not be reached"}.</p>`, 502, target.href);
  }
  clearTimeout(t);
  const final = res.url || target.href;
  const type = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return page(`<h1>Page too large</h1><p>This page is over 4 MB and was not loaded.</p>`, 413, final);
  if (!/text\/html|application\/xhtml/i.test(type)) {
    return new Response(buf, { status: res.status, headers: { "content-type": type || "application/octet-stream", "cache-control": "no-store", "x-aic-url": final } });
  }
  let html = buf.toString(/charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() === "iso-8859-1" ? "latin1" : "utf8");
  const title = /<title[^>]*>([^<]{0,160})/i.exec(html)?.[1]?.trim().replace(/\s+/g, " ") ?? target.hostname;
  if (reader) return new Response(readerHtml(html, final, title), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aic-url": final } });
  html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  html = html.replace(/<base\b[^>]*>/gi, "");
  const head = `<base href="${final.replace(/"/g, "&quot;")}" target="_self">${INJECT}`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  else html = head + html;
  return new Response(html, { status: res.status >= 400 ? res.status : 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aic-url": final, "x-aic-title": encodeURIComponent(title) } });
}

function page(body: string, status: number, url = "") {
  return new Response(`<!doctype html><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#6e6e73;text-align:center;padding:120px 24px;background:#fff}h1{font-size:22px;color:#1d1d1f;font-weight:600}p{font-size:14px;max-width:420px;margin:8px auto}</style>${body}`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aic-url": url } });
}
