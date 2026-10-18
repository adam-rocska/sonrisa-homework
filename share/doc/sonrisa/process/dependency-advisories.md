# Dependency advisory assessment

Assessed on 2026-10-18 after installation and both final audits. Production
scope reports **zero known advisories**; the complete development/build
graph still reports **16**. This is an audit snapshot, not a claim that the
application or its dependencies are vulnerability-free.

## Evidence and classification

The initial `pnpm audit --prod --json` snapshot reported 23 advisories:
1 critical, 9 high, 12 moderate and 1 low. Its paths were either beneath
Plasmo's extension build toolchain or beneath Better Auth's optional
Vitest peer dependency. Plasmo was initially classified as an application
dependency; moving it to `devDependencies` corrects that classification.
It does not repair or erase its remaining advisory findings.

The application uses React, a Node/TypeScript server, SQLite, Better Auth
and tRPC. Plasmo, Parcel, icon conversion and the unused Svelte/Vue
transformers execute during development/build, not as backend services.
Our normal checks use `vitest run`; the product exposes no Vitest UI
server. These distinctions reduce the identified exposure but do not
establish that every advisory is unreachable in every development
environment.

Registry metadata was checked with pnpm 10.28.2. The selected patched
versions exist and the project runs on Node 24. The selected dependency
changes passed the install, type checks, tests and extension build; the
final optional-peer adjustment additionally passed the server checks below.

## Minimal remediation selected

- Pin root Vitest to **4.1.11**, also updating its matching
  `@vitest/mocker` package. This addresses the critical Vitest UI issue
  and the later mocker path-traversal advisory.
- Put **Plasmo 0.90.5 in `devDependencies`**; retain the user's chosen
  framework and exact version.
- Override **Plasmo's fflate to 0.8.3** for the malformed ZIP64 infinite loop.
- Override **LMDB's msgpackr to 1.11.5** for the recursive decoding issue.
- Override **the inline-CSS transformer's Browserslist to 4.28.7** for the
  unbounded cache/custom-stats issues.
- Remove only Better Auth 1.7.10's unused optional Svelte, Vue and Vitest
  peer declarations through the scoped manifest hook described below.
- Classify **tsx as a runtime dependency**, because the server start
  command uses it. Production audit includes this actual runtime edge.

No blanket forced upgrade of Parcel, Svelte, Vue or native image
libraries is part of this remediation. No advisory is suppressed.

## Final audit results

| Audit scope | Critical | High | Moderate | Low | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production dependencies | 0 | 0 | 0 | 0 | **0** |
| Complete graph, including development dependencies | 0 | 6 | 9 | 1 | **16** |

The production snapshot contains 77 dependencies; the complete snapshot
contains 867. These are advisory counts, not counts of proven exploitable
application paths. The initial report and these final reports have
different graph classifications and optional-peer edges. Their reduction
must not be represented as 23 independently patched vulnerabilities.

The commands were `pnpm audit --prod --json` and `pnpm audit --json`.
Production audit exited 0; the complete audit exited 1 for its retained
findings. Re-run both scopes whenever the lockfile changes.

## Findings retained in the complete graph

