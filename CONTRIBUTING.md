# Contributing to AI Mac

Thanks for wanting to help. This is a small, opinionated experiment, so a short conversation before a large change saves everyone time. Typo fixes, bug fixes and new shipped apps can go straight to a pull request.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). To report a security problem, use [SECURITY.md](SECURITY.md) and **not** a public issue.

## Getting set up

You need Node 24+ and Postgres (`docker compose up -d` gives you one).

```bash
git clone https://github.com/<you>/ai-mac.git && cd ai-mac
docker compose up -d
cp .env.example .env.local        # set SESSION_SECRET: openssl rand -hex 32
npm install
npm run dev                       # http://localhost:3000
```

In development the sign-in code is printed in the terminal. You do not need an OpenAI key unless you are working on generation.

## Before you open a pull request

Every change must pass the same checks CI runs:

```bash
npm run lint
npm run typecheck
npm run build
npm audit --omit=dev      # no known vulnerabilities in production dependencies
```

Also:

- **Run it.** Type-checking proves the code compiles, not that the feature works. Open the app and use what you changed. Say in the pull request what you tried.
- **Keep it small.** One change per pull request. Do not mix a refactor with a fix.
- **Match the surrounding code:** naming, comment density and idiom. Comments explain *why*, not *what*.
- **Never commit secrets** or real user data, including in screenshots and test fixtures. `.env*` is git-ignored except `.env.example`.
- **Update the docs** (README, `.env.example`, comments) when behaviour or configuration changes.
- **Add a CHANGELOG entry** under *Unreleased* for anything a user would notice.

Commit messages: a short imperative summary line, then a paragraph on *why* if it is not obvious. Describe the problem, not just the diff.

## Adding or fixing a shipped app

The default apps live in `templates/<slug>.html`, one self-contained HTML file each, with all CSS and JS inline and no external scripts. Their briefs are in `lib/catalog.ts`. Desktops that installed a template follow it: when you fix the file, the next open picks the fix up as a new version.

The rules for an app are the same as the model's (see the system prompt in `lib/generate.ts`): runs inside the sandboxed frame, talks to the desktop only through `window.aic`, never uses `alert`/`confirm`/`prompt`, collapses sidebars under 760px, and has no console errors on load. `lib/check.ts` shows how an app is exercised in a headless browser.

When you fix behaviour, prove it. The Bomberman enemy fix was verified by simulating the game's own movement code headlessly before and after; that kind of evidence is what we look for.

## Security-sensitive areas

Take extra care, and expect a closer review, when you touch:

- `lib/sandbox.ts` (the validator and the frame bridge) and `components/AppWindow.tsx`. The sandbox must never gain `allow-same-origin`.
- `app/api/browse/route.ts` (an SSRF boundary).
- `lib/otp.ts`, `lib/auth.ts` and `app/api/auth/*` (sign-in).
- `next.config.ts` (security headers).

Do not weaken a limit, a check or a header to make something work without discussing it in the pull request.

## Reporting bugs and proposing features

Use the issue templates. For a bug, include what you did, what you expected, what happened, and your Node and browser versions. For a feature, say what problem it solves before describing the solution.

## Code review

A maintainer will review when they can. Expect questions and requests for changes; they are about the code, not you. Pull requests that go quiet for a month may be closed, and you are welcome to reopen them.
