# Signalpost · Sonrisa homework

A desktop browser extension connects Google Alerts RSS subscriptions to a
small notification server. Users manage alerts in Google's UI, synchronize
the entire feed catalog, and route new entries to email or Slack. The
extension also contains the administrator view.

**Stack:** Plasmo, React, strict TypeScript, tRPC, Better Auth OSS, SQLite,
pnpm. One repository; no paid SDK, authentication service, queue, or broker.
Chrome/Chromium is the first target. Safari and mobile are outside this pilot.
The GUI includes English and Hungarian, browser-local language selection,
and RTL-ready layout; additional languages use typed translation catalogues.

## Run locally

Use Node 24 and pnpm 10.28.2. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:resilience
pnpm --filter @signalpost/extension package
cp etc/signalpost.env.example etc/signalpost.env
chmod 600 etc/signalpost.env
pnpm start
```

Load `src/extension/build/chrome-mv3-prod` as an unpacked extension in
`chrome://extensions` (Developer mode). Copy its ID to `EXTENSION_IDS`
in the local configuration. Configure a Google **Web application** OAuth
client, its client ID/secret, `BETTER_AUTH_SECRET`, and the callback
`http://localhost:3000/api/auth/callback/google`. Restart the server.

The health endpoint works before OAuth is configured. Sign-in does not:
it presents the missing configuration instead of using a fake user.
Email requires a working OS mail transport and `MAIL_FROM`; Slack requires
an incoming webhook, entered through the extension. Credentials belong in
ignored local configuration or the local protected database, never in Git.

Open the extension's Options page to sign in and configure destinations.
Click its toolbar icon on Google Alerts to synchronize. On another page,
the icon opens Google Alerts. The entire end-user flow, keyboard shortcuts,
configuration and operational limits are in the handover documents below.

## Handover and review

- [Operator guide](share/doc/sonrisa/handover/operator-guide.md)
- [Google Alerts and extension guide](share/doc/sonrisa/handover/user-guide.md)
- [Localization and adding languages](share/doc/sonrisa/handover/localization.md)
- [Architecture and tradeoffs](share/doc/sonrisa/handover/architecture.md)
- [Verification evidence](share/doc/sonrisa/handover/verification.md)
- [Original assignment and email](share/doc/sonrisa/sources/)
- [Prompt history](share/doc/sonrisa/prompts/)
- [Decision and correction log](share/doc/sonrisa/process/)

This is an implemented local pilot. Live Google OAuth, Slack acceptance and
email inbox delivery require operator configuration and separate acceptance
checks; a green unit suite does not establish those external results.

## Repository layout

FHS directory roles are applied to this project prefix, recursively. This
is a project organization convention, not an operating-system root image.

| Path | Role |
| --- | --- |
| `src/contracts/src/` | Transport schemas and DTO types |
| `src/core/src/` | Server domain, SQLite adapter, feed engine, channels |
| `src/server/src/` | Authentication, authorization, tRPC and HTTP entry |
| `src/extension/src/` | Extension domain, browser adapters and React UI |
| `etc/` | Configuration examples; local secrets are ignored |
| `bin/`, `sbin/` | Developer and administrator utilities |
| `lib/`, `include/` | Library/header roles, reserved where unused |
| `share/doc/sonrisa/` | Durable specifications, decisions and handover |
| `share/test/` | Isolated process-probe worker |
| `var/lib/` | Runtime SQLite databases; ignored |
| `var/log/`, `var/cache/`, `var/tmp/`, `run/`, `tmp/` | Ignored runtime state |

Each subproject follows these roles for the directories it uses. Plasmo
owns its generated `.plasmo/` and `build/` directories; both are ignored.
One root Git repository versions every subproject. See [FHS 3.0](https://refspecs.linuxfoundation.org/FHS_3.0/fhs.html).
