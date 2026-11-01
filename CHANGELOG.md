# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
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
- A first-name check could be probed anonymously to learn whether an address had an account; it now needs a live code for that address.
- Bomberman enemies no longer freeze in place.

### Removed
- Password sign-up, sign-in and change-password routes, and the `bcryptjs` dependency.

## [0.1.0]

- First public version: a browser desktop whose apps are written by a model the first time they are opened, with versions, a sandboxed bridge and a headless check.
