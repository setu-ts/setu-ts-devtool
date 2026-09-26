# Devtool roadmap

Status: D01 foundation implemented and locally verified, updated 2026-09-27.
D02–D04 remain pending. See [D01 evidence](docs/d01-validation.md).

The [architecture](docs/architecture.md) defines the preview's components,
launch lifecycle and resource budgets. The [security model](docs/security.md)
defines its trust boundaries and acceptance cases. These are design baselines;
D01 has a canonical implementation plan; later plans remain to be written.

## Product boundary

Free provides everyday single-application debugging. Pro adds deeper analysis
and coordinated investigation across applications. Authentication, minimization,
compatibility checks, bounded resources, capture-quality indicators, and
framework diagnostic APIs have the same protections in both tiers. A license
never authorizes access to an application.

## Feature allocation

| Feature                                                   | Tier | Delivery  | Dependency or limitation                                                                                       |
| --------------------------------------------------------- | ---- | --------- | -------------------------------------------------------------------------------------------------------------- |
| Project and monorepo discovery                            | Free | D01       | Read bounded local manifests without importing application code                                                |
| Explicit local launch and pairing                         | Free | D02       | Implemented M98a–c; prepared Deno application, native extension host                                           |
| Plugin/capability graph and route explorer                | Free | D03       | M98 minimized DTOs; names require application-side approval                                                    |
| Middleware order and individual request timeline          | Free | D03       | Inclusive elapsed durations, not CPU profiling                                                                 |
| Available lifecycle stages and connection state           | Free | D03       | No complete post-failure startup history                                                                       |
| Search, filters, capture gaps, clear/disconnect           | Free | D03       | Bounded in-memory capture only                                                                                 |
| Contextual documentation links                            | Free | D03       | Built-in destination allowlist                                                                                 |
| VSIX preview with measured compatibility                  | Free | D04       | Real framework/editor exercises                                                                                |
| Generator/task UI with change preview                     | Free | After D04 | Separate execution/write plan; keep using existing CLI initially                                               |
| Safe source navigation and health summary                 | Free | Follow-on | New reviewed metadata projections; never arbitrary file/data access                                            |
| Route percentiles, outcome trends, slow-stage analysis    | Pro  | P01       | Derived from M98; sample size, losses and window visible                                                       |
| Compare two windows in the same live session              | Pro  | P01       | No persistence or cross-restart identity claim                                                                 |
| Focused dependency subgraphs and declared impact analysis | Pro  | P01       | Declared dependencies do not prove runtime calls                                                               |
| Multi-application dashboard                               | Pro  | P01       | Independent explicitly launched/paired sessions and memory budgets                                             |
| Saved filters and layouts                                 | Pro  | P01       | Preferences only; exclude diagnostic records and labels by default                                             |
| Local recordings, history, architecture diffs             | Pro  | P02       | Retention/access review and semantic identity matching                                                         |
| Explicit investigation bundle export/import               | Pro  | P02       | Metadata can be sensitive; hostile-file validation and export preview                                          |
| Queue attempt and outcome investigation                   | Pro  | P03       | New minimized observations; existing counters do not prove durable settlement; job listing is separately gated |
| Distributed operation tracing                             | Pro  | P03       | Readable minimized span/operation feed and verified causal context; M98 identifiers alone are insufficient     |
| Configuration provenance                                  | Pro  | P03       | Origin metadata captured during resolution, without values; new reviewed contract                              |
| Authorization explanations                                | Pro  | P03       | Bounded observations from actual decisions; no policy re-evaluation or principal/claim export                  |

P01–P03 describe product direction, not approved implementation plans. Write
canonical plans and acceptance tests before starting each. Generator/task
management UI remains free but follows the preview. D02 already consumes M98c's
prepared development entry and launch tasks; users enable or migrate projects
through the existing CLI before launch.

The [five-area framework assessment](docs/framework-addons.md) identifies
reusable code, missing contracts and security evidence for health, queues,
configuration, authorization and tracing. These addons do not block D01–D04;
their individual feature plans must wait for the relevant framework design and
review. P01's side-by-side application dashboard does not promise distributed
trace reconstruction. Queue job/dead-letter enumeration remains a separate
proposal, even after live queue observations become available.

## First release

Ship D01–D04 as a free local preview. One active application per editor window;
any number of discovered workspace applications may be selected one at a time.
The M98c workspace runner starts all members while instrumenting only the
selected one; disclose this launch scope and clean up every owned process. Show
a fixture-backed preview only through an explicit development/test command,
always marked as sample data.

Supported target: desktop VS Code and Code OSS, local file workspaces, local
Deno application. Start qualification on Linux, the current development
platform. Add Windows/macOS only after their process cleanup and
packaged-extension matrix passes. Node is the extension host; Deno is the
inspected application runtime. This does not imply support for Node applications
through M98b.

Browser editors, SSH/WSL/containers/Codespaces sessions, remote connections, and
production access are outside the first support matrix. Unsupported execution
contexts must be refused explicitly.

## Milestones

| ID  | State                                | Deliverable                                                    | Prerequisites                                                        | Canonical plan                      |
| --- | ------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------- |
| D01 | Implemented; locally verified        | Extension shell, trust gate, workspace discovery, fixtures, CI | None                                                                 | [D01 plan](plans/d01-foundation.md) |
| D02 | Planned; framework integration gated | Explicit launch, pairing, bounded reader, teardown             | D01 + implemented M98a–c + local compatibility evidence              | Pending: `plans/d02-connection.md`  |
| D03 | Planned                              | Composition graph, route/middleware views, request timeline    | D01 fixtures for parallel UI work; D02 for integration               | Pending: `plans/d03-inspection.md`  |
| D04 | Planned                              | Security/compatibility exercises, VSIX, free preview docs      | D01–D03, pinned published framework packages and acceptance evidence | Pending: `plans/d04-release.md`     |
| P01 | Direction only                       | Live Pro analysis, multi-app workflows, licensing              | Validated free workflow; separate plan                               |                                     |
| P02 | Direction only                       | Retained investigations and comparisons                        | Persistence/export threat review; separate plan                      |                                     |
| P03 | Direction only                       | Capability-specific inspectors                                 | Framework addons individually designed and audited                   |                                     |

## Framework work and reviews in priority order

1. Use the [verified M98a–c contract register](docs/framework-compatibility.md)
   for detailed planning. The framework milestones are implemented but
   unpublished. D02 can start with consistently mapped local artifacts; verify
   native host packaging and resolve the recorded client validation and
   instance-binding gaps before accepting integration. D04 requires
   released-package evidence.
2. Exercise M98c credential handoff and session lifecycle for D02. The preview
   honors the existing 15-minute default/60-minute maximum and requires relaunch
   after expiry. Renewal is a separate framework design prerequisite for a later
   seamless session experience; do not invent renewal in the extension or
   silently lengthen the lifetime.
3. Review workspace-relative source references and minimized health observations
   before those free enhancements. Existing health checks invoke application
   code and may return arbitrary data.
4. Before P02, review storage, deletion, import/export and identity across
   instances. M98 IDs are instance-local; matching `r1` between launches is
   incorrect.
5. Before the corresponding P03 feature plans, review configuration provenance,
   then queue observations and tracing together, then authorization
   explanations. The order is a recommendation for contract/security review, not
   a release commitment. Existing payload-bearing service APIs are not
   diagnostic feeds.

Database/cache/storage browsing, durable queue enumeration, retries, scheduler
control, tenant switching, replay and fault injection remain outside these
releases. They require capability-specific inspection or control contracts and
authorization reviews. Resending a request is not deterministic replay.

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
