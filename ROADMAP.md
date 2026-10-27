# Devtool roadmap

Status, updated 2026-10-28: D01–D03 are implemented and locally verified. Next
is moving the contract pin to framework `v0.10.0`, then D03b and D04. Framework
M126 (a Node diagnostics listener) is the framework's next milestone; D06
consumes it. The [milestone table](#milestones) is the status record; per-milestone evidence is linked from it.

P01–P03 describe product direction, not approved implementation plans. Write a
canonical plan with acceptance tests before starting each.

The [architecture](docs/architecture.md) defines the preview's components,
launch lifecycle and resource budgets. The [security model](docs/security.md)
defines its trust boundaries and acceptance cases. These documents are design
baselines for the free preview.

## Product boundary

Free provides everyday single-application debugging. Pro adds deeper analysis
and coordinated investigation across applications. Both tiers get the same
protections: authentication, minimization, compatibility checks, bounded
resources, capture-quality indicators, and the framework diagnostic APIs. A
license never authorizes access to an application.

## Framework baseline

The devtool consumes the framework's authenticated local diagnostics connector
(M98b) and its native client. Two framework revisions matter:

- **Contract pin** — merged framework commit
  `26aebd0e3fd16074d7b578623577fe87a1930e83` (2026-09-27), recorded in
  `scripts/framework-pin.json`. It contains M98a–g. D01–D03 are qualified
  against it.
- **Framework release `v0.8.0`** — tag at merge commit
  `6520e12e03118a9fc96f893a907aa7f6e3751e59` (2026-10-03). It contains the
  M98h–n observation families and M98o session renewal. None of these is
  qualified here until the pin moves and the
  [contract register](docs/framework-compatibility.md) is refreshed.
- **Framework release `v0.10.0`** — tag at merge commit
  `d7a04734be8a4658774c7fe5b5e30297d5103ef3` (2026-10-23), the current release
  and the recommended pin target. It serves the same connector routes as
  `v0.8.0`. The diagnostics changes between the two releases are in the CLI's
  devtool lifecycle (M101f, M113i), not the wire protocol. One later commit on
  framework `develop` (`d409fec8`, unreleased) changes only how connector rate
  buckets are swept internally.

**Distribution moved to npm.** Starting with `v0.9.0` (2026-10-14), the
framework publishes to npm under `@setu-ts`, and JSR gets no further releases
(framework M111, M111f). Generated Deno projects import `npm:@setu-ts/…`.
Release builds and D04 must therefore take the client from npm or from the
pinned source, never from JSR.

**Node is the default runtime.** Starting with framework M111d, a stock
`setu new` project targets Node and runs TypeScript under `tsx`. The
diagnostics listener still binds only on Deno, and the CLI refuses
`--devtool` on any other target. As a result, the devtool cannot inspect a
project created with the defaults. Framework M126 removes both refusals for
Node; D06 consumes it.

`v0.8.0` was the first published framework release containing
`@setu-ts/diagnostics-plugin` (on JSR, 2026-10-03). npm has
`diagnostics-plugin@0.9.0` (2026-10-14) and `@0.10.0` (2026-10-23). D04's
dependency on a published release is therefore met; moving the contract pin to
a release commit is what remains.
See [framework work](#framework-work-in-priority-order).

Observations the connector serves as of `v0.8.0`:

| Connector route     | Client method          | Framework milestone | In contract pin |
| ------------------- | ---------------------- | ------------------- | --------------- |
| `/v1/snapshot`      | `snapshot()`, `read()` | M98a–b              | Yes             |
| `/v1/health`        | `health()`             | M98d                | Yes             |
| `/v1/config`        | `configuration()`      | M98e                | Yes             |
| `/v1/queues`        | `queues()`             | M98f                | Yes             |
| `/v1/traces`        | `traces()`             | M98g                | Yes             |
| `/v1/authorization` | `authorization()`      | M98h                | No              |
| `/v1/cache`         | `cache()`              | M98i                | No              |
| `/v1/event`         | `events()`             | M98j                | No              |
| `/v1/scheduler`     | `scheduler()`          | M98k                | No              |
| `/v1/realtime`      | `realtime()`           | M98l                | No              |
| `/v1/storage`       | `storage()`            | M98m                | No              |
| `/v1/outbound-http` | `outboundHttp()`       | M98n                | No              |

Each capability-specific feed is opt-in on its own plugin through an explicit
`diagnostics` option, with application-side alias approval. The app must enable
it. A source that is not enabled reports `disabled` (or `unsupported`, with a
reason) rather than an empty result. Each inspector must show that state, not an
empty view.

## Feature allocation

| Feature                                                | Tier | Delivery  | Dependency                                          | Limitation                                                                                                    |
| ------------------------------------------------------ | ---- | --------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Project and monorepo discovery                         | Free | D01       | None                                                | Reads bounded local manifests; never imports application code                                                 |
| Explicit local launch and pairing                      | Free | D02       | M98a–c                                              | Prepared Deno application, native extension host                                                              |
| Plugin/capability graph and route explorer             | Free | D03       | M98a minimized DTOs                                 | Names require application-side approval                                                                       |
| Middleware order and individual request timeline       | Free | D03       | M98a                                                | Inclusive elapsed durations, not CPU profiling                                                                |
| Available lifecycle stages and connection state        | Free | D03       | M98a                                                | No complete post-failure startup history                                                                      |
| Search, filters, capture gaps, clear/disconnect        | Free | D03       | —                                                   | Bounded in-memory capture only                                                                                |
| Contextual documentation links                         | Free | D03       | —                                                   | Built-in destination allowlist                                                                                |
| Node application discovery and launch                  | Free | D06       | Framework M126; pin move                            | npm projects run under `tsx`; the launcher owns the whole process tree; Bun still refused                     |
| Session renewal without relaunch                       | Free | D03b      | Framework M98o (released in `v0.8.0`); pin move     | Bounded by the launch-time maximum lifetime the application set; never silently lengthened                    |
| VSIX preview with measured compatibility               | Free | D04       | D03b; framework `v0.8.0` published packages         | Real framework/editor exercises                                                                               |
| Generator/task UI with change preview                  | Free | D05       | Separate execution/write plan; pinned CLI version   | Keep using the existing CLI until then                                                                        |
| Health summary                                         | Free | D05       | M98d (`/v1/health`)                                 | Retained latest observations, collected by the framework's scheduler                                          |
| Safe source navigation                                 | Free | Follow-on | New reviewed workspace-relative source projection   | Never arbitrary file or data access                                                                           |
| Route percentiles, outcome trends, slow-stage analysis | Pro  | P01       | M98a                                                | Sample size, losses and window visible                                                                        |
| Compare two windows in the same live session           | Pro  | P01       | M98a                                                | No persistence or cross-restart identity claim                                                                |
| Focused dependency subgraphs, declared impact analysis | Pro  | P01       | M98a                                                | Declared dependencies do not prove runtime calls                                                              |
| Multi-application dashboard                            | Pro  | P01       | Independent launched/paired sessions                | Separate memory budgets; does not reconstruct cross-service causality                                         |
| Saved filters and layouts                              | Pro  | P01       | —                                                   | Preferences only; exclude diagnostic records and labels by default                                            |
| Local recordings, history, architecture diffs          | Pro  | P02       | Retention/access review; semantic identity matching | M98 identifiers are instance-local                                                                            |
| Explicit investigation bundle export/import            | Pro  | P02       | Hostile-file validation and export preview          | Metadata can be sensitive                                                                                     |
| Queue attempt and outcome inspector                    | Pro  | P03       | M98f (`/v1/queues`)                                 | Settlement is `unknown` on RabbitMQ/SQS; depth may be `unavailable`; durable job listing remains out of scope |
| Trace inspector and cross-application correlation      | Pro  | P03       | M98g (`/v1/traces`)                                 | Correlates on equal trace ids only; parent visibility is shown, never a fabricated edge                       |
| Configuration provenance                               | Pro  | P03       | M98e (`/v1/config`)                                 | Value-free; unapproved keys are never observed                                                                |
| Authorization explanations                             | Pro  | P03       | M98h (`/v1/authorization`); pin move                | First-party RBAC only; custom providers report `unsupported`                                                  |
| Cache, event and scheduler inspectors                  | Pro  | P03       | M98i–k; pin move                                    | Counters and local timer fires; a skipped local fire is not a missed execution                                |
| Realtime, storage and outbound-HTTP inspectors         | Pro  | P03       | M98l–n; pin move                                    | Counters and status classes only; no frames, paths, URLs or payloads                                          |

D02 consumes M98c's prepared development entry and launch tasks. Users enable or
migrate projects through the existing CLI before launch.

The [five-area framework assessment](docs/framework-addons.md) is historical. It
predates M98d–n and is superseded by the [framework baseline](#framework-baseline)
above. Refresh the relevant area against framework source before each P03
feature plan.

## First release

Ship D01–D04 as a free local preview, including D03b. One active application per
editor window. Any number of discovered workspace applications may be selected,
one at a time. The M98c workspace runner starts all members but instruments only
the selected one; disclose this launch scope and clean up every owned process.
Show a fixture-backed preview only through an explicit development/test command,
always marked as sample data.

Supported target: desktop VS Code and Code OSS, local file workspaces, local
Deno application. Start qualification on Linux, the current development
platform. Add Windows/macOS only after their process cleanup and
packaged-extension matrix passes. Node is the extension host; Deno is the
inspected application runtime.

Node and Bun applications are not supported in the D04 preview. The framework's
local diagnostics listener is Deno-only and rejects every `listen` on other
platforms before binding. Node is now the framework's default target, so this is
the preview's largest limitation, and the preview docs must state it. Framework
M126 adds a Node listener and the CLI's Node devtool arm. D06 adds Node support
here. Whether the preview waits for D06 is an
[open decision](#open-decisions). Bun stays unsupported until the framework takes
it.

Browser editors, SSH/WSL/containers/Codespaces sessions, remote connections, and
production access are outside the first support matrix. Unsupported execution
contexts must be refused explicitly.

## Milestones

| ID   | State                               | Deliverable                                                    | Prerequisites                                                         | Canonical plan                      |
| ---- | ----------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------- |
| D01  | Implemented; locally verified       | Extension shell, trust gate, workspace discovery, fixtures, CI | None                                                                  | [D01 plan](plans/d01-foundation.md) |
| D02  | Implemented; independently reviewed | Explicit launch, pairing, bounded reader, teardown             | D01 + M98a–c + local compatibility evidence                           | [D02 plan](plans/d02-connection.md) |
| D03  | Implemented; independently reviewed | Composition graph, route/middleware views, request timeline    | D01 fixtures for parallel UI work; D02 for integration                | [D03 plan](plans/d03-inspection.md) |
| D03b | Planned; M98o released in `v0.8.0`  | Session renewal without relaunch                               | D02; contract pin moved to `v0.10.0` (contains M98o)                  | Pending: `plans/d03b-renewal.md`    |
| D04  | Planned; draft plan on a branch     | Security/compatibility exercises, VSIX, free preview docs      | D01–D03b; framework `v0.10.0` on npm; pinned packages                 | Pending: `plans/d04-release.md`     |
| D06  | Planned; framework M126 next        | Node applications: npm project discovery, launch under `tsx`   | D02; framework M126 released; pin moved to that release               | Pending: `plans/d06-node.md`        |
| D05  | Direction only                      | Health summary, generator/task UI                              | D04; separate plan                                                    |                                     |
| P01  | Direction only                      | Live Pro analysis, multi-app workflows, licensing              | D04; validation criteria met (see open decisions); separate plan      |                                     |
| P02  | Direction only                      | Retained investigations and comparisons                        | Persistence/export threat review; separate plan                       |                                     |
| P03  | Direction only                      | Capability-specific inspectors                                 | Pin moved past M98n; contract register refreshed; tier decision; plan |                                     |

Evidence: [D01](docs/d01-validation.md), [D02](docs/d02-validation.md) and its
[security review](docs/d02-security-review.md), [D03](docs/d03-validation.md)
and its [security review](docs/d03-security-review.md).

### D03b — session renewal before D04

A paired session lasts 15 minutes by default and at most 60. After expiry the
user must relaunch the application. A debugging tool stays open all day, so a
forced relaunch every 15 minutes makes the preview unusable for its main
workflow. The preview should not ship with it.

The framework at the contract pin exposes no renewal operation, so the devtool
must not invent one. The extension must never relaunch the application silently,
extend the session beyond the framework's maximum, or retry a refused renewal.

D03b covers:

1. **Framework milestone M98o — shipped.** Merged as
   [setu-ts#392](https://github.com/setu-ts/setu-ts/pull/392) on 2026-10-03 and
   released in `v0.8.0`; its plan was
   [setu-ts#389](https://github.com/setu-ts/setu-ts/pull/389). The independent
   committed-tree audit passed with no findings. As shipped:
   - An application opts in at launch with `maxSessionLifetimeMs`, between
     `ttlMs` and a hard ceiling of 12 hours (43,200,000 ms) of awake time.
     CLI-generated development entries set 8 hours (`28_800_000`). Without the
     option, the status bytes and expiry behave exactly as before, and a
     renewal request is refused.
   - `GET /v1/renew` is a signed request on the existing session. It keeps the
     same key, session ID, instance binding and sequence space, and sets the
     expiry to
     `max(current expiry, min(now + ttlMs, activation + maxSessionLifetimeMs))`,
     so it never revives or shortens a session.
   - The status body gains an optional `renewal` member. The native client
     gains `session()` and `renew()`, both returning
     `DiagnosticsSessionLifetime` (`expiresInMs`, and `renewal` as
     `{ maxRemainingMs }` or `null`). `renew()` throws locally, without sending a
     request, when the status did not advertise renewal.
   - Revocation and an application restart end the session exactly as before.
     Real expiry still closes the listener.
2. **Devtool consumption.**
   - Read the deadline from `session()`, and renew at half the remaining time.
   - Show the real remaining time and the maximum lifetime that is left.
   - Decide renewability from `session().renewal === null`, never from the
     error `renew()` throws: that is a plain `Error` with no typed code, and S09
     forbids classifying failures by error strings. When `renewal` is `null`,
     show the fixed deadline and do not attempt renewal.
   - Keep relaunch as the explicit fallback when renewal is refused.
3. Updates to the design baselines that currently forbid renewal: the session
   timer in `docs/architecture.md`, security case S09 in `docs/security.md`, and
   the session-lifecycle row in `docs/framework-compatibility.md`. This change
   touches credentials and authenticated transport, so it needs a renewed
   independent security review.

**Release requirement.** The first published devtool must bundle a client that
understands renewal, and its contract pin must move to a framework commit that
contains M98o. The framework's status parser stays exact, so a client pinned
before M98o refuses any status body that carries `renewal`.

**Consequence now that `v0.8.0` is published.** The CLI emission did not wait
for this re-pin: `cli@0.8.0` writes `maxSessionLifetimeMs` into every generated
development entry. Preflight refuses such an entry before the application
runs: the launcher accepts a `main.dev.ts` only when it is byte-identical to the
recipe catalog built from the pinned CLI (`src/launch/recipes.ts`), and the
`0.8.0` entry carries that extra line. Separately, the wire contract has
diverged: those entries answer status with a `renewal` member, and the client
at the current pin counts status keys exactly (`protocol.ts:511-512` at
`26aebd0e`). That parser refusal is not a second failure on the supported
launch path, because preflight stops the entry before the application starts or
pairs; it means a recipe-only fix would still not be enough. The devtool as
built today therefore cannot inspect any project scaffolded or enabled by
`cli@0.8.0`. Projects generated before `v0.8.0` still work. Moving the pin is
therefore no longer optional housekeeping; it is what keeps the devtool working
against current scaffolds.

The framework publication hold
([setu-ts#390](https://github.com/setu-ts/setu-ts/pull/390)) merged on
2026-10-02 and was lifted by M98o, so the first published release carrying
`diagnostics-plugin` already includes renewal. The 15-minute session cannot ship
by default.

### D05 — scaffolding runs the matching CLI

The generator/task UI will scaffold projects through the framework CLI. Wherever
the devtool invokes the CLI, it must run the CLI version that matches its bundled
client, not whatever `setu` is on the user's `PATH`. Generated development
entries carry options (M98o's `maxSessionLifetimeMs`, for example) that must
agree with the client that will pair with them.

### D06 — Node applications

Framework M126 makes the diagnostics listener bind on Node and lets the CLI
emit `--devtool` for a Node target. D06 is the devtool half of that work:

- **Discovery.** The single-project path (`src/discovery/discover.ts`) accepts
  only a `deno.json` whose import map names `@setu-ts/`. D06 adds npm projects:
  a bounded read of `package.json` dependencies and the workspace manifest. It
  still never imports application code.
- **Launch.** Accept the Node development entry only when it is byte-identical
  to the pinned CLI's rendering, as D02 already requires for Deno. Spawn it
  under `tsx` with the environment built explicitly. Replace the `denoPath`
  setting with a per-runtime executable setting, or add a Node one beside it.
- **Process ownership.** tsx runs the application in a child process. Teardown,
  `Recheck Cleanup` and the S-cases in `docs/security.md` must cover the whole
  process tree, not just the immediate child.
- **Compatibility evidence.** Rerun the D02/D03 exercises on Node against the
  release that contains M126. Add rows for Node to the contract register.

This crosses the same trust boundary as D02 (launching processes and handling
credentials), so it needs an independent security review.

## Framework work in priority order

Done: **session renewal (M98o)** and **publishing `diagnostics-plugin`** both
shipped in `v0.8.0` (2026-10-03). **M101f** (the devtool lifecycle, framework
PR #414) changed the generated `main.dev.ts` and shipped in `v0.9.0`. The D04
draft plan (`feat/d04-release`, written 2026-09-28 against `0.8.0`) predates
all of this and must be rebased: its version numbers become `0.10.0`, and its
publishing references move from JSR to npm.

1. **Move the contract pin** to the `v0.10.0` release commit
   (`d7a04734be8a4658774c7fe5b5e30297d5103ef3`), not `v0.8.0`, and refresh the
   [contract register](docs/framework-compatibility.md). This requalifies D02/D03
   against the new pin, unblocks D03b, restores pairing with current scaffolds
   (see [D03b](#d03b--session-renewal-before-d04)), and is a P03 prerequisite.
   The launcher's recipe catalog (`src/launch/recipes.ts`) is regenerated from
   the pinned CLI, which picks up the M101f entry text. Prefer the release
   commit over a later `develop` commit, so local builds and D04's published
   packages describe the same source.
2. **Node diagnostics listener — framework M126, the framework's next
   milestone.** It adds a Node `ILocalDiagnosticsListenerFactory` whose responses
   match the Deno listener byte for byte, and it adds the CLI's `--devtool` arm
   for Node targets. The pin moves again to the release that contains it, and
   D06 consumes it. Under `tsx`, the application runs in a child process of the
   process the launcher spawns. D06's teardown must own that whole process
   tree.
3. **Workspace-relative source references**: a new reviewed metadata projection,
   before safe source navigation.
4. **Before P02**: review storage, deletion, import/export and identity across
   instances. M98 IDs are instance-local; matching `r1` between launches is
   incorrect.
5. **Bun diagnostics listener.** Named but not taken in M126. Request it from the
   framework only if the support matrix is to include Bun.

The observation families that blocked P03 (health, configuration, queues,
tracing, authorization) shipped as M98d–h, each with its own security audit.
Raw service APIs remain inappropriate diagnostic feeds.

Database/cache/storage browsing, durable queue enumeration, retries, scheduler
control, tenant switching, replay and fault injection remain outside these
releases. They require capability-specific inspection or control contracts and
authorization reviews. Resending a request is not deterministic replay.

## Open decisions

- **Does the first preview wait for D06?** Node is the framework's default
  target, so a Deno-only preview cannot inspect a project created with the
  defaults. Shipping D04 first gets real feedback sooner. Waiting for D06 makes
  the preview cover the common case. Decide once M126 has a plan and a date.

- **Tier of single-application inspectors.** The P03 inspectors render data the
  MIT-licensed framework serves free through a documented protocol and a native
  client. Anyone can build those views, so a paid single-app view is weak to
  defend. P01/P02 analysis and retention do need devtool-side work. Decide
  before the P03 plan whether single-app inspectors move to Free, with Pro
  keeping cross-session analysis, history and multi-app correlation.
- **What "validated free workflow" means for P01.** Define the users, signal
  and threshold before P01 is planned, so the gate can actually be met.

## Subscription without a custom portal

The free preview contains no account system, billing client, entitlement checks,
or application-data upload. P01 will select hosted checkout/billing management
and a small entitlement service or a managed licensing provider. Provider
selection and commercial terms are not decided in this plan.

The future license design must define expiry, cancellation, bounded offline
grace, and recovery from service failures. License secrets stay in host-managed
secret storage, not workspace settings or the webview. No diagnostic data or
pairing credential reaches licensing infrastructure. Loss of Pro entitlement
leaves free inspection working. Framework packages contain no paid-feature
checks.
