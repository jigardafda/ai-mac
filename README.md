# AI Mac

A desktop in the browser whose apps do not exist until you open them.

Sign in with your name and email (a six digit code arrives by email, no password), and you get a Mac-style desktop with a dock and a set of icons: Notes, Calculator, Todo, Calendar, Weather, Paint, Music. None of those apps is written yet. Double-click one and a model writes it in front of you (about a minute), it opens, and from then on it loads from your own cache in a few milliseconds. Every user has their own desktop, their own copies of the apps, their own data. "New app" turns a sentence into a new icon. "Improve" rewrites an app the way you ask and keeps the old versions.

This is an experiment, not a product.

## How it works

- **Next.js 16** (App Router, TypeScript) serves the desktop and the API. **Postgres** stores users, apps, app versions (the generated code) and app data.
- **Generation**: `lib/generate.ts` asks the code model (`gpt-5.5` by default) for one self-contained HTML document per app: inline CSS and JS, no frameworks, no external scripts. The response streams back to the window so you watch the code being written. `validateApp` rejects anything that reaches for the parent page, cookies or external scripts.
- **Sandbox**: an app runs in `<iframe sandbox="allow-scripts">` via `srcdoc`, so it has no origin and cannot touch the desktop or your session. The host injects a small bridge (`lib/sandbox.ts`) that gives the app `window.aic`:
  - `aic.storage.get / set / keys` — per-app JSON storage on the server
  - `aic.ask(prompt)` — a short answer from a cheaper chat model
  - `aic.open(slug)`, `aic.setTitle(text)`, `aic.notify(text)`
  Everything goes over `postMessage` with request ids; the host answers through the normal authenticated API.
- **Shipped builds**: every default app also has a reviewed build in `templates/<slug>.html`. The first open installs that copy in a few hundred milliseconds, so a new desktop works at once; "Rebuild From Scratch" in the app menu writes a fresh one from the brief instead. Bomberman and Road Rash ship the same way.
- **Caching**: the first open builds version 1 and stores it. Later opens fetch `GET /api/apps/<slug>` and get the stored HTML. "Improve" and "Rebuild" create new versions; `/api/apps/<slug>/versions` lists them and can roll back.
- **Images**: the wallpaper and the default icons were generated once with the image model and live in `public/`. Icons for new apps are generated when the app is created.

## The life of an app

```
double-click icon
      |
      v
GET /api/apps/<slug> ---- version stored? ----yes----> HTML from your cache (milliseconds)
      |                                                       |
      no                                                      v
      |                                              <iframe sandbox="allow-scripts" srcdoc>
      v                                                       ^
template in templates/<slug>.html?  --yes--> installed as v1 --+
      |
      no
      v
build job (lib/jobs.ts) --> model streams the code --> validate --> run in headless Chromium
                                  |                                        |
                                  v                                        v
                      code appears in the window            problems? one automatic fix pass
                                                                           |
                                                                           v
                                                           stored as version N, app opens
```

1. **Open.** The desktop asks the API for the app. If a version is stored, its HTML comes straight back and renders in a sandboxed frame.
2. **Install or build.** With no stored version, a reviewed template is installed if one ships for that slug; otherwise a build job starts. "New app" first asks the model to turn your sentence into a name, slug, brief and icon prompt (`designApp`).
3. **Stream.** The model writes one HTML document and the chunks stream to the window as they arrive, so you watch the app being written.
4. **Validate.** `validateApp` rejects documents that are too small or too large, have no markup, reach for `parent.location`, `top.location`, `window.top` or `document.cookie`, or load an external `<script src>`.
5. **Check.** `lib/check.ts` loads the app in headless Chromium with a stubbed `window.aic`, waits about two seconds, and reports uncaught exceptions, console errors, a blank page and horizontal overflow at 1000px and 560px wide.
6. **Fix.** If the check found problems, the model gets one chance to fix them. The fixed version is kept only if it has fewer problems than the first.
7. **Store.** The result is saved as a new row in `app_versions` and becomes the app's current version.

### Builds are jobs, not requests

A build runs as a server-side job that outlives the HTTP request that started it (`lib/jobs.ts`). Close the window, reload the page or open the same app twice and you attach to the same job, which replays what has been written so far and then follows it live. A build cannot be lost or started twice. Finished jobs stay attachable for 30 seconds for late reloads, and a job that has not finished after 12 minutes is treated as abandoned. Jobs live in process memory, so this assumes one server instance.

### Versions

Every build, "Improve" and "Rebuild From Scratch" writes a new version with the prompt and model that produced it. `GET /api/apps/<slug>/versions` lists them and can roll back, so an improvement that goes wrong costs one click.

## The model's rulebook

The system prompt in `lib/generate.ts` is most of the product. It tells the model to return one complete HTML document with everything inline, no frameworks and no external scripts, and to behave like a real macOS app: system font and 13px body text, the standard control sizes and colours, SF Symbols-style inline SVG icons, subtle hover and press motion, sidebars that collapse under 760px, and no `alert`, `confirm` or `prompt`. It also carries rules learnt from user testing, such as saving once on Enter, showing a quiet "Saved" confirmation, never showing a dead-end control, and writing dates with the month as a word.

## Data model

Postgres holds everything. The schema is created on first use (`ensureSchema` in `lib/db.ts`), and every statement is idempotent, so there are no migrations to run.

| Table | Holds |
| --- | --- |
| `users` | email and a bcrypt password hash |
| `apps` | one row per user per app: slug, name, brief, icon, dock position, current version, soft-delete time |
| `app_versions` | the generated HTML for each version, with the prompt and model that wrote it |
| `app_data` | per-app key and JSON value, the storage behind `aic.storage` |
| `user_settings` | wallpaper, dock contents and preferences |

