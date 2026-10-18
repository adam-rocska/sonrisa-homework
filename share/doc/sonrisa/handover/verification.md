# Verification and acceptance boundary

Verified locally on 2026-10-18, macOS arm64, Node 24.13.0,
pnpm 10.28.2. Tests use fictional or isolated temporary data.

## Automated results

| Check | Result | What it establishes |
| --- | --- | --- |
| `pnpm typecheck` | PASS | Strict TypeScript across all packages and process probes |
| `pnpm lint` | PASS | ESLint, no explicit any and consistent type imports |
| `pnpm format:check` | PASS | Reproducible explicit formatting |
| `pnpm test` | **153 passed** | Core 54, server 48, extension 51; 22 test files |
| `pnpm build` | PASS | Server/contracts/core type validation; Plasmo Chrome MV3 bundle |
| `pnpm test:resilience` | PASS | Actual SIGKILL during a leased delivery; durable retry after restart; no replay on another restart |
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
production server. The Google round trip is separate and remains unverified.

## Browser inspection

The actual compiled Options bundle was rendered in the in-app browser,
with an **unshipped**, visibly labeled local fixture replacing Chrome APIs
and tRPC responses. It is a UI test, not a claim that a Chrome extension
was installed or that real authentication/delivery completed.

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

## Remaining live acceptance work

These require operator-supplied configuration and explicit target choices:

1. Load the packaged extension in actual Chrome and set its ID on the server.
2. Configure Google Web OAuth and complete real login/logout.
3. Test real toolbar click/manual sync and mutation-driven sync on Google
   Alerts, including browser host permissions and native notifications.
4. Configure the local MTA and a Slack webhook, route a feed, await a new
   item after baseline, and independently confirm inbox/channel receipt.
5. Exercise the chosen administrator account and a non-admin account.

The handover is complete as a guide to the implemented flow, with these
external checks explicitly outstanding. No claim of live delivery, public
deployment, store approval, Safari support or mobile support is made.

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
rendering and a real Google OAuth round trip remain in the live acceptance
list above; the unit tests cover their localization boundaries.

See [localization and adding languages](localization.md), the
[Hungarian preview](signalpost-hu.png) and [RTL preview](signalpost-hu-rtl.png).
