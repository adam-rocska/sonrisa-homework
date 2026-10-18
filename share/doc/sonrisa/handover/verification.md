# Verification and acceptance boundary

Verified locally on 2026-10-18, macOS arm64, Node 24.13.0,
pnpm 10.28.2. Automated tests use fictional or isolated temporary data.
The separately recorded native Chrome acceptance used the real local
installation and Google account, with the owner completing consent.

## Latest deployment follow-up

The [deployment verification](../process/2026-10-18-deployment-verification.md)
supersedes the earlier 156-test count below: **202 tests in 27 files** now
pass with the full check, all existing process probes, actual Pulumi provider
rendering and Chrome packaging. A standalone production package also passed
startup/SQLite/health/shutdown checks. A Linux image or live cluster has not
been deployed. The table below is retained as the earlier application
checkpoint; the linked follow-up contains the current totals and limits.

## Automated results — original application checkpoint

All checks below were rerun together after the final application changes,
at approximately 22:05 Europe/Budapest on 2026-10-18. See the
[final release record](../process/2026-10-18-final-release.md).

| Check | Result | What it establishes |
| --- | --- | --- |
| `pnpm typecheck` | PASS | Strict TypeScript across all packages and process probes |
| `pnpm lint` | PASS | ESLint, no explicit any and consistent type imports |
| `pnpm format:check` | PASS | Reproducible explicit formatting |
| Unit suites | **156 passed in one final run** | Core 54, server 48, extension 54; 23 test files |
| `pnpm build` | PASS | Server/contracts/core type validation; Plasmo Chrome MV3 bundle |
| `pnpm test:resilience` | PASS | Actual SIGKILL during a leased delivery; durable retry after restart; no replay on another restart |
| `pnpm test:delivery` | PASS | Isolated RSS HTTP → SQLite → actual email subprocess and Slack HTTP adapter; 429/retry/restart/deduplication |
| `pnpm test:http` | PASS | Separate actual server process, health, auth rejection, body/batch limits, 100 concurrent requests, graceful SIGTERM |
| `pnpm --filter @signalpost/extension package` | PASS | Unpacked Chrome directory and ZIP produced |

Server-side TypeScript runs through the pinned `tsx` loader; its build
command validates source rather than pretending to emit a separate server
binary. The extension build emits the actual installable assets.

The contracts package's schema behavior is exercised by server/extension
boundary tests; it does not have a separate test suite. The application
packages fail their test command if their tests disappear.

The HTTP process probe observed health 200, anonymous catalog 401,
oversized body 413, 21-procedure batch 400, 100/100 concurrent requests
successful and SIGTERM exit 0. Timing is a local observation, not a
throughput SLA. The SQLite crash probe uses a file sink and a deterministic
clock jump across the lease boundary, not a real mail service.

## Actual library boundary

Tests instantiate Better Auth 1.7.10 and its SQLite adapter, migrate the
schema, create a local test-only session, authenticate a bearer request,
and verify sign-out revocation. No fake-user bypass exists in the
production server. The real Google round trip was subsequently verified
through the installed Chrome extension, as recorded below.

## Earlier fixture browser inspection

The actual compiled Options bundle was rendered in the in-app browser,
with an **unshipped**, visibly labeled local fixture replacing Chrome APIs
and tRPC responses. It is a UI test, not a claim that a Chrome extension
was installed or that real authentication/delivery completed during that
fixture inspection. The later native Chrome check is separate below.

Observed and exercised:

- My feeds, routing controls, destinations, activity, settings and admin UI.
- Legible high-contrast default styling, labeled native controls and visible
  keyboard focus in the available narrow desktop pane.
- Cmd+K opens Commands; choosing Settings moves focus to its heading.
- A fictional email destination is added and visibly appears after save.
- A failed fictional delivery transitions to pending after admin retry.
- Explicit all-feed clearing is disabled until its confirmation is checked.
- The final bundle loads after fixing a real Parcel/Zod export failure.

The screenshot is [a fixture preview](signalpost-preview.png), not live user
data. Automated shortcut tests cover Windows Ctrl and macOS Cmd choices;
this is not a complete screen-reader certification or installed-browser
permission test.

Separately, the already-open real Google Alerts DOM was inspected read-only.
It confirmed signed-in markup, query spans and RSS anchors in the owner's
current page. No alert setting was changed. Signed-out variants, a zero-row
empty marker and future Google DOM changes were not assumed verified.
The extractor refuses uncertain destructive snapshots.

