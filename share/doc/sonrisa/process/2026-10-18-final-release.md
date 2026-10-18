# Final release verification · 2026-10-18

This record was written from the final tool results, not copied from an
older green checkpoint. Execution began around 22:05 Europe/Budapest on
macOS arm64, Node 24.13.0 and pnpm 10.28.2. Application source was unchanged
between this run and final documentation/package preparation.

## Commands and results

Executed sequentially from the repository root; the whole command exited 0:

```sh
pnpm check
pnpm test:resilience
pnpm test:http
pnpm test:delivery
pnpm --filter @signalpost/extension package
```

- Strict TypeScript, ESLint and Prettier: passed.
- All 156 unit tests in 23 files: passed (core 54, server 48, extension 54).
- Plasmo Chrome MV3 build and ZIP: passed.
- Crash probe: actual SIGKILL during a leased delivery, durable retry after
  restart, no replay on another restart.
- HTTP probe: health 200, anonymous catalog 401, large body 413, excessive
  batch 400; 100/100 concurrent requests succeeded. Local burst 40 ms;
  SIGTERM exit 0, shutdown 9 ms; total probe 613 ms. These are observations,
  not a capacity or latency guarantee.
- Delivery probe: five isolated workers, four RSS GETs, two Slack-adapter
  POSTs (429 then 200), one sendmail-compatible MIME receipt, two accepted
  delivery records. Quiet baseline, retry timing, UTF-8 content, persistence
  and deduplication all passed. Final local-only marker:
  `sp-30c938bd-884b-447d-a967-df6f1537ca56`.

## Independent final reviews

A read-only release review examined startup, packaging, authentication,
authorization, provider validation and probe isolation. A separate handover
review compared the original assignment with the guides and process record.

- Fixed setup examples to preserve existing local configuration (`cp -n`).
- Added direct reviewer navigation and all three process-probe commands.
- Found a working personal Google Alerts URL in prompt 009. Replaced it
  with a synthetic selector example; Git history sanitization completed
  with explicit owner approval, as recorded below.
- Credential-pattern inspection of 191 tracked files and 246 historical
  blobs found this RSS URL only; no OAuth secret, access token, actual Slack
  webhook, GitHub token or private key was found by those checks.

## Acceptance and distribution boundary

Actual Chrome installation, Google OAuth, admin access, Hungarian settings,
manual sync and page-load sync were verified separately. The owner also
independently confirmed the notification test flow. See
[verification](../handover/verification.md) and its linked evidence.

The local protocol probe does not establish real Slack acceptance or
production SMTP delivery. A separate Gmail-connector relay reached the
owner's inbox; the normal local MTA remains unconfigured. These are stated
limits, not hidden setup successes. No new Slack account or paid service
was introduced.

The GitHub repository remains private. At this checkpoint only its owner
has access, no reviewer invitation is pending, and the assignment email
provides a submission address but no reviewer GitHub identity. A clean
source archive can be reviewed immediately; repository access requires an
identity supplied by the recipient. No employer email has been sent by
this finalization step.


## Final history and package disposition

The owner explicitly approved replacing the remote main history to remove
the working personal RSS capability URL. Before the push, an isolated
rewrite was verified against all 42 original commits:

- All commit messages, authors and timestamps were preserved.
- The first ten commits were byte-identical. Later commits were signed
  again; their identities changed with the corrected trees/parents.
- Exactly one prompt file changed in 29 historical snapshots, and only the
  private feed identifiers were replaced with synthetic values.
- The latest tree remained byte-identical. All 256 reachable blobs in the
  sanitized history were checked for the original URL; none contained it.
- A private local backup was retained outside the distribution artifacts.

The approved push used `--force-with-lease` with the exact previously
observed remote main ID. Read-back confirmed that local and GitHub main
matched. This verifies reachable main history, not deletion of every
unreachable object in GitHub's internal storage or revocation of the feed.

The distribution includes a tracked-files-only source ZIP, a Chrome ZIP
with 14 files (including EN/HU locale catalogues), and a Git bundle carrying
only main and HEAD. Restoring the bundle with plain `git clone` reproduced
the clean working tree and milestone history. The first trial exposed a
missing HEAD advertisement; including HEAD corrected the bundle before
handover. No ignored runtime state, OAuth secret, database or dependencies
are packaged. Artifact hashes are distributed alongside the final files.

A final documentation commit records this outcome. No application source
changed after the complete test run described above. The submission email
remains an unsent local draft addressed to `job@sonrisa.hu`. Separate Gmail
searches found no reviewer GitHub identity in the relevant correspondence.
