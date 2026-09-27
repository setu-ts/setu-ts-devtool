# D02 local validation — 2026-09-27

Implementation on `feat/d02-connection`, stacked on D01 `2615d26` and the D02
plan/audit `457a93a`. Separate-reviewer assessment of the committed D02
implementation is recorded in [D02 security review](d02-security-review.md).
No push, PR, publication, framework modification or installed VSIX is implied.

## Qualified inputs and commands

- Framework: `26aebd0e3fd16074d7b578623577fe87a1930e83`, including PR #370.
- Deno 2.9.6; Node 24.18.0 for non-editor tests.
- Code OSS 1.138.0; embedded Node 24.19.0; Electron 42.11.8; Linux x64.
- esbuild 0.28.2; TypeScript 7.0.2; c8 10.1.3; jsonc-parser 3.3.1.
- Clean source archived by `prepare:framework`; public client bundle and generated
  CLI recipes hashed. Builds refuse mismatched artifact hashes or source pins.
  Production includes framework and jsonc-parser notices.

```sh
npm ci
npm run prepare:framework -- <clean-checkout-at-pin>
npm run check
npm run format:check
npm run test:coverage
npm run build:dev
npm run test:host
npm run build
npm run test:host -- --production
npm run test:host -- --restricted
```

The coverage command builds and runs both the unit and integration suites:
**50 tests passed, zero failed/skipped**, with the per-file gate below. Type
checking and formatting are separate gates. Framework client/protocol
qualification passed 19 tests and 122 steps, as recorded in the
[contract audit](d02-contract-audit.md). This is not the full framework milestone
verification or publish gate; no framework code is changed here.

Source archive SHA-256: `357e524044925b6be7a7b94fbf34023dce99a7016ba484bca7ccf28a37a3722f`.
Public client SHA-256: `3713e4bc653d85c40a0c5a6a4db6ea8749be7950deb500477a7145bd055d472a`.
Recipe catalog SHA-256: `3da04c4e336cfdab31f022e1b6b31bb4cbbead2ed8620004fbf3e7ed346eccd6`.

## Behavioral evidence

| Boundary            | Exercised behavior                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared launch     | Complete generated raw/formatted entries and runner/task recipes; malformed/changed configs, missing enablement, hooks and unsupported tasks refused; confirmation-time changes detected                                  |
| Executable          | Absolute user setting only; workspace overrides ignored; canonical host PATH excludes workspace/current-directory entries; bounded exact Deno version and executable identity check                                       |
| Explicit lifecycle  | No launch on discovery/selection; modal cancellation, trust/root changes, concurrent launch refusal and Stop while preparation is pending; late preparation cannot start a process                                        |
| Local deadline      | Mocked host clock at 899,999 ms remains Live; 900,000 ms stops the owned application without renewal                                                                                                                      |
| Real framework      | Actual mapped Deno kernel/runtime/connector in standalone and two-member workspaces; pair, snapshot, request event, Clear, Stop and closed listener ports                                                                 |
| Credential handoff  | Fresh hex ID/key and removal of inherited handoff/bootstrap variables; real selected app sees credentials, sibling sees blanks; canaries absent from arguments/control IPC; streams ignored; oversized start IPC rejected |
| Core authentication | Independent signed HTTP peer: honest snapshot accepted/frozen; changed header, body, both identities, invalid state and bad MAC rejected; read before pairing refused                                                     |
| Transport           | Direct numeric loopback with proxy canary receiving no traffic; unexpected URL, header, body, redirect/non-200, overflow and cancellation refused; Stop prevents late fetch                                               |
| Cleanup             | Real group/session supervisor; standalone/workspace Stop; early root exit with code 7; SIGTERM-resistant descendants require escalation and disappear; IPC loss and malformed startup fail closed                         |
| Uncertainty         | Injected identity/group/startup failures and surviving-member/inspection failure cannot report clean; Cleanup required blocks another launch; recheck is read-only                                                        |
| Retention           | One topology, 4,096 events/4 MiB cap, loss and eviction accounting, frozen allowlisted copies; Clear advances revision but preserves cursor; Stop resets records                                                          |
| Build               | Production contains no development sample marker/command; separately bundled supervisor and third-party notices; no runtime imports from framework checkout                                                               |

Both trusted Code OSS runs (development and production bundle) exercised real
standalone/workspace connection and cleanup inside the editor's Node runtime.
The actual extension was activated for discovery/selection/sample-command checks.
The connection exercise instantiates the same controller and packaged supervisor
from the test harness; native confirmation wiring is separately exercised by
`test/unit/editor.test.ts` with an editor double and real Deno launches. This is
not an automated click-through of the native dialog or a VSIX installation.
The real Restricted Mode run verifies that direct discovery/launch commands
cannot obtain projects or a live connection. Each run uses a separate profile
under `.tmp/`, leaving the normal editor profile unchanged.

