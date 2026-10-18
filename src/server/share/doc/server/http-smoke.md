# Bounded HTTP runtime smoke evidence

Run from the repository root:

```sh
node --import tsx src/server/test/http-smoke.ts
```

The script launches the real Node/Hono server in a separate process with an
ephemeral localhost port and a fresh temporary SQLite directory. It passes
only explicit test environment variables; it does not inherit OAuth
credentials or read the user's local configuration. The empty catalogue
produces no outbound feed requests, Slack messages or email sends. The
temporary directory is removed and the child process is stopped on success
or failure.

Validated on 2026-10-18 using Node 24.13.0:

| Probe | Observed result |
| --- | --- |
| Health | HTTP 200, authentication explicitly unconfigured |
| Anonymous catalogue access | HTTP 401 |
| 1,048,577-byte request body | HTTP 413, `Connection: close` |
| 21-procedure tRPC batch | HTTP 400 before store access |
| 100 concurrent health/session requests | All 100 returned HTTP 200 |
| Health after the burst | HTTP 200 |
| SIGTERM | Exit 0, observed in 10 ms |

The bounded burst completed in 41 ms in this local run. This is a regression
probe, not a throughput benchmark or production capacity claim. It exercises
unauthenticated routes and does not claim OAuth, authenticated workload,
SQLite contention or external-channel delivery coverage.

## Fault found and corrected

The first process run caught an HTTP connection-lifecycle problem that the
in-memory Hono tests did not expose: rejecting an unread oversized body could
close its socket while the client still considered that connection reusable.
A subsequent pooled request failed with `UND_ERR_SOCKET`.

The 413 response now explicitly sets `Connection: close`; the process probe
asserts that header and immediately sends the bounded concurrent requests.
The corrected run passed. A unit regression also checks the header. tRPC's
installed `maxBatchSize` option is set to 20, with a separate unit regression
that accepts 20 calls and rejects 21 without invoking the store.
