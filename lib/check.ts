import { chromium } from "playwright";

/**
 * Runs a freshly written app for a moment in a headless browser and reports
 * what a user would hit at once: uncaught exceptions, console errors and a
 * layout that overflows sideways. The host bridge is replaced by an in-memory
 * stub so the app can start as it would on the desktop.
 */
const STUB = `<script>
(function(){var store={};function ok(v){return Promise.resolve(v);}
window.aic={storage:{get:function(k){return ok(k in store?store[k]:null)},set:function(k,v){store[k]=v;return ok(true)},keys:function(){return ok(Object.keys(store))}},
ask:function(){return ok("")},open:function(){return ok(true)},setTitle:function(){return ok(true)},setTitlebar:function(){return ok(true)},notify:function(){return ok(true)}};
})();
</script>`;

export async function checkApp(html: string, { width = 1000, height = 700, settleMs = 1800 } = {}): Promise<string[]> {
  let browser;
  try {
    browser = await chromium.launch();
  } catch {
    return []; // no browser on this machine: skip the check rather than block the build
  }
  const problems: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on("pageerror", (e) => problems.push(`Uncaught: ${String(e.message || e).slice(0, 300)}`));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push(`Console error: ${m.text().slice(0, 300)}`); });
    const doc = /<head[^>]*>/i.test(html) ? html.replace(/<head([^>]*)>/i, `<head$1>${STUB}`) : `<!doctype html><html><head>${STUB}</head><body>${html}</body></html>`;
    await page.setContent(doc, { waitUntil: "load", timeout: 8000 });
    await page.waitForTimeout(settleMs);
    const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, text: (document.body?.innerText || "").trim().length }));
    if (overflow.sw > overflow.iw + 4) problems.push(`Layout overflows horizontally at ${width}px wide (scrollWidth ${overflow.sw}); nothing may scroll sideways.`);
    if (overflow.text === 0) problems.push("The page rendered no visible text at all after loading.");
    // A second look at a narrow size catches sidebars that refuse to collapse.
    await page.setViewportSize({ width: 560, height: 400 });
    await page.waitForTimeout(400);
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (narrow > 4) problems.push(`Layout overflows horizontally at 560px wide by ${narrow}px; collapse the sidebar below 760px.`);
  } catch (e) {
    problems.push(`Could not load: ${e instanceof Error ? e.message.slice(0, 200) : "unknown"}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return [...new Set(problems)].slice(0, 6);
}
