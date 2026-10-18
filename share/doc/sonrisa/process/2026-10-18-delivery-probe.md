# Isolated notification delivery probe

The deterministic probe checks the notification pipeline without a Slack
account, SMTP service, new Google alert, or external messages:

```sh
pnpm exec tsx sbin/delivery-probe.ts
```

It creates a private temporary directory, an ephemeral loopback HTTP server,
and five short-lived Node workers. Each worker opens the same isolated
SQLite file and uses the production feed parser, store, poller, Slack
adapter, and sendmail adapter. The sendmail adapter launches a real child
process that records its arguments and standard input.

Only two fixed synthetic provider URLs are translated to the local HTTP
fixtures through the existing fetch injection seam. Unknown URLs fail.
Production provider URL validation, application configuration, credentials,
user data, and authentication remain unchanged. Workers do not inherit
OAuth or notification configuration. Temporary files and the HTTP listener
are removed after the run, including failures.

## Assertions and observed result

The probe passed on 2026-10-18, including TypeScript compilation:

1. An existing RSS item establishes a quiet baseline: no notifications.
2. Publishing a new item creates one delivery per configured destination.
3. Email is accepted by a real sendmail-compatible child process. Captured
   argv, UTF-8 MIME subject/body, recipient, sender, and Message-ID shape
   are checked independently of the email renderer.
4. The Slack adapter sends an actual HTTP JSON POST to the fixture. The
   fixture returns `429` and `Retry-After: 1` on the first request.
5. A fresh worker before the retry deadline sends nothing. A later fresh
   worker retries Slack successfully after the deadline; email is not
   resent. A controlled clock makes these checks immediate.
6. A further worker polls the same RSS and creates no duplicate delivery.

Observed totals: five workers, four RSS GETs, two webhook POSTs (`429`, then
`200`), one MIME receipt, and two accepted delivery records. Every run
includes a unique `sp-<UUID>` title marker for optional downstream receipt
verification.

The capture option was also checked: both address headers and the envelope
recipient match the requested address; the new file has mode `0600`;
existing files are never overwritten. Standalone email address options,
relative capture paths, header injection, and unknown options fail.

## Optional MIME capture

The same validated MIME can be retained for a separately authorized mail
transport or manual inspection. This command itself **never sends email**:

```sh
pnpm exec tsx sbin/delivery-probe.ts \
  --capture-email /absolute/private/path/new-message.eml \
  --email-address "$SIGNALPOST_TEST_EMAIL"
```

The output file is created only after all pipeline assertions pass. Its
parent directory must exist, and the file must not exist. The optional
address sets both `From` and `To` and the sendmail envelope arguments.
Without an address, fictional `example.invalid` addresses remain in use.
The capture is local runtime evidence; keep real addresses outside Git.

## Evidence boundary

This is a cross-component process/protocol probe, not a complete product
end-to-end test. It does not exercise the extension UI, Google OAuth, Google
Alerts DOM discovery, the tRPC HTTP boundary, or real Google feed delivery.
Those require separate acceptance evidence.

It proves the application's RSS-to-outbox-to-adapter behavior, persistence
across process restart, and the emitted email/Slack payloads against local
fixtures. It does not prove Slack's remote acceptance or rendering, SMTP
submission, Gmail receipt, or remote exactly-once delivery. A separately
relayed captured email proves only that relay path and the observed inbox
receipt; it does not validate an unconfigured production mail transport.

## Provider references

The fixture's JSON POST and `200`/`ok` response follow Slack's
[incoming webhooks documentation](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).
Its `429` and `Retry-After` response follows Slack's
[rate-limit contract](https://docs.slack.dev/apis/web-api/rate-limits/).
These describe the provider contract; a local fixture passing it is not
independent evidence that an actual workspace accepted the notification.
