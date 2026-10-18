# Implementation, rejected outputs and corrections

Date: 2026-10-18. Product name: Signalpost; namespace: `@signalpost`.
Owner prompts are archived separately, with explicit whitespace
normalization and a documented personal RSS URL redaction. This document records engineering choices and agent work;
it is a curated evidence log, not a claim to contain hidden model reasoning.

## Work split and supervision

The main agent owned the root workspace, shared wire contracts, dependency
pins, commits, cross-package validation, process-crash probe and handover.
Three parallel agents first performed read-only checks of the framework,
authentication/mail choices and specification. After the owner's explicit
Plasmo/Chrome decision, those agents implemented bounded packages:

- Core: SQLite row/domain mapping, transactional full snapshots, durable
  delivery state, bounded feed parsing/polling, Slack and sendmail adapters,
  deterministic tests. No wire DTOs or live sends.
- Server: Better Auth Google auth, extension PKCE handoff, Hono/tRPC,
  authorization, explicit wire mappings, real local auth seam tests and
  an isolated HTTP process probe. No real OAuth credentials.
- Extension: Plasmo/React, DOM extraction, full snapshot coordination,
  browser action/content script, session-only auth and accessible Options
  screens, deterministic tests and an unshipped fictional UI harness.

Only the main agent committed. After package tests, the core agent reviewed
the integration independently; the server agent reviewed handover accuracy.
Findings below were turned into changes and regression checks.

## Important decisions

- Kept Plasmo after the owner rejected the newer-maintained WXT option.
- Kept Google's native alert UI. No undocumented Google CRUD protocol.
- Used full replacement for source catalog state, separate from routes,
  destination secrets and delivery history.
- Unknown/loading/empty-without-source DOM is not permission to clear a
  catalog. A confirmed Settings action handles removing every RSS feed.
- Used four polling and four delivery workers with bounded batches;
  pending deliveries are not starved by slow source requests.
- Used the SQLite delivery table as a local outbox; no external queue.
- Added narrow process probes instead of a broad, credential-dependent
  system-test platform. Never replaced dependencies inside a running server.
- Kept the admin role on the server; a hidden UI tab is not authorization.
- Used native semantic React controls, legible typography, keyboard access
  and visible focus rather than adding a large UI component dependency.

## Rejected or corrected outputs

1. jsdom 30 required a newer Node 24 patch than the installed 24.13.0.
   Pinned jsdom 26.1.0 for the test DOM; left the user's Node installation.
2. The shell's default pnpm was a different major. Used the available
   pnpm 10.28.2 executable explicitly; did not rewrite global configuration.
3. macOS system Git/Python/native tools hit the Xcode license gate.
   Used process-local Command Line Tools selection; did not accept a EULA.
4. Initially sequential polling could delay pending delivery by many slow
   requests. Added bounded independent work pools and starvation/cap tests.
5. A sendmail test wrongly rejected '-' at the start of an email local part.
   Corrected the test: argv uses '--' before the recipient, without a shell.
6. Actual Better Auth startup initially raced schema migration. Run its
   migrations before constructing auth; test migration, bearer lookup and
   logout against the real local SQLite adapter, not only a mocked facade.
7. An oversized HTTP body left a pooled socket looking reusable after the
   server closed its unread stream. Return Connection: close with 413.
   The real child-process smoke now checks the following request too.
8. Added an explicit 20-procedure tRPC batch cap after boundary review.
9. Browser inspection found a blank Options page despite a green Plasmo
   build: Zod 4's exports failed in the old Parcel pipeline. Pin direct
   shared validators to Zod 3.25.76 and import the zod/v3 namespace
   explicitly. The downgrade alone did not fix it: generated external.js
   had been replaced with an empty module. Verify the rendered bundle.
10. A queued sync initially resolved the current account at execution time.
    Freeze its user, backend and token, and reject identity changes before
    sending or updating local success state.
11. Independent review reproduced a second OAuth/server-switch race:
    server A's token could be sent to newly selected server B. Bind stored
    sessions to their originating server and reject changed-server OAuth
    completion. Tests use mocked callbacks and no real credentials.
12. Add a 15-second tRPC deadline so an unresponsive backend cannot trap the
    serialized sync pipeline or leave the UI permanently busy.
13. Clear all UI models when a server-side session expires. Match field
    limits to the wire schema, and make existing channel kind immutable.
14. Correct handover wording: permanent delivery errors fail immediately;
    only transient errors retry up to eight attempts. Google basic OIDC
    scopes have a testing-user exception. Connected-user counts measure
    catalogs, not every account in the authentication database.

## External-service boundary

All automated delivery checks use injected/local sinks. OAuth tests use
local test sessions and nonfunctional client strings. UI preview data is
fictional and visibly labeled. None of these establish a successful live
Google login, Slack delivery or mailbox receipt. The handover contains the
operator-run acceptance steps once real configuration is supplied.

## Final local verification

The compiled Options bundle was inspected in a browser using a clearly
labeled fictional fixture. Cmd+K, command navigation and focus, destination
creation and administrator retry were exercised through visible controls.
The actual Google page was only read; no real feed settings were changed.

All 126 tests, strict compilation, lint and formatting checks passed.
The process-crash probe and 100-request HTTP probe passed separately.
The Chrome ZIP contains 12 files, no popup, and no fixture or env file.
Minimum Chrome 124 covers the AbortSignal APIs used by the client;
[MDN compatibility data](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/AbortSignal.json)
was checked. Live provider acceptance remains a separate operator step.


## Later acceptance and finalization

The initial 126-test checkpoint above is historical. The final application
passed all 156 tests in one complete run, followed by all three process
probes and a rebuilt Chrome package. Actual Chrome OAuth and sync, and a
separate connector-assisted Gmail receipt, are recorded in the
[final verification](../handover/verification.md).

Final review caught a working personal RSS capability URL inside an
archived implementation prompt. The example is now synthetic. Historical
Git copies also need the same substitution before reviewer access; the
release record reports the final disposition. No application behavior
changed for this correction.
