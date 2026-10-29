# D04 — Free-preview release qualification

Status: planned; rebased 2026-10-29 onto framework `v0.10.0` on npm (it was first
written 2026-09-28 against `0.7.0` on JSR). This is the single D04 implementation plan. It does not
authorize publication, a Marketplace listing, a framework change, a push, or a
merge.

## Outcome and support claim

Produce one reproducible, audited VSIX for the existing free local preview and
evidence that separates exercised behavior from unavailable environments. The
installed extension retains D01–D03's workflow: trusted local discovery;
explicit native selection, Launch and authenticated pairing; bounded
graph/timeline inspection; literal filtering and selection; Clear; Stop;
reload/deactivation cleanup; and no account, analytics, capture persistence,
remote attachment, source inspection, application-output capture, or automatic
launch/restart.

The first support claim is **Linux x64 desktop VS Code 1.138.0 and Code OSS
1.138.0, local `file:` workspaces, Deno 2.9.6 and prepared Setu-TS 0.10.0
applications**. Node applications are D06 and are not part of this claim (see
"Order relative to D03b and D06" below). Browser, remote/SSH/WSL/container/Codespaces, virtual,
untrusted and non-Linux contexts must refuse. Windows and macOS remain
unsupported after their installed refusal checks; support can expand only after
their own real launch/process-cleanup matrices pass.

A source checkout, `.tmp/framework`, development-host load, unpacked extension,
mock editor, or locally bundled helper cannot close distributable
qualification. D02/D03 local evidence remains useful regression evidence only.

## Verified prerequisites and release set