## Native Chrome acceptance on 2026-10-18

The unpacked canonical build was installed and pinned in actual Chrome.
Google Web OAuth was configured for the local server; the owner personally
completed Google consent. The server health endpoint reported configured
authentication, and the extension displayed the signed-in user and the
Administration view. Hungarian was selected and persisted. In native
Chrome, Cmd+K opened the localized Commands dialog; Escape closed it and
returned focus to the content. Reloading Options with Cmd+R retained the
signed-in account, admin navigation, Hungarian preference, both imported
feeds and their latest polling timestamps.

The toolbar opened Google Alerts from Options. Page-load automatic sync
imported two RSS alerts and skipped one email-only alert. The already-open
Options page updated without a reload after the live-sync fix. A manual
toolbar sync at 21:47:05 Europe/Budapest (19:47:05 UTC) retained the same two
feeds. Read-only SQLite inspection independently confirmed one verified
user, one session, one catalog and two active feeds, both baselined without
errors. There were zero destinations and zero deliveries.

See [the live acceptance record](../process/2026-10-18-live-acceptance.md)
for configuration identifiers, observations and explicit limits. No client
secret, session token, account email or personal feed URL is included there.

## Remaining live acceptance work

1. Complete live logout and a new login; exercise a separate non-admin
   account. Unit tests cover revocation and authorization, but these live
   paths have not yet been exercised.
2. Deliberately edit an alert through Google's UI and observe mutation-driven
   sync. Page-load automatic sync and manual toolbar sync passed; the
   deliberate-edit path and native OS notification visibility remain
   unverified.
3. Configure the local MTA and a Slack webhook, route a feed, await a new
   item after baseline, and independently confirm inbox/channel receipt
   through those production transports.

The handover documents the implemented flow and the completed local
acceptance. It does not claim final delivery through production SMTP or an
actual Slack workspace, public deployment, store approval, Safari support
or mobile support. The later connector-assisted receipt is separate below.

## Dependency status

See the [dependency assessment](../process/dependency-advisories.md) and
saved audit outputs beside it. The production and complete build graphs are
reported separately. Retained build-tool advisories are not hidden by a
successful compiler/test result. Any later dependency update requires a
fresh build and browser runtime check, not only an install command.

## Localization follow-up

The EN/HU localization follow-up passed the full `pnpm check` and Chrome
packaging. The final timestamp/shortcut wrapping adjustment then passed
extension typechecking, targeted lint, formatting and a rebuilt package.
No dependency was added or upgraded for localization.

The actual compiled bundle was checked again in the labeled local UI
fixture. Observed: automatic Hungarian selection, explicit English switch,
translated cached sync counts and dates, English persisting across reload,
Hungarian with explicit RTL persisting across reload, Cmd+K command dialog,
and saving a fictional Arabic/Latin destination name. At the available
663px pane width, document scroll width equals client width in both LTR
and RTL. The final preview is Hungarian with automatic direction.
The unshipped fixture persists only its language/layout preferences in
browser local storage; its API/account/delivery data remain fictional.

Browser inspection caught two wrapping issues, corrected before handover:
keep status timestamps together, and keep each keyboard chord with its own
label in a semantic list. The compiled manifest includes both native
`_locales/en` and `_locales/hu` catalogues. Actual Chrome-native notification
rendering remains in the live acceptance list above. The subsequent real
Google OAuth round trip passed; the unit tests also cover the localization
boundaries of both flows.

See [localization and adding languages](localization.md), the
[Hungarian preview](signalpost-hu.png) and [RTL preview](signalpost-hu-rtl.png).

## Destination delivery follow-up

The [controlled delivery probe](../process/2026-10-18-delivery-probe.md)
passed with both real adapters and isolated process/HTTP receivers. It
verified quiet baseline, one new-item delivery per destination, Slack 429
backoff, persistence across restart and no replay of accepted work.

A [separate connector-assisted Gmail receipt](../process/2026-10-18-gmail-receipt.md)
also passed: the exact generated subject/body reached the owner’s inbox.
This was an explicit relay through the existing Gmail connector, not the
production sendmail transport. The local MTA is not configured/running;
real Slack acceptance and normal SMTP delivery remain unverified.
