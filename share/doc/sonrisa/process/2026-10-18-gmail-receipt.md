# Connector-assisted Gmail receipt — 2026-10-18

The owner explicitly authorized a test message to their own connected Gmail
inbox. The controlled RSS delivery probe ran successfully with that address
as both the envelope/header sender and recipient, capturing one generated
MIME message in a private local file. No production database or destination
was changed.

## Verified observations

- The installed macOS Postfix mail system was down; relayhost was empty and
  SMTP authentication was not configured. No system mail settings changed.
- The production RSS parser, store, poller and two channel adapters passed
  the isolated process/protocol probe described in
  [delivery-probe](2026-10-18-delivery-probe.md).
- Its captured MIME was decoded. The exact subject and decoded plain-text
  body were sent once through the existing Gmail connector to the owner.
- A subsequent independent Gmail read returned the INBOX label and exactly
  matching subject/body, including Hungarian accents and the emoji.
- Receipt time: 2026-10-18 21:58:34 Europe/Budapest (19:58:34 UTC).
- Unique marker: sp-9ab0a906-f698-4bfe-904b-17d8b59e68e1.
- Captured MIME SHA-256:
  ccd52a0bea30b9183f3ce9768e09c47917602205384f44bdab2f816f9a533a02
- Decoded body SHA-256:
  2aab317f5aa24434341ee959d27e17c5404affa830ee80700ca9ac505e62c624

## Boundary

The connector relay is an explicit separate step. It is not the server's
normal sendmail-to-SMTP transport and does not configure that transport.
Gmail generated its own transport headers and Message-ID; comparison was
of the subject and decoded body, not byte-identical RFC message headers.

This establishes application payload correctness plus this connector's
Gmail inbox receipt. It does not establish production SMTP deliverability,
a remote Slack workspace's receipt/rendering, or remote exactly-once
delivery. No Slack account, installed client or paid service was introduced.
The synthetic RSS source does not test Google indexing latency.

The production Gmail/Slack delivery acceptance still requires a configured
MTA/webhook and selected recipients. Test addresses, raw MIME and the Gmail
message identifier remain outside Git.

## Reproduce the application portion

Run pnpm test:delivery from the repository root. The default run uses
fictional addresses and local protocol/process receivers only. It requires
no Gmail or Slack access. An optional capture can be separately relayed
through an operator-authorized mail transport.
