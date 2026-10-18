# Signalpost deployment

One application intent configures two actual runtime adapters: a local Docker
container or a workload in an existing Kubernetes cluster. The same OCI image,
server environment contract and persistent data directory are used in both.
The application has no AWS, Azure or Google Cloud SDK dependency. An existing
cluster on any of those providers is a valid target; this project does not create
accounts, clusters, load balancers, DNS or certificates.

Pulumi expresses and reconciles resources. It does not make storage, networking,
IAM or provider pricing interchangeable. Adding a VM or a managed container
service later means implementing another target adapter behind this boundary.
SQLite deliberately keeps this deployment to **one writer and one replica**.
This is a small portable pilot, not a highly available deployment.

## Layout and prerequisites

- `src/`: validated deployment intent, environment mapping and resource adapters.
- `etc/`: non-secret example stack configurations.
- `test/`: boundary tests and actual Pulumi SDK resource-graph tests.
- `share/test/`: isolated fixture program for real-provider YAML rendering.
- `share/doc/infrastructure/`: process record and source references.
- `var/lib/`, `var/cache/`, `var/log/`, `var/tmp/`, `run/`, `tmp/`: ignored local state.

Use Node 24, the repository's pinned pnpm, and Pulumi CLI 3.270.0. Install
workspace dependencies from the repository root with `pnpm install --frozen-lockfile`.
Docker requires a running local engine. Kubernetes requires an existing context,
namespace and a compatible persistent-volume storage class. The server's SQLite
files must reside on storage supporting SQLite locking, not an object store or
an unsuitable shared network filesystem.

Pulumi CLI, these SDKs and the local state backend require no Pulumi Cloud account
or paid plan. A cloud cluster, storage, SMTP relay or network egress can still
have the operator's existing costs. This repository creates no cloud account or
managed service.

## Local Docker

Build the runtime image at the repository root:

```sh
docker build -f src/server/Dockerfile -t signalpost:0.1.0 .
cd src/infrastructure
mkdir -p var/lib/pulumi
pulumi login "file://$(pwd)/var/lib/pulumi"
pulumi stack init local --secrets-provider passphrase
pulumi config set target docker
pulumi config set image signalpost:0.1.0
pulumi config set publicUrl http://localhost:3300
pulumi config set googleClientId YOUR_GOOGLE_WEB_CLIENT_ID
pulumi config set --path 'extensionIds[0]' YOUR_CHROME_EXTENSION_ID
pulumi config set --secret authSecret
pulumi config set --secret googleClientSecret
pulumi preview
pulumi up
```

The secret commands prompt for values; use a unique random authentication secret
of at least 32 characters. Keep the state encryption passphrase and a backup of
the local state somewhere private. Losing either state or its passphrase is an
operational recovery problem. `Pulumi.<stack>.yaml`, state and caches must remain
untracked; only the examples under `etc/` belong in Git.

The Docker provider always uses an explicit local Unix socket. Default:
`unix:///var/run/docker.sock`. If the engine has another socket, set `dockerSocket`
to its absolute `unix:///...` URI. A remote Docker daemon is rejected. The only
published listener is `127.0.0.1:3300`; `hostPort` can change it, and a local HTTP
`publicUrl` must use the same port. This separate default leaves the original
local server on port 3000 untouched.

Register the exported `oauthCallbackUrl` in the Google Web OAuth client, then set
the extension's server URL to `publicUrl`. Register every installed extension ID
explicitly. HTTP is accepted only for local Docker loopback development and maps
to `NODE_ENV=development`. An externally accessible deployment must use HTTPS.
For HTTPS Docker, provide an existing reverse proxy on the same host; the
container still binds only loopback. `pulumi stack output internalUrl` gives the
exact local upstream endpoint for that proxy.

The container runs as UID/GID 1000, with a read-only root filesystem, dropped
capabilities and writable temporary memory only under `/tmp`. Its named data
volume contains `/var/lib/signalpost`. Replacements stop the old container first,
then start the new one using that volume; this introduces brief downtime and
avoids concurrent SQLite writers. The engine restarts it unless explicitly
stopped. `/healthz` health checking and bounded log rotation are configured.

## Existing Kubernetes

Create a separate stack using the same local backend and secrets procedure.
Use `etc/Pulumi.kubernetes.example.yaml` as the list of non-secret inputs:

```sh
pulumi stack init cluster --secrets-provider passphrase
pulumi config set target kubernetes
pulumi config set image YOUR_REGISTRY/SIGNALPOST@sha256:YOUR_IMAGE_DIGEST
pulumi config set publicUrl https://YOUR_EXISTING_HTTPS_HOST
pulumi config set kubeContext YOUR_EXPLICIT_EXISTING_CONTEXT
pulumi config set namespace YOUR_EXISTING_NAMESPACE
pulumi config set googleClientId YOUR_GOOGLE_WEB_CLIENT_ID
pulumi config set --path 'extensionIds[0]' YOUR_CHROME_EXTENSION_ID
pulumi config set --secret authSecret
pulumi config set --secret googleClientSecret
pulumi preview
pulumi up
```

