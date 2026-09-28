# D04 — Free-preview release qualification

Status: planned. This plan is the single D04 implementation plan. It does not
authorize publication, a Marketplace listing, a framework change, a push, or a
merge.

## Outcome and non-goals

Produce a repeatable, audited VSIX for the existing free local preview, plus
evidence that distinguishes what was exercised from what remains unavailable.
The installed extension must retain D01–D03's one-active-local-Deno-application
workflow: trusted local project discovery; explicit native Launch/pairing;
bounded graph/timeline display; literal filtering and selection; Clear; Stop;
reload/deactivation cleanup; and no account, analytics, capture persistence,
remote attachment, source inspection, application-output capture, or automatic
launch/restart.

The supported claim remains narrow until this plan's evidence exists: **Linux
x64 desktop VS Code and Code OSS, local `file:` workspaces, and prepared local
Deno applications only.** Browser, remote/SSH/WSL/container/Codespaces,
virtual, untrusted and non-Linux contexts refuse. Windows and macOS are not
supported or inferred from doubles; they need separately recorded installed-VSIX
and real-cleanup evidence before the claim can expand.

This plan cannot close distributable qualification with `.tmp/framework`, a
source checkout, a development-host load, an unpacked directory, a mock editor,
or a locally bundled helper. Those retain their D02/D03 local evidence only.

## Contracts, provenance, and prerequisite decision

The checked-in local-development pin is framework commit
`26aebd0e3fd16074d7b578623577fe87a1930e83`, Deno `2.9.6`, whose package
manifests declare `@setu-ts/common` and `@setu-ts/diagnostics-plugin` version
`0.7.0`. On 2026-09-28, JSR exposed `@setu-ts/common@0.7.0`, while
`https://jsr.io/@setu-ts/diagnostics-plugin/meta.json` returned 404. Therefore
the published diagnostics client prerequisite is **blocked** at planning time.
Do not change the source pin merely because framework `origin/main` advances;
the pin is a tested contract and release provenance decision.

