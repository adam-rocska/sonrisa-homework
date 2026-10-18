# Implementation preflight

Status: specification accepted; Plasmo and Chrome/Chromium confirmed.
Date: 2026-10-18.

## Verified live DOM

Read the already-open Safari Web Inspector accessibility tree without
changing the page or account settings. It exposes:

- `.main-page[data-signed_in="1"]` for the signed-in page.
- `#manage-alerts-div li.alert_instance` rows.
- Relative anchors beginning `/alerts/feeds/`.
- Each anchor inside `.delivery_settings_view`, alongside
  `.query_div span` containing the query text.
- Three alert rows, two exposing RSS links and one without an RSS link.
- `.show_all_alerts` / `.show_less_alerts` controls currently hidden.
  Before treating a snapshot as complete, handle or reject a visible
  show-all control. Never infer a complete empty snapshot from failure
  to recognize the page.

This verifies the proposed extraction shape on the user's current page.
It does not verify signed-out, other accounts, long lists or changed DOM.
Private feed URLs are not copied into fixtures or documentation.

## Framework stop condition

The user explicitly requested discussion before using a better alternative
to Plasmo. Primary release records show Plasmo 0.90.5 on 2025-05-17 and
WXT 0.21.4 on 2026-08-11. WXT has current companion releases, an official
React module, pnpm/TypeScript support, MIT licensing and `imports: false`.
Recommend WXT based on maintenance; do not silently substitute it.

- https://github.com/PlasmoHQ/plasmo/releases/tag/v0.90.5
- https://github.com/wxt-dev/wxt/releases/tag/wxt-v0.21.4
- https://wxt.dev/guide/essentials/config/auto-imports
- https://wxt.dev/guide/essentials/frontend-frameworks.html

Safari is the browser observed on the user's machine. Ask for the first
supported browser rather than silently treating desktop as Chromium-only.
Neither framework removes Safari's native packaging/verification step.

## Proposed implementation sequence after the decision

1. Capture the accepted specification and defaults before code. Bootstrap
   recursive FHS subprojects, pnpm, explicit imports, strict TypeScript,
   lint/format checks and deterministic unit-test tooling. Choose the
   working product name Signalpost and private package scope @signalpost.
2. Define wire schemas separately from server domain objects, SQLite rows
   and extension domain/UI models. Use explicit boundary mappers; avoid
   ORM records or transport DTOs flowing unchanged through the application.
3. Build transactional full-catalog replacement, owned subscriptions and
   independent destination/routing state. Retain routes for unchanged feed
   identity. No client-side patch protocol, no external broker.
4. Build bounded RSS/Atom polling and per-destination delivery/recovery
   state with a soft channel interface, Slack webhook and OS sendmail.
5. Add free self-hosted Better Auth Google sign-in and tRPC ownership/admin
   authorization. Google Alerts login and product login remain distinct.
6. Build the extension action, signed-in/readiness detection, full snapshot
   extraction, manual sync and debounced mutation/load sync; serialize
   requests so older snapshots cannot overtake newer ones from one client.
7. Add accessible React subscription/destination/admin screens and
   platform-aware keyboard commands without changing the specified action
   button semantics. Use an extension page/side panel for settings.
8. Run FIRST unit tests and a bounded black-box process-restart/failure
   probe. Package the extension and server, inspect the actual UI and
   write the complete operator/user handover, including Google Alerts.

## Proposed defaults and validation limits

- Full PUT applies to the connected source catalog, not user preferences
  or delivery history. No write for unknown, unsigned or incomplete DOM.
- Explicit source binding prevents silent replacement after Google-account
  switching. Source identity from a feed URL is not OAuth proof.
- Poll every 60 seconds initially, with bounded concurrency and failure
  backoff. Upstream publication latency is not controlled by our server.
- First successful fetch establishes a baseline without replaying history.
- Per-channel retries; a crash after external acceptance but before local
  commit can still duplicate delivery. Do not promise exactly-once.
- Email success means the configured local MTA accepted the message;
  real inbox receipt needs separate verification.
- Google OAuth client configuration and real Slack/MTA setup are external
  prerequisites for live tests. Do not fabricate success or solicit secrets
  into chat. Use ignored local configuration for credentials later.
- No paid Better Auth infrastructure or plugins; MIT core and bundled OSS
  plugins only. No Twilio dependency now. Discuss Twilio as a future option
  in handover, with pricing/fit checked at adoption rather than guaranteed.
- Focus failure tests on crash/restart, destination 429/500/timeouts and
  bounded load. Replacing installed dependencies in a running process is
  not a supported deployment procedure; test versioned restart instead.
- Mobile is explicitly out of scope. Do not add manual URL entry as a
  requirement: the user's mandatory fallback is manual full sync.

## Research performed in parallel

Three read-only agents reviewed framework choice, free authentication/
sendmail feasibility, and specification edge cases. They made no changes.
Their conclusions informed the defaults above. The framework selection
and browser target were presented as pending questions to the owner.

Supporting primary documentation:

- https://better-auth.com/docs/adapters/sqlite
- https://better-auth.com/docs/authentication/google
- https://better-auth.com/docs/plugins/bearer
- https://better-auth.com/docs/plugins/one-time-token
- https://www.postfix.org/sendmail.1.html
- https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies

## Owner decision

The owner explicitly chose Plasmo and Chrome/Chromium first; Safari is
a later target. WXT was considered and rejected for this implementation.

Dependency check rejected jsdom 30 because it requires a newer Node 24
patch release than the installed 24.13.0. Pin jsdom 26.1.0 for test DOMs
instead of modifying the user's Node installation.