Choose an immutable image digest for repeatable releases, and publish the same
OCI image to a registry the cluster already has access to. Registry credentials
and image-pull configuration remain part of the existing environment. The
adapter refuses to infer a Kubernetes context or create a namespace. Verify the
preview names the intended existing context and namespace before updating it.

Resources: one Secret, one retained/protected PVC, a one-replica Deployment with
`Recreate` updates, and a `ClusterIP` Service on port 3000. There is no public
LoadBalancer. Configure an existing ingress/gateway to route the chosen HTTPS
host to that service; TLS terminates there. Public DNS, certificate and proxy
ownership stay with that environment. `pulumi stack output internalUrl` gives
the exact service endpoint for that stack, in the form
`http://SERVICE.NAMESPACE.svc.cluster.local:3000`; use its service and namespace
when configuring the gateway. This DNS name is reachable inside the cluster,
not from the public browser. `pulumi stack output workloadId` identifies the
deployment.

The pod runs without a service-account token, as UID/GID 1000 with `fsGroup: 1000`,
a read-only root filesystem and dropped capabilities. Startup, readiness and
liveness checks use `/healthz`. Shutdown has 45 seconds for graceful handling.
Secret changes replace an immutable, auto-named Secret; the new name changes the
pod template and rolls the single instance. Application configuration changes
also update the template. Both kinds of rollout have downtime by design.

The default PVC request is `1Gi`; `storageSize` and an existing `storageClass` are
configurable. `ReadWriteOnce` is not a distributed writer lock: do not manually
scale this deployment, force-delete and restart a partitioned pod while the old
process can still write, or share this data with another Signalpost server.

## Authentication and delivery configuration

Optional inputs are `adminEmails` (array), `mailFrom` (plain email address),
`pollIntervalMs` (10,000–3,600,000; default 60,000), and secret
`smtpConfiguration` containing a complete msmtp configuration. For example, put
a valid relay configuration in a private file and supply it on stdin:

```sh
pulumi config set --secret smtpConfiguration < /PRIVATE/PATH/msmtprc
pulumi config set mailFrom alerts@example.com
pulumi config set --path 'adminEmails[0]' admin@example.com
pulumi preview
pulumi up
```

The image writes that secret to a private file under `/tmp` and uses the same
sendmail abstraction as the original server. No SMTP service is provisioned and
no personal Gmail token is reused. The server can start without mail configuration. A missing `mailFrom` causes an
immediate nonretryable email failure. With a sender configured, missing or broken
relay configuration follows bounded delivery retry; fix the configuration and
retry failed deliveries from the admin view. Slack continues to use
user-configured webhooks. See the
[container contract](../server/share/doc/server/container.md) and the main
[operator guide](../../share/doc/sonrisa/handover/operator-guide.md).

Pulumi secrets remain secret outputs and encrypted in state. Runtime administrators
with access to the Docker daemon or Kubernetes Secrets can still read runtime
credentials. Protect those interfaces and enable the cluster's appropriate
secret encryption/access controls. No credential is exported as a stack output.

## Updates, backup and removal

Run `pulumi preview` before updates. Keep the same stack and data resource while
changing the image; schema and application compatibility remain release
responsibilities. Back up the SQLite data with SQLite's online backup API, or
stop the workload and copy the complete data directory including any WAL files.
Restoring an older image alone does not undo a database schema migration.

Both persistent resources set `protect: true` and `retainOnDelete: true`.
Consequently a normal `pulumi destroy` is blocked before removing protected data.
For intentional teardown, first back up the data, then explicitly unprotect the
data resource with `pulumi state unprotect <URN>` and preview the destroy. Pulumi
will retain the volume/PVC after removing it from state. Record its physical ID
before doing so: a later stack does not automatically reattach a retained volume.
Reattachment requires an explicit resource import. Deleting that retained
resource is a separate operator action. Never remove persistent data as routine
application cleanup.

## Validation scope

`pnpm --filter @signalpost/infrastructure test` checks rejected unsafe inputs,
provider selection, local-only binding, persistence, single-writer rollouts,
non-root execution, secret propagation and the Kubernetes resource graph using
the real Pulumi SDK with its supported engine mocks. `share/test/offline-program.ts`
uses the real Kubernetes provider's YAML-rendering mode with fixture-only secrets
for a CLI validation without credentials or a cluster. Rendering writes plaintext
fixture secrets: never repurpose that test for production credentials.

These checks validate the deployment program and provider contract. A successful
mock or YAML render is not evidence that a Docker engine, storage class, TLS
endpoint, Google callback or SMTP relay has been deployed and works. Those
acceptance steps require the chosen operator environment.
