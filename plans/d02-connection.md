# D02 — Local launch and authenticated connection

Status: planned on `feat/d02-connection`; implementation not started. The core
helper instance-binding defect blocks live-connection acceptance. Independent
preflight, process ownership and model work can proceed. D01 is the base commit
`2615d26`; merge its branch first or keep D02 explicitly stacked on it.

## Outcome and exclusions

A trusted Linux desktop user selects a prepared Deno application, reviews its
execution scope, explicitly launches it, and sees native connection/application
status. One owned session provides a validated snapshot and bounded events to
D03. Stop closes the client, clears records and stops the complete owned launch.
Workspace launch starts every member and instruments only the selected member.

No application migration, automatic launch/restart, arbitrary attachment, URL
configuration, application logs, webview, recordings, billing or addon reads.
M98d–g methods exist but D02 calls only `snapshot`, `read` and `close`.

## Contracts verified from source

Framework reference: `f89fd615ad2d4b15d4dfc1e12ed74e51857db025`, inspected
2026-09-27. See the [contract register](../docs/framework-compatibility.md) and
[audit evidence](../docs/d02-contract-audit.md). Source paths below are relative
to the framework repository; implementation paths later are relative to devtool.

| Source                                                              | Contract consumed                                                                         | Consequence                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/common/src/services/diagnostics.ts`                       | Public snapshot, batch, node, edge and event types                                        | Type-only public imports; separate runtime validation and minimized storage              |
| `packages/diagnostics-plugin/src/index.ts`, `interfaces/index.ts`   | Public injected client; core plus four addon methods                                      | Adapter exposes only the three core methods internally; no private protocol imports      |
| `packages/diagnostics-plugin/src/client/client.ts`                  | Lazy key import, serialized calls, terminal initial pairing, five-second exchange timeout | One extension caller; hold raw bytes until first call settles; never retry a failed pair |
| `packages/diagnostics-plugin/src/protocol/protocol.ts`              | Legacy/current status forms; shallow core DTO guards                                      | Fixed manifest negotiation belongs to helper; extension validates core DTOs fully        |
| `packages/cli/src/devtool/dev-entry.ts`                             | Direct Deno environment reads; literal port; default TTL; second factory argument         | Prepared entry fingerprint and explicit port must agree                                  |
| `packages/cli/src/workspace/dev-runner.ts`, `runtime-profile.ts`    | Root starts all members; selected dev task; blank sibling credentials                     | Full-scope confirmation and descendant cleanup; pin Deno on child PATH                   |
| `packages/cli/src/devtool/planner.ts`, `templates/project-files.ts` | Derived tasks, generated entry and templates                                              | Support only qualified generated recipes; do not execute workspace code during preflight |

Manifest versions remain `0.7.0` while diagnostics API documentation says
`@since 0.8.0`; neither is publication evidence. Local artifacts must carry their
source commit and input hashes. Never resolve unpublished code by guessing a
registry version.

## Prerequisites and acceptance blockers

1. **Framework binding:** the helper must reject a verified response whose
   instance header differs from the paired status identity, and reject a core
   snapshot/batch whose body identity differs from that header/paired identity.
   Add signed adversarial tests in the framework, including independent header
   and body changes and the first snapshot after status. Keep null identity
   support for in-process pre-runtime DTOs separate from paired network DTOs.
   D02 must not patch a private module, implement another HMAC protocol, or claim
   tracking the first snapshot identity recovers the hidden status identity.
2. **Artifact qualification:** source bundling and editor import have been
   measured; a complete real Deno server/host round trip has not. Build all local
   fixture mappings from one clean, exact framework revision after the binding
   fix, rerun the audit, and update the register before accepting the connection.
3. **Linux supervisor:** qualify the owned-group design below in the actual
   editor host before enabling Launch. If Electron cannot run the packaged
   supervisor or cleanup cannot be proved, refuse Launch; no direct-PID fallback.
4. Run security review on the final committed implementation independently of
   implementation work. Close blocking findings before merging. This plan and
   its source audit are not that security review.

## Design decisions

### Preflight and explicit launch

Reuse D01's context gate and bounded filesystem/JSON readers. Launch resolves a
current opaque selection ID again; stale IDs, sample rows, removed roots and
unsupported contexts refuse before executable invocation. Limit each file to
256 KiB, depth to 32, roots to 16 and members to 64. Read only root/member Deno
configs, the authoritative workspace manifest, `main.dev.ts`, the known
workspace runner, and necessary generated discovery-port metadata. Never read
`.env`, import `setu.config.ts`, or recursively traverse project files.

For standalone projects ask for an in-memory integer port, 1024–65535, with 4919
labeled as the scaffold default. Workspace projects use the selected member's
explicit `devtoolPort`. Missing enablement is a refusal with existing CLI
migration guidance, never an automatic file edit.

Build a versioned recipe catalog from the pinned CLI output for supported
plugin-list `rest`, `microservice` and `none` templates. Capture standalone and
workspace entries, root runner/task and member start/dev task variants. Include
raw and CLI-formatted outputs as distinct fixtures. Compare complete template
text after CRLF normalization only, substituting validated numeric ports and
fixed known discovery-import variants. Do not strip arbitrary whitespace,
search for marker substrings, or interpret TypeScript. Task strings must equal
catalog values, not merely end in `main.dev.ts`; reject task objects, hooks,
shell prefixes, extra arguments, altered TTL, legacy runners, custom factories
requiring a different entry, and unsupported templates. All sibling start tasks
must qualify too. Application code inside the prepared composition remains
trusted executable code; fingerprints are compatibility checks, not a sandbox.

Record hashes of the exact preflight files, executable identity and member list.
Native modal confirmation identifies the selected project, all started members,
instrumented target, executable, diagnostics port, 15-minute local limit, and
that Stop terminates the whole owned launch. On cancellation do nothing.
After confirmation recheck trust, selection generation, roots and every hash.
Changed input requires a new preflight/confirmation; never silently approve
new contents. Active same-user filesystem races remain outside isolation claims.
No credentials are generated until the final launch is authorized.

### Executable and environment

Use only `setuDevtool.denoPath` at user-global scope (an absolute path), otherwise
search absolute host PATH entries. Ignore workspace/folder overrides. Reject
relative/empty PATH entries and executables resolving inside any selected
workspace; canonicalize symlinks, require a regular executable, and perform a
bounded `--version` probe only after the native launch confirmation. Require the
qualified Deno 2 baseline; the first measured target is 2.9.6. Errors are fixed
codes, never raw executable output. Recheck identity before actual spawn.

The packaged supervisor uses the editor's executable in Node mode, with no
workspace module resolution, `NODE_OPTIONS`, `NODE_PATH`, inherited inspector
flags or `VSCODE_*` bootstrap variables. Its startup environment contains only
the platform variables needed to run it plus the fresh handoff credentials.
After its private ready handshake, pass the validated launch descriptor and
ordinary application environment through its private IPC channel; never pass
session credentials in that message. The supervisor obtains the credentials
from its startup environment and supplies them only to its Deno child. Neither
supervisor nor extension logs IPC or environment objects.

For the application copy the ordinary host environment, remove inherited
`SETU_DEVTOOL_*`, prepend the resolved Deno directory to a PATH containing only
absolute non-workspace directories, and provide fresh ID/key and the workspace
selector when applicable. This matters because the generated root runner calls
`deno` by name for children. Use `spawn(deno, ['task', 'dev'], {shell:false,
stdio:'ignore', cwd})`. The app retains its ordinary permissions/environment;
the extension does not load env files or promise that application code cannot
read its own credentials. Secrets never enter command arguments, files,
settings, logs, diagnostic models or webview messages.

Generate a 16-byte ID and 32-byte key with host crypto, encode to 32/64 lowercase
hex. Keep a dedicated helper byte buffer until the first helper call settles,
zero it then or on early cancellation, and release launch environment/string
references after spawn. Erasure of strings, child environments, crypto keys or
garbage-collected memory is not promised.

### Linux process ownership and cleanup

Refine the architecture's direct detached launch into a **packaged supervisor**
that is itself the detached group/session leader. It starts Deno in that same
group and stays alive when Deno exits. It owns a private inherited IPC channel
and never accepts a PID, arbitrary executable or shell command from project data.
The parent sends one validated start descriptor and later only stop; bound the
start message to 1 MiB and subsequent control messages to 1 KiB. Extra, duplicate
or malformed messages fail closed. Do not forward the supervisor IPC descriptor
or Node IPC environment variables to application children.

Only the supervisor sends termination signals, to its own current group via
`process.kill(0, signal)`. It handles SIGTERM itself, sends group SIGTERM once,
then allows five seconds for shutdown. If live group members remain, send group
SIGKILL from the still-live supervisor. That also terminates the supervisor.
There is no later parent `kill(-rememberedPid)` escalation: a saved PID plus a
`/proc` check cannot make the subsequent signal atomic with identity validation.

The supervisor scans Linux `/proc` for members of its own session/group using
bounded passes (at most 65,536 entries and one second per pass); inability to
inspect enough state is unknown, not empty. On graceful cleanup it verifies no
live group member besides itself, acknowledges cleanup, then exits. Treat zombie
members separately as non-executing, not as proof that all processes were reaped.
On forced cleanup the parent waits at most two more seconds and uses read-only
group/session inspection to confirm no live remainder. It never signals from
that inspection. Reused numeric group identities conservatively yield unknown.
Unexpected supervisor death, access failure, exceeded scan budget or surviving
members produce **Cleanup required**, clear records and block another launch.
The only recheck command performs read-only disappearance checks; there is no
"forget and launch anyway" operation.

Root exit of any code, explicit Stop, validation/connection failure, deadline,
selected-root removal and extension deactivation share idempotent cleanup.
Invalidate generations before awaiting cleanup. IPC loss asks a surviving
supervisor to stop its group. Await normal deactivation cleanup, not only a
synchronous disposable. Abrupt supervisor/host death and deliberately detached
application descendants remain unsupported; no crash-proof guarantee or
persisted-PID recovery. Server TTL limits diagnostic access, not app lifetime.

The OS mechanism follows [Node detached-process documentation](https://nodejs.org/api/child_process.html#optionsdetached),
[Linux group signaling](https://man7.org/linux/man-pages/man2/kill.2.html), and
[Electron Node mode](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node).
These establish primitives; real editor and descendant tests must qualify the design.

### Readiness, transport and lifetime

Check only the selected `127.0.0.1` port before spawn and refuse an existing
listener. Wait at most 60 seconds after Deno spawn, with one TCP probe at a time,
250 ms between probes and a 500 ms probe timeout. Abort/close all probes on Stop,
root exit or supersession. TCP readiness is not authentication or port ownership.
Once listening, construct exactly one helper and call `snapshot()`; live status
requires its successful authentication and DTO validation. A failed first call
ends the launch with fresh credentials required on explicit retry.

Inject Web Crypto, timers and an extension-owned fetch adapter built on native
`node:http` with `agent:false`, fixed numeric IPv4 host and no proxy lookup. Only
GET to the selected port and the three canonical core paths is accepted; refuse
credentials/path overrides, Origin, redirects and extra headers. Maintain an adapter-owned stopped flag and session AbortSignal:
refuse a new fetch after Stop even if the helper finishes asynchronous signing
later, and abort every active socket independently of `client.close()`. Preserve the
helper AbortSignal until body completion, expose a cancellable bounded
Web ReadableStream, and destroy sockets on non-200, cancellation, overflow or
stream failure. Enforce 256 KiB including streamed/chunked bodies and bounded
headers. Do not use ambient fetch/global dispatcher or proxy agents. Tests must
show configured proxy variables cannot receive diagnostics traffic.

One monotonic 900,000 ms local deadline starts when Deno is spawned. Display
"Local session limit", never an authenticated expiry countdown. No custom TTL,
renewal or retry loop. Application state (`starting`, `running`, etc.) is
separate from connection state. An open socket is not application readiness.

### State, scheduling, validation and storage

States: Idle → Preparing → Starting → Pairing → Live; any active state may enter
Stopping. Confirmed Stop returns Idle; confirmed failure cleanup yields Failed
with fixed reason/exit code only; uncertain cleanup yields Cleanup required.
Reject concurrent launches. Switching the inspected project requires stopping;
refresh does not replace an active session. Capture the canonical selected root
identity independently of D01's regenerated UI IDs. Sample mode cannot replace
an active session. Root removal/deactivation clears all diagnostics immediately.

One scheduler owns all helper calls. Poll `read(cursor,128)` at least 250 ms
after completion, and refresh snapshot no more often than every five seconds in
that same scheduler. No timer-created request backlog. Stop closes the helper,
cancels timers/probes and discards all late generation results. `closed:true`
ends the session. Any helper/validation error uses one fixed connection failure,
not private message matching or an inferred server expiry/revocation cause.

Validators receive `unknown` and return fresh allowlisted records typed from
public common exports. Validate the exact required fields, enum vocabularies,
nullable timing, finite nonnegative timing/counters and safe-integer sequences.
Bound snapshots to 256 KiB, 1,024 nodes and 4,096 edges; events to 1,024 bytes
each and at most the requested 128. Node/operation IDs must match the source's
bounded opaque grammar; labels are at most 160 UTF-8 bytes without control
characters, versions at most 64 with the producer's semver grammar. Validate
kind-specific optional fields, HTTP methods/status ranges and nonzero lowercase
trace/span identifiers. Never validate by calling peer object methods.

Reject duplicate node IDs, malformed IDs and duplicate event sequences. Missing
nodes/parents can reflect truncation/eviction/completion order and stay unresolved.
All network DTO identities must be non-null and match the session; this check is
additional to, not a replacement for, the repaired helper's authenticated binding.
For nonempty pages require increasing contiguous sequences above `after`, exact
`lost = first.sequence - after - 1`, and `next = last.sequence`. Empty pages must
preserve `after` with zero loss; closed batches retain no events. Unknown fields
are discarded, never copied to the model. Freeze constructed records.

Keep one snapshot and at most 4,096 events or 4 MiB serialized event data, evicting
oldest first. Saturate counters at MAX_SAFE_INTEGER. Keep ring loss, collector
drops and extension evictions separate. Clear capture preserves the cursor and
current topology, clears event/index state and advances a capture revision;
discard a pre-Clear read's events but still advance its validated cursor and
account for loss, preventing resurrection or repeated reads. Stop clears all
records, counters and identities. No extension storage or persistence.

## Internal surface and file/test mapping

No published library exports. Symbols exported between files are internal and
must have the named production consumer; do not expose the client or credentials
through `activate()`'s inspection API. Existing D01 test helpers may expose only
bounded synthetic/status data needed by the host harness.

| File                           | Main surface and consumer                                               | Required tests                                                              |
| ------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/launch/preflight.ts`      | `prepareLaunch`, immutable descriptor → controller                      | `test/unit/preflight.test.ts`; real generated recipes                       |
| `src/launch/recipes.ts`        | Qualified recipe matching → preflight                                   | `test/unit/recipes.test.ts`; unsupported and changed fixtures               |
| `src/launch/executable.ts`     | `resolveDeno`, version/identity checks → preflight/controller           | `test/unit/executable.test.ts`; path shadowing and version timeout          |
| `src/launch/credentials.ts`    | Fresh pair, environment construction and disposal → controller/launcher | `test/unit/credentials.test.ts`; real sibling handoff                       |
| `src/launch/launcher.ts`       | Owned handle, readiness, root exit and async stop → controller          | `test/unit/launcher.test.ts`; `test/integration/processes.test.ts`          |
| `src/launch/supervisor.ts`     | Packaged child entry, private start/stop protocol → launcher            | `test/integration/processes.test.ts`; `test/host/connection.ts`             |
| `src/launch/process-group.ts`  | Bounded membership projection → supervisor/cleanup verifier             | `test/unit/process-group.test.ts`; malformed proc data and real descendants |
| `src/launch/readiness.ts`      | Cancellable single-port probe → launcher                                | `test/unit/readiness.test.ts`; `test/integration/readiness.test.ts`         |
| `src/diagnostics/transport.ts` | Fixed loopback fetch implementation → adapter                           | `test/unit/transport.test.ts`; `test/integration/transport.test.ts`         |
| `src/diagnostics/client.ts`    | Core client adapter with injected dependencies → controller             | `test/unit/client.test.ts`; `test/integration/framework-client.test.ts`     |
| `src/diagnostics/validate.ts`  | Snapshot/batch validators → adapter/store                               | `test/unit/validate.test.ts`; signed malicious fixtures                     |
| `src/model/capture.ts`         | Bounded snapshot/event store and revisions → controller, later D03      | `test/unit/capture.test.ts`; overflow/clear/loss cases                      |
| `src/session/controller.ts`    | State, generations, launch/stop/clear → editor                          | `test/unit/controller.test.ts`; every state/async race                      |
| `src/session/scheduler.ts`     | One outstanding operation → controller                                  | `test/unit/scheduler.test.ts`; slow reads/expiry/close                      |
| `src/editor/connection.ts`     | Native confirmation and fixed status/commands → extension               | `test/host/connection.ts`; restricted and direct command paths              |
| `src/extension.ts`             | Composition, stable selection ownership, async deactivate               | Existing host tests plus `test/host/connection.ts`                          |

