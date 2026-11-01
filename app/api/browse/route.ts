import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { requireUser } from "@/lib/auth";

/**
 * The built-in browser loads pages through here so sites that refuse to be
 * framed still show. The document comes back with a <base> pointing at the
 * real site (so its images, styles and scripts load from there), its frame
 * blocking headers dropped, and a small script that routes link clicks and
 * form submissions back to the browser window. It runs in a sandboxed frame
 * with an opaque origin, so page scripts cannot reach this desktop's session.
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
function go(u){try{parent.postMessage({aicBrowse:true,type:'navigate',url:new URL(u,document.baseURI).href},'*')}catch(e){}}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;var h=a.getAttribute('href')||'';if(/^(javascript:|#|mailto:|tel:)/i.test(h))return;e.preventDefault();e.stopPropagation();go(a.href)},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.action)return;if((f.method||'get').toLowerCase()!=='get')return;e.preventDefault();var u=new URL(f.action,document.baseURI);var d=new FormData(f);d.forEach(function(v,k){if(typeof v==='string')u.searchParams.set(k,v)});go(u.href)},true);
window.open=function(u){if(u)go(u);return null};
document.addEventListener('DOMContentLoaded',function(){try{parent.postMessage({aicBrowse:true,type:'title',title:document.title},'*')}catch(e){}});
})();</script>`;

export async function GET(req: Request) {
  await requireUser();
  const raw = new URL(req.url).searchParams.get("url") || "";
  const target = await safeTarget(raw);
  if (typeof target === "string") return page(`<h1>Cannot open page</h1><p>${target}</p>`, 400);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 12000);
  let res: Response;
  try {
    res = await fetch(target, { headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*;q=0.8", "accept-language": "en-GB,en;q=0.8" }, redirect: "follow", signal: ac.signal });
  } catch (e) {
    clearTimeout(t);
    return page(`<h1>Safari cannot open the page</h1><p>${target.hostname} did not answer${e instanceof Error && e.name === "AbortError" ? " in time" : ""}.</p>`, 502, target.href);
  }
  clearTimeout(t);
  const final = res.url || target.href;
  const type = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return page(`<h1>Page too large</h1><p>This page is over 4 MB and was not loaded.</p>`, 413, final);
  if (!/text\/html|application\/xhtml/i.test(type)) {
    // Images, PDFs and the like: pass straight through.
    return new Response(buf, { status: res.status, headers: { "content-type": type || "application/octet-stream", "cache-control": "no-store", "x-aic-url": final } });
  }
  let html = buf.toString(/charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() === "iso-8859-1" ? "latin1" : "utf8");
  html = html.replace(/<meta[^>]+http-equiv=["']?content-security-policy["']?[^>]*>/gi, "");
  html = html.replace(/<base\b[^>]*>/gi, "");
  const head = `<base href="${final.replace(/"/g, "&quot;")}" target="_self">${INJECT}`;
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1>${head}`);
  else html = head + html;
  const title = /<title[^>]*>([^<]{0,120})/i.exec(html)?.[1]?.trim() ?? "";
  return new Response(html, { status: res.status >= 400 ? res.status : 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aic-url": final, "x-aic-title": encodeURIComponent(title) } });
}

function page(body: string, status: number, url = "") {
  return new Response(`<!doctype html><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#555;text-align:center;padding:80px 24px}h1{font-size:20px;color:#222}p{font-size:14px}</style>${body}`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-aic-url": url } });
}
