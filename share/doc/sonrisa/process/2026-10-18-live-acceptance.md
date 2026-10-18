# Native Chrome local acceptance — 2026-10-18

This record captures the observations verified by the coordinating agent
while operating the owner's Mac and actual Chrome. It is separate from the
earlier in-app-browser fixture. The owner personally completed Google
consent. No secrets, account email or personal feed URLs are recorded here.

## Configuration and installation

- Google Cloud project: **Signalpost**, ID `signalpost-sonrisa-20261018`.
  Created without enabling billing.
- OAuth client: **Signalpost Local**, type **Web application**.
  Exact authorized callback:
  `http://localhost:3000/api/auth/callback/google`.
- Canonical unpacked extension directory:
  `src/extension/build/chrome-mv3-prod`.
- Actual Chrome extension ID: `aeclmacelapbhgjembgbamdcnnajpfgl`.
  Installed and pinned in the owner's browser.
- The local environment file is ignored and mode `0600`.
  The credential JSON is private and ignored. Values are not recorded here.
- Administrator access was explicitly approved by the owner.

## Setup authorization boundaries

Automatic approval initially blocked configuring administrator access.
The owner then explicitly approved that role, after which it was configured.
The required policy, OAuth-client and extension-install confirmations were
obtained during setup; the owner personally completed login and consent.

A proposed Chrome file-URL permission toggle was rejected as an access
expansion. The toggle was not performed and was omitted as unnecessary
for the Google Alerts and local-server flow.

## Observed live results

| Observation | Result |
| --- | --- |
| Local server health | Authentication reported `configured` |
| Google OAuth consent and callback | Owner completed consent; extension returned to its signed-in UI |
| User and administrator UI | Signed-in user shown; Administration view available |
| Toolbar action from Options | Opened Google Alerts |
| Page-load automatic sync | Imported 2 RSS alerts; skipped 1 email-only alert |
| Already-open Options | Feed catalog updated after successful background sync |
| Toolbar manual sync | At 21:47:05 Europe/Budapest (19:47:05 UTC), retained 2 feeds |
| Language preference | Hungarian selected and persisted |
| Native Chrome keyboard | Cmd+K opened localized Commands; Escape closed it and returned focus to content |
| Options reload | Cmd+R retained signed-in account, admin navigation, Hungarian preference, 2 feeds and latest polling timestamps |

Read-only SQLite inspection independently confirmed: **1 verified user,
1 session, 1 catalog, 2 active feeds**. Both feeds had completed their
baseline fetch without errors. There were **0 destinations and 0 deliveries**.
These facts establish authentication, ingestion and baseline operation;
they do not establish notification receipt. A native Chrome screenshot was
retained only in the chat outputs because it contains private user data;
it was not copied into this repository.

## Change and automated checks

Setup review identified that feed rows in an already-open Options page
could remain stale after background sync. This was corrected before the
freshly installed live flow was checked. The correction refreshes server data on a
successful sync event while preserving unsaved unrelated form values.
Success bursts are coalesced and reads are serialized. Three regression
tests cover live list refresh, form preservation and overlapping events.

The extension suite passed **54 tests** after the correction. Core **54**
and server **48** results remain unchanged: **156 tests across 23 files**
in aggregate. Full typechecking, lint and formatting checks passed, and the
Chrome build/package was rebuilt successfully.

## Explicitly unverified live paths

- Logout followed by a new login.
- A separate non-admin account.
- A deliberate Google Alerts edit triggering the DOM mutation path.
- Visibility/rendering of native operating-system notifications.
- Real email inbox receipt or Slack channel receipt.

No alert was deliberately edited for this check. No destinations were
configured, and no email or Slack notifications were sent. This is local pilot
acceptance evidence, not final delivery acceptance or a public deployment.
