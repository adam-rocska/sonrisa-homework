# Scope review: feed-based alerts with optional browser import

Date: 2026-10-18. Status: recommendation; awaiting owner decision.
Method: business-strategy-workbench strategy-audit.
No application, extension or external-account changes were made.

## Decision memo

Recommend a small application that owns subscriptions, routing, delivery
state and administration, accepts RSS/Atom, and optionally imports feed
links from the user's Google Alerts page. Keep manual URL entry usable.
The extension should improve onboarding, not become a runtime dependency.

The strongest evidence is the actual assignment [S1]: it intentionally
leaves event sources and detection unspecified and evaluates planning,
AI direction, critical judgment and validation. This supports explicit
delegation of detection. It does not guarantee that any particular
reviewer will accept a fragmented onboarding flow. Treat the approach as
a declared MVP interpretation, not proof of exhaustive brief compliance.

An external topic rule plus our destination rule can form a complete
user-facing alert setup. The UI should show source, destination and state,
and distinguish user configuration from an admin-only operational view.
Ordinary users must not obtain access to other users' destinations.

Existing products validate the basic workflow: Slack already provides
RSS/Atom subscriptions and channel management [S2], and Zapier documents
feed-to-email and feed-to-Slack automations [S3]. These are evidence of
available substitutes, not proof of willingness to pay. In real consulting,
compare configuration of existing tools before funding custom software.
For this assignment, a bounded owned workflow gives inspectable evidence
of product choices, AI-directed work and validation. Avoid claiming that
an RSS relay is novel or that off-the-shelf products lack administration.

Keep Google Alerts as one source option. USGS publishes earthquake Atom
feeds [S4], showing that a second domain/source need not require a new
integration service. Financial news is not price-threshold detection;
any promise about market movements must define which one is intended.
Feed-based awareness is not an emergency-warning or trading system.

Browser import is plausible with user-triggered activeTab and scripting
permissions [S5], but actual Alerts DOM/feed-link extraction has not been
tested. Import only RSS-enabled alerts exposed by the selected account.
Repeated import should not duplicate subscriptions or overwrite routing;
absence from an import must not silently delete a working subscription.
Do not export Google session cookies. Deleting our subscription need not
delete the source alert; make that lifecycle distinction visible.

Extension distribution is real work: Chrome documents review durations
of days and sometimes weeks [S6]. A documented unpacked extension can
support a developer demo [S7], but is not equivalent to production rollout.
Do not make store approval or installation necessary to evaluate the core.
The proposed US/Western 'cool factor' is unverified and has no decision weight.

Favor one backend deployment with clear input and output boundaries,
persistent state and a small worker/scheduler. Two different real delivery
adapters can demonstrate a useful abstraction without building a generic
plugin framework, broker or distributed platform. Architectural literature
describes the operating premium of service decomposition [S8]; it does
not establish that the owner's unseen alternative is technically wrong.

Minimize total ownership effort, including integrations, support,
distribution and failure recovery, rather than just lines of source code.
Future channels are options, not proven revenue. Treat upgrades as responses
to observed needs: noise reduction/digests, team governance, or precise
domain data and latency requirements. Agree a demonstrable pilot outcome
before treating delivery as commercially accepted; rhetorical compliance
is a weak foundation for continued customer trust.

## Requirement-to-evidence proposal

These are proposed acceptance observations, not completed capabilities.

| Brief element | Proposed MVP interpretation | Review evidence |
| --- | --- | --- |
| Users set up alerts | Add/import a feed, name it, select destinations, pause/remove | Complete setup walkthrough; user isolation check |
| Something important | User chooses topic/source; each new entry is a candidate event | Assumption log and representative source examples |
| News, markets, disasters | Feed-based awareness; no price thresholds or early-warning guarantee | Google news example and independent Atom source; explicit boundary |
| Email and Slack | Two real configurable adapters | One controlled item received at authorized test destinations |
| More channels later | Small output contract separate from feed parsing | Contract tests and evidence that a new adapter does not edit ingestion |
| Admin view | Operational subscriptions, poll status, delivery failures, retry | Admin walkthrough and denied ordinary-user access |
| Visible process | Plans, prompts, rejected choices, verification and commits | Repository evidence and reproducible demo instructions |

## Options and strongest objections

| Option | Strength | Main objection | Recommendation |
| --- | --- | --- | --- |
| Configure existing automation tools | Lowest custom-code obligation; already supports core routing | Must still demonstrate chosen deliverables and the assignment's AI process | Real-customer baseline; record as considered |
| Small owned app + manual feed input | Clear boundaries, direct evaluation, fewer dependencies | External alert creation remains an onboarding step | Core candidate |
| Same app + optional import extension | Less copying; coherent setup demonstration | DOM coupling and distribution cost | Include only if a timeboxed spike passes |
| Large bespoke detection/platform design | Could meet broader latency/domain/control needs | Those needs are not established; more unvalidated commitments | Defer pending evidence; detailed B plan not reviewed |

## Risk register