The source contract pin is the framework `v0.10.0` release commit
`d7a04734be8a4658774c7fe5b5e30297d5103ef3`, moved by D03b (merged as
setu-ts-devtool#14). Since
`v0.9.0` the framework publishes only to npm; JSR receives no further releases.
On 2026-10-29 npm served every package below at `0.10.0`, each with a
`sha512` integrity, and `@setu-ts/cli@0.10.0` declares a `setu` bin with
`engines.node` `^22.23.4 || ^24.22.1 || >=26.12.1`. The framework's own Deno lane
still pins Deno `2.9.6`.

| Component                     | Required release | D04 consumer                                                               |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `@setu-ts/common`             | `0.10.0`         | Extension DTO types and diagnostics-client dependency                      |
| `@setu-ts/diagnostics-plugin` | `0.10.0`         | Bundled public `createDiagnosticsClient`; also imported by fixture members |
| `@setu-ts/kernel`             | `0.10.0`         | Real standalone/workspace fixture application                              |
| `@setu-ts/runtime`            | `0.10.0`         | Fixture runtime                                                            |
| `@setu-ts/testing`            | `0.10.0`         | Listed in every generated Deno project's import map                        |
| `@setu-ts/cli`                | `0.10.0`         | Public `setu` bin generates the qualification fixtures                     |
| Node                          | `24.22.1`        | Runs the CLI and the extension host build                                  |
| Deno                          | `2.9.6`          | Inspected application runtime                                              |
| VS Code / Code OSS            | `1.138.0`        | Independently identified installed-extension hosts                         |

`scripts/framework-release.json` commits exactly those package names, versions,
the source commit and the Node and Deno versions. `package-lock.json` pins
`@setu-ts/common` and `@setu-ts/diagnostics-plugin` from the npm registry with
their resolved URLs and integrity. The CLI is installed into its own
`.tmp/framework-published/cli` tree with `npm ci`, from
`scripts/release/cli/package.json` and its committed `package-lock.json` (which
the preparation script copies there first), so its full dependency graph is
pinned too. Generated Deno projects name the
framework as `npm:@setu-ts/<pkg>@^0.10.0` (measured 2026-10-29); the preparation
step rewrites each to the exact `npm:@setu-ts/<pkg>@0.10.0` and writes a frozen
Deno lock, so no caret range, newest release or mixed local/published package
is accepted.

The CLI's renderer helpers are internal. D04 does not import
`src/devtool/dev-entry.ts`, `src/workspace/dev-runner.ts` or any other
unpublished subpath. It runs only the published `setu` bin. The checked-in
fixture overlay adds only deterministic `/ready`, `/items`, hostile-label and
stress routes; the generated entry, tasks, runner and manifests stay CLI output.
The preparation audit rejects any generated framework import that is not
rewritten to an exact `0.10.0` specifier and verifies the Deno lock before
launch.

## Work that can proceed and hard blockers

| Class                                  | Work                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can start now                          | Deterministic staging/ZIP canonicalization, archive auditor, release-script unit tests, installed-host orchestration, fixture overlay, acceptance-ledger format, local D01–D03 regression lane |
| Unblocked by D03b (merged)             | Published preparation, release build, reproducibility proof, exact VSIX digest, installed launch/pairing and S17 helper-provenance evidence (the packages are published)                       |
| Available locally after implementation | Linux Code OSS installed trusted/restricted/virtual workflow, Linux crash/stress/egress exercises                                                                                              |
| Needs another installed product        | Microsoft VS Code Linux matrix; `/usr/bin/code` and `/usr/bin/code-oss` currently identify the same Code OSS build and count once                                                              |
| Needs external environments            | Real Remote-SSH window; web extension host; Windows and macOS installed refusal runs                                                                                                           |
| Remains blocked after Linux release    | Windows/macOS support, Marketplace publication, crash-proof cleanup, remote/browser/virtual support, and Node applications (D06)                                                               |

Missing published or environment evidence is a failed/open gate, never a skip.
D04 cannot declare the Linux preview releasable while a required refusal,
published-provenance, VS Code, or Code OSS row is open.

## Build and provenance design

There are two explicit, non-interchangeable artifact modes:

- `npm run build:local` and existing tests use
  `.tmp/framework-local/provenance.json`, created from the clean source pin.
  This preserves D01–D03 regression behavior and cannot feed `package:vsix`.
- `npm run build:release` uses
  `.tmp/framework-published/provenance.json`, the exact npm/Deno locks and
  extracted published artifacts. It refuses a local provenance kind, checkout
  path, missing registry integrity, unexpected package/version, changed export,
  dirty lock or hash mismatch.

`scripts/build.mjs` accepts exactly `--framework=local` or
`--framework=published`; it has no implicit mode. Both aliases point only into
the selected prepared directory. Published mode bundles the npm-compatible
public helper and common package, writes notices from recorded package license
files, and names package versions, npm registry URLs and integrity rather than a local
checkout. Production supervisor source maps are disabled; development/test
maps stay outside the VSIX. The build continues to reject non-`vscode`/Node
runtime imports, development sample markers, fixture modules and temporary
paths.

Published preparation installs the CLI from its committed lockfile, then caches
the fixture graph against the exact Deno lock:

```sh
npm ci --prefix .tmp/framework-published/cli --ignore-scripts
deno cache --frozen --lock=.tmp/framework-published/deno.lock \
  npm:@setu-ts/common@0.10.0 npm:@setu-ts/diagnostics-plugin@0.10.0 \
  npm:@setu-ts/kernel@0.10.0 npm:@setu-ts/runtime@0.10.0 \
  npm:@setu-ts/testing@0.10.0
```

The script, not a human, runs the CLI commands below in an empty
`.tmp/release-fixtures` root, checks each exit status and output, rewrites the
generated framework specifiers to exact versions and applies the fixed fixture
overlay. The flags were checked against `cli@0.10.0` on 2026-10-29:

```sh
SETU=.tmp/framework-published/cli/node_modules/.bin/setu
$SETU new d04-standalone --runtime deno --devtool --devtool-port 49191 \
  --yes --dir .tmp/release-fixtures
$SETU new d04-workspace --workspace --runtime deno --yes \
  --dir .tmp/release-fixtures
$SETU generate app api --devtool --devtool-port 49192 --port 43101 \
  --dir .tmp/release-fixtures/d04-workspace
$SETU generate app worker --port 43102 --depends-on api \
  --dir .tmp/release-fixtures/d04-workspace
```

It derives the release `recipes.json` only from the generated `main.dev.ts`,
root runner and task strings, records their hashes in published provenance, and
proves `prepareLaunch` accepts both generated projects. No private CLI renderer
is bundled or invoked.

Any permission found unnecessary during implementation is removed; no broader
permission may be added without updating and reviewing this plan.

## Deterministic VSIX and exact contents

Add exact development dependencies `@vscode/vsce@4.0.0`,
`@vscode/test-web@0.0.74`, `playwright-core@1.63.0`, `yazl@2.5.1`, and
`yauzl@3.2.0`, with lockfile integrity. `@vscode/vsce` creates the VSIX
metadata; a release script then rewrites the archive in lexical entry order
with timestamp `1980-01-01T00:00:00.000Z`, file mode `0100644`, no directory
entries and DEFLATE level 6 under pinned Node 24. `yauzl`, independent of the
writer, audits the final archive.

Packaging rejects any output from
`git status --porcelain=v1 --untracked-files=all` except ignored `.tmp/`, removes
and rebuilds `dist`, copies the allowlist into a fresh staging root, and invokes
`node_modules/.bin/vsce package --no-dependencies`. The canonical artifact is
`.tmp/release/d04/setu-ts-devtool-0.0.1.vsix`. It must contain exactly:

```text
[Content_Types].xml
_rels/.rels
extension.vsixmanifest
extension/package.json
extension/README.md
extension/dist/THIRD_PARTY_NOTICES.txt
extension/dist/extension.cjs
extension/dist/supervisor.mjs
extension/dist/webview/main.js
extension/dist/webview/style.css
```

The auditor rejects duplicate, directory, absolute, backslash, traversal,
symlink and unexpected entries; missing entries; executable mode; source maps;
source/test/config files; `.tmp` or absolute paths; source-checkout commit/path
fallbacks; fixture/sample markers; `Deno` or workspace module resolution in the
host; credential names or test values; remote assets; and runtime imports other
than `vscode` or Node built-ins. It parses the manifest/XML, verifies
publisher/name/version/preview/engine/main/resource paths, hashes every entry,
and writes:

```text
.tmp/release/d04/setu-ts-devtool-0.0.1.sha256
.tmp/release/d04/package-entries.json
.tmp/release/d04/framework-provenance.json
.tmp/release/d04/package-audit.json
```

Reproducibility verifies the canonical tree is clean, writes a source manifest
containing `HEAD`, its commit timestamp and every archived file hash, then uses
two separate `git archive HEAD` extractions at `.tmp/repro-a` and
`.tmp/repro-b`. The reproducibility orchestrator alone may pass that manifest
to an internal replica-build function; each extraction must match it before
`npm ci`, published preparation and release packaging. The replica function has
no general CLI flag that bypasses the canonical clean-tree check. Both runs use
`TZ=UTC`, `LC_ALL=C`, and the recorded commit time as `SOURCE_DATE_EPOCH`.
Their VSIX SHA-256 values and entry-by-entry hashes must match despite different
absolute source directories.

## Installed-editor driver and context matrix

`scripts/release/host-vsix.mjs` first runs the editor CLI with
`--install-extension <absolute-vsix> --force --extensions-dir <fresh-dir>`.
The editor process then receives the same fresh extension/user/workspace
directories, `--extensionTestsPath=<absolute out/host/index.cjs>`, and a fixed
loopback `--remote-debugging-port`; it receives neither
`--extensionDevelopmentPath` nor `--disable-extensions`. The isolated extension
directory contains only the audited target VSIX. The runner asserts that the
extension path is inside that directory and its package/version/digest match
the candidate.

`scripts/release/drive-editor.mjs` attaches with Playwright over the loopback
Chrome debugging protocol. It opens the command palette, chooses the real
Select and Launch commands, fills the diagnostics port, reads the modal launch
scope, clicks the visible `Launch` button, opens the inspection panel and uses
its actual controls. No product command, hidden setting, exported controller,
or test-only bypass is added. `test/host/index.ts` coordinates through bounded
files under the fresh profile and observes only public VS Code APIs; its
installed lane must not call the existing direct `exerciseConnection()` helper.

The trusted installed workflow performs both standalone and workspace runs:

1. discover and select through native UI;
2. inspect the modal directory/member/instrumented-target/Deno/port scope;
3. launch, pair, issue `/items`, observe graph and request/middleware timeline;
4. filter and select a record, then Clear and prove the cursor is not rewound;
5. hide/reopen the panel, reload the window and prove no capture/session is
   restored or silently reattached;
6. relaunch explicitly, then Stop and deactivate; and
7. verify every ordinary owned fixture process/group and diagnostics/app port
   disappears.

Each product must identify itself through `vscode.env.appName`, editor version,
commit, embedded Node/Electron, executable realpath and package signature/source.
Two paths reporting the same product/build count once.

Required refusal runs are hard gates:

| Context       | Real exercise                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Restricted    | Fresh profile opens the installed VSIX in Restricted Mode; direct Refresh/Select/Launch/Open Inspection invocations produce no file read beyond host setup, process, credential or INET activity.                                         |
| Virtual       | The host runner registers a bounded in-memory filesystem provider, replaces the workspace with its real virtual URI and invokes every command; the runtime gate refuses.                                                                  |
| Web           | `@vscode/test-web@0.0.74` serves an extraction of the exact VSIX; the main-only UI extension cannot activate and no target command/network route exists.                                                                                  |
| Remote        | A self-hosted Linux qualification runner opens a real Remote-SSH window against an isolated loopback SSH fixture with an exact pinned Remote-SSH extension; the local UI host sees `env.remoteName` and refuses before reading/launching. |
| Windows/macOS | Native runners install the candidate and invoke all commands in trusted local workspaces; the platform refusal occurs before discovery/network/process creation. These runs do not qualify launch or cleanup support.                     |

Absence of the real Remote-SSH, web, Windows, macOS, VS Code or Code OSS result
blocks D04 release qualification. Unit context doubles remain regression tests,
not substitutes.

## Egress, stress, crash, and cleanup exercises

On Linux, the installed editor is launched under
`strace -ff -yy -e trace=connect,sendto,sendmsg`. The host runner records its
extension-host PID; the fixture records supervisor/Deno PID, process-group,
start-time and canonical scratch root without credentials. The auditor
classifies traces by those identities. For the target extension host, the only
permitted INET connection is the selected numeric
`127.0.0.1:<diagnostics-port>`; DNS, proxy, IPv6 and non-loopback attempts fail
the run. AF_UNIX editor IPC is recorded separately. The extensions directory
contains no unrelated extension. Telemetry, updates and extension checks are
disabled in the fresh profile.

Restricted/virtual refusal runs add
`openat,newfstatat,readlink,readlinkat` tracing and bracket direct command
invocations with evidence timestamps. The auditor rejects target workspace-path
access in that interval; editor/profile/extension loading before the bracket is
classified separately and cannot satisfy discovery.

The fixed documentation-link subtest sets a scratch browser recorder as the OS
handler. It must receive exactly one allowlisted HTTPS URL without query or
fragment and performs no network request. CDP attempts hostile webview fetches
and remote resources; CSP must block them and the network trace must remain
empty. Proxy environment variables point to a loopback canary that records and
fails any use. Raw trace evidence is sanitized to numeric addresses and scratch
paths only.

The stress fixture creates the contract maxima of 1,024 nodes and 4,096 edges,
then sends 50,000 `/items` requests at concurrency 32. The driver performs 1,000
literal filter/page/selection changes capped at the specified 20 messages per
second, 100 burst messages to prove rate refusal, 25 Clear cycles and five
hide/reopen cycles before Stop. Unit evidence still proves exact array/index/
frame/queue limits; installed evidence must show distinct loss/drop/eviction/
clipping indicators and no stale restoration.

Sample extension-host `rss` and `heapUsed` every 250 ms through the host runner;
sample renderer animation-frame delay through CDP. The exact unit gates must
first prove the 4,096-event/4-MiB capture, 256-KiB frame, one-outstanding plus
one-replacement frame, and single-helper-request limits. After a 30-second
installed idle settle, acceptance additionally requires UI action latency p95
at or below 500 ms and maximum below 2 seconds, settled extension-host RSS no
more than 192 MiB above baseline, settled heap no more than 96 MiB above
baseline, every capture-quality indicator visible, and no stale record after
Clear/Stop/reload. Re-run once after an environmental outlier; a second breach
blocks release and both measurements remain in evidence.

For S16, terminate the recorded extension-host process during a live installed
workspace run, reopen with the same profile, and verify no recovered credentials,
capture, PID authority, session or silent reconnect. Record surviving processes
as the expected limitation. External cleanup signals only the recorded test
process group after revalidating PID start-time, group, command and cwd under
`.tmp/release-fixtures`; any mismatch stops cleanup for manual inspection.
TTL is checked separately and is never described as process cleanup.

Evidence is written under `.tmp/release/d04/evidence/`:

```text
hosts/<product>/<context>.json
network/<product>-trusted.json
network/<product>-documentation.json
process/<product>-normal.json
process/<product>-crash.json
stress/<product>.json
acceptance.json
```

Every JSON record includes candidate SHA-256, framework release-set digest,
source commit, fixture digest, command, exit status, timestamps, product/editor/
Node/Electron/OS/arch versions, context, measured bounds, cleanup outcome and
artifact-relative log paths. Failure retains the isolated profile and sanitized
logs; success removes profiles only after evidence is copied. Nothing under
`.tmp/` is committed.

## Planned files and exact tests

| File                                                                                                                                         | Consumer/change                                                                                       | Test                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/framework-release.json`, `package.json`, `package-lock.json`                                                                        | Exact five-package release set and release/test tools                                                 | `test/release/published-framework.test.mjs`                                                                                                      |
| `scripts/prepare-framework.mjs`, `scripts/framework-integrity.mjs`, `scripts/build.mjs`                                                      | Separate local/published provenance, aliases and notices                                              | Existing build tests plus `test/release/published-framework.test.mjs` and `test/release/release-build.test.mjs`                                  |
| `scripts/release/cli/package.json`, `scripts/release/cli/package-lock.json`                                                                  | Exact `@setu-ts/cli@0.10.0` install graph for fixture generation                                      | `test/release/published-framework.test.mjs`: the lock names exactly `0.10.0` with integrity                                                      |
| `scripts/release/prepare-published-framework.mjs`                                                                                            | Public registry resolution, locks, CLI fixture generation and overlay audit                           | `test/release/published-framework.test.mjs`: absent/mixed/range/private-import/hash/export/lock/permission failures and guarded real npm success |
| `scripts/release/package-vsix.mjs`                                                                                                           | Clean staging, VSCE invocation, canonical ZIP and reproducibility manifest                            | `test/release/package-vsix.test.mjs`: dirty/untracked tree, tool failure, timestamp/path variance and byte-identical success                     |
| `scripts/release/audit-vsix.mjs`                                                                                                             | Independent exact-entry/XML/manifest/bundle/provenance auditor                                        | `test/release/audit-vsix.test.mjs`: traversal, duplicate, mode, missing/extra/map/source/fixture/path/import/credential and valid archives       |
| `scripts/release/host-vsix.mjs`, `scripts/release/drive-editor.mjs`                                                                          | Install-only host orchestration and real native/webview UI driver                                     | `test/release/host-vsix.test.mjs`: arguments, product identity, digest/path, timeouts, evidence protocol and cleanup                             |
| `scripts/release/audit-network.mjs`, `scripts/release/stress-vsix.mjs`                                                                       | Trace classification and fixed resource workload/thresholds                                           | `test/release/network-stress.test.mjs`: allowed loopback/UNIX plus DNS/proxy/IPv6/remote/limit/latency/memory failures                           |
| `scripts/host-test.mjs`, `test/host/index.ts`                                                                                                | Preserve development mode; add coordinated installed mode without direct controller exercise          | `test/release/host-vsix.test.mjs` and real product matrix                                                                                        |
| `test/fixtures/release/app-overlay.ts`, `test/fixtures/release/hostile-labels.json`                                                          | Deterministic endpoints, maximum topology and inert hostile labels copied over public CLI output      | `test/release/published-framework.test.mjs` and installed behavior/stress runs                                                                   |
| `.vscodeignore`, `README.md`, `ROADMAP.md`, `plans/README.md`, `docs/architecture.md`, `docs/framework-compatibility.md`, `docs/security.md` | Exact package boundary, install/support/limitations and evidence links                                | `test/release/docs.test.mjs` plus Prettier                                                                                                       |
| `docs/d04-validation.md`, `docs/d04-security-review.md`                                                                                      | Candidate matrix/full acceptance ledger and independent review                                        | Candidate/evidence digest checker in `test/release/docs.test.mjs`                                                                                |
| `.github/workflows/ci.yml`, `.github/workflows/release-qualification.yml`                                                                    | Local regression, mandatory published static release job and explicit self-hosted editor/context jobs | Workflow syntax/action-pin audit in `test/release/docs.test.mjs`                                                                                 |

`npm run test:release-unit` runs c8 over `scripts/release/**/*.mjs` with 90%
branch/function/line per-file thresholds; scripts use importable functions and a
thin guarded CLI. The ordinary `npm run test:coverage` continues enforcing 90%
per source/webview file. `format`/`format:check` must include this plan and every
new script/test/evidence document explicitly.

## CI and executable qualification commands

The existing `linux` job remains the source-pin regression job. A non-optional
`release-static` job performs `npm ci`, published preparation, release-script
coverage, normal coverage, release build, two-extraction reproducibility and
archive audit. It fails while the pin, `framework-release.json` or a lock is out
of step with `0.10.0`; it is never conditionally skipped. The separately triggered
`release-qualification.yml` uses pinned actions and named self-hosted labels for
Linux VS Code, Linux Code OSS, Linux Remote-SSH, Windows and macOS. Raw `.tmp`
evidence is uploaded only after sanitization; the VSIX is retained as a CI
artifact, not published.

The exact runner selectors are `[self-hosted,d04,linux,x64,vscode]`,
`[self-hosted,d04,linux,x64,code-oss]`,
`[self-hosted,d04,linux,x64,remote-ssh]`,
`[self-hosted,d04,windows,x64,refusal]`, and
`[self-hosted,d04,macos,arm64,refusal]`. A runner with a different label set
cannot produce evidence for that row.

```sh
npm ci
npm run prepare:framework -- <clean-source-checkout-at-pin>
npm run check
npm run format:check
npm run test:coverage
npm run build:local
npm run test:host -- --production
npm run test:host -- --restricted

npm run prepare:published-framework
npm run test:release-unit
npm run build:release
npm run package:vsix
npm run audit:vsix -- .tmp/release/d04/setu-ts-devtool-0.0.1.vsix
npm run test:reproducible-vsix
SETU_TEST_EDITOR=/absolute/code-oss npm run test:host:vsix -- \
  --product code-oss --all-local-contexts
SETU_TEST_EDITOR=/absolute/microsoft-code npm run test:host:vsix -- \
  --product vscode --all-local-contexts
npm run test:egress -- --product code-oss
npm run test:egress -- --product vscode
npm run test:stress -- --product code-oss
npm run test:crash -- --product code-oss
npm run check:d04-evidence
```

## S01–S18 closure ledger

D04 validation contains one row per ID with prior commit/evidence, D04 command,
candidate digest, result and reviewer disposition. A prior approval carries only
when its runtime sources are byte-identical in the candidate; build-boundary
changes require installed re-exercise.

| IDs     | D04 closure requirement                                                                                                                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01     | Installed trusted/restricted/virtual/web/Remote-SSH/Windows/macOS direct-command matrix. D04 supplies the missing editor/context evidence.                                                                                         |
| S02–S07 | Re-run D01/D02 parser, preflight, credential, executable, readiness and signed-transport suites; installed standalone/workspace workflow confirms the release bundle. Carry prior independent findings only for unchanged sources. |
| S08     | Installed proxy canary, `strace` target-host classification, browser-Origin framework regression and CSP fetch attempt.                                                                                                            |
| S09     | Re-run neutral-error/deadline suite and inspect installed wording; renewal behaves as D03b specifies, with no retry of a refused renewal.                                                                                          |
| S10     | Installed normal Stop/reload/deactivation process trees in both Linux products plus D02 resistant/early-root regressions.                                                                                                          |
| S11     | Re-run generation races and installed Clear/Stop/reload/relaunch sequence.                                                                                                                                                         |
| S12–S13 | Re-run hostile renderer/CSP/IPC suites and repeat hostile labels, fixed documentation handler and rate refusal in the installed candidate.                                                                                         |
| S14     | Existing exact bound tests plus the fixed installed stress thresholds and evidence.                                                                                                                                                |
| S15     | Installed host/DOM/frame/storage inspection after Clear, Stop, hide/reopen and reload, plus existing cursor regression.                                                                                                            |
| S16     | Forced extension-host termination, honest survivors, no persisted authority/reconnect and externally verified cleanup. D04 is the owning milestone.                                                                                |
| S17     | Exact published provenance, deterministic audited VSIX, two installed Linux products, no workspace resolution/Deno global/unexpected egress. D04 is the owning milestone.                                                          |
| S18     | Re-run loss/partial projection suites and observe all distinct indicators under the installed stress candidate.                                                                                                                    |

S16 and S17 are newly closable by D04. S01, S08, S10 and S14 become closable
only by combining prior implementation evidence with the D04 matrix. The other
rows may close only after their exact prior evidence is carried against an
unchanged source digest and their named regression/installed checks above pass.
No blanket “all rows passed” statement is permitted.

## Preview documentation and known limitations

The final README is written for the installed VSIX and contains the exact
installation command for each qualified editor, SHA-256 verification, supported
matrix, Select → Launch → Inspect → Clear/Stop workflow, workspace all-member
launch warning, the session lifetime (renewed by D03b up to the cap the generated
entry sets), fixed documentation destinations and
uninstall instructions. It names the extension version, framework release set,
candidate digest and validation document.

Known limitations remain explicit: local Linux/Deno only; one active application
per window; no attach, automatic restart, persistence, export, log capture,
source navigation, account, telemetry or billing; Clear is
local and does not rewind the server cursor; streamed response completion is not
timed; identities are instance-local; graph edges do not prove runtime calls;
durations are inclusive elapsed time; workspace Launch starts every member; and
an editor/host crash may leave application processes that require manual cleanup.
Unsupported Windows/macOS, remote, web and virtual contexts are refusals, not
partially working modes.

## Order relative to D03b and D06

D04 depends on D03b (ROADMAP milestone table): the preview must not ship with a
fixed 15-minute session. D03b (merged, setu-ts-devtool#14) moved the contract pin
to `v0.10.0`, regenerated the launcher's recipe catalog from `cli@0.10.0` and
added renewal; D04 qualifies that build. Node applications are D06, which needs a framework release containing
M126 (merged, not yet released). Whether the first preview waits for D06 is an
open ROADMAP decision. If it does, this plan's support claim, release set and
fixture commands move to that release and gain the Node rows in the same PR.

The devtool is free and MIT-licensed (2026-10-29). Marketplace publication stays
a separate, explicitly authorized action.

## Dependency order and release decision

1. Commit this corrected plan. Implement importable deterministic package,
   audit, evidence-schema and unit-test infrastructure; keep product behavior
   unchanged.
2. Implement explicit local/published build modes and public-CLI fixture
   generation against `0.10.0`. D03b has merged, so the release lane runs
   against the `v0.10.0` pin from the start.
3. Implement installed UI driving, refusal contexts, trace classification,
   stress and crash harnesses. First prove their failure branches with synthetic
   evidence, then run real products/environments.
4. Run normal and release coverage/build/audit/reproducibility jobs. Inspect the
   per-file tables, package entries, locks, hashes and forbidden-content scan.
5. Run every required editor/context row, write `docs/d04-validation.md`, and
   obtain an independent security review of the exact candidate VSIX SHA-256.
   The reviewer re-runs the audit and one installed workflow and validates the
   full S01–S18 ledger.
6. Update user documentation only to the support claims the evidence proves.
   Publication remains a separate explicitly authorized action.

D04 is complete only when the exact release set resolves from npm; both clean
builds match; package audit passes; identified Linux VS Code and Code OSS
installed workflows pass; every refusal context has real evidence; all required
S01–S18 rows have a non-open disposition; normal/release coverage passes; and
the independent review approves the candidate. Unavailable evidence blocks the
release claim without reducing the acceptance criteria.