A real occupied listener refuses startup before credentials/process creation.
A deliberately failing application startup now waits for cleanup before Launch
returns; the regression failed with state `Stopping` before the controller fix
and passes with `Failed` afterward. Restoring the fixture and explicitly
launching again succeeds with a distinct ID/key. A delayed listener succeeds;
a short startup deadline interrupts backoff rather than overrunning it.

Static source scan for `new Function`, `eval(`, `require(`, `as any`,
`@ts-ignore`, `Date.now()` and `globalThis.__` returned no matches. Production
builds enforce an external-import allowlist (Node builtins and `vscode` only)
and reject development sample markers. `npm audit --omit=dev` reported zero
known vulnerabilities; this is dependency metadata, not security signoff.

## Per-file coverage

c8 instruments unit/integration bundles and the real supervisor child. Source
maps remap execution to host TypeScript. Tests, build tools, framework artifacts
and dependencies are excluded after remapping. The command enforces at least
90% in **each** metric for **every** `src` file, including unchanged D01 sources.
No ignore directives or uncovered-file exclusions are used.

| Source                         | Branch % | Function % | Line % |
| ------------------------------ | -------: | ---------: | -----: |
| `src/extension.ts`             |    93.25 |        100 |    100 |
| `src/diagnostics/client.ts`    |      100 |        100 |    100 |
| `src/diagnostics/transport.ts` |    97.29 |        100 |    100 |
| `src/diagnostics/validate.ts`  |      100 |        100 |    100 |
| `src/discovery/discover.ts`    |     92.3 |        100 |  99.44 |
| `src/discovery/files.ts`       |       92 |        100 |    100 |
| `src/discovery/json.ts`        |    94.73 |        100 |    100 |
| `src/editor/connection.ts`     |     90.9 |        100 |   99.1 |
| `src/editor/context.ts`        |      100 |        100 |    100 |
| `src/editor/refresh.ts`        |      100 |        100 |    100 |
| `src/launch/credentials.ts`    |      100 |        100 |    100 |
| `src/launch/executable.ts`     |     92.1 |        100 |    100 |
| `src/launch/launcher.ts`       |       95 |       90.9 |  97.89 |
| `src/launch/preflight.ts`      |    91.42 |        100 |    100 |
| `src/launch/process-group.ts`  |     92.3 |        100 |    100 |
| `src/launch/readiness.ts`      |      100 |        100 |    100 |
| `src/launch/recipes.ts`        |      100 |        100 |    100 |
| `src/launch/supervisor.ts`     |    98.59 |        100 |  95.77 |
| `src/model/capture.ts`         |      100 |        100 |    100 |
| `src/session/controller.ts`    |     96.2 |        100 |    100 |
| `src/session/scheduler.ts`     |      100 |        100 |    100 |

## Security-review follow-up: cleanup recheck race

The security-focused self-review of `94220ab` found that two overlapping cleanup
rechecks could let a late result clear a replacement session's ownership. The
new regression in `test/unit/controller.test.ts` failed before the fix with
`Idle` instead of `Live`, and passes afterward. It also verifies that Stop
invokes the replacement launch's cleanup exactly once.

The controller now coalesces pending rechecks and applies a result only while
its captured owned handle and session generation still match Cleanup required.
A second regression rejects the shared scan, verifies launches remain blocked,
and confirms a later recheck can succeed. The full unit/integration suite now
passes 50 tests and the per-file coverage gate above. Type checking, formatting
and production build checks pass. Earlier Code OSS evidence remains from the
initial implementation; those editor runs were not repeated for this controller
fix. A subsequent independent review covers this fix; see the review report.

## Remaining acceptance work

A separate AI reviewer has approved the current implementation for the local
Linux scope. The [report](d02-security-review.md) identifies the reviewed commit,
additional checks and limits; future runtime changes require renewed review.
D03 owns graph/timeline presentation, CSP, renderer/bridge and DOM races. D04
owns published dependencies, installed VSIX, VS Code qualification and additional
OS/editor combinations. CI runs non-GUI Linux validation; the Code OSS results
above are local evidence.

Arbitrary same-user mutation is not sandboxed by recipe hashing. App code can
read its own credentials and ordinary environment. Deliberately detached
children and abrupt supervisor/host death can leave application processes
running; server TTL is not an application kill mechanism. Reopening the editor
does not recover credentials or authorize killing a saved PID.
