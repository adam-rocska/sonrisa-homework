# Operator handover

## Prerequisites and cost boundary

Use one Node 24 server process, pnpm 10.28.2, a local disk suitable for
SQLite, and Chrome/Chromium 124 or newer. Linux or macOS needs a working
sendmail-compatible MTA for email. Windows can host the extension; the
server email adapter expects a Unix sendmail executable. No paid Better
Auth feature, cloud auth plan, Twilio service or external queue is required.
Hosting and a deliverable mail configuration are operator responsibilities;
free source code does not promise free hosting or guaranteed inbox delivery.

On the author's Mac, Git/native builds use the installed Command Line Tools:

```sh
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
```

This is a process-local workaround for an unaccepted Xcode license, not a
license acceptance or global developer-directory change. Use your normal
toolchain on other machines. On this Mac, the pinned pnpm executable is
`/Users/rocskaadam/Library/pnpm/pnpm`; prepend `$HOME/Library/pnpm` to
PATH for these commands because a different pnpm is also installed.

## Install and configure

Run from the repository root. Pin pnpm rather than changing global tools.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:resilience
pnpm test:http
pnpm test:delivery
pnpm --filter @signalpost/extension package
cp -n etc/signalpost.env.example etc/signalpost.env
chmod 600 etc/signalpost.env
```

The copy command preserves an existing local configuration. Never replace
a configured environment file with the blank example during an update.

Load `src/extension/build/chrome-mv3-prod` through Chrome's
`chrome://extensions` → Developer mode → Load unpacked. The packaged ZIP
is a distribution artifact; Chrome's unpacked loader expects the directory.
Pin the extension in the toolbar. Record its extension ID. Retain the
same installation/path or use a stable manifest key for a later distributed
build; changing the extension ID also changes the allowed login callback.

Fill the ignored `etc/signalpost.env`:

| Variable | Value |
| --- | --- |
| `HOST`, `PORT` | Default loopback `127.0.0.1:3000` |
| `BETTER_AUTH_URL` | Browser-visible server origin, default `http://localhost:3000` |
| `BETTER_AUTH_SECRET` | Locally generated random secret of at least 32 characters |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth Web application credentials |
| `EXTENSION_IDS` | Exact installed Chrome ID(s), comma separated |
| `ADMIN_EMAILS` | Verified Google emails allowed into administration |
| `DATA_DIRECTORY` | Default `var/lib/signalpost`, relative to the process cwd |
| `MAIL_FROM` | Plain sender address accepted by your local MTA |
| `SENDMAIL_PATH` | Absolute executable, default `/usr/sbin/sendmail` |
| `POLL_INTERVAL_MS` | Default 60000; allowed 10000–3600000 |

Generate the auth secret locally; do not paste secrets into an issue or chat:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Create/configure a Google **Web application** OAuth client. Set its
Authorized redirect URI to exactly:
`http://localhost:3000/api/auth/callback/google` for local development.
For a remote deployment, substitute the exact HTTPS server origin. Follow
Google's consent-screen audience settings. Its basic OIDC identity scopes
have a test-user exception; do not request extra scopes merely for this app.
Only OIDC identity scopes (`openid`, `email`, `profile`) are requested;
there is no Gmail access or Google Alerts management OAuth scope.

The extension callback is different:
`https://<extension-id>.chromiumapp.org/auth`.
The server derives it from `EXTENSION_IDS`; do not register it as Google's
server OAuth callback. The flow is described in the server subproject docs.

Start the server:

```sh
pnpm start
```

The script loads `etc/signalpost.env`. Check `http://localhost:3000/healthz`.
An unconfigured auth response means HTTP is up but login is intentionally
unavailable. Restart after changing configuration. Open extension Options,
verify Settings → Server address, and sign in. Setting `ADMIN_EMAILS` is
required for an administrator; there is no default administrator bypass.

## Author's local instance verified on 2026-10-18

The local Chrome pilot uses Google Cloud project **Signalpost**
(`signalpost-sonrisa-20261018`), created without enabling billing. Its
**Signalpost Local** Web application OAuth client redirects to exactly
`http://localhost:3000/api/auth/callback/google`.

The installed and pinned unpacked extension ID is
`aeclmacelapbhgjembgbamdcnnajpfgl`, loaded from the canonical
`src/extension/build/chrome-mv3-prod` directory. This ID is installation
specific; obtain the actual ID again on another machine or installation.
The local environment file is ignored and mode `0600`; the downloaded
credential JSON is also private and ignored. Neither is a handover artifact
or committed source. The owner's administrator access was explicitly
approved and verified through the live Administration view.

