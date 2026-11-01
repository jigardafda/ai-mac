# Security policy

## Reporting a vulnerability

**Please do not open a public issue, pull request or discussion for a security problem.**

Report it privately through GitHub: go to the [Security tab](https://github.com/jigardafda/ai-mac/security) of this repository and choose **Report a vulnerability** (private vulnerability reporting). Include:

- what the problem is and where (file, route or feature),
- how to reproduce it, with the smallest example you can,
- what an attacker could do with it, and
- any suggested fix.

You can expect an acknowledgement within **5 days** and a first assessment within **14 days**. We will keep you updated, agree a disclosure date with you, and credit you in the release notes if you would like that. Please give us a reasonable chance to fix the problem before you disclose it.

## Supported versions

Only the latest commit on `main` and the deployment at <https://ai-mac.jigardafda.com> are supported. There are no long-term support branches.

## What is in scope

The threat model is that **generated code is untrusted**. Reports we especially want:

- **Sandbox escapes:** a generated app reading cookies, calling the API as the user, reaching the desktop page, or navigating the top window. Apps must run in `<iframe sandbox="allow-scripts">` with no `allow-same-origin`.
- **Validator bypasses** in `lib/sandbox.ts` that let an app do something it forbids.
- **SSRF** through `/api/browse` (reaching private, link-local or loopback addresses, redirects to them, DNS rebinding).
- **Sign-in flaws:** guessing or replaying a code, bypassing the attempt or rate limits, account takeover, session fixation, or learning whether an address has an account faster than the documented rate limits allow. (The sign-in page deliberately tells new addresses from existing ones so it can ask for a first name.)
- **Cross-user access:** reading or changing another user's apps, versions, data or files.
- **Injection,** XSS, CSRF, header or cookie weaknesses, and leaking secrets in responses or logs.

## What is out of scope

- Findings that need a malicious *maintainer* or access to the server or database.
- Denial of service by sheer volume, and costs from an owner's own model usage.
- A generated app that is merely ugly, broken or wrong: that is a quality bug, so open a normal issue.
- Missing security headers on pages that serve no content, and reports from automated scanners with no demonstrated impact.
- Vulnerabilities in dependencies with no reachable path in this project (Dependabot tracks them).

## Safe harbour

If you act in good faith, stay within the scope above, avoid privacy violations and service disruption, and only use accounts you own or have permission to test, we will not take or support legal action against you.

## For people running their own instance

- Set a long random `SESSION_SECRET` (`openssl rand -hex 32`) and never reuse the development credentials in `docker-compose.yml`.
- Verify your sending domain (DKIM, SPF, DMARC) before enabling sign-in emails.
- Keep `OPENAI_API_KEY` and `RESEND_API_KEY` in your host's secret store, never in the repository.
- Treat generated apps as untrusted. Do not add `allow-same-origin` to the sandbox.
- Run a single instance unless you have moved the in-memory build jobs into shared storage.
