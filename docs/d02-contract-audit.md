# D02 contract audit — 2026-09-27

Scope: source review and focused compatibility probes for core local launch and
connection. This is not a complete framework security audit, extension release
certification, or approval of addon inspectors.

Framework: `f89fd615ad2d4b15d4dfc1e12ed74e51857db025` (clean working tree when
inspected). Devtool base: `2615d26`. M98a–g are marked complete in the framework
roadmap; M98h is in a separate active worktree and was not included. No framework
files were changed. Publication was not attempted or inferred from versions.

## Findings and disposition

| ID                          | Evidence                                                                                                                                                                               | D02 treatment                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 — blocking              | `client/client.ts` binds initial status body/header, but core snapshot/read return parsed DTOs without comparing subsequent signed headers or DTO identities with that paired identity | Framework fix and adversarial conformance tests required before live-connection acceptance; extension cannot recover the helper's hidden paired identity |
| F02 — validation gap        | `isSnapshotProjection` accepts any string state and shallow node/edge records; `isBatchProjection` does not enforce the full event/cursor contract                                     | Extension-owned bounded validators and allowlisted records; never display raw helper results                                                             |
| F03 — immutability mismatch | Core snapshot/read return mutable JSON while interface documentation says frozen; newer addon paths freeze their outputs                                                               | Own/freeze extension models; do not generalize addon guarantees to core                                                                                  |
| F04 — status evolution      | Legacy three-field status and current four-field status with eleven fixed boolean inspector keys are accepted; public client adds health/configuration/queues/traces                   | Consume current public helper, limit D02 adapter to core calls; addon UI remains separate                                                                |
| F05 — process ownership     | Generated workspace runner starts all members and best-effort signals children; this is not proof of complete descendant cleanup                                                       | Explicit all-member confirmation and qualified supervisor/group cleanup; no stale-PID escalation                                                         |
| F06 — local delivery        | Public helper bundled/imported under Node and the actual Code OSS host without a Deno global                                                                                           | Source delivery feasibility demonstrated; real server pairing, source mapping and production packaging remain acceptance gates                           |

F01 is not evidence of an unauthenticated attacker forging responses: the probe
uses a synthetic peer with the correct session signing key. It establishes that
the helper does not enforce the promised identity invariant on authenticated
responses. New addon body checks also do not establish a general response-header
binding guarantee; fixing the common exchange boundary requires testing all
operations, without expanding D02's consumed surface.

## Measured probes

Existing framework tests, run read-only from its root:

```sh
deno test --no-lock --allow-read --allow-env \
  packages/diagnostics-plugin/test/unit/client.test.ts \
  packages/cli/test/unit/devtool-planner.test.ts \
  packages/cli/test/unit/devtool-refusals.test.ts \
  packages/cli/test/unit/devtool-manifest-merge.test.ts
```

Result: **16 tests, 114 steps passed, zero failed**. These are existing focused
tests, not a complete verification/coverage/publish run.

A separate scratch probe bundled `createDiagnosticsClient` from the public
`packages/diagnostics-plugin/src/index.ts` entrypoint with esbuild 0.28.2,
ESM/Node24 output, mapping `@setu-ts/common` to that revision's public entrypoint.
It loaded in Node 24.18.0 with no Deno runtime. The build visited 48 input files;
this count is not a claim that all 48 survive tree shaking.

The probe injected fetch, crypto and timers. A synthetic signed server returned
legacy status for instance A; each fresh client then received one snapshot.
Authentication helpers from the same revision were bundled separately **for the
test peer only**, not as an extension dependency. Real credentials/network
services were not used. The snapshot retained valid base fields except the
mutation named below, and every mutation was re-signed with the synthetic key.

| Variant after status A                   | Observed core snapshot result | Required result after fix   |
| ---------------------------------------- | ----------------------------- | --------------------------- |
| Header A, body A, running state          | Accepted, mutable             | Accept                      |
| Header B, body A                         | Accepted, mutable             | Reject                      |
| Header A, body B                         | Accepted, mutable             | Reject                      |
| Header B, body B                         | Accepted, mutable             | Reject                      |
| Header A, body A, `state: "not-a-state"` | Accepted, mutable             | Reject before model/display |

To reproduce, construct one fresh public client per row, inject a peer whose
`/v1/status` response is `{version:1, instanceId:A, expiresInMs:900000}`, and
whose snapshot is `{version:1, instanceId:A, state:"running", failureCode:null,
nodes:[], edges:[], truncated:false, droppedEvents:0}` before the row's mutation.
Use distinct valid UUIDs A/B. Sign each response over the real response header
identity, request sequence, canonical target, status `200` and SHA-256 of its
exact JSON bytes using the framework test authentication helpers. Invoke
`snapshot()` and inspect acceptance and `Object.isFrozen`; close every client.
The post-fix regression suite must include batch reads and subsequent refreshes,
not just the first snapshot measured here.

An isolated Code OSS test then imported that same bundled public helper,
constructed it with host Web Crypto/fetch/timers and closed it without making a
request. Evidence: Code OSS 1.138.0, embedded Node 24.19.0, Electron 42.11.8,
`typeof globalThis.Deno === "undefined"`, passed. It used separate user-data and
extension directories under devtool `.tmp/`; no user profile was changed.
This proves import/construction only, not actual transport or npm/JSR packaging.

## Unchanged contracts and next actions

The CLI development entry, enable planner and workspace runner have no changes
between the previous reference `6de620d6206e087c601c6067786f6b4d8a219ca6` and this
reference. Credential encoding, selected-member forwarding, sibling blanks,
all-member launch, default TTL and explicit development entry still apply.
Core helper timeout/queue/terminal-pairing limitations remain. Package manifests
still say `0.7.0`, with API `@since 0.8.0`; source provenance is the local pin.

The [D02 plan](../plans/d02-connection.md) specifies implementation order, per-file
tests, safe transport, full DTO validation and a supervisor-based cleanup design.
The helper binding fix belongs in the framework repository on its own branch.
Repin all local artifacts together after that fix. Do not publish or claim D02
complete using only these probes. M98h or later work does not implicitly resolve
F01; inspect and retest the actual core exchange before changing its disposition.
