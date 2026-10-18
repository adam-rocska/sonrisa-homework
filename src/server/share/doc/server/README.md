# Signalpost server

The TypeScript server owns authentication, subscription state, polling and
delivery. The browser extension owns its own UI model. The tRPC boundary
validates transport DTOs and maps them explicitly to/from the independent
`@signalpost/core` domain. Database rows remain inside the core store.

## Setup

Use the repository's canonical `etc/signalpost.env.example` and root start
scripts. Run one server process against the SQLite data directory. The default
listener is loopback-only; remote use needs a reachable HTTPS origin and a
deliberate `HOST` configuration. `BETTER_AUTH_URL` is an origin, not a path.

Google authentication requires a Google OAuth **Web application** client.
Register `<BETTER_AUTH_URL>/api/auth/callback/google` as an authorized redirect
URI. Set the client ID, secret, a high-entropy Better Auth secret, and exact
Chrome extension ID(s). Only basic `openid`, `email`, and `profile` scopes are
requested. A Google Alerts page session and a Signalpost session are separate;
the user should choose the same Google account during setup.

The unconfigured server intentionally still serves `/healthz`, reporting
`authentication: "unconfigured"`. Sign-in presents an actionable setup page.
There is no development auth bypass, default account or fake successful login.
`ADMIN_EMAILS` grants administrator access only to an authenticated, verified
Google email. An empty allowlist grants nobody administrator access.

Better Auth runs locally using its MIT-licensed package and SQLite adapter.
No Better Auth managed infrastructure, billing integration or paid service is
used. Authentication and application data use separate SQLite files in the
same configured data directory.

## Extension authentication protocol

1. The extension creates a random state and PKCE verifier, retaining both in
   its trusted context. It computes the verifier's SHA-256 base64url challenge.
2. `chrome.identity.launchWebAuthFlow` opens
   `/auth/start?redirectUri=...&state=...&codeChallenge=...`. The redirect must
   exactly match `https://<configured-extension-id>.chromiumapp.org/auth`.
3. The server creates a ten-minute flow and an HttpOnly, SameSite=Lax flow
   cookie. Its page starts Better Auth's Google sign-in with a POST request.
   Better Auth manages OAuth state validation and the Google callback.
4. `/auth/complete` verifies the flow cookie and the real, verified, unexpired
   Better Auth session. It redirects to the extension with an opaque code and
   the original state. **The bearer token never appears in a redirect URL.**
5. After checking the returned state, the extension POSTs
   `{code, codeVerifier, redirectUri}` to `/auth/exchange`. The code expires in
   60 seconds, is consumed once, and is bound to both the PKCE challenge and
   exact redirect. The server also revalidates the session before responding.
6. The response is `{token, expiresAt, user}`. The extension sends
   `Authorization: Bearer <token>` to `/trpc`. Logout is a POST to
   `/api/auth/sign-out` with that bearer and an empty JSON object.

Login codes live only in bounded process memory. A server restart invalidates
unfinished sign-ins safely; the user retries. Existing sessions persist in
SQLite. This is deliberately a single-process server, not a distributed auth
code store. Tokens belong in trusted extension session storage, never the
Google page DOM or its content-script-visible storage.

## Delivery configuration and meaning

`MAIL_FROM` must be a real configured sender address. Without it, the email
adapter fails explicitly. `SENDMAIL_PATH` identifies an absolute
sendmail-compatible executable; it defaults to `/usr/sbin/sendmail`. The
deployment must provide and configure the MTA. Installing an executable or
setting a sender address does not establish Internet mail delivery.

`accepted` means the channel accepted the submission. For sendmail this is
local MTA acceptance, not proof of inbox delivery. Mail transport credentials
and relay configuration belong to the operating system. Slack webhook targets
are stored server-side and never returned in destination DTOs.

Polling defaults to 60 seconds and does not make Google publish RSS updates
more frequently. Graceful SIGINT/SIGTERM stops scheduling, waits for in-flight
work and closes the databases. A 30-second shutdown deadline bounds process
exit. See the core documentation for retry semantics and the unavoidable
duplicate window after external acceptance but before local acknowledgement.

## Validation boundaries

Unit tests exercise config validation, verified-email admin rules, DTO mapping,
tenant ownership propagation, PKCE expiry/replay/wrong-verifier handling,
untrusted origins and oversized requests. A focused adapter test starts the
real Better Auth version against temporary SQLite, runs migrations and proves
that the handoff's raw session token is accepted by its bearer plugin and
revoked by logout. Its local fixture session does not exist in production code.

Live Google OAuth, real Slack receipt and end-to-end mailbox delivery require
deployment configuration and an explicit live test. Local test success does
not claim those workflows are already configured or verified.

## Primary references

- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)
- [SQLite adapter](https://better-auth.com/docs/adapters/sqlite)
- [Bearer plugin](https://better-auth.com/docs/plugins/bearer)
- [Hono integration](https://better-auth.com/docs/integrations/hono)
- [MIT license](https://github.com/better-auth/better-auth/blob/main/LICENSE.md)
- [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [Postfix sendmail interface](https://www.postfix.org/sendmail.1.html)
