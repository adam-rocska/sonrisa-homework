# Deployment verification and corrections · 2026-10-18

The owner's portability follow-up extends the previously verified pilot.
The source/runtime contract remains separate from the deployment intent and
Pulumi's provider resource models. See the
[pre-implementation plan](2026-10-18-deployment-plan.md).

## Final checks

On macOS arm64, Node 24.13.0, pnpm 10.28.2, around 22:37 Europe/Budapest:

- `pnpm check`: strict TypeScript, lint, formatting, all **202 tests in 27
  files** and build passed. Core 54; server 65; extension 54; infrastructure 29.
- `pnpm test:infrastructure`: actual CLI 3.270.0 and Kubernetes provider
  4.34.2 rendered Deployment, PersistentVolumeClaim, Secret and Service.
  Secret state stayed encrypted; secret stdin preserved the complete
  multiline msmtp fixture. Only synthetic credentials and a file backend
  were used. No live provider infrastructure was created.
- `pnpm test:resilience`: SIGKILL/lease recovery and no second replay passed.
- `pnpm test:http`: health 200, unauthenticated catalog 401, body 413,
  batch 400; 100/100 requests, 42 ms burst, SIGTERM exit 0, 9 ms shutdown.
  Local observations only, not an SLA.
- `pnpm test:delivery`: five workers, four feed GETs, Slack 429→200,
  one MIME receipt, two accepted delivery records, no duplicate replay.
  Marker `sp-808ae9fe-a1ab-4a85-b73c-da07aab63816` is a local-only fixture.
- Chrome MV3 build/package passed. The browser application source did not
  change; the prior native Chrome/OAuth acceptance record remains separate.
- Actual standalone production package: healthy, new isolated SQLite
  database, graceful SIGTERM exit 0 in 10 ms. Every symlink stayed inside
  the package after finalization (115 verified); Plasmo, React, Pulumi,
  TypeScript, ESLint and Vitest were absent from top-level runtime dependencies.

The standalone package was prepared with:

```sh
pnpm --filter @signalpost/server deploy --prod --legacy var/tmp/runtime-check
node src/server/sbin/finalize-runtime.mjs var/tmp/runtime-check
```

Then `node --import tsx src/main.ts` was launched from that directory with
an isolated data directory, unused loopback port, production mode and a
fictional HTTPS origin. No live OAuth or mail configuration was inherited.
The Linux container remains unbuilt/unrun: Docker CLI 29.2.0 exists, but
its selected Unix daemon socket does not. No VM platform was installed.

The official Pulumi release archive was checked against the published
SHA256 before use. Its local cache does not change the global CLI installation.
`PULUMI_CLI=/absolute/path/to/pulumi pnpm test:infrastructure` reproduces the
provider probe; alternatively put the same CLI version on PATH.

## Findings corrected before handover

1. `pnpm deploy --legacy` left a package self-reference pointing back to
   the source workspace. The build now localizes that one known link and
   rejects every remaining escaped or dangling symlink. Six process tests
   cover valid, repeated and rejected finalizations.
2. The Docker build must include `.pnpmfile.cjs` so the frozen lock uses the
   same optional-peer policy. A failed early edit was caught by read-back
   and actually corrected before completion.
3. Docker replacement must stop the old container first: a shared SQLite
   volume and host port cannot support create-before-delete overlap.
4. Kubernetes environment secrets require a new pod after rotation.
   Immutable auto-named Secret replacement changes the pod template.
5. Kubernetes instance selectors now include a hash of project, stack and
   component identity, preventing routing across separate stacks in one
   namespace. The exact internal service URL is exported for gateway wiring.
6. Provider injection is honored through standard Pulumi component options,
   enabling actual offline provider validation without a special production
   bypass or accidental ambient-cluster selection.
7. The isolated CLI environment initially lacked the macOS user/home values
   required by Go's user lookup. The probe now preserves the real identity
   while isolating Pulumi state/cache through its dedicated environment keys.

The container and infrastructure subprojects archive their exact delegated
instructions. The independent review instruction is archived separately.

## Dependency audit refresh

The [production graph audit](dependency-audit-deployment-production.json)
reports zero known advisories (293 dependencies in the workspace production
classification, including infrastructure SDKs). The
[complete graph audit](dependency-audit-deployment-all.json) reports the same
16 advisory IDs as the previous full audit: 1 low, 9 moderate, 6 high, none
critical. The new Pulumi dependencies introduced no additional reported ID.
The retained build-tool assessment still applies; an advisory-free audit is
not a proof of security, and these results are time-specific.

## Acceptance boundary

This validates source, scripts, the standalone macOS runtime and the actual
Kubernetes YAML provider. It does not establish Linux image build/runtime,
registry access, live cluster scheduling/storage, external TLS, remote OAuth,
SMTP delivery, Docker engine behavior or a paid cloud deployment. No email
was sent and no real user alerts, sessions or feed state were changed.
