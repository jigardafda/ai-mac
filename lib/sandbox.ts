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
    var m = e.data; if (!m || !m.aic || !pending[m.id]) return;
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
    notify: function (text) { return call('notify', { text: text }); }
  };
  window.addEventListener('error', function (e) { parent.postMessage({ aic: true, event: 'error', message: String(e.message) }, '*'); });
})();
</script>`;

/** Wraps generated HTML so the bridge is always present and the page fills the window. */
export function wrapApp(html: string): string {
  const base = `<style>html,body{margin:0;height:100%;}body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;font-size:13px;color:rgba(0,0,0,.85);user-select:none;}input,textarea,[contenteditable]{user-select:text;}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(0,0,0,.25);border-radius:8px;border:2px solid transparent;background-clip:padding-box}::-webkit-scrollbar-track{background:transparent}</style>`;
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