Real sign-in and feed import passed. See the
[live acceptance record](../process/2026-10-18-live-acceptance.md).
No destinations or deliveries were configured in that check, so transport
setup and actual inbox/channel acceptance still remain below.

## Mail and Slack

The application invokes sendmail with argv and stdin, without a shell.
Configure and test the machine's MTA separately. An executable merely
existing is insufficient. Set `MAIL_FROM`; absent configuration produces a
clear failed delivery. MTA acceptance is reported as `accepted`; inspect
MTA logs/bounces and the destination inbox to establish actual delivery.

Create a Slack app/incoming webhook for a channel you control, following
Slack's setup. Enter its `https://hooks.slack.com/services/...` URL through
Destinations in the extension. It is stored in the protected server database
and never read back through the API. Set a readable label so the secret need
not be displayed. Rotate a webhook by editing its target.

A live acceptance check should create a destination, select it on a feed,
allow the baseline poll, and wait for a genuinely new feed entry. Verify
Activity, the Slack channel/inbox and server/MTA status independently.
This check sends real notifications and is operator-run after credentials
and target recipients have been selected.

## Test destinations without external services

Run `pnpm test:delivery` from the repository root. A controlled local RSS
source publishes one item after baseline; production channel adapters talk
to a sendmail-compatible subprocess receiver and a local Slack-protocol
HTTP receiver. The probe includes retry, restart and duplicate checks.
No new dependency, Slack account, email transport or real message is needed.
See [the probe guide](../process/2026-10-18-delivery-probe.md) for optional
private MIME capture and the exact coverage boundary.

The author’s macOS MTA was found stopped and without an SMTP relay. One
captured message was separately relayed using the Gmail connector and its
inbox subject/body verified. This does not configure application email
delivery; see [the receipt record](../process/2026-10-18-gmail-receipt.md).

## Routine operation and recovery

- Run one process under your normal supervisor. SQLite WAL, transactions
  and a busy timeout protect local state; this is not a replicated service.
- Keep `var/lib/signalpost` private. It contains session material, webhook
  targets, feeds and delivery history. New data directories use mode 0700.
- Back up both `application.sqlite` and `auth.sqlite`. Stop the service for
  a simple consistent filesystem copy, or use SQLite's online backup API;
  do not copy only the main files while WAL writes continue.
- Restore into a protected directory, preserve `BETTER_AUTH_SECRET`, then
  restart. Retest a health request and sign-in. Interrupted login flows
  intentionally expire on restart; pending deliveries recover after leases.
- Keep remote traffic on HTTPS, set `BETTER_AUTH_URL` accordingly, and use
  your reverse proxy's normal request limits. Production mode refuses HTTP.
- Inspect the Administration view for failed work; fix configuration or
  upstream availability before retrying. Disabled or removed routes cannot
  be forced through the retry operation.
- History currently grows with activity. Retention/pruning and metrics
  export are later operational features; monitor disk usage in this pilot.

Do not mutate dependency files in a running process. Stop, install the
locked release, run checks and restart. Existing domain tables currently
use the initial idempotent schema; future incompatible schemas need an
explicit versioned migration before deployment.

## Troubleshooting

| Symptom | Next action |
| --- | --- |
| Sign-in opens configuration instructions | Fill the missing local variables and restart |
| Google redirect mismatch | Match the Web OAuth callback to `BETTER_AUTH_URL` |
| Extension callback rejected | Check the installed ID against `EXTENSION_IDS` |
| Server changed | Save the new origin, allow that host and sign in again |
| RSS list incomplete | Reload Google Alerts, expand its full list and retry |
| Google account mismatch | Return to the connected account; do not force a destructive import |
| No notification after first sync | Baseline skips history; select a destination and await a new item |
| Email accepted but absent from inbox | Inspect MTA delivery, bounce and spam handling |
| Slack 429/5xx | Automatic retry backs off; review failed work after retry exhaustion |

Twilio is a possible future notification adapter for SMS and other
channels. It has no place in this pilot's dependency or spending footprint.

## Dependency advisory assessment

The pinned Plasmo build toolchain retains known upstream advisories. See
[the reviewed assessment](../process/dependency-advisories.md) for exact
audit counts, optional-peer paths, scoped fixes and rejected unsafe
overrides. Do not expose development tooling as a public service. The
completed checks are not a claim that this dependency tree is advisory-free.


## Portable deployment targets

The direct local process above remains supported. For an OCI runtime and
Pulumi-managed Docker or existing Kubernetes resources, use the
[portable deployment guide](deployment.md). It includes persistent storage,
secrets, callback/gateway configuration, backup and teardown. No paid Pulumi
service is required. `pnpm test:infrastructure` additionally checks the real
provider's local YAML rendering when Pulumi CLI 3.270.0 is available.