Everything is keyed by user, so every account has its own desktop, its own copies of the apps and its own data. Sessions are a signed, HttpOnly, `Secure` cookie (`jose`, HS256, 14 days). There are no passwords: `login_codes` holds the pending sign-in codes.

## Security model

Generated code is untrusted code, so the design assumes the model can write something bad.

- **No origin.** Apps run in `<iframe sandbox="allow-scripts">` loaded through `srcdoc`. Without `allow-same-origin` the frame has an opaque origin: it cannot read your cookies, call the API as you, or touch the desktop page.
- **A narrow door.** The only way out is the `window.aic` bridge over `postMessage`. The host answers each request through the normal authenticated API, scoped to the signed-in user and that one app.
- **A validator and a runtime check** catch the obvious escapes and the obvious breakage before an app is stored.
- **The built-in browser is a proxy** (`app/api/browse/route.ts`). It refuses non-http(s) addresses, addresses with credentials, `localhost`, `.local` and `.internal` names, and any host that resolves to a private or link-local address. It caps responses at 4 MB, strips frame-blocking headers, and runs the page in its own sandboxed frame with an opaque origin so page scripts cannot reach your session.
- **Sign-in is an emailed code** (`lib/otp.ts`). The code is six digits from a CSPRNG, stored only as an HMAC, valid for 10 minutes, single use, and locked after 5 wrong tries (counted atomically, so parallel guesses cannot beat the limit). Requests are limited to one per 30 seconds and 5 per hour per address, and 20 per hour per IP. The response never says whether an address already has a desktop, and names are stripped of control characters and angle brackets and HTML-escaped in the email.
- **Hardened responses.** Every response carries HSTS, `nosniff`, `X-Frame-Options: SAMEORIGIN` and a `frame-ancestors 'self'` policy, a strict referrer policy and a locked-down permissions policy.
- **Secrets stay server-side.** The OpenAI key is only ever read by the server. Apps get a short answer from `aic.ask`, never a key.

This is still an experiment. The validator is a filter, not a proof. Do not point it at anything you cannot afford to lose.

## The built-in apps

Besides the generated apps, the desktop has a set of real, hand-written components in `components/`:

| App | What it is |
| --- | --- |
| Finder | browses your files, a small file system stored in Postgres (`lib/files.ts`), with the usual macOS folders and a Trash |
| TextEdit | edits the text files in that file system |
| Terminal | lists and reads the same files with `ls`, `cat` and friends |
| Safari | the proxy-backed browser, with Reader mode, find and zoom |
| Settings | wallpaper, dock and appearance preferences |
| Activity Monitor | shows running windows and builds |
| Presentation | a short deck about the project |

The menu bar, dock (with magnification and zoom-from-icon), window chrome and traffic lights are in `components/` too.

## Deploying

It runs as one Next.js service plus Postgres, for example on Railway: set `DATABASE_URL`, `SESSION_SECRET` and `OPENAI_API_KEY` as variables, deploy from this repository, and the schema creates itself on first request. Use Node 24 or newer (`.node-version` pins 26). Headless Chromium for the runtime check is optional: if Playwright cannot launch a browser, the check is skipped rather than blocking the build.

## Running it

```
docker run -d --name ai-computer-db -p 127.0.0.1:5495:5432 \
  -e POSTGRES_USER=aic -e POSTGRES_PASSWORD=<pw> -e POSTGRES_DB=ai_computer pgvector/pgvector:pg16
cp .env.example .env.local   # fill in DATABASE_URL, SESSION_SECRET, OPENAI_API_KEY
npm install
PORT=3700 npm run dev
```

The schema is created on first use. Open http://localhost:3700, create a desktop, double-click something.

Environment:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SESSION_SECRET` | signs the session cookie and keys the sign-in code hashes |
| `RESEND_API_KEY` | sends the sign-in emails through Resend |
| `MAIL_FROM` | sender, default `AI Mac <noreply@jigardafda.com>`; the domain must be verified in Resend |
| `OPENAI_API_KEY` | used for code, chat and images |
| `AIC_CODE_MODEL` | default `gpt-5.5` |
| `AIC_CHAT_MODEL` | default `gpt-5.4-mini`, used by `aic.ask` |
| `AIC_IMAGE_MODEL` | default `gpt-image-2`, used for new app icons |
| `DEV_ORIGINS` | comma separated hosts allowed to reach the dev server |

## Layout

```
app/              pages and API routes
  login/          email and password sign in
  desktop/        the desktop page
  api/auth/       signup, login, logout
  api/apps/       list, create; per app: get or build, improve, data, ask, versions
components/       Desktop (menu bar, icons, dock, windows) and AppWindow (iframe, bridge, build UI)
lib/              db, auth, catalog of default apps, generation, sandbox bridge, icons
public/           generated wallpaper and icons
```

## How the look is kept honest

The shell follows macOS measurements (24px menu bar, 28px title bar, 12px traffic lights 8px apart, 22px menu rows, dock magnification, zoom-from-icon, minimise-to-dock). Each default app's brief in `lib/catalog.ts` names the real macOS app and describes its layout, and the system prompt in `lib/generate.ts` carries a macOS design system (colours, control sizes, typography, motion).

To check fidelity, screenshots of each app are taken with Playwright and reviewed by a second model (Codex CLI, `codex exec -i screenshot.png`), which lists the most visible differences from the real app. Those findings go back into the briefs, and "Rebuild" writes the app again. The default apps always build from the current brief, so an old desktop picks up improvements when it rebuilds.

## Known limits

- A build takes about a minute and costs a model call; a desktop with many users builds each app once per user.
- Apps are single HTML files under roughly 900 lines, so they stay small by design.
- Generated code is reviewed by a validator, not by a person. Keep this on a trusted network.
