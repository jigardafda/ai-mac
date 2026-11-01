/**
 * Everything a generated app may use from the host lives behind `window.aic`.
 * The iframe runs with sandbox="allow-scripts" only, so it has no origin, no
 * cookies and no access to the parent page. All it can do is post messages.
 */
export const BRIDGE_SCRIPT = `
<script>
(function () {
  var pending = {}, seq = 0;
  function call(type, payload) {
    return new Promise(function (resolve, reject) {
      var id = ++seq; pending[id] = { resolve: resolve, reject: reject };
      parent.postMessage({ aic: true, id: id, type: type, payload: payload }, '*');
    });
  }
  window.addEventListener('message', function (e) {
    var m = e.data; if (!m || !m.aic) return;
    if (m.command === 'exec') { try { document.execCommand(m.name); } catch (err) {} return; }
    if (!pending[m.id]) return;
    var p = pending[m.id]; delete pending[m.id];
    m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
  });
  window.aic = {
    storage: {
      get: function (key) { return call('storage.get', { key: key }); },
      set: function (key, value) { return call('storage.set', { key: key, value: value }); },
      keys: function () { return call('storage.keys', {}); }
    },
    ask: function (prompt, options) { return call('ai.ask', { prompt: prompt, options: options || {} }); },
    open: function (slug) { return call('app.open', { slug: slug }); },
    setTitle: function (title) { return call('window.title', { title: title }); },
    setTitlebar: function (background, foreground) { return call('window.titlebar', { background: background, foreground: foreground }); },
    notify: function (text) { return call('notify', { text: text }); }
  };
  window.addEventListener('error', function (e) { parent.postMessage({ aic: true, event: 'error', message: String(e.message) }, '*'); });
  // The desktop owns a few global shortcuts and needs to know when the app is clicked.
  document.addEventListener('keydown', function (e) {
    var mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === ' ' || e.key === 'n' || e.key === 'N' || e.key === 'w' || e.key === 'W' || e.key === 'm' || e.key === 'M')) {
      e.preventDefault();
      parent.postMessage({ aic: true, event: 'key', key: e.key, ctrl: e.ctrlKey, meta: e.metaKey }, '*');
    }
  }, true);
  document.addEventListener('pointerdown', function () { parent.postMessage({ aic: true, event: 'focus' }, '*'); }, true);
  // Browser autofill and autocomplete history have no place in a desktop app.
  function quiet(root) {
    var els = root.querySelectorAll ? root.querySelectorAll('input, textarea, form') : [];
    for (var i = 0; i < els.length; i++) { els[i].setAttribute('autocomplete', 'off'); if (els[i].tagName !== 'FORM') { els[i].setAttribute('autocorrect', 'off'); els[i].setAttribute('spellcheck', 'false'); } }
    if (root.tagName === 'INPUT' || root.tagName === 'TEXTAREA' || root.tagName === 'FORM') root.setAttribute('autocomplete', 'off');
  }
  function watch() { quiet(document); new MutationObserver(function (ms) { ms.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType === 1) quiet(n); }); }); }).observe(document.documentElement, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
</script>`;

/**
 * macOS baseline every app inherits: system font, overlay scrollbars that only
 * show while the pointer is over a scrolling area, AppKit sized fields with the
 * blue focus ring, and layouts that cannot scroll sideways. Apps may restyle
 * on top of it, but a plain <input> already looks right.
 */
export const BASE_CSS = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;line-height:1.3;color:rgba(0,0,0,.85);user-select:none;overflow-x:hidden}
input,textarea,[contenteditable]{user-select:text}
/* overlay scrollbars like macOS: no track, thumb only while hovering the scroller */
*{scrollbar-width:thin;scrollbar-color:transparent transparent}
*:hover{scrollbar-color:rgba(0,0,0,.28) transparent}
::-webkit-scrollbar{width:9px;height:9px;background:transparent}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-corner{background:transparent}
::-webkit-scrollbar-thumb{background:transparent;border-radius:9px;border:2px solid transparent;background-clip:padding-box}
*:hover>::-webkit-scrollbar-thumb,*:hover::-webkit-scrollbar-thumb{background:rgba(0,0,0,.28);background-clip:padding-box}
/* AppKit controls */
input,select,textarea,button{font:inherit;color:inherit;max-width:100%;min-width:0}
input:where(:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file])),select,textarea{appearance:none;-webkit-appearance:none;height:28px;padding:0 9px;border:1px solid rgba(0,0,0,.14);border-radius:6px;background:#fff;box-shadow:inset 0 .5px 1px rgba(0,0,0,.06);outline:none;transition:box-shadow .12s,border-color .12s}
textarea{height:auto;min-height:64px;padding:6px 9px;line-height:1.4;resize:vertical}
select{padding-right:26px;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><rect x='1' y='1' width='14' height='14' rx='4' fill='%230a60ff'/><path d='M5 6.6l3-3 3 3M5 9.4l3 3 3-3' fill='none' stroke='white' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>");background-repeat:no-repeat;background-position:right 5px center;background-size:16px 16px}
input:focus,select:focus,textarea:focus{border-color:#007aff;box-shadow:0 0 0 3px rgba(0,122,255,.3)}
input::placeholder,textarea::placeholder{color:rgba(60,60,67,.45)}
input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none}
input[type=checkbox],input[type=radio]{width:14px;height:14px;margin:0 6px 0 0;accent-color:#0a60ff;vertical-align:-2px}
input[type=range]{height:auto;padding:0;border:0;background:none;box-shadow:none;accent-color:#0a60ff}
label{font-size:13px}
/* layouts never overflow sideways; grid and flex children shrink instead */
[style*="display:grid"]>*,[style*="display: grid"]>*,[style*="display:flex"]>*,[style*="display: flex"]>*{min-width:0}
img,canvas,svg,video{max-width:100%}
`.replace(/\n\s*/g, "");

/** Wraps generated HTML so the bridge is always present and the page fills the window. */
export function wrapApp(html: string): string {
  const base = `<style>${BASE_CSS}</style>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${base}${BRIDGE_SCRIPT}`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">${base}${BRIDGE_SCRIPT}</head><body>${html}</body></html>`;
}

/** Cheap checks on generated code before it is stored. */
export function validateApp(html: string): string | null {
  if (html.length < 400) return "The generated app is too small to be real.";
  if (html.length > 400_000) return "The generated app is too large.";
  if (!/<(div|main|section|canvas|body)/i.test(html)) return "The generated app has no markup.";
  const banned = [/parent\.location/i, /top\.location/i, /window\.top\b/i, /document\.cookie/i, /<script[^>]+src=/i];
  for (const re of banned) if (re.test(html)) return `The generated app uses something that is not allowed (${re.source}).`;
  return null;
}
