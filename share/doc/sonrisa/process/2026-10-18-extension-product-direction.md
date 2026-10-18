# Direction selected: extension UI and SQLite backend

Date: 2026-10-18. Status: architecture direction selected by owner;
gap check in progress, detailed implementation plan not yet approved.

## Owner decisions and corrections

- The browser extension is the product's user interface, rather than
  an optional importer attached to a separate web frontend.
- Use a small backend with SQLite and pub/sub behavior.
- Keep future options open through boundaries; discover additional
  requirements in conversation instead of prebuilding speculative features.
- Swift was suggested as a possible backend language, not fixed yet.
- The owner reports a recent analogous upsell and has sales context not
  provided here. Earlier assistant caution was based on missing context;
  it should not be presented as contradicting the owner's experience.

This supersedes the separate web-app UI recommendation in the preceding
scope review. Manual feed input can live inside the extension itself.
The hypothetical customer's technical background is an assumption;
the architecture does not depend on proving that assumption.

## Minimum responsibilities to make the selected design work

These clarify existing brief requirements and the chosen feed workflow;
they do not introduce additional products or services.

1. **Extension:** guided Google Alerts setup/import, feed subscriptions,
   destination configuration and status. An admin view can be another
   screen in this same extension. A side panel or full extension page
   can provide enough space for the application UI.
2. **Backend:** API and identity/access checks, scheduled RSS/Atom polling,
   item recognition, routing and email/Slack delivery. Polling and sending
   continue when the user's browser is closed.
3. **SQLite:** durable subscriptions, destinations, seen items and pending/
   successful/failed delivery state. Restart/repeated-poll behavior and
   per-destination retry need explicit, small policies. No separate broker
   or generic plugin framework follows from the requirements.
4. **Account boundary:** identify the product user, restrict subscriptions
   and destinations to their owner, enforce admin permissions on the
   server and keep delivery credentials server-side. The simplest suitable
   login/pairing mechanism is still to be chosen; full account lifecycle
   management has not been added to scope.
5. **Source boundary:** importing feed links does not create or alter
   Google Alerts. Onboarding must make RSS delivery setup clear; alerts
   configured only for email cannot be assumed to expose an RSS link.
   Missing items during an import must not silently remove subscriptions.

The explicitly requested admin view is the most visible omission from the
owner's short architecture summary. The poller and durable delivery state
are the necessary work hidden by the phrase 'small pub/sub server'.
All of these responsibilities fit in the two selected components.

## Verification boundary and sources

Chrome documents extension service-worker suspension and shutdown:
[service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).
This supports keeping continuous polling/delivery on the backend rather
than relying on the extension remaining active.

Chrome supports an extension-owned side-panel UI:
[Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel).
This establishes a UI hosting option, not an implemented or chosen layout.

No backend, extension, Google import or delivery experiment was implemented
in this turn. The original process-evidence and prompt-history requirements
remain applicable to the subsequent implementation.
