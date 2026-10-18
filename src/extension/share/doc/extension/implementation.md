# Signalpost extension

Chrome/Chromium Manifest V3, Plasmo 0.90.5, React 18. The toolbar action
has no popup: it opens Google Alerts or replaces the user's complete RSS
catalog. The independent options tab contains feeds, destination routing,
delivery activity, administration and connection settings.

## Data and authentication boundaries

The DOM adapter produces an extension-owned catalog snapshot. Shared
contracts validate transport input; UI view models explicitly map transport
DTOs. The extension does not import a SQLite row or execute server code.
Its router import is type-only.

Google Alerts sign-in and Signalpost Google OAuth sign-in are distinct.
The OAuth handoff uses S256 PKCE, a cryptographic state value and an exact
extension redirect URI. One-use authorization codes appear in callbacks;
bearer sessions are exchanged through the API and retained only in trusted
chrome.storage.session, never local storage or content scripts. Sessions
are bound to their issuing API origin. Server changes invalidate them.
Queued snapshots capture their user, origin and session, and cannot be
retargeted by logging into another account while a write is pending.

## Snapshot rules

The Google DOM must explicitly report signed-in state. Every visible alert
row must be readable, RSS URLs must have the expected numeric account and
feed segments, and a collapsed "show all" list is rejected. Unknown,
loading, incomplete or signed-out pages never become empty snapshots.

Mutations are debounced for 800 ms; writes are serialized and pending whole
snapshots coalesce to the newest snapshot. No patches or item-level diff
requests are sent. tRPC calls have a 15-second deadline and preserve caller
cancellation, so an unreachable server cannot occupy the writer forever.

A catalog with no RSS links cannot independently establish which Google
account is currently visible. Automatic clearing is therefore refused.
Settings contains an explicit confirmation checkbox and complete empty
catalog replacement for removing every synced feed. Google itself remains
unchanged. This is a deliberate deviation from blindly treating an empty
DOM extraction as a deletion request.

The extension only inspects the canonical Google Alerts page. It does not
request permission for every Google domain merely to guess sign-in state.
A toolbar click elsewhere opens/focuses Google Alerts; the next click can
show a native sign-in notification based on that page's verified state.

## Keyboard and accessibility

The options interface uses semantic native buttons, inputs, fieldsets and
a modal dialog, 17px body text, visible focus and live status/error text.
Tab/Shift+Tab reaches controls. Command on macOS and Control elsewhere:
K opens commands, Enter syncs, comma opens settings. Question mark opens
help and Escape closes an open dialog. These shortcuts do not intercept
text entry or IME composition. Browser-wide shortcuts are configurable at
chrome://extensions/shortcuts.

## Verification

Thirty deterministic unit cases currently exercise extraction, malformed
and partial Google markup, account mismatch, snapshot serialization,
failed-write recovery, platform shortcuts, DTO mapping, PKCE/state/callback
validation, trusted storage, sign-out failure, server-switch races and
network deadlines. Plasmo production build and strict type-check pass.

The non-shipped share/test/preview.py harness serves the compiled options
UI with visibly labeled fictional data and intercepts API calls. It is
only for browser visual review and does not prove real OAuth, Google DOM
integration, local mail delivery or Slack delivery. End-to-end credentials
and transport verification remain separate handover steps.

The current Plasmo/Parcel bundler produced a runtime-invalid Zod namespace
barrel although its build exited successfully. A version downgrade alone
did not solve it: generated code mapped the namespace dependency to an
empty module. Direct project schemas use Zod 3.25.76 with explicit
`import * as z from 'zod/v3'`, which retains the validators in the bundle.
Better Auth's independent internal dependencies are unchanged.
