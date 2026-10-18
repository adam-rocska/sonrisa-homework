# Container packaging work record

The following is the delegated implementation task, preserved as task evidence.
It is an instruction from the implementing agent's parent, not an extra customer
requirement. Hidden system instructions and credentials are not included.

> Implement portable Signalpost OCI runtime packaging in repo /Users/rocskaadam/var/homework/sonrisa. Read AGENTS. Own ONLY src/server/Dockerfile, src/server/sbin container entrypoint/sendmail scripts and related focused tests/docs under src/server/share/doc (coordinate names). Root will own .dockerignore and root scripts. Need pinned Node24 Debian slim multi-stage build; build native better-sqlite3 in build stage, runtime non-root UID1000, image contains backend/core/contracts and production deps only (not Plasmo/Pulumi). Existing pnpm workspace and tsx runtime (currently tsx root dependency); don't edit package manifests/lockfile (request changes root). Persist /var/lib/signalpost; HOST0.0.0.0 PORT3000 NODE_ENVproduction, publicURL HTTPS required existing serverconfig. Health /healthz; exec Node PID1 and gracefulSIGTERM. Need OS sendmail compatibility via Debian msmtp package, free no provider. Suggest optional SIGNALPOST_MSMTP_CONFIG env written by entrypoint as uid1000 into /tmp private0600 msmtprc, unset then exec; wrapper invokes msmtp --file path preserving argv. Keep this narrow; account/config credentials NEVER in image. Author unit/blackbox script tests for wrapper semantics / failure if feasible. Test Docker build/run if runtime available but don't install/start paid tooling or access hostrealconfig. No external messages or commits; report proposed manifest changes and validation. Preserve strictFHS. Record exact task instruction in your process evidence file under src/server/share/doc (task prompts requirement), not hidden context.

Decisions and corrections:

- Requested a direct server `tsx@4.23.15` runtime dependency and package file
  allowlists from the parent; the parent owns manifests and the shared lock.
- Observed that the application strips the sendmail child's environment. Kept
  the mail configuration path fixed instead of depending on an inherited path.
- The sendmail wrapper is installed under `/usr/local/libexec/signalpost`, not
  over a distribution-managed `/usr/sbin/sendmail` file.
- Included the repository's `.pnpmfile.cjs` optional-peer hook in the build context
  after the parent highlighted its relationship to the frozen lockfile.
- A shell helper isolates credential file IO from entrypoint process semantics,
  allowing meaningful process tests without touching a live fixed config path.
- The Docker CLI could not reach a daemon. Image-level checks are explicitly
  outstanding; no desktop tooling or paid service was installed.

Validation: 11 focused process tests passed on 2026-10-18. The broader release
checks and portable deploy-directory check are consolidated by the parent agent.

## Follow-up after a real artifact check

> Real pnpm deploy closure check found EXACTLY ONE escaping symlink: node_modules/.pnpm/node_modules/@signalpost/server -> ../../../../../../../src/server (all otherlinksinternal). Fix portableartifact self-reference to deploymentroot, e.g. ln -sfn ../../../.. /opt/signalpost/node_modules/.pnpm/node_modules/@signalpost/server afterdeploy; preferably small finalize-runtime.mjs script invokedDockerbuild and root localdeploy check, validates deployedpackage name and rewrites onlyknownselflink thenassertalllinks resolvewithinartifact. Don't alterworkspaceinjectionglobally. Root willrunfullproductionstartup/shutdown afterfix. Updatecontainerdocactualcorrection. No commits.

Implemented the bounded correction in `sbin/finalize-runtime.mjs` and added it
to the Docker build immediately after deploy. Six artifact process tests passed;
targeted lint passed. An unexpected escape or dangling link fails the build
instead of being silently rewritten. The parent owns the final real
deploy-directory startup/shutdown evidence.
