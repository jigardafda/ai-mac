# AI Computer

A desktop in the browser whose apps do not exist until you open them.

Sign in, and you get a Mac-style desktop with a dock and a set of icons: Notes, Calculator, Todo, Calendar, Weather, Paint, Music. None of those apps is written yet. Double-click one and a model writes it in front of you (about a minute), it opens, and from then on it loads from your own cache in a few milliseconds. Every user has their own desktop, their own copies of the apps, their own data. "New app" turns a sentence into a new icon. "Improve" rewrites an app the way you ask and keeps the old versions.

This is an experiment, not a product.

## How it works

- **Next.js 16** (App Router, TypeScript) serves the desktop and the API. **Postgres** stores users, apps, app versions (the generated code) and app data.
- **Generation**: `lib/generate.ts` asks the code model (`gpt-5.5` by default) for one self-contained HTML document per app: inline CSS and JS, no frameworks, no external scripts. The response streams back to the window so you watch the code being written. `validateApp` rejects anything that reaches for the parent page, cookies or external scripts.
- **Sandbox**: an app runs in `<iframe sandbox="allow-scripts">` via `srcdoc`, so it has no origin and cannot touch the desktop or your session. The host injects a small bridge (`lib/sandbox.ts`) that gives the app `window.aic`:
  - `aic.storage.get / set / keys` — per-app JSON storage on the server
  - `aic.ask(prompt)` — a short answer from a cheaper chat model
  - `aic.open(slug)`, `aic.setTitle(text)`, `aic.notify(text)`
  Everything goes over `postMessage` with request ids; the host answers through the normal authenticated API.
- **Caching**: the first open builds version 1 and stores it. Later opens fetch `GET /api/apps/<slug>` and get the stored HTML. "Improve" and "Rebuild" create new versions; `/api/apps/<slug>/versions` lists them and can roll back.
- **Images**: the wallpaper and the default icons were generated once with the image model and live in `public/`. Icons for new apps are generated when the app is created.

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
| `SESSION_SECRET` | signs the session cookie |
| `OPENAI_API_KEY` | used for code, chat and images |
| `CODE_MODEL` | default `gpt-5.5` |
| `CHAT_MODEL` | default `gpt-5.4-mini`, used by `aic.ask` |
| `IMAGE_MODEL` | default `gpt-image-2`, used for new app icons |
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

## Known limits

- A build takes about a minute and costs a model call; a desktop with many users builds each app once per user.
- Apps are single HTML files under roughly 900 lines, so they stay small by design.
- Generated code is reviewed by a validator, not by a person. Keep this on a trusted network.
