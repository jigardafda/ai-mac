# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- A real Linux: the Terminal app is now **Linux** (penguin icon) and opens straight into a Linux 6.8 (i686) kernel and busybox shell, running in the browser through the v86 emulator, with the macOS-style shell one click away (and as the fallback if the image is missing). Mac-style commands work inside it (`open`, `pbcopy`, `say`, `ask`, `sw_vers`), and Cmd+K, Cmd+C and Option-as-Meta behave as in Terminal.app. No network, RAM disk, no special headers. See `THIRD_PARTY_NOTICES.md` for licences.
- AI Mac logo, favicon and Apple touch icon; the logo is on the sign-in card and in the menu bar.
- Open-source project files: MIT license, contributing guide, code of conduct, security policy, issue and pull request templates, CI, CodeQL and Dependabot.
- README rewritten with screenshots, a tour GIF, an architecture diagram and a quick start.
- `docker-compose.yml` for local Postgres and a complete `.env.example`.

- Read-only admin panel at `/admin`, limited to the addresses in `ADMIN_EMAILS` and signed into with an emailed code: totals, users, the apps people made and what they asked for.

### Changed
- Sign in with an emailed six digit code instead of a password: enter your email, then the code; a new address is also asked for a first name, prefilled from the email. Codes are single use, expire after 10 minutes, are stored only as an HMAC and are bound to the requesting browser.
- Dependencies and Node updated to the latest (Node 24+, Next 16, React 19, TypeScript 6); production dependencies report no known vulnerabilities.
- Security headers on every response and a `Secure` session cookie in production.
- The OpenAI client is created on first use, so the desktop and every shipped app work without an API key.

### Fixed
- The Safari app rendered other sites unstyled with broken images: the new Content-Security-Policy blocked the `<base>` tag the proxy injects. `/api/browse` now has its own narrower policy.
- The per-address cooldown and hourly budget for codes are kept per purpose, so anyone requesting sign-in codes for an address can no longer use up its admin budget and lock an admin out.
- Sign-in and admin codes are bound to their purpose, so one cannot be used for the other.
- A burst of parallel code requests could slip past the cooldown and hourly limits; they are now enforced under a lock.
- The admin sign-in request answers every address identically and instantly, so it no longer reveals which addresses are admins.
- A first-name check could be probed anonymously to learn whether an address had an account; it now needs a live code for that address.
- Bomberman enemies no longer freeze in place.

### Removed
- Password sign-up, sign-in and change-password routes, and the `bcryptjs` dependency.

## [0.1.0]

- First public version: a browser desktop whose apps are written by a model the first time they are opened, with versions, a sandboxed bridge and a headless check.
