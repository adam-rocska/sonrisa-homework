# Portable server image

The OCI image is one implementation of the server's runtime contract. Its inputs
are environment variables, one writable data directory and HTTP port 3000. It
contains the backend, core and contracts packages plus their production
JavaScript dependencies. Plasmo, the browser extension, Pulumi and native build
tools are absent from the runtime stage.

`src/server/Dockerfile` uses `node:24.13.0-bookworm-slim` in both stages and
pnpm 10.28.2 during build. `better-sqlite3` is built from source inside that
Linux stage; a host macOS native module must never be copied into the image.
`pnpm deploy --prod --legacy` selects the production dependency closure.
`finalize-runtime.mjs` then localizes its known package self-reference and rejects
any remaining escaping or dangling symlink before the runtime stage is copied.
The exact Node patch and dependency lock are pinned; Debian package repository
updates can still change OS package versions. Record the built image digest when
promoting a deployment.

## Runtime contract

| Concern | Contract |
| --- | --- |
| Process | Node runs directly after `exec`, receives SIGTERM, existing graceful shutdown has a 30-second deadline |
| Identity | UID/GID 1000, no runtime root privileges |
| Listener | `HOST=0.0.0.0`, `PORT=3000`; health endpoint `/healthz` |
| Public origin | `BETTER_AUTH_URL` must be an HTTPS origin in production; terminate TLS at the deployment edge |
| Persistence | Mount `/var/lib/signalpost`; keep one application replica with exclusive local SQLite storage |
| Temporary writes | Writable `/tmp`; may be a small tmpfs with a read-only root filesystem |
| Mail | `SENDMAIL_PATH=/usr/local/libexec/signalpost/sendmail.sh`; Debian msmtp supplies the sendmail-compatible transport |
| Configuration | Google OAuth, auth secret, extension IDs and admin emails are injected at deployment time |

The image's data directory is owned by UID/GID 1000 and includes a marker so a
fresh Docker named volume copies the directory ownership. A pre-existing volume
or bind mount must already be writable by UID 1000. An orchestrator must retain
the volume when replacing the application. Do not horizontally scale this
SQLite implementation or place its live database on a shared network filesystem.

The health endpoint confirms that the HTTP process is responding. Its JSON also
reports whether authentication is configured; a passing health check alone does
not establish working Google OAuth or notification delivery.

## Build and run

From the repository root, on a machine with a running Docker-compatible engine:

```sh
docker build -f src/server/Dockerfile -t signalpost-local:0.1.0 .
docker volume create signalpost-data
docker run --name signalpost --read-only \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=64m,uid=1000,gid=1000 \
  --mount type=volume,source=signalpost-data,target=/var/lib/signalpost \
  --publish 127.0.0.1:3000:3000 \
  --env-file /absolute/private/path/signalpost.env \
  signalpost-local:0.1.0
```

The private environment file must set an actual HTTPS `BETTER_AUTH_URL` and the
Google/auth values described in the [server guide](README.md). A reverse proxy
must route that origin to this listener. Register the origin's exact
`/api/auth/callback/google` URL with Google, and set the same server origin in the
extension. A direct HTTP request to the local health endpoint can test the
process before configuring the edge; it cannot test the full OAuth flow.

Give the orchestrator at least 35 seconds to stop the process, for example
`docker stop --time 35 signalpost`. Existing graceful shutdown drains workers
before closing SQLite. Reuse the same named volume after replacing the container.

## Optional mail relay

Supply `MAIL_FROM` and `SIGNALPOST_MSMTP_CONFIG` as runtime configuration. The
latter is the content of a trusted operator-authored msmtp configuration, for
example:

```text
defaults
auth on
tls on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
timeout 8
account default
host smtp.example.test
port 587
from signalpost@example.test
user example-user
password REPLACE_WITH_A_SECRET
```

This is a synthetic example, not a working relay. Inject the multiline value with
the orchestrator's secret facilities; Docker's basic `--env-file` does not encode
multiline values. No mail account or paid service is provisioned. The entrypoint
writes the value into `/tmp/signalpost-mail/msmtprc` with mode 0600 inside a 0700
directory, removes it from Node's environment and then executes Node. A container
restart without the value removes a stale private config. The sendmail child uses
a fixed path because the application intentionally supplies it a minimal
environment. The orchestrator still holds the supplied secret and must protect
its state/configuration.

The wrapper forwards the original message and arguments without shell expansion.
A missing or rejected relay configuration fails delivery and uses the existing
retry policy; no fake acceptance is returned. Actual inbox delivery remains a
separate provider-dependent validation step. Do not copy local mail configuration,
OAuth downloads, SQLite databases or feed URLs into an image.

## Verification boundary

Eleven isolated POSIX process tests exercise configuration permissions, literal
secret handling, stale credential removal, symlink rejection, failed setup,
credential removal from the child environment, unchanged PID after `exec`, exact
MIME/stdin and argument forwarding, and propagation of msmtp exit codes. They
write only synthetic credentials to test-owned temporary directories. The
entrypoint test substitutes only the configuration helper to avoid touching a
running container's fixed private directory; that helper is separately tested.

The first real deploy-directory check discovered a retained self-link from
`node_modules/.pnpm/node_modules/@signalpost/server` to the source workspace.
The build finalizer replaces only that known link with the artifact root and
then resolves every symlink to verify closure. Six additional process tests
cover this correction, idempotence, absent self-links, wrong packages, other
escaping links, dangling links and a conflicting regular directory. This keeps
the global workspace configuration unchanged.

At implementation time the Docker CLI was present but no daemon was reachable
(`/var/run/docker.sock` was absent). No VM or container runtime was installed or
started. Consequently these tests do not establish that the Debian image builds
or runs. Run the image build, health, persistence and termination probe on a
Docker-capable host before deployment. The repository's process probes continue
to validate the existing application outside a container.

References: [pnpm deploy](https://pnpm.io/10.x/cli/deploy),
[Node image practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md),
[msmtp manual](https://marlam.de/msmtp/msmtp.html).