| Package path | Relevant advisory / patched release | Disposition |
| --- | --- | --- |
| Plasmo → manifest transformer → `content-security-policy-parser` 0.4.1 | [GHSA-w2cq-g8g3-gm83](https://github.com/advisories/GHSA-w2cq-g8g3-gm83); 0.6.0 | Blind override rejected: incompatible return shape; see below. It parses our build manifest, not incoming product requests. |
| Plasmo → Parcel dev-server reporter 2.9.3 | [GHSA-qm9p-f9j5-w83w](https://github.com/advisories/GHSA-qm9p-f9j5-w83w); 2.16.4 | Updating one component of the pinned Parcel 2.9.3 family needs a separate compatibility check. Do not expose the development server publicly. |
| Plasmo → resolver → `tsup` 7.2.0 / `esbuild` 0.18.20 | [tsup DOM clobbering](https://github.com/advisories/GHSA-3mv9-4h5g-vhg3), [esbuild dev-server CORS](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | The audited tsup advisory has no patched release listed; esbuild's fix starts at 0.25.0, outside this resolver's pinned toolchain. A resolver/toolchain upgrade needs separate validation. |
| Plasmo → `sharp` 0.33.5 | [libvips](https://github.com/advisories/GHSA-f88m-g3jw-g9cj), [libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [librsvg](https://github.com/advisories/GHSA-wq5f-xc86-pv6w); all addressed by 0.35.5 | Retained pending a separate native-library/build compatibility check. Current Plasmo usage reads repository PNG icons and resizes them; the server does not process uploaded images. |
| Root Vitest → Vite → Sass → Parcel watcher → micromatch → `braces` 3.0.3 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm); no patch listed | Development/watch pattern processing. No application endpoint accepts brace patterns. |
| Plasmo → unused Svelte transformer → Svelte 4.2.2 | Seven moderate SSR/XSS advisories, including [GHSA-pr6f-5x2q-rwfp](https://github.com/advisories/GHSA-pr6f-5x2q-rwfp); newest cited fix 5.55.7 | The product uses React and has no Svelte SSR. Do not force Svelte 5 into an unused transformer built against Svelte 4 merely to silence audit. |
| Plasmo → unused Vue transformer → `@vue/server-renderer` 3.3.4 | [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6); 3.5.42 | The product does not use Vue or Vue SSR. No standalone renderer override against the old pinned Vue family. |

The seven Svelte findings are `GHSA-8266-84wp-wv5c`,
`GHSA-crpf-4hrx-3jrp`, `GHSA-m56q-vw4c-c2cp`,
`GHSA-f7gr-6p89-r883`, `GHSA-phwv-c562-gvmh`,
`GHSA-rcqx-6q8c-2c42` and `GHSA-pr6f-5x2q-rwfp`.

### Why the CSP parser override was rejected

The [upstream changelog](https://raw.githubusercontent.com/helmetjs/content-security-policy-parser/main/CHANGELOG.md)
explicitly calls 0.6.0 breaking: it returns a `Map` instead of a plain
object. Inspection of the installed Plasmo manifest transformer shows
object indexing (`result["script-src"]`) and `for...in` enumeration.
Forcing 0.6.0 underneath that implementation could omit existing CSP
directives during development-manifest transformation. A compatibility
adapter or upstream transformer fix is needed; a version-only override
would trade a known finding for a security-sensitive behavior regression.

## Narrow optional-peer packaging adjustment

Better Auth 1.7.10 declares Svelte, Vue and Vitest as optional peers. The
application does not import its Svelte, Vue or testing entrypoints. The
repository's `.pnpmfile.cjs` therefore removes these three names from both
`peerDependencies` and `peerDependenciesMeta` **only for that exact package
and version**. It first verifies that each peer is marked optional and
fails installation if that assumption no longer holds. It does not remove
any actual `dependencies` or `optionalDependencies` entry.

The [pnpm readPackage hook](https://pnpm.io/10.x/pnpmfile#hooksreadpackagepkg-context-pkg--promisepkg)
changes manifest resolution before installation, without changing library
source. Removing both declarations matters: the installed pnpm 10.28.2
resolver reconstructs optional peer entries from dangling
`peerDependenciesMeta` keys. A dependency-removal override alone left
Vitest reachable from Better Auth through the workspace root's test
package.

This adjustment is scoped to the server authentication package. Plasmo's
Svelte/Vue transformers and root Vitest remain in the development graph,
as do their visible audit findings. There are no global optional-package
ignore flags or audit exclusions. Reconsider the hook before importing one
of the removed adapters or upgrading Better Auth; the version guard makes
it intentionally inapplicable to other versions.

## Verification boundary

The complete project check passed 126 tests, typechecking, lint, formatting
and extension production build before the final metadata-only adjustment.
After it, installation, server typechecking and all 42 server tests passed.
The separate-process HTTP probe also passed: 100 concurrent health checks,
unauthenticated request rejection (401), oversized body rejection (413),
oversized tRPC batch rejection (400) and graceful SIGTERM shutdown.
The hook's scope, optional-peer assertion and preservation of actual
runtime dependencies were checked with isolated manifest fixtures.

These checks do not exercise live Google credentials, Slack delivery or a
real system mail transfer agent. The production audit's zero result does
not remove the 16 development/build findings documented above.