| Risk | Consequence | Proposed treatment |
| --- | --- | --- |
| Reviewer expects one-screen topic creation | Scope viewed as incomplete | Show the whole journey and explicit assumption before implementation |
| Google page changes or lacks feed links for an alert | Import unavailable or partial | Manual input; clear import preview; no cookie/CRUD escalation |
| 'Sync' implies deletion or continuous account monitoring | Accidental subscription loss or misleading UX | User-triggered, idempotent import; distinguish source and local lifecycles |
| No news arrives during evaluation | Demo appears broken | Deterministic local feed fixture plus separately recorded live integration evidence |
| Repeated polls/restarts or partial delivery failure | Duplicate messages or silent loss | Persistent item/delivery state; per-channel retry checks; no unsupported exactly-once promise |
| Arbitrary fetch URLs, feed content or secrets mishandled | Backend/user data exposure | Bound feed fetching and redirects, safe rendering, secret redaction, role checks |
| Per-user polling represented as real-time detection | False expectations and excess load | Label check interval; share source polling where useful; distinguish source latency |
| Connector backlog mistaken for commercial demand | Effort without customer value | Tie each upgrade to observed friction and explicit customer interest |

Slack webhooks are tied to a destination and may return permanent errors;
their URLs contain secrets [S9]. A reusable channel boundary reduces code
coupling, but it does not erase provider-specific authorization, limits
and failure semantics. Email provider acceptance is also not proof that
the final recipient received or read a message.

## Three decisive tests after the owner chooses a direction

Timeboxes below are proposed stop conditions, not development estimates.

1. **Importer feasibility, 30 minutes.** Owner provides a test account/page;
   implementing agent inspects a small known set of RSS-enabled alerts.
   Pass: correct links/names, selection preview, no cookies transmitted,
   repeated import adds no duplicates, manual fallback works. Stop and
   defer extension if it requires reverse-engineered Google account CRUD.
2. **Core delivery slice, 60-minute initial spike.** Controlled Atom/RSS
   fixture adds one entry; process polls twice and restarts. Pass: one
   logical delivery per selected destination, visible failure state for
   a simulated rejected destination, retry leaves the successful channel
   alone. Verify actual inbox/Slack receipt separately with authorized
   test destinations. Record partial results honestly; do not imply
   transport-level exactly-once guarantees.
3. **Independent review, 10-minute walkthrough.** Owner or another human
   follows setup/demo instructions from a clean environment. Pass: can
   configure a subscription, observe a test event and inspect admin status
   without the author's private Google account or mandatory extension.
   An automated walkthrough can supplement but not replace this usability
   evidence. Failure prioritizes instructions/onboarding over more features.

## Quality gates

| Gate | Status | Evidence / next action |
| --- | --- | --- |
| G0 Scope | PASS | [S1] and current prompt: recommend now, decide before implementation; next outcome is an assessable submission, not an invented 90-day revenue target |
| G1 Evidence | CONDITIONAL | Official platform capabilities verified; live importer/delivery untested; validate in tests 1-2 |
| G2 Customer fit | CONDITIONAL | Hypothetical users/admin and actual evaluator differ; buyer and user research unavailable; test 3 addresses only review usability |
| G3 Offer fit | CONDITIONAL | Requirement map supports scope; external onboarding acceptance remains untested |
| G4 Business coherence | CONDITIONAL | Substitutes and delivery dependencies identified; no full business model or real procurement process supplied |
| G5 Economics | CONDITIONAL | No price, willingness-to-pay, throughput, support load or payment terms validated; no revenue forecast justified |
| G6 Testing | PASS | Three bounded falsification tests with explicit observations defined; execution pending |
| G7 Decision | CONDITIONAL | Recommendation and alternatives documented; owner has not selected implementation scope |
| G8 Execution | CONDITIONAL | Owner selects direction, agent runs bounded spikes, owner reviews; no implementation started |

Dependencies not reviewed: the full B architecture, actual Google Alerts
DOM, email provider/account setup, Slack permissions, deployment platform,
production security posture, buyer demand, pricing and contractual terms.

## Source register

- **S1 — supplied primary evidence:** original DOCX and extracted text in
  `../sources/`; read in full again for this review.
- **S2 — vendor capability:** [Slack RSS/Atom integration](https://slack.com/intl/en-gb/help/articles/218688467-Add-RSS-feeds-to-Slack).
- **S3 — vendor capability:** [RSS by Zapier](https://zapier.com/apps/rss/integrations).
- **S4 — source capability:** [USGS Atom documentation](https://earthquake.usgs.gov/earthquakes/feed/v1.0/atom.php).
- **S5 — platform capability:** [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).
- **S6 — distribution constraint:** [Chrome Web Store review](https://developer.chrome.com/docs/webstore/review-process).
- **S7 — developer workflow:** [Chrome unpacked extension tutorial](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world).
- **S8 — architectural opinion, not empirical proof:** [Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) and [Microservice Premium](https://martinfowler.com/bliki/MicroservicePremium.html).
- **S9 — delivery capability and limits:** [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).
- **S10 — external setup:** [Google Alerts help](https://support.google.com/websearch/answer/4815696?hl=en).

Sources were checked on 2026-10-18. This was documentation research,
not a live account or delivery experiment. Market fashion, customer demand
and reviewer satisfaction remain hypotheses. Recommendations above are
the assistant's inferences from the sources and the supplied assignment.

## Change log and corrected claims

- Preserve the previous defensibility discussion as prompt 003; archive
  the current challenge as prompt 004.
- Tighten prior wording: delegated detection is a defensible declared
  scope, not unconditional fulfillment of every plausible interpretation.
- Narrow the extension from Google account control to optional feed import.
- Add existing-tool alternatives instead of assuming custom code is needed.
- Require a source-independent demo and explicit delivery failure evidence.
- Keep code volume, buyer willingness, operational cost and reviewer
  preference separate; none is a proxy for all the others.
