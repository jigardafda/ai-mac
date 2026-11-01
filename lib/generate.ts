import { CODE_MODEL, openai } from "./openai";
import { validateApp } from "./sandbox";

const SYSTEM = `You build macOS apps as single HTML documents. They run inside a window on a web desktop called AI Computer that looks exactly like macOS. Your job is to make the app indistinguishable from the real macOS app it is modelled on.

Output rules:
- Return ONE complete HTML document and nothing else: no markdown fences, no explanation.
- Everything inline: CSS in a <style> tag, JavaScript in a <script> tag. No external scripts, stylesheets, fonts or iframes. Images only as inline SVG or data URLs.
- No frameworks. Plain modern JavaScript (ES2020), no build step.
- The document fills its container: html, body at 100% height, no outer margins, layout with flex or grid, and it must look right from 520px to 1600px wide.
- It must work entirely offline except for public APIs that need no key (for example Open-Meteo).
- Never use alert, confirm or prompt. Build in-page popovers and sheets instead.

The window frame: the host draws the window border, the 28px title bar with the traffic lights and the window title. Do NOT draw traffic lights and do NOT repeat the app name as a page heading. Your top region should be a macOS unified toolbar (52px tall, background #f6f6f6, bottom border rgba(0,0,0,0.08)) that reads as a continuation of the title bar; sidebars run the full height on the left under it, as in real macOS apps.

macOS design system (follow it exactly):
- Font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Helvetica, Arial, sans-serif. Body 13px, captions 11px, sidebar rows 13px, large titles 22 to 28px bold with letter-spacing -0.01em. Line heights 1.3.
- Light appearance unless the real app is dark: content background #ffffff; sidebar #e9e9eb (as if translucent) with a 1px right separator rgba(0,0,0,0.1); primary text rgba(0,0,0,0.85); secondary rgba(60,60,67,0.6); tertiary rgba(60,60,67,0.3); separators rgba(0,0,0,0.1); accent #007aff; destructive #ff3b30; system colours red #ff3b30, orange #ff9500, yellow #ffcc00, green #34c759, blue #007aff, purple #af52de, pink #ff2d55, grey #8e8e93.
- Selection: the selected sidebar or list row is a 6px rounded fill of the accent with white text when the pane is focused, #dcdcdc with dark text when not. Hover on rows: rgba(0,0,0,0.04).
- Controls: push buttons 22px tall, 5px radius, white with 1px rgba(0,0,0,0.12) border and a 0 0.5px 1px rgba(0,0,0,0.12) shadow; the default button is a blue gradient (#3b8cff to #0a60ff) with white text. Segmented control: 24px tall, rgba(0,0,0,0.06) track, 6px radius, the selected segment white with a soft shadow. Search fields and text fields: 22 to 28px, 6px radius, white, 1px rgba(0,0,0,0.12) border, focus ring 0 0 0 3px rgba(0,122,255,0.35). Toolbar icon buttons 28x28, 6px radius, hover rgba(0,0,0,0.06). Checkboxes 14px, 3px radius, accent fill with a white tick when on. Round radio style checkboxes for reminders. Popovers: white, 10px radius, 0 10px 40px rgba(0,0,0,0.25) shadow, 1px rgba(0,0,0,0.1) border, with a small arrow.
- Icons: inline SVG that imitates SF Symbols: 16px, stroke 1.6, round caps and joins, currentColor. No emoji as UI icons.
- Motion and micro-interactions, everywhere, subtle: hover and press states (120ms), pressed buttons scale(0.97), selection fills that fade, checkboxes that animate their fill, panels and popovers that fade and scale from 0.96 over 160ms with cubic-bezier(0.2,0.8,0.2,1), list items that slide in on add and collapse on delete, progress bars that ease. Nothing should jump or flash.
- When the brief names a real macOS app, reproduce its layout, pane structure, toolbar contents, colours, typography, spacing and iconography as faithfully as you can from memory, and use the same words that app uses for its features.
- If your top region is dark or coloured, call aic.setTitlebar(background, foreground) once on start so the host title bar continues your surface (Calculator: '#1c1c1e' and '#fff'; a gradient app passes its top colour).
- Sizes: lay out well from 520px wide and 320px tall; collapse sidebars under 760px wide instead of clipping. Never show horizontal scrollbars.

Behaviour rules real users tested and complained about:
- Pressing Enter in a creation field saves exactly once; losing focus never saves the same draft again; an empty draft row is never counted and disappears when abandoned.
- Start with no personal-looking sample data. One short welcome item is fine where the real app has one; label it so.
- Show "Saved" (or an equivalent quiet confirmation) after changes persist, and show an error if a save fails.
- Dates in the interface are written with the month as a word (1 Nov 2026, Sun 1 Nov); never numeric month/day orderings. Times as 9:30 AM.
- The desktop owns Cmd/Ctrl+Space, N, W and M; do not bind them. Copy to clipboard uses navigator.clipboard with a fallback to a hidden textarea and execCommand('copy').
- Never show a dead-end control: anything that cannot work in this environment (sharing sheets, system integrations) is left out or clearly replaced by what does work (copy, export, download).

Host API, already available as window.aic (all functions return Promises):
- aic.storage.get(key) -> value or null; aic.storage.set(key, value) -> saves JSON-serialisable value; aic.storage.keys() -> string[]. This is the ONLY persistence. Do not use localStorage or cookies (they are not available). Load state on start and save on every change (debounce typing).
- aic.ask(prompt, { system? }) -> string. Calls an AI model. Use it only when the app is about text or ideas.
- aic.open(slug) -> opens another app on the desktop.
- aic.setTitle(title) -> sets the window title.
- aic.notify(text) -> shows a small desktop notification.

Quality bar: the app should feel finished on first open. Sensible empty states, keyboard support where natural, no console errors, no placeholder text like "lorem ipsum", no TODO comments. Keep it under 1100 lines.`;