Build scripts must bundle the supervisor separately, preserve public helper
imports, and include its production artifact in `.vscodeignore` allowlists.
`package.json` adds native Launch, Stop, Clear Capture and Recheck Cleanup
commands plus the user-global executable setting. Host tests cover command
availability/status; there is no webview bridge in this milestone.

## Implementation order and verification

1. Commit this plan/audit and review its trust boundaries. Build a reproducible
   local artifact/recipe preparation command taking an explicit framework path,
   requiring a clean pinned revision, and writing only `.tmp/`. Record input
   hashes and licenses. Resolve all framework package mappings to that same
   revision; no production runtime workspace imports or machine-specific paths.
2. Implement/test preflight, executable rules and generated fixtures, then the
   supervisor and cleanup. Qualify actual Code OSS launch/teardown before wiring
   native Launch. Complete the framework binding prerequisite on its own
   framework branch and repin/re-audit before accepting real pairing.
3. Implement the transport, core adapter, DTO validation and store; exercise the
   real public helper against a real mapped Deno application.
4. Wire the state controller/scheduler/editor lifecycle. Exercise standalone and
   multi-member applications, cancellation in every state, malformed signed
   data, proxy canaries, occupied/replaced listeners, delayed startup, root exit,
   SIGTERM-resistant descendants, supervisor loss and process-group uncertainty.
