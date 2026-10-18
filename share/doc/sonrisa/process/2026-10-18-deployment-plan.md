# Deployment portability plan

Recorded before implementation of the deployment adapters.

## Interpretation

Pulumi gives one infrastructure language, configuration and lifecycle, but
does not make provider resources interchangeable automatically. Define a
small Signalpost deployment intent and map it explicitly into two concrete
adapters: Docker and an existing Kubernetes cluster. Kubernetes can be
provided by AWS, Azure, GCP or another operator without putting that vendor
into the application. Creating the cluster/network/cloud account is a
separate platform concern, not a new homework requirement.

## Planned implementation

1. A pinned Node 24 OCI image with only server/core/contracts runtime
   dependencies, non-root execution, health check and graceful shutdown.
   SQLite lives on persistent storage. A sendmail-compatible OS utility
   handles optional SMTP submission without adding an application vendor SDK.
2. `src/infrastructure`: strict TypeScript, a validated deployment intent,
   explicit environment mapping and one Pulumi component behind which
   Docker and Kubernetes resource types stay isolated.
3. One instance, no rolling overlap, retained/protected persistent storage,
   scoped configuration and Pulumi secret propagation. Never default to an
   ambient Kubernetes cluster. Docker host binding defaults to loopback.
4. A free DIY local state backend with encrypted secrets; no Pulumi Cloud,
   paid account or ESC dependency. Provider-specific setup stays in target
   configuration; outputs expose the same public URL and OAuth callback.
5. Meaningful invariant tests and Pulumi resource-graph tests, plus real
   provider/CLI checks when tools are available. Keep mocks, generated plans
   and actual deployment evidence distinct.
6. Update setup/reviewer docs and distribution artifacts; retain the
   existing runtime acceptance record and disclose new deployment limits.

## Initial environment observation

Docker CLI 29.2.0 is installed, but its selected local daemon socket does
not exist. No Pulumi CLI or Kubernetes CLI/context was found through PATH.
Do not silently install a VM platform or pretend a mocked graph is a real
deployment. The current app already has HOST, PORT, DATA_DIRECTORY and
sendmail-path configuration, and a /healthz endpoint; no business logic
change is needed for deployment portability.

## Sources

- [Pulumi components](https://www.pulumi.com/docs/iac/concepts/components/)
- [DIY state backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
- [Pulumi secrets](https://www.pulumi.com/docs/iac/concepts/secrets/)
- [Pulumi unit testing](https://www.pulumi.com/docs/iac/guides/testing/unit/)
