# Infrastructure implementation record

## Delegated task (verbatim)

> Implement Pulumi deployment subproject src/infrastructure in /Users/rocskaadam/var/homework/sonrisa, recursiveFHS perAGENTS. Root handles dependencyinstall/lock/root scripts/docs. You own new subproject including package.json (send proposed versions first; query registry official ifneeded), Pulumi.yaml, src, test, examples, itsREADME. TS strict with explicitimports noany. Architecture: one deployment/runtime intent model, mapping to environment, Pulumi ComponentResource with two actual target adapters Docker and existing Kubernetes (cloud-vendor agnostic, no managedcluster provisioning). OCI image provided by config (built separately Dockerfile by otheragent), explicit target, publicUrl HTTP onlyDocker localhost development elseHTTPS, OAuthsecret Googleclientsecret requireSecret, GoogleclientId extensionIDs adminEmails andmailFrom optional pollperiod. Root common serverconfig alreadyHOST supports. Persist /var/lib/signalpost. Docker explicitprovider localhostdaemon, loopbackonlyhostport default3300, volume retained/protected; containerrestart unlessstopped, readonlyroot wherefeasible tmpfs, UID1000, hardening. K8s explicitkubeContext mandatory (no accidentalambientcluster), existingnamespace, PVC protected/retained, Deployment replicas1 Recreate, nonroot UID1000 fsGroup1000, health/readiness /healthz, graceperiod>=45, ClusterIPService. NO LoadBalancer/billablecloud resources/autoprovisioning; exposure/TLS handled by existing ingress/gateway documented; optional ingress onlyif genuinelyneeded rootwilldecide. SMTP optional secret string SIGNALPOST_MSMTP_CONFIG consumed by image entrypoint -> private/tmpmsmtprc; no secretsinoutputs/logs. PublicoutputsURL callbackURL data resource ID. State localfilebackend free noPulumiCloudrequired. Validation/puremodeltests + realPulumi runtimeMocks testresourcegraphs/securitysecrets/dataretention andfailfast notmockimplementationtests. Need return output promises usingPulumi APIs withoutany. Do notdeploycredentials or editliveconfig. No commits. Record exact delegationprompt in subprojectprocessdoc. Prioritize lean real adapterboundary over universalmagic. Check SDK docs/version pinned compile. Send design/manifest quickly; rootwillinstall.

## Decisions and corrections

- Pinned official npm registry versions: Pulumi SDK 3.270.0, Docker provider
  5.2.0, Kubernetes provider 4.34.2. No paid service dependency was added.
- A discriminated deployment intent maps to the existing application environment
  contract; provider resources remain behind a ComponentResource boundary.
- Standard explicit provider injection allows composition and a real Kubernetes
  provider YAML-rendering check without adding a production test-mode flag.
- Review corrected Docker replacement ordering: stop/delete the old workload
  before creating its replacement to prevent a shared-volume writer overlap.
- Review corrected Kubernetes credential rotation: replace immutable auto-named
  Secrets so their changed names also change the pod template and restart it.
- Review identified cross-stack selector collision. Instance labels now derive
  from a stable hash of project, stack and component, rather than component name
  alone, keeping multiple stacks isolated in a shared namespace.
- The image uses its own sendmail wrapper; environment mapping was aligned with
  `/usr/local/libexec/signalpost/sendmail.sh` rather than overriding it with a
  nonexistent package-managed executable.
- Strict compilation caught Pulumi output inference and API mismatches. The
  implementation now uses a typed tuple for secret values and the exported
  `isSecret` helper in tests, without weakening the workspace's TypeScript rules.
- System Python was unavailable behind an unaccepted Xcode license. No license
  or machine configuration was changed; file corrections used installed Node.
- No actual cloud resources, Docker workload, Kubernetes cluster or credentials
  were provisioned by this subproject's implementation task.

## Primary references consulted

- [Pulumi local and other state backends](https://www.pulumi.com/docs/iac/concepts/state-and-backends/)
- [Pulumi Docker Container resource](https://www.pulumi.com/registry/packages/docker/api-docs/container/)
- [Pulumi Kubernetes Deployment resource](https://www.pulumi.com/registry/packages/kubernetes/api-docs/apps/v1/deployment/)
- [Pulumi unit testing with runtime mocks](https://www.pulumi.com/docs/iac/guides/testing/unit/)
- Installed, pinned SDK TypeScript declarations for secret outputs, resource
  options, provider injection and Kubernetes rendering.

All fixture OAuth and SMTP values in tests are synthetic. Runtime validation
results are recorded in the repository's final verification document rather
than inferred from successful source generation.

## Follow-up task (verbatim)

> Small operational polish beforecommit: expose a common `internalUrl` output from RuntimeResources/component/index (Docker http://127.0.0.1:hostPort; K8s http://<service.metadata.name>.<namespace>.svc.cluster.local:3000). Then guide operator can wireexistingTLSgateway to exactendpoint fromstackoutput instead of ambiguous app=signalpost service listing when multiple stacks coexist. Add assertions in existinggraph tests outputs; no bignewtestplatform. Ensure share/test included intsconfig ifnotalready. Root driver actualCLI firstpasssuccessful. Then ready.

The common output now identifies the exact private upstream endpoint. Existing
resource-graph tests assert both forms and that the endpoint is not a secret.
The operator guide distinguishes cluster-internal DNS from the public URL.