| Source or contract                                      | Verified current fact                                                                                                                                                              | D04 requirement and consumer                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/framework-pin.json`, `prepare-framework.mjs`   | Local builds archive a clean source checkout and bundle `createDiagnosticsClient`; this is intentionally not a published dependency.                                               | Preserve it only for local regression lanes. Add a separate published-resolution preparation path; production VSIX construction consumes only that path.                                                                                       |
| Framework package manifests at the pin                  | Both required source packages declare `0.7.0`; the client is publicly exported by diagnostics-plugin.                                                                              | Resolve exact JSR package/version/integrity metadata, compile against its public exports, and fail before packaging if either package is absent, changes identity, or its public client/CLI recipes differ from the approved contract fixture. |
| `package.json`, `.vscodeignore`, `scripts/build.mjs`    | The intended current VSIX surface is `package.json`, `README.md`, `dist/extension.cjs`, `dist/supervisor.mjs`, `dist/webview/**`, and notices; build currently uses local aliases. | Make packaging deterministic, audit the archive rather than trust `.vscodeignore`, and prove no source, tests, `.tmp`, maps, framework checkout path, fixture, credential, or accidental dependency enters it.                                 |
| `src/editor/context.ts`, `src/extension.ts`             | Runtime refuses untrusted, non-desktop, remote, non-file and non-Linux contexts; manifest declares untrusted/virtual restrictions.                                                 | Exercise the installed extension through direct commands in trusted, restricted, unsupported-platform, remote/web/virtual simulations where the actual host can provide them; record whether each is a real host or a non-closing double.      |
| `src/launch/supervisor.ts`, controller and D02 evidence | Process-group ownership is Linux-specific; ordinary descendant cleanup was locally exercised.                                                                                      | Run installed-package Stop/reload/deactivation and forced-extension-host-termination exercises against real process trees. A crash must never be described as clean cleanup; externally terminate leftovers and record them.                   |
| `docs/security.md` S01, S08, S10, S14, S16, S17         | D04 owns the listed editor-matrix, stress, crash and package rows; D02/D03 own earlier local evidence.                                                                             | Add an evidence matrix with command, input fixture, host/product/version/OS, measured result, artifact digest and acceptance-row outcome. No documentation row changes to “passed” without that record.                                        |

## Release design decisions

1. Add a package tool as an exact development dependency committed with the npm
   lockfile. Its package command must receive a fixed version and produce
   `.tmp/release/setu-ts-devtool-<extension-version>.vsix`; release scripts
   reject a dirty tracked tree and never package from `dist` left by an earlier
   command. They run a clean production build first, record SHA-256/size and
   list the ZIP entries in sorted order.
2. Introduce a single release-audit script with machine-readable JSON evidence.
   It must unzip/list the VSIX independently, reject duplicate/unsafe/archive
   traversal entries, compare the exact normalized allowlist, hash every
   packaged file, and scan text/bundles (not source maps) for fixture markers,
   temporary framework paths, `Deno`, workspace-module resolution, credential
   names/values, `setuDevtool.sample`, source/test paths, and unapproved runtime
   imports. Assertions cover the extension and supervisor bundles separately.
3. The VSIX runtime must resolve its helper only from a content-addressed,
   bundled published artifact. It may not import a workspace module, a relative
   framework checkout, `Deno`, or an application dependency. The published
   preparation script records JSR URLs, exact versions, content hashes,
   signature/build metadata when available, export/type-check result and the
   generator-recipe inputs. `scripts/build.mjs` verifies that record before
   every production release build. A successful local `prepare:framework` run
   cannot satisfy this check.
4. Extend the host harness with mutually exclusive `--development` and
   `--vsix <absolute-path>` modes. VSIX mode installs exactly the supplied
   archive into a fresh extension directory and never passes
   `--extensionDevelopmentPath`; it writes product name/version, embedded Node,
   Electron, OS/arch, extension version, VSIX SHA-256 and evidence path. It
   rejects an editor executable whose reported product identity does not match
   the requested matrix row. Fresh user-data/extensions/workspace directories
   remain below `.tmp/` and are retained on failure for inspection.
5. The installed exercise uses prepared standalone and workspace fixtures made
   from the same published generator/recipe provenance. It requires explicit
   selection and launch, validates pairing, makes an application request,
   observes graph/timeline, literal filter and selection, Clear (cursor never
   rewinds), Stop, panel close/reopen, extension reload and deactivation. It
   proves all owned ordinary processes disappear after normal teardown.
6. Egress verification observes extension-host traffic during each installed
   run. Allow only the fixture application's selected `127.0.0.1:<port>`
   diagnostics exchange and the explicitly invoked fixed documentation URL in
   the documentation subtest; reject DNS, proxy, non-loopback, IPv6, remote
   assets and browser/webview fetches. Application-originated dependency/network
   traffic is excluded only by using a deterministic offline fixture and is
   never reported as extension egress.
7. Stress tests stay bounded and responsive: use capped synthetic snapshots,
   event/frame/filter/IPC floods and repeated Clear/Stop/reload cycles. Record
   peak retained counts/serialized bytes, queue/timer counts, extension-host
   responsiveness latency and RSS/heap deltas using a stated sampling method.
   A budget breach or unavailable measurement is a failure/open row, not a
   silently reduced load.

## Planned files, consumers, and tests

| File                                                                                       | Change and production consumer                                                                                                                                                      | Required verification                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`, `package-lock.json`, `.vscodeignore`                                       | Exact package-tool dependency; `package:vsix`, `audit:vsix`, `prepare:published-framework`, `test:host:vsix`, `test:release` scripts; only intentional files can enter the archive. | Unit-test script argument validation; package twice from clean copies and compare entry manifests/hashes; audit a deliberately injected forbidden file and an unexpected dependency.                                                |
| `scripts/package-vsix.mjs`                                                                 | Clean, deterministic production build/package coordinator writing only `.tmp/release/`.                                                                                             | Tests with injected command/file ports: dirty tree, missing provenance, non-reproducible entry list, tool failure and successful digest manifest.                                                                                   |
| `scripts/audit-vsix.mjs`                                                                   | ZIP/content/import/secret/provenance auditor used before install and release claims.                                                                                                | Synthetic archives cover traversal, duplicate, omitted/extra, source map, fixture, path, `Deno`, non-`vscode` runtime import, credential marker and valid archive branches.                                                         |
| `scripts/prepare-published-framework.mjs`                                                  | Resolve exact published JSR dependencies and generator recipes without using a checkout; record immutable provenance and build the helper artifact.                                 | Controlled resolver fixtures cover absent package, wrong version/export/hash, changed recipe and happy path; a real guarded JSR run is required once packages exist.                                                                |
| `scripts/host-test.mjs`, `test/host/index.ts`                                              | Installed-VSIX launcher/evidence protocol; real workflows and refusal checks under a fresh profile.                                                                                 | Assert VSIX mode has no development-path flag, requires an absolute existing archive and product identity, exercises launch/pair/graph/timeline/Clear/Stop/reload/cleanup, and fails if fixture/sample state appears in production. |
| `test/integration/release-*.test.ts`, `test/fixtures/release/`                             | Offline prepared apps, hostile labels/IPC, bounded stress and controlled process descendants; no real credentials or user traffic.                                                  | Unit/integration coverage for all new script branches and reproducible fixture generation; test output redacts generated credentials.                                                                                               |
| `docs/d04-validation.md`, `docs/d04-security-review.md`, `docs/framework-compatibility.md` | Exact matrix/evidence, renewed independent release-scope review, published provenance and open blockers.                                                                            | Human-review the evidence against actual command outputs/artifact digests; no “qualified” wording before every required Linux installed row is attached.                                                                            |
| `README.md`, `ROADMAP.md`, `plans/README.md`, `docs/architecture.md`, `docs/security.md`   | Accurate free-preview install/support/limitations instructions and acceptance-row status.                                                                                           | Documentation test/check ensures commands and links exist; reviewer confirms Windows/macOS, Marketplace, publication and crash guarantees are not overstated.                                                                       |

## Executable qualification matrix

All commands run from a clean D04 worktree after `npm ci`. `SETU_TEST_EDITOR`
is an absolute path. Values in angle brackets are recorded evidence inputs, not
defaults selected by the script.

| Lane                     | Exact command sequence                                                                                                                                                                                                                         | Required result                                                                                                                                  | Current availability                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Local regression         | `npm ci`; `npm run prepare:framework -- <clean-local-checkout-at-pin>`; `npm run check`; `npm run format:check`; `npm run test:coverage`; `npm run build`; `npm run test:host -- --production`; `npm run test:host -- --restricted`            | Preserves D01–D03 behavior and 90% branch/function/line coverage; evidence labels this **local-artifact regression**, not release qualification. | Can begin now on Linux.                                                                                                      |
| Published provenance     | `npm run prepare:published-framework -- --common @setu-ts/common@<published-version> --diagnostics @setu-ts/diagnostics-plugin@<same-compatible-version> --deno <qualified-version>`; `npm run audit:published-framework`                      | Resolver obtains both JSR artifacts, validates public exports/recipes and writes exact URLs, hashes, versions and contract result.               | Blocked until diagnostics-plugin is published and compatible.                                                                |
| Reproducible VSIX        | `git diff --exit-code`; `npm run package:vsix`; `npm run audit:vsix -- .tmp/release/setu-ts-devtool-<version>.vsix`; repeat in a second clean worktree and compare SHA-256 plus normalized entry manifest.                                     | One allowlisted archive, no unexpected content/import/egress-capable asset, identical artifacts under documented reproducibility conditions.     | Implementation can begin; final run depends on published provenance.                                                         |
| Code OSS installed Linux | `SETU_TEST_EDITOR=<absolute-code-oss> npm run test:host:vsix -- --vsix <absolute-vsix> --editor code-oss --trusted`; repeat `--restricted`; run `--unsupported-platform`, `--virtual`, `--remote` only where a real host exposes each context. | Fresh-profile install, explicit workflow, refusals with no process/network activity, actual panel/CSP, Clear/Stop/reload and normal cleanup.     | Linux Code OSS executable exists; installed mode must be implemented.                                                        |
| VS Code installed Linux  | Same command with `--editor vscode` and an executable/product evidence proving Microsoft VS Code, not a renamed Code OSS binary.                                                                                                               | Same evidence as Code OSS, independently recorded.                                                                                               | Blocked on a distinct qualifying VS Code installation; current equal version/build output is insufficient identity evidence. |
| Crash/termination        | Start installed fixture, record process tree, forcibly terminate the extension-host/editor process, verify no reconnect/persisted authority/automatic PID kill on reopen, then manually remove and record any remaining owned processes.       | S16 documents survivors honestly; no “cleaned” outcome follows a crash.                                                                          | Can begin on Linux after installed VSIX/provenance lane.                                                                     |
| Windows/macOS            | Execute the installed matrix, real fixture process tree, Stop/reload/deactivation and forced-termination exercises on native runners; attach raw logs/digests.                                                                                 | Only then consider expanding supported OS wording.                                                                                               | Requires external native runners/environments.                                                                               |

## Security acceptance mapping and failure handling

| Rows | Installed-package evidence that may close the row                                                                                                                                         | Failure handling                                                                                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01  | VS Code and Code OSS trusted/restricted/local-file runs plus real remote/web/virtual/unsupported-context refusals where supported by the host.                                            | Any command reaches discovery, launch, client creation or network in a refused context: fail, retain profile/logs, do not ship. Missing real context leaves its subcase open. |
| S08  | Packet/proxy canary evidence for the installed extension and a CSP/webview attempt, including proxy environment variables.                                                                | Any non-selected-loopback extension request, browser request or proxy use: fail and preserve sanitized trace.                                                                 |
| S10  | Installed standalone/workspace Stop, reload and deactivation with ordinary descendants; process-group disappearance confirmed.                                                            | Uncertain ownership remains Cleanup required; never kill by port/PID history. Preserve evidence and manually clean only known test group.                                     |
| S14  | Measured event/snapshot/filter/IPC/frame/reload floods under the published artifact, with stated budgets and responsive UI/host threshold.                                                | Budget/latency/measurement failure blocks release; retain bounded synthetic fixture and metrics, never user data.                                                             |
| S15  | Installed Clear, Stop, hide/reopen and reload inspect host model, renderer DOM, pending frames and editor storage for capture/filter/credential persistence.                              | Any residue blocks release; regenerate profiles and attach a redacted reproduction.                                                                                           |
| S16  | Forced extension-host/editor termination described above.                                                                                                                                 | Record residual processes and manual cleanup; the row documents limitation and cannot become a cleanup guarantee.                                                             |
| S17  | Audit of the exact installed VSIX, published dependency provenance, helper/module-resolution probes, host `Deno`-global probe, egress trace and package-content manifest in both editors. | Missing published input, mismatched digest, source fallback, unexpected content/import/egress or one-editor-only result blocks distributable release.                         |

An independent security review is mandatory after the final candidate artifact is
created. It reviews the D04 implementation diff and exact VSIX SHA-256,
re-runs a representative installed workflow and audit, verifies the evidence
matrix, and writes a separate decision in `docs/d04-security-review.md`. It
does not convert unavailable external OS/editor lanes into approvals.

## Dependency order and release criteria

1. Commit this plan. Implement deterministic package/audit infrastructure and
   tests without changing product behavior. Keep local-source preparation only
   as a clearly named regression lane.
2. Implement the independent published resolver/provenance gate and make a
   production VSIX refuse to build without it. Wait for a compatible published
   diagnostics package rather than faking this with the framework checkout.
3. Add installed-VSIX harness support, fixture provenance, product identity
   checks, egress observation and release/stress/crash exercises. Unit-test
   every failure branch before relying on real editors.
4. Run source gates and inspect the per-file coverage table: `npm run check`,
   `npm run format:check`, `npm run test:coverage`, and `npm run build`. Every
   `src/` and `webview/` file remains at least 90% branch/function/line; D04
   scripts/tests have focused coverage even though they are outside c8's source
   gate. Run the production artifact audit after every candidate build.
5. When publication and real hosts exist, run the complete matrix and record
   raw command, exit code, tool/editor/OS versions, package/provenance hashes,
   fixture revision, timings/resource metrics and cleanup outcome in D04
   evidence. Then update user documentation only to claims actually supported.

Release remains blocked until all of these are true: compatible exact published
`common` and diagnostics-plugin packages resolve; two clean builds match under
the documented conditions; the archive audit passes; installed VSIX workflows
pass in independently identified Linux VS Code and Code OSS; S01/S08/S10/S14/
S15/S16/S17 evidence is attached with limitations; a renewed independent
security review approves the candidate; and all normal gates/coverage pass.
Windows/macOS support, Marketplace publication, crash-proof cleanup and any
claim beyond the free local preview remain blocked even after Linux qualification
unless their own evidence is added.
