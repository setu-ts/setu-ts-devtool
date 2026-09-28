# Framework compatibility and contract register

Source baseline: Setu-TS commit
[`26aebd0e3fd16074d7b578623577fe87a1930e83`](https://github.com/setu-ts/setu-ts/commit/26aebd0e3fd16074d7b578623577fe87a1930e83),
inspected 2026-09-27. M98a–g are implemented and merged. The diagnostics
release remains unpublished in the development workflow. Publication is planned after M99 in the next framework release
cycle. This commit is an integration reference, not a minimum supported release;
manifest versions and `@since` comments do not establish availability.

This register replaces the earlier M98 proposal baseline. It records observed
implementation behavior and extension requirements. D02 now has
[local end-to-end evidence](d02-validation.md); released-package and VSIX
compatibility are still unqualified.

The [architecture](architecture.md) turns these contracts into extension design
decisions; the [security model](security.md) tracks their required acceptance
evidence. Neither document changes the framework contracts recorded here.

## Source register

Links are pinned to the inspected revision. Consume package entrypoint exports,
the documented wire protocol, and generated-project contracts. Do not import
private framework modules into the extension.

| Source                                                                                                                                                                                                                                                                                                                      | Implemented surface                                                   | Consumer                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------- |
| [Common diagnostics types](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/common/src/services/diagnostics.ts) and [application interface](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/common/src/plugin.ts)                        | Optional `IApplication.diagnostics`, snapshot and cursor-based reader | D02 adapter, D03 views    |
| [Kernel collector](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/kernel/src/diagnostics/collector.ts) and [projection rules](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/kernel/src/diagnostics/projection.ts)                    | Opt-in collection, exact label approvals, bounded topology/events     | D03 interpretation        |
| [Connector exports](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/diagnostics-plugin/src/index.ts) and [interfaces](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/diagnostics-plugin/src/interfaces/index.ts)                       | Plugin and injected native client                                     | D02 launch/client adapter |
| [Client implementation](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/diagnostics-plugin/src/client/client.ts) and [protocol validation](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/diagnostics-plugin/src/protocol/protocol.ts) | Authenticated, serialized reads; limitations below                    | D02 connection policy     |
| [Protocol v1](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/docs/diagnostics-protocol.md) and [plugin lifecycle](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/diagnostics-plugin/src/plugin/diagnostics-plugin.ts)                          | Signed loopback HTTP, finite sessions, teardown                       | D02 trust boundary        |
| [Development entry](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/cli/src/devtool/dev-entry.ts) and [enable planner](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/cli/src/devtool/planner.ts)                                      | M98c `main.dev.ts`, `dev` task and credential reads                   | D02 preflight/launch      |
| [Workspace manifest](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/cli/src/workspace/manifest.ts) and [development runner](https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/packages/cli/src/workspace/dev-runner.ts)                           | Member `devtoolPort`, selection and credential isolation              | D01 discovery, D02 launch |

## M98a: data and interpretation

Collection requires explicit kernel configuration; enabling collection does not
open a listener. `IApplication.diagnostics` is optional. Its reader exposes
synchronous `snapshot()` and `read(after, limit?)`; the network client exposes
asynchronous equivalents.

| Projection | Fields relevant to the extension                                                                                                                       | Meaning                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Snapshot   | `version: 1`, `instanceId`, `state`, `failureCode`, `nodes`, `edges`, `truncated`, `droppedEvents`                                                     | Bounded composition and lifecycle state; instance can be null before initialization                     |
| Node       | `id`, `kind`, optional `label`, `version`, `method`, `priority`, `position`, `registered`                                                              | Kinds: plugin, capability, route, middleware; positions are one-based                                   |
| Edge       | `from`, `to`, `kind`                                                                                                                                   | `provides`, `requires`, `optional`, `consumes` describe declarations; `owns` records observed ownership |
| Event      | `sequence`, `operationId`, `parentOperationId`, `kind`, `stage`, `nodeId`, `outcome`, `atMs`, `durationMs`, optional `statusCode`, `traceId`, `spanId` | Completion records; nullable fields follow common types                                                 |
| Batch      | `version: 1`, `instanceId`, `events`, `next`, `lost`, `closed`                                                                                         | Cursor advancement, discarded/evicted-event gaps and reader closure                                     |

Use exported common unions for stages and outcomes. Snapshot states are
`created`, `starting`, `running`, `failed`, `stopping`, `closed`; failure codes
are nullable `startup-failed` or `shutdown-failed`. Event kinds are `lifecycle`,
`request`, `middleware`, `handler`.

- IDs such as `p1`, `r1` and `op1` are opaque and instance-local. Never
  correlate across launches. Capability `registered` does not mean ready,
  healthy or instantiated; declarations do not prove runtime calls. This is not
  a complete class-level dependency-injection graph.
- Labels require exact application-side approval per
  plugin/capability/route/middleware family. Each family accepts at most 256
  entries, each at most 160 UTF-8 bytes without control characters. Empty
  approvals suppress names and route patterns. Valid bounded plugin versions are
  still emitted independently of name approval; label-free does not mean
  metadata-free.
- `atMs` is the operation's start offset from runtime initialization;
  `durationMs` is inclusive elapsed time. Events arrive in completion order, so
  parents may follow children. Null timing is valid early in startup. Do not sum
  nested durations as exclusive CPU time. HTTP response timing does not measure
  completion of a streamed response body.
- `read` accepts a non-negative safe-integer cursor and a limit of 1–128,
  default 128. A zero cursor starts from retained history. `next` is the last
  returned sequence, or the requested cursor when nothing is returned. `lost`
  counts sequence gaps from eviction or failed-start discards; snapshot `droppedEvents` counts events rejected
  before ring insertion. Display them separately. A cursor beyond an open
  collector's sequence is invalid. After teardown, a closed reader instead
  returns an empty batch preserving the requested cursor. Reset the extension
  cursor only for an explicitly new session.
- Limits are 1,024 retained events, 1,024 bytes per event, 1,024 nodes, 4,096
  edges and 256 KiB of compact snapshot JSON. Truncation and loss are expected
  under load. Extension retention needs separate bounds.
- Startup failure and final shutdown clear collector buffers. The connector
  starts during bootstrap; failed-startup history is not guaranteed retrievable.
  An open connector socket does not prove the application finished starting.
- HTTP pipeline observations do not describe WebSocket frames, gRPC handler
  internals, queue workers or arbitrary service calls. Optional trace
  identifiers do not constitute a general span feed.
- Kernel reader and public core client results are deeply frozen at this pin.
  The client validates exact wire shapes and binds response headers and bodies
  to the authenticated paired instance before returning them.

## M98b: connection and session contract

`@setu-ts/diagnostics-plugin` exports `DiagnosticsPlugin`,
`createDiagnosticsClient`, and the types `DiagnosticsPluginOptions`,
`IDiagnosticsPlugin`, `DiagnosticsClientOptions`, `IDiagnosticsClient`. Internal
error constants and protocol validators are not public exports.

The plugin requires `enabled: true`, a loopback port from 1024–65535, a
32-character lowercase hex session ID, and a 32-byte `Uint8Array` key. It also
requires kernel diagnostics and the runtime's local diagnostics listener
capability. Its optional `ttlMs` defaults to 900,000 ms and cannot exceed
3,600,000 ms. It reads no environment variables itself. Application-side
`revoke()` closes the connector independently; stopping/closing the app also
revokes it.

The native client takes `endpoint`, `sessionId`, `sessionKey`, injected Web
Crypto `subtle`, `fetch`, and `timing` with `setTimeout`/`clearTimeout`. It
has the following core subset (D02 consumes only these methods):

```typescript
interface IDiagnosticsClient {
  snapshot(): Promise<DiagnosticsSnapshot>;
  read(after: number, limit?: number): Promise<DiagnosticsBatch>;
  close(): void;
}
```

The endpoint must be exactly `http://127.0.0.1:<port>` without credentials,
trailing slash, query or fragment. D02 uses three core signed GET operations:
`/v1/status`, `/v1/snapshot`, and `/v1/events?after=N&limit=N`. Requests with an
`Origin` header are rejected. Use the native extension host, never
browser/webview fetch. HMAC authenticates traffic; HTTP does not encrypt it or
make remote access supported. Use the helper rather than implementing another
signing protocol.

The helper pairs through status on first use, serializes requests, never reuses
a request sequence, refuses redirects, bounds response bodies to 256 KiB, and
applies a five-second abort deadline across response headers and body.
Successful responses are authenticated before JSON parsing. Request sequences
are independent of diagnostic event cursors.

### M98d–g additions at this revision

The helper also exposes `health()`, `configuration()`, `queues(after, limit?)`
and `traces(after, limit?)`. Its authenticated status parser accepts both the
legacy three-field form and the current form with eleven fixed boolean inspector
keys. Health, configuration, queues and traces are currently advertised true;
authorization, cache, events, scheduler, realtime, storage and outboundHttp are
reserved false. Legacy status resolves all addon support to false. The helper
returns typed unsupported addon DTOs without probing unsupported routes.
D02 does not call these methods or expose their data.

The [D02 audit](d02-contract-audit.md) preserves the earlier failing probes and
records requalification after framework PR #370. The identity, core validation
and freezing defects are resolved at this pin; generic errors and the remaining
lifecycle constraints below still apply.

### Integration constraints observed in the client

These are source observations, not new public framework guarantees or a
completed security audit.

| Observation                                                                                    | Required D02 treatment                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any failed initial status exchange makes the client terminal                                   | Validate a bounded startup strategy; never retry initial pairing with the same credentials, even through a newly constructed client. Fresh launch means fresh credentials                             |
| No public status/expiry accessor, renewal operation or typed error-code API                    | Display a conservative launcher deadline, not an exact authenticated countdown. Use fixed user messages; do not classify failures by private error strings                                            |
| Non-200 responses become a generic connection failure before their signed error body is parsed | Do not claim the helper distinguishes expiry, revocation, rate limiting, authorization or network failures                                                                                            |
| Serialization uses an uncapped promise queue                                                   | Keep at most one outstanding extension read and schedule the next after completion; bound retention and avoid timer-created backlogs                                                                  |
| Core snapshot/batch validation enforces exact shapes and cursor invariants                     | Consume the public helper; own bounded allowlisted copies without private-validator imports                                                                                                           |
| Core snapshot/read results are now deeply frozen                                               | Keep independently owned frozen models for extension retention                                                                                                                                        |
| Initial status, subsequent response headers and core bodies are bound to the paired instance   | Retain signed adversarial regression cases and requalify when changing the pin                                                                                                                        |
| Key import is lazy and clears an internal copy, not the caller's original bytes                | Preserve supplied bytes until import has occurred; define launcher-owned buffer cleanup and release references on teardown. Do not promise erasure of environment strings or garbage-collected memory |
| `close()` aborts client reads but does not revoke the application connector                    | Stop the owned launch on disconnect/expiry and exercise complete child cleanup; client close alone is not server revocation                                                                           |

The generated entry uses the default 15-minute TTL. A custom entry can choose a
different permitted TTL, so custom launch recipes require an explicit matching
lifetime policy. Expired or revoked sessions require relaunch; the extension
must not silently extend their lifetime.

## M98c: scaffolding and launcher handoff

The implemented CLI supports:

```text
setu new <name> --devtool [--devtool-port N]
setu generate app <name> --devtool [--devtool-port N]
setu devtool enable [member] [--dir path] [--devtool-port N] [--dry-run]
```

These emit separate `main.dev.ts` and `dev` tasks while preserving the
production entry. Enabling existing projects checks conflicts and supports
dry-run; it does not guarantee atomic filesystem changes. It refuses unsupported
runtimes (Node, Bun, Workers), starter-composed templates, incompatible custom
factories, and older workspace runners without credential handoff. Compatible
plugin-list templates include `rest`, `microservice` and `none`. Existing
projects may need reviewed manual migration before enable succeeds; the
extension must not rewrite them automatically.

Generated composition uses the factory's **second** argument:

```typescript
const app = await createApp(undefined, {
  plugins: [diagnostics],
  diagnostics: {},
});
```

The first argument remains reserved for the existing environment/discovery
contract. Empty diagnostics options enable collection without approving labels.
The `dev` task derives from a compatible `start` task ending in `main.ts`,
substitutes `main.dev.ts`, and preserves permissions. Scaffolding does not
automatically restrict arbitrary existing application permissions.

### Credentials

| Variable                   | Required value                                               | Reader                                                                      |
| -------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `SETU_DEVTOOL_SESSION_ID`  | Fresh 16 random bytes encoded as 32 lowercase hex characters | Generated development entry and workspace runner                            |
| `SETU_DEVTOOL_SESSION_KEY` | Fresh 32 random bytes encoded as 64 lowercase hex characters | Development entry decodes to `Uint8Array(32)`; workspace runner forwards it |
| `SETU_DEVTOOL_MEMBER`      | Exact selected manifest member name                          | Workspace root runner; omit for standalone launch                           |

The entry reads the first two variables directly through **`Deno.env.get`**,
validates them and exits with a value-free message when missing/malformed. It
never generates credentials, writes an env file, or prints their values. The
plugin itself remains explicitly configured. The launcher must generate
credentials with a cryptographic RNG and pass them only in the owned child
process environment, never in arguments, settings, files, terminal command
strings or webview messages.

Environment handoff exposes credentials to the selected application process and
its descendants. It does not isolate them from application code or privileged
local inspection. Generated code avoiding value output cannot guarantee that
arbitrary app logs omit secrets; inherited stdout/stderr is not a sanitized
diagnostics feed.

### Standalone versus workspace launch

For prepared standalone projects, run `deno task dev` in the project directory
with the fresh pair. The default scaffolded diagnostics port is **4919**,
embedded in `main.dev.ts`, with a CLI override available. There is no standalone
manifest `devtoolPort` to discover. D02 must define an explicit port/recipe
configuration and verify it against the prepared project; do not execute or
import TypeScript to discover a port, scan listeners, or assume every project
uses the default.

For workspaces, read bounded `setu.workspace.json` version 1. Older manifests
can omit `runtime` (the CLI defaults it to Deno). Member `devtoolPort` is
optional; absence means no recorded diagnostics enablement. It is not a fixed
offset from the application port. Allocation considers application and
diagnostics ports; bind availability remains a launch-time concern. Do not
display `transportUrl`, which can contain credentials.

Launch root `deno task dev` with the pair and selected `SETU_DEVTOOL_MEMBER`.
The runner:

1. Validates that the selected member exists and has a `devtoolPort` before
   spawning children.
2. Starts **all workspace members**, respecting dependency readiness, not just
   the selected member.
3. Runs `deno task dev` for the selected member and `deno task start` for every
   sibling, even siblings that have diagnostics enabled in the manifest.
4. Forwards credentials and selector to the selected child only. It explicitly
   sets all three variables to empty strings for siblings because omission would
   allow inherited environment leakage.

Without a selector, the root runner performs ordinary startup without selecting
a diagnostics entry. Application readiness probes do not authenticate the
diagnostic endpoint. The connector's optional log banner is not a
machine-authenticated readiness API. D02 must disclose the full workspace launch
scope and own teardown of every process it starts. One inspected application
does not mean one launched application process.

## Development before publication

D01 and local D02 integration can proceed before publication. Record the source
hash and resolve common, kernel, runtime, CLI and diagnostics-plugin
consistently to that revision through reviewed local mappings/artifacts. The CLI
emits version-based JSR imports; running it from source does not automatically
make generated projects use local packages. Do not silently mix a local helper
with older registry packages or commit machine-specific paths.

The extension needs a reproducible npm-compatible delivery route for the helper and
dependencies. Public-source bundling and real Code OSS import/construction were
measured in the [D02 audit](d02-contract-audit.md). Real standalone/workspace
round trips now have [D02 evidence](d02-validation.md); published-package and
VSIX installation remain unverified. Publication is unnecessary for those local
experiments. D04's distributable preview needs pinned published
dependencies and repeatable installation evidence.

## Integration gates and evidence

| Gate                 | Required evidence                                                                                                                                                             | Owner                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Discovery/preflight  | Bounded v1 manifest parsing; absent `devtoolPort`, unsupported runtime, stale scaffold and standalone port mismatch exercised without executing project code during discovery | D01/D02                      |
| DTO mapping          | Compile against common exports; negative shape/version/bounds tests; verify public helper freezing and independently owned extension records                                  | D02                          |
| Helper delivery      | Local artifact provenance and real packaged extension-host import without Deno globals; repeat with pinned published packages                                                 | D02 locally; D04 for release |
| Instance binding     | Signed mismatched status/header/DTO instances rejected; retain the fixed helper contract with framework and devtool regression tests                                          | Framework + D02              |
| Credential handoff   | Real standalone/multi-member launches, fresh credentials, sibling isolation, no credential output/storage/webview transfer                                                    | D02 using M98c               |
| Startup pairing      | Bounded readiness strategy, terminal initial failure and fresh-launch recovery exercised against the actual helper                                                            | D02                          |
| Session lifecycle    | App exit, expiry, disconnect and activation disposal stop reads and owned processes; late responses cannot repopulate cleared state                                           | D02                          |
| Capture quality      | Truncation, ring loss, collector drops, late parents, null timing and closed reader represented honestly                                                                      | D03 implemented locally      |
| Compatibility matrix | Exact source/artifact versions, protocol, editor/host versions, OS and app runtime; local evidence distinct from released support                                             | D04                          |

Historical source-review validation on 2026-09-22 (previous reference): `deno test --allow-read --allow-env`
against `packages/diagnostics-plugin/test/unit/client.test.ts` and the CLI's
`devtool-planner.test.ts`, `devtool-refusals.test.ts`,
`devtool-manifest-merge.test.ts` passed: **12 tests, 83 steps, zero failures**.
These focused tests do not satisfy future editor integration, process-cleanup or
adversarial instance-binding gates.

## Framework capabilities outside D02

Raw service APIs remain inappropriate diagnostic feeds. M98d–g now provide
separate minimized contracts for several areas below; their existence does not
add inspectors to D02 or qualify a devtool integration:

| Raw service surface                    | Limitation of that raw surface                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| Router `listRoutes()`                  | Contains live handlers and schemas; use M98 route projections instead |
| Queue `add`/`process`/`addRecurring`   | No general job enumeration contract                                   |
| Health indicators                      | Execute app code and can return arbitrary `data`                      |
| Configuration `get`/`getOrThrow`/`has` | Expose values; no provenance-only API                                 |
| Authorization methods                  | Decisions without a diagnostic explanation contract                   |
| Telemetry span creation/active IDs     | Not a general span read feed                                          |

Source navigation, health UI and P02/P03 addons remain separate devtool designs
and security reviews. Use the current minimized framework contracts when their
feature plans start; M98a–g implementation does not authorize raw service access.

The [addon assessment](framework-addons.md) is the historical pre-M98d–g
assessment; its missing-contract findings must be refreshed before addon planning. In particular,
existing queue counters/depths and health deadlines are useful foundations; they
do not make job enumeration or raw health reports safe devtool feeds.