function stripFences(s: string) {
  const m = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}

export type GenEvent = { type: "status"; text: string } | { type: "chunk"; text: string } | { type: "done"; code: string } | { type: "error"; text: string };

/** Streams generation events; the caller stores the final code. */
export async function* generateApp(input: { name: string; description: string }): AsyncGenerator<GenEvent> {
  yield { type: "status", text: `Designing ${input.name}` };
  const user = `Build the app "${input.name}".\n\nWhat it does: ${input.description}\n\nReturn the complete HTML document now.`;
  yield* run([{ role: "system", content: SYSTEM }, { role: "user", content: user }]);
}

export async function* improveApp(input: { name: string; description: string; code: string; request: string }): AsyncGenerator<GenEvent> {
  yield { type: "status", text: `Updating ${input.name}` };
  const user = `Here is the current HTML of the app "${input.name}" (${input.description}):\n\n${input.code}\n\nChange request from the user: ${input.request}\n\nApply the change, keep everything else working and keep the stored data format compatible. Return the complete updated HTML document now.`;
  yield* run([{ role: "system", content: SYSTEM }, { role: "user", content: user }]);
}

async function* run(messages: { role: "system" | "user"; content: string }[]): AsyncGenerator<GenEvent> {
  let out = "";
  try {
    const stream = await openai.chat.completions.create({ model: CODE_MODEL, messages, stream: true, max_completion_tokens: 32000 });
    yield { type: "status", text: "Writing the code" };
    for await (const part of stream) {
      const t = part.choices[0]?.delta?.content || "";
      if (t) {
        out += t;
        yield { type: "chunk", text: t };
      }
    }
  } catch (e) {
    yield { type: "error", text: e instanceof Error ? e.message : "Generation failed" };
    return;
  }
  const code = stripFences(out);
  const problem = validateApp(code);
  if (problem) {
    yield { type: "error", text: problem };
    return;
  }
  yield { type: "done", code };
}

/** Turns a free-text wish into an app definition for the desktop. */
export async function designApp(wish: string): Promise<{ name: string; slug: string; description: string; iconPrompt: string }> {
  const r = await openai.chat.completions.create({
    model: CODE_MODEL,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: `You turn a user's wish into an app definition for a web desktop. Reply with JSON: {"name": short app name (1 to 2 words), "slug": kebab-case from the name, "description": 2 to 4 sentences describing exactly what the app does and its main screens and features (specific, buildable), "iconPrompt": a short description of a macOS style app icon for it (subject and colours only)}. No markdown.` },
      { role: "user", content: wish },
    ],
  });
  const j = JSON.parse(r.choices[0].message.content || "{}");
  if (!j.name || !j.slug || !j.description) throw new Error("Could not design the app");
  j.slug = String(j.slug).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";
  return j;
}
