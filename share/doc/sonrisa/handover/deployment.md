# Portable deployment

The application uses one runtime contract: an OCI image, public origin,
authentication settings, persistent data directory and notification transport
configuration. The Pulumi subproject maps this intent into two adapters:

| Target | Resources managed here | Environment supplied by operator |
| --- | --- | --- |
| Docker | Non-root container, retained named data volume, loopback listener | Running local engine; HTTPS proxy for remote access |
| Kubernetes | Secret, retained PVC, one-replica Deployment, ClusterIP Service | Explicit existing context/namespace, storage, registry access and HTTPS gateway |

A Kubernetes cluster may run on AWS, Azure, GCP or another platform. No cloud
SDK enters the application. A future native VM or managed-container target
would add an adapter; Pulumi does not translate provider-specific networking
or storage semantics automatically.

Use the [deployment operator guide](../../../../src/infrastructure/README.md)
for full setup, stack configuration, secrets, gateway wiring, backup and
teardown. The [container contract](../../../../src/server/share/doc/server/container.md)
describes the image and OS sendmail-compatible transport. Main commands:

```sh
pnpm container:build
# Initialize and configure a stack as the deployment guide describes.
pnpm infra:preview
pnpm infra:up
```

Pulumi CLI 3.270.0, the SDKs and a local encrypted state backend need no
Pulumi Cloud account or paid plan. The operator's existing hosting/storage
and SMTP costs are outside the application's tooling. No cloud resources
were provisioned while implementing this layer.

## Decisions that remain stable across targets

- The application, wire and SQLite models remain unchanged.
- One server process owns the SQLite files. Updates stop the old writer
  before starting a replacement; Kubernetes uses Recreate, not rolling overlap.
- Data survives routine workload replacement and is protected/retained
  during infrastructure removal. Retained data needs explicit import to
  reattach after stack deletion; backup remains an operator responsibility.
- Secrets are encrypted in Pulumi state and absent from stack outputs.
  Runtime administrators still have the capabilities of their platform.
- `publicUrl`, `internalUrl` and `oauthCallbackUrl` identify the external,
  internal and Google callback endpoints. The extension already supports
  changing its backend URL with an explicit host-permission request.
- Sendmail remains the application interface. The image's OS msmtp utility
  accepts an operator-supplied relay configuration, without a provider SDK.

## What was actually verified

All 202 tests passed, including 29 deployment-model/resource-graph checks
and 17 container-script/artifact checks. The production package was deployed
into an isolated directory, all 115 symlinks resolved within the artifact,
and the standalone server created SQLite state, answered /healthz and
exited 0 on SIGTERM. That was a real macOS Node process, not a Linux image.

`pnpm test:infrastructure` used the real Pulumi CLI and Kubernetes provider
against a fresh local stack with fictional credentials. It produced the
four expected Kubernetes manifests, preserved multiline secret input,
confirmed the public callback output and encrypted secrets in exported
state, then removed the temporary fixture files. It contacted no cluster.
The provider plugin cache remains under ignored `var/cache/`.

The Linux image was not built or run because no Docker daemon was available.
No live Kubernetes, storage class, registry pull, HTTPS ingress, remote
Google callback or SMTP relay was accepted. These are explicit deployment
acceptance steps, not evidence inferred from a passing mock or YAML render.
See the [deployment verification record](../process/2026-10-18-deployment-verification.md).
