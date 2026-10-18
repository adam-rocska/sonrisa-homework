# Signalpost · Sonrisa homework

A desktop browser extension connects Google Alerts RSS subscriptions to a
small notification server. Users manage alerts in Google's UI, synchronize
the entire feed catalog, and route new entries to email or Slack. The
extension also contains the administrator view.

**Stack:** Plasmo, React, strict TypeScript, tRPC, Better Auth OSS, SQLite,
pnpm, Pulumi deployment adapters. One repository; no paid SDK, authentication service, queue, or broker.
Chrome/Chromium is the first target. Safari and mobile are outside this pilot.
The GUI includes English and Hungarian, browser-local language selection,
and RTL-ready layout; additional languages use typed translation catalogues.

## Suggested review path

Start with the [reviewer guide](share/doc/sonrisa/handover/reviewer-summary.md)
for the scoped result, key corrections and evidence boundaries.
A [one-page Hungarian summary](share/doc/sonrisa/handover/summary-hu.pdf)
describes the owner's reasoning and direction of the AI; its
[editable source](share/doc/sonrisa/handover/summary-hu.md) is included.

The assignment evaluates the reasoning and validation process. Continue with
[the original brief](share/doc/sonrisa/sources/assignment-extracted.txt),
then [the implementation plan](share/doc/sonrisa/process/2026-10-18-implementation-preflight.md)
and [decisions, rejected outputs and corrections](share/doc/sonrisa/process/2026-10-18-implementation-log.md).
The [verification record](share/doc/sonrisa/handover/verification.md) separates
automated checks, real Chrome acceptance and remaining external-service
checks. The handover links below explain how to reproduce and operate it.

## Run locally

Use Node 24 and pnpm 10.28.2. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:resilience
pnpm test:http
pnpm test:delivery
pnpm --filter @signalpost/extension package
cp -n etc/signalpost.env.example etc/signalpost.env
chmod 600 etc/signalpost.env
pnpm start
```

The copy command preserves an existing local configuration.

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

## Portable deployment

A separate Pulumi component deploys the same non-root OCI image to local
Docker or an explicitly selected existing Kubernetes cluster. The SQLite
volume survives workload replacement. Configuration, secrets, health checks
and one-writer rollout rules are mapped by adapters; application code stays
independent of cloud providers. Local Pulumi state needs no paid service.

See [portable deployment](share/doc/sonrisa/handover/deployment.md) and the
[stack operator guide](src/infrastructure/README.md). Docker engine and live
cluster acceptance remain explicitly unverified on this machine.

## Handover and review

- [Portable deployment](share/doc/sonrisa/handover/deployment.md)
- [Operator guide](share/doc/sonrisa/handover/operator-guide.md)
- [Google Alerts and extension guide](share/doc/sonrisa/handover/user-guide.md)
- [Localization and adding languages](share/doc/sonrisa/handover/localization.md)
- [Architecture and tradeoffs](share/doc/sonrisa/handover/architecture.md)
- [Verification evidence](share/doc/sonrisa/handover/verification.md)
- [Original assignment and email](share/doc/sonrisa/sources/)
- [Prompt history](share/doc/sonrisa/prompts/)
- [Decision and correction log](share/doc/sonrisa/process/)

This is an implemented local pilot. Live Chrome installation, Google OAuth
and Google Alerts import passed on the author’s local instance. The
controlled delivery probe exercises real adapter I/O against isolated
fixtures without a Slack account or SMTP service. External inbox/channel
receipt and the production mail transport are separate acceptance boundaries;
a green local probe does not establish them.

## Repository layout

FHS directory roles are applied to this project prefix, recursively. This
is a project organization convention, not an operating-system root image.

| Path                                                 | Role                                                                 |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| `src/contracts/src/`                                 | Transport schemas and DTO types                                      |
| `src/core/src/`                                      | Server domain, SQLite adapter, feed engine, channels                 |
| `src/server/src/`                                    | Authentication, authorization, tRPC and HTTP entry                   |
| `src/extension/src/`                                 | Extension domain, browser adapters and React UI                      |
| `src/infrastructure/`                                | Pulumi intent model, Docker/Kubernetes adapters and deployment tests |
| `etc/`                                               | Configuration examples; local secrets are ignored                    |
| `bin/`, `sbin/`                                      | Developer and administrator utilities                                |
| `lib/`, `include/`                                   | Library/header roles, reserved where unused                          |
| `share/doc/sonrisa/`                                 | Durable specifications, decisions and handover                       |
| `share/test/`                                        | Isolated process-probe worker                                        |
| `var/lib/`                                           | Runtime SQLite databases; ignored                                    |
| `var/log/`, `var/cache/`, `var/tmp/`, `run/`, `tmp/` | Ignored runtime state                                                |

Each subproject follows these roles for the directories it uses. Plasmo
owns its generated `.plasmo/` and `build/` directories; both are ignored.
One root Git repository versions every subproject. See [FHS 3.0](https://refspecs.linuxfoundation.org/FHS_3.0/fhs.html).
