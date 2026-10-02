# Devtool roadmap

Status, updated 2026-10-02: D01–D03 are implemented and locally verified. D03b
and D04 are next. The [milestone table](#milestones) is the status record; per-milestone evidence is linked from it.

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
- **Framework `main`** — commit `2b72167e` (2026-10-02). It has since merged the
  M98h–n observation families. They are not qualified here until the pin moves
  and the [contract register](docs/framework-compatibility.md) is refreshed.

No published framework release contains `@setu-ts/diagnostics-plugin`. The
latest release, `v0.7.0` (2026-09-19), predates the contract pin. JSR returned
404 for `diagnostics-plugin` on 2026-09-28. D04 therefore depends on a framework
release that does not yet exist; see
[framework work](#framework-work-in-priority-order).

Observations the connector already serves, as of framework `main`:

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

| Feature                                                | Tier | Delivery  | Dependency                                              | Limitation                                                                                                    |
| ------------------------------------------------------ | ---- | --------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Project and monorepo discovery                         | Free | D01       | None                                                    | Reads bounded local manifests; never imports application code                                                 |
| Explicit local launch and pairing                      | Free | D02       | M98a–c                                                  | Prepared Deno application, native extension host                                                              |
| Plugin/capability graph and route explorer             | Free | D03       | M98a minimized DTOs                                     | Names require application-side approval                                                                       |
| Middleware order and individual request timeline       | Free | D03       | M98a                                                    | Inclusive elapsed durations, not CPU profiling                                                                |
| Available lifecycle stages and connection state        | Free | D03       | M98a                                                    | No complete post-failure startup history                                                                      |
| Search, filters, capture gaps, clear/disconnect        | Free | D03       | —                                                       | Bounded in-memory capture only                                                                                |
| Contextual documentation links                         | Free | D03       | —                                                       | Built-in destination allowlist                                                                                |
| Session renewal without relaunch                       | Free | D03b      | Framework M98o (planned, not yet implemented)           | Bounded by the launch-time maximum lifetime the application set; never silently lengthened                    |
| VSIX preview with measured compatibility               | Free | D04       | D03b; framework release containing `diagnostics-plugin` | Real framework/editor exercises                                                                               |
| Generator/task UI with change preview                  | Free | D05       | Separate execution/write plan; pinned CLI version       | Keep using the existing CLI until then                                                                        |
| Health summary                                         | Free | D05       | M98d (`/v1/health`)                                     | Retained latest observations, collected by the framework's scheduler                                          |
| Safe source navigation                                 | Free | Follow-on | New reviewed workspace-relative source projection       | Never arbitrary file or data access                                                                           |
| Route percentiles, outcome trends, slow-stage analysis | Pro  | P01       | M98a                                                    | Sample size, losses and window visible                                                                        |
| Compare two windows in the same live session           | Pro  | P01       | M98a                                                    | No persistence or cross-restart identity claim                                                                |
| Focused dependency subgraphs, declared impact analysis | Pro  | P01       | M98a                                                    | Declared dependencies do not prove runtime calls                                                              |
| Multi-application dashboard                            | Pro  | P01       | Independent launched/paired sessions                    | Separate memory budgets; does not reconstruct cross-service causality                                         |
| Saved filters and layouts                              | Pro  | P01       | —                                                       | Preferences only; exclude diagnostic records and labels by default                                            |
| Local recordings, history, architecture diffs          | Pro  | P02       | Retention/access review; semantic identity matching     | M98 identifiers are instance-local                                                                            |
| Explicit investigation bundle export/import            | Pro  | P02       | Hostile-file validation and export preview              | Metadata can be sensitive                                                                                     |
| Queue attempt and outcome inspector                    | Pro  | P03       | M98f (`/v1/queues`)                                     | Settlement is `unknown` on RabbitMQ/SQS; depth may be `unavailable`; durable job listing remains out of scope |
| Trace inspector and cross-application correlation      | Pro  | P03       | M98g (`/v1/traces`)                                     | Correlates on equal trace ids only; parent visibility is shown, never a fabricated edge                       |
| Configuration provenance                               | Pro  | P03       | M98e (`/v1/config`)                                     | Value-free; unapproved keys are never observed                                                                |
| Authorization explanations                             | Pro  | P03       | M98h (`/v1/authorization`); pin move                    | First-party RBAC only; custom providers report `unsupported`                                                  |
| Cache, event and scheduler inspectors                  | Pro  | P03       | M98i–k; pin move                                        | Counters and local timer fires; a skipped local fire is not a missed execution                                |
| Realtime, storage and outbound-HTTP inspectors         | Pro  | P03       | M98l–n; pin move                                        | Counters and status classes only; no frames, paths, URLs or payloads                                          |

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

Node and Bun applications are not supported. The framework's local diagnostics
listener is Deno-only and rejects every `listen` on other platforms before
binding. Widening this needs framework listener work first; see
[framework work](#framework-work-in-priority-order).

Browser editors, SSH/WSL/containers/Codespaces sessions, remote connections, and
production access are outside the first support matrix. Unsupported execution
contexts must be refused explicitly.

## Milestones

| ID   | State                               | Deliverable                                                    | Prerequisites                                                                  | Canonical plan                      |
| ---- | ----------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| D01  | Implemented; locally verified       | Extension shell, trust gate, workspace discovery, fixtures, CI | None                                                                           | [D01 plan](plans/d01-foundation.md) |
| D02  | Implemented; independently reviewed | Explicit launch, pairing, bounded reader, teardown             | D01 + M98a–c + local compatibility evidence                                    | [D02 plan](plans/d02-connection.md) |
| D03  | Implemented; independently reviewed | Composition graph, route/middleware views, request timeline    | D01 fixtures for parallel UI work; D02 for integration                         | [D03 plan](plans/d03-inspection.md) |
| D03b | Planned; blocked on framework M98o  | Session renewal without relaunch                               | D02; framework M98o implemented and released; contract pin moved to include it | Pending: `plans/d03b-renewal.md`    |
| D04  | Planned                             | Security/compatibility exercises, VSIX, free preview docs      | D01–D03b; framework release containing `diagnostics-plugin`; pinned packages   | Pending: `plans/d04-release.md`     |
| D05  | Direction only                      | Health summary, generator/task UI                              | D04; separate plan                                                             |                                     |
| P01  | Direction only                      | Live Pro analysis, multi-app workflows, licensing              | D04; validation criteria met (see open decisions); separate plan               |                                     |
| P02  | Direction only                      | Retained investigations and comparisons                        | Persistence/export threat review; separate plan                                |                                     |
| P03  | Direction only                      | Capability-specific inspectors                                 | Pin moved past M98n; contract register refreshed; tier decision; plan          |                                     |

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

1. **Framework milestone M98o.** Its plan,
   `plans/milestone-98o-session-renewal.md` in the framework repository
   ([setu-ts#389](https://github.com/setu-ts/setu-ts/pull/389)), has passed its
   design security review. All maintainer decisions were approved on 2026-10-02.
   Implementation has not started. The design:
   - An application opts in at launch with `maxSessionLifetimeMs`, between
     `ttlMs` and a hard ceiling of 12 hours of awake time. CLI-generated
     development entries set 8 hours. Without the option, the session behaves
     exactly as today, and a renewal request is refused.
   - `GET /v1/renew` is a signed request on the existing session. It keeps the
     same key, session ID, instance binding and sequence. It moves the expiry
     to `min(now + ttlMs, activation + maxSessionLifetimeMs)`, and the expiry
     never moves backwards.
   - The status body gains an optional `renewal` member, and the native client
     gains `session()` and `renew()`. `renew()` throws `notRenewable` without
     sending a request when the application did not opt in.
   - Revocation and an application restart end the session exactly as today.
     Real expiry still closes the listener.
2. **Devtool consumption.**
   - Read the deadline from `session()`, and renew at half the remaining time.
   - Show the real remaining time and the maximum lifetime that is left.
   - On `notRenewable`, show the fixed deadline and do not attempt renewal.
   - Keep relaunch as the explicit fallback when renewal is refused.
3. Updates to the design baselines that currently forbid renewal: the session
   timer in `docs/architecture.md`, security case S09 in `docs/security.md`, and
   the session-lifecycle row in `docs/framework-compatibility.md`. This change
   touches credentials and authenticated transport, so it needs a renewed
   independent security review.

**Release requirement.** The first published devtool must bundle a client that
understands renewal, and its contract pin must move to a framework commit that
contains M98o. The framework's status parser stays exact, so a client pinned
before M98o refuses any status body that carries `renewal`. M98o's CLI emission
ships in step with this re-pin.

A framework publication hold is proposed in
[setu-ts#390](https://github.com/setu-ts/setu-ts/pull/390), which is not yet
merged. Once it merges, the hold refuses every framework release until M98o
merges. D04 then cannot reach a published framework release without renewal
unless the framework removes the hold on purpose. Never let the 15-minute session ship by default.

### D05 — scaffolding runs the matching CLI

The generator/task UI will scaffold projects through the framework CLI. Wherever
the devtool invokes the CLI, it must run the CLI version that matches its bundled
client, not whatever `setu` is on the user's `PATH`. Generated development
entries carry options (M98o's `maxSessionLifetimeMs`, for example) that must
agree with the client that will pair with them.

## Framework work in priority order

1. **Session renewal (M98o)** for D03b (above). Its plan is approved and
   implementation has not started.
2. **Release `diagnostics-plugin`.** D04 needs a published framework release
   that contains it. Once the proposed publication hold
   ([setu-ts#390](https://github.com/setu-ts/setu-ts/pull/390)) merges, it keeps
   the package unpublished until M98o merges, so this release follows item 1. Until then, D04's
   published-provenance gates stay open. The D04 plan's version numbers must
   match whatever that release is.
3. **Move the contract pin** past M98n and refresh the
   [contract register](docs/framework-compatibility.md). This requalifies D02/D03
   against the new pin, and is a P03 prerequisite.
4. **Workspace-relative source references**: a new reviewed metadata projection,
   before safe source navigation.
5. **Before P02**: review storage, deletion, import/export and identity across
   instances. M98 IDs are instance-local; matching `r1` between launches is
   incorrect.
6. **Node/Bun diagnostics listener**, if the support matrix is to widen beyond
   Deno.

The observation families that blocked P03 (health, configuration, queues,
tracing, authorization) shipped as M98d–h, each with its own security audit.
Raw service APIs remain inappropriate diagnostic feeds.

Database/cache/storage browsing, durable queue enumeration, retries, scheduler
control, tenant switching, replay and fault injection remain outside these
releases. They require capability-specific inspection or control contracts and
authorization reviews. Resending a request is not deterministic replay.

## Open decisions

- **Tier of single-application inspectors.** The P03 inspectors render data the
  MIT-licensed framework serves free through a documented protocol and a native
  client. Anyone can build those views, so a paid single-app view is weak to
  defend. P01/P02 analysis and retention do need devtool-side work. Decide
  before the P03 plan whether single-app inspectors move to Free, with Pro
  keeping cross-session analysis, history and multi-app correlation.
- **What "validated free workflow" means for P01.** Define the users, signal
  and threshold before P01 is planned, so the gate can actually be met.
- **Release without renewal.** Only if M98o slips. Once the proposed framework
  publication hold merges, this also requires removing that hold on purpose; see
  [D03b](#d03b--session-renewal-before-d04).

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
