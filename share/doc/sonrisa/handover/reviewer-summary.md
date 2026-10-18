# Signalpost: reviewer guide

## From the brief to a bounded product

The [original brief](../sources/assignment-extracted.txt) asks for configurable
world-event alerts, email and Slack delivery, future channels and an admin
view. It leaves event sources, importance and technology open. The assessment
focuses on planning, directing AI and checking its output.

The chosen pilot delegates topic matching to Google Alerts. A desktop
Chrome extension imports the user's RSS subscriptions and manages routing;
a small server polls feeds and dispatches new entries. Google owns alert
creation and search settings. Signalpost owns synchronization, destinations,
delivery state and administration. This is an explicit interpretation of
the brief, not a claim to provide every kind of real-time event detection.

Read the [scope discussion](../process/2026-10-18-scope-review.md) and the
[plan recorded before implementation](../process/2026-10-18-implementation-preflight.md).
The [task prompt archive](../prompts/README.md) records the owner's evolving
specification and decisions.

## Decisions that constrained implementation

- Retain Plasmo after comparing its maintenance with WXT and asking the
  owner; target Chrome first. Safari and mobile remain outside this pilot.
- Use TypeScript, tRPC, SQLite and free self-hosted Better Auth. Keep wire,
  application and persistence models separate; share transport contracts
  without making database records the UI model.
- Synchronize complete source snapshots. Reject uncertain DOM discovery
  instead of clearing subscriptions; retain independent routing settings.
- Use SQLite delivery state as a durable local outbox. No external queue,
  paid authentication service or paid messaging dependency is necessary.
- Establish a quiet first-poll baseline, then notify on newly observed
  entries. Sendmail and Slack implement the same channel boundary.

See [architecture and tradeoffs](architecture.md) for identities, recovery,
security boundaries and at-least-once delivery semantics.

## AI output was checked and corrected

The [implementation log](../process/2026-10-18-implementation-log.md) records
work allocation, rejected outputs and corrections. Three examples show why
build success alone was insufficient:

1. The compiled extension initially rendered blank because of a Parcel/Zod
   export interaction. Browser inspection found it; explicit dependency and
   import changes were verified in the rendered bundle.
2. Review found that switching servers during authentication could send a
   session to the wrong server. Sessions and queued work were bound to their
   original identity/server, with regression checks.
3. Live Chrome acceptance exposed a stale already-open dashboard after
   successful sync. The refresh path was corrected and retested in Chrome;
   the [live record](../process/2026-10-18-live-acceptance.md) distinguishes
   these observations from earlier fictional UI fixtures.

The [localization record](../process/2026-10-18-localization.md) also captures
English/Hungarian and RTL inspection, including wrapping fixes discovered
in the actual compiled interface.

## Verified result and reproduction

The [verification record](verification.md) is the current inventory of checks
and their limits. It covers deterministic unit tests, strict static checks,
packaging, process crash/recovery, bounded HTTP load and real Chrome
installation, Google sign-in, admin access and Google Alerts import.

A [controlled RSS delivery probe](../process/2026-10-18-delivery-probe.md)
exercises the real email subprocess and Slack HTTP adapters with local
receivers: quiet baseline, a new item, retry, restart and duplicate
suppression. It needs no Slack account. A captured email separately reached
Gmail through the existing connector; [that receipt](../process/2026-10-18-gmail-receipt.md)
is explicitly distinguished from production sendmail delivery.

Use the [operator guide](operator-guide.md) to reproduce the checks and
configure a local instance. The [user guide](user-guide.md) explains Google
Alerts creation/editing, RSS selection, synchronization and notification
routing. [Localization](localization.md) documents adding languages and RTL.

## Honest limits

Normal SMTP transport and receipt in a real Slack workspace remain operator
acceptance steps. Google controls upstream coverage and publication latency;
60-second polling is not a breaking-news SLA. A crash after external receipt
but before local acknowledgement can duplicate a notification. The pilot
runs as one server process; live cloud deployment, retention policies, horizontal
scaling, browser-store publication and broader browser support are outside
this implementation. Retained build-tool advisories are documented in the
[dependency assessment](../process/dependency-advisories.md).

The submitted repository contains source, milestone history, task prompts,
plans and validation evidence. Local OAuth secrets, session data and private
runtime databases are intentionally excluded. No live credentials are
needed to inspect or run the isolated checks.


## Portability follow-up

After the initial handover, the owner requested an explicit deployment
abstraction. A [separate Pulumi layer](deployment.md) now maps one runtime
intent into Docker and existing Kubernetes adapters, with a non-root OCI
image and protected SQLite storage. The [follow-up verification](../process/2026-10-18-deployment-verification.md)
records 202 passing tests, a real standalone runtime check, actual Pulumi
provider rendering and the packaging/lifecycle defects found and corrected.
No live cloud deployment is claimed.