5. Update roadmap, architecture, security matrix and validation evidence with
   exact source/artifact/editor/runtime versions and remaining D04 limitations.

Retain D01 commands: `npm ci`, `npm run check`, `npm run format:check`, `npm test`,
`npm run build`. Add `npm run test:integration` (explicit local-artifact prerequisite;
fail rather than silently skip when missing) and `npm run test:coverage` enforcing
at least 90% branch/function/line for every changed host source file. Instrument
supervisor child runs too. Extend `npm run test:host` with live-connection,
restricted, production and deactivation exercises in isolated profiles. CI runs
unit/build gates plus qualified Linux integration jobs; local editor evidence
remains explicitly separate until a GUI CI job executes it.

Security evidence must cover D02 portions of S01–S11, S14–S15 and supervisor IPC,
including secrets in process arguments/logs/artifacts/extension state, sibling
credential isolation, hostile signed DTOs, transport abort/body bounds, no proxy
egress, PID reuse simulation and real descendant termination. Scan the built
bundle for fixture credentials, development sample markers and unresolved
workspace/Deno imports. Do not claim full VSIX, other-OS or release qualification.

A no-op/synthetic-only run cannot close D02: the acceptance exercise must launch
both real prepared project forms, pair, read actual diagnostics, generate an
application request, observe its event, Stop, and verify no live owned process
remains. Repeat failed-start recovery with different credentials and show late
responses cannot restore cleared data. Independent code/security review must
reference the exact implementation commit; no publication is needed for these
local experiments, while D04 still requires pinned published dependencies.
