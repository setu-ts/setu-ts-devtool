# Framework addons: dependencies and review boundaries

Historical assessment: the missing-contract analysis below predates merged
M98d–g. See the [current D02 contract audit](d02-contract-audit.md) and
[contract register](framework-compatibility.md) for the updated client surface.
This assessment is not current addon implementation status; refresh each area
before its devtool feature plan. No addon inspector is included in D02.

Source assessment, reviewed 2026-09-23, against framework commit
[`6de620d6206e087c601c6067786f6b4d8a219ca6`](https://github.com/setu-ts/setu-ts/commit/6de620d6206e087c601c6067786f6b4d8a219ca6).
This refines the five deferred feature areas before writing devtool milestone
plans. It is a source-level feasibility/security assessment, not a completed
audit, an approved public API, or a framework implementation milestone.

M98a–c provides minimized composition and HTTP execution observations, an
authenticated connector and launch scaffolding. It does not provide general
inspection of every registered capability. The framework's own
[follow-on boundary](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/ROADMAP.md#L10888)
also defers these richer data surfaces. The
[contract register](framework-compatibility.md) remains the current wire/API
baseline.

## Product decision

Keep D01–D04 scoped to the free M98 preview. Make the following features
explicit dependency-gated follow-ons rather than silently dropping them or
treating them as UI-only work. Their framework projections remain free; the tier
describes the devtool experience, never permission to read an application.

| Feature                       | Existing foundation                                                                     | Required addition before devtool implementation                                                              | Product placement                                      |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| Health summary                | Executable health indicators, status reports and per-indicator deadlines                | Cached, minimized observations with explicit collection/freshness policy                                     | Free follow-on after D04                               |
| Configuration provenance      | Central load/merge/expand/validate path; typed sections                                 | Value-free origin metadata recorded when configuration is resolved                                           | Pro P03 direction                                      |
| Queue investigation           | Process callbacks, outcome counters, some adapter depth reporting and trace propagation | Bounded queue observations with explicit scope/availability; a separate contract for durable job enumeration | Pro P03 direction; durable listing remains uncommitted |
| Authorization explanations    | RBAC decision implementation and guard enforcement                                      | Observation of actual decisions with bounded reasons and policy-version semantics                            | Pro P03 direction                                      |
| Distributed operation tracing | Span creation/export, propagation and optional active identifiers                       | Minimized readable span/operation feed plus verified correlation and capture-quality semantics               | Pro P03 direction                                      |

P01's multiple-application dashboard can show independently paired applications
side by side. That is distinct from reconstructing cross-service causality. M98
trace identifiers can be displayed when present; matching an identifier alone
does not prove a caller/callee edge or a complete trace.

## Queue inspection

The
[public queue contract](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/common/src/services/queue.ts)
has `add`, `process` and `addRecurring`, with `ProcessOptions.onFailed` for
final attempt failures. It still has no job-listing, job lookup or dead-letter
reader. However, saying that no inspection foundation exists would be too broad:

- [Queue metrics](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/metrics/queue-collector.ts)
  already record outcomes when a metrics provider is present.
- The
  [health indicator](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/services/queue-service.ts)
  can report ready/processing/dead depths for names processed by that instance.
  [MemoryQueue](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/adapters/memory-queue.ts)
  supports this;
  [RedisQueue](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/adapters/redis-queue.ts)
  exposes it when its connected client supports the required counts. RabbitMQ
  and SQS do not expose equivalent depths through this implementation.
- [Job settlement](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/processors/job-processor.ts)
  emits outcome notifications before awaiting the backend
  ack/requeue/dead-letter operation. A reported outcome or failure callback is
  not proof that durable settlement succeeded.

The first useful addon should observe local job attempts and expose approved
queue identifiers, outcome, attempt number, duration and explicit settlement
state when known. Backend depths need separate scope, freshness and completeness
metadata; process counters are not durable inventory and are not safe to sum
across replicas as queue depths. Unsupported counts must stay unavailable, not
zero.

Do not forward `IJob.data`, headers, backend receipt/claim tokens, raw job IDs,
exception messages or connection details. Use bounded session-local job aliases
if correlation is needed, and approve queue labels separately. Project before
diagnostic buffering; do not buffer full jobs and redact later. Observation must
preserve existing processors, failure callbacks, retries and settlement.

A durable browser is a separate proposal: backend-specific non-consuming reads,
bounded pagination, queue/tenant authorization and adapter support evidence.
Never implement browsing using `reserve` followed by requeue; that changes
delivery behavior. Do not give the extension Redis/broker credentials or access
private adapter state. Retry, purge, move and replay remain separate control
work.

## Health inspection

The
[health contract](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/common/src/services/health.ts)
returns arbitrary `data` inside each result. The
[implementation](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/health-plugin/src/services/health-service.ts)
already runs selected indicators concurrently, defaults to a five-second
per-indicator deadline, and replaces thrown details with fixed error/timeout
reasons. These protections do not minimize successful `data`, and a deadline
does not cancel an indicator's underlying work: its callback accepts no abort
signal.

Prefer a passive snapshot of the last observation made by normal application
health collection. A diagnostic read must not itself call `check`, `checkReady`,
`checkLive` or poll the public health endpoints. If the application wants
scheduled collection, make that a separate explicit opt-in with selected
indicators, cadence and concurrency budgets. Never launch replacement work
indefinitely after timeouts while earlier callbacks remain pending.

The proposed projection contains approved indicator identity, reported status,
measured latency and observation age. An indicator with no observation is
`unknown`, not `up`; old observations become stale. A reported `up` must not be
relabeled as proven backend reachability. Drop arbitrary `data` entirely,
including nested URLs, errors and credentials. Any later queue-depth or
backend-reachability fields need their own typed contract rather than reopening
an arbitrary data bag.

The M98c workspace runner's existing `/ready` checks remain launch behavior;
they are not the devtool health feed or diagnostic authentication. The new
inspector must not multiply those checks on each UI refresh.

## Configuration provenance

[IConfig](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/common/src/services/config.ts)
supports named reads/presence checks, not enumeration or provenance. The
[loader](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/config-plugin/src/services/load-config.ts)
and
[source merger](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/config-plugin/src/services/env-loader.ts)
know precedence while loading, then expansion and schema processing transform
the result. Injected `IConfig` instances bypass source loading. A snapshot alone
cannot reconstruct those decisions.

Record metadata at the existing resolution steps instead of loading files or
running schemas a second time. The initial proposal should expose only approved
key aliases, source categories and known precedence/transform steps. Origins
such as environment, approved file alias, injected snapshot or unknown must
reflect evidence; do not pretend an arbitrary schema transform has a known
dependency graph. A caller's `get(key, { default })` fallback is also distinct
from the startup snapshot's origin.

Do not expose values, value hashes, lengths, file contents, full environment
inventories or absolute source paths. Even key names, presence and override
relationships can be sensitive and require explicit approval. Preserve the same
metadata whether configuration is loaded before composition or by the plugin;
custom instances without provenance must report unsupported/unknown. Do not
change `IConfig.get` into an inspection endpoint.

## Authorization explanations

[IAuthorizationService](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/common/src/services/auth.ts)
returns booleans. The
[RBAC implementation](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/auth-plugin/src/services/rbac-service.ts)
knows direct permissions, wildcard grants and inherited roles internally; it
does not emit an explanation tree. A 403 or skipped handler in M98 does not
establish which authorization rule failed.

Observe the actual evaluation once, with a bounded decision ID, allow/deny
result, approved rule alias, fixed reason category and relevant policy revision
when available. Do not rerun a policy to explain it: a custom service may be
stateful, and a later evaluation can differ. Preserve short-circuit order and
mark unexecuted branches as not evaluated. An arbitrary replacement service that
only returns a boolean cannot supply a trustworthy detailed explanation.

No JWTs, credentials, principal IDs, claim maps, request bodies, resource
objects or arbitrary policy error text enter the feed. Role/rule names also need
label approval. Observation must not alter decisions or turn a broken
diagnostics sink into a request failure. Start with bounded observed RBAC
reasons; a full policy tree or hypothetical decision simulator needs a separate
contract.

## Distributed tracing

[ITelemetryService](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/common/src/services/telemetry.ts)
offers `withSpan` and optional active identifiers, not a completed-span reader.
Existing
[queue tracing](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/queue-plugin/src/tracing/traced-queue.ts)
already propagates context for enqueue/processing; recurring registration is
deliberately not the parent of every future run. Reuse these semantics rather
than adding a competing tracing system.

The
[telemetry options](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/telemetry-plugin/src/interfaces/index.ts)
support console/OTLP export and a custom `TracerHost` factory, not a public
devtool span subscription. That factory can support an investigation prototype;
it is not evidence of a ready-made minimized feed. A production addon needs an
explicitly supported local projection path and must preserve the existing
exporter, context activation, sampling and shutdown behavior.

Do not forward raw OTLP, console spans, attributes, baggage, resource labels,
exception events or span names. The current
[HTTP middleware](https://github.com/setu-ts/setu-ts/blob/6de620d6206e087c601c6067786f6b4d8a219ca6/packages/telemetry-plugin/src/middleware/telemetry-middleware.ts)
uses the request path in the span name and `http.route`; removing query strings
alone would not minimize it to M98's approved route labels.

A future feed needs approved operation/service identities, span/parent/link
relationships, duration, outcome and explicit sampling/loss/coverage metadata.
M98 `parentOperationId` is instance-local, not a cross-service parent span ID.
Join only independently authorized sessions; propagated IDs are correlation
input, never permission to discover or connect to another service. Preserve
missing parents and unobserved services instead of inventing edges. Do not order
cross-process records by comparing unrelated monotonic clocks or claim complete
traces when instrumentation/context activation is unavailable.

## Requirements shared by all addons

Each proposal must define the producer, exact fields, opt-in/label policy,
reader, resource limits, cleanup, unavailable-data semantics and a real devtool
consumer before adding exports. Reuse implementation logic inside its owning
framework package; do not import private plugin modules or widen operational
interfaces solely to let the editor walk application internals.

The M98 connector/client does not currently advertise these inspector types or
provide a generic extension endpoint. Any new transport surface requires a
reviewed version/capability contract, signed requests/responses and compatible
client delivery. A registered plugin is not proof that an inspector is
supported. Do not infer support from package names, failed requests or Pro
entitlement.

Future availability must distinguish unsupported, disabled,
enabled-with-no-data, stale and collection-failed states, with collection scope
and completeness reported separately. A future optional inspector failure must
be isolated from the core M98 reader; core integrity or authentication failures
still stop the session. Do not implement speculative negotiation fields or an
arbitrary `Record<string, unknown>` provider bus in D01–D04.

Minimize before capture, keep diagnostics read-only, and prove disabled
collection does no new work. Bound sinks and make failures non-disruptive to
application behavior. Shared databases/brokers may contain other tenants' data:
possession of a local session key is not authorization to enumerate all backend
resources. These requirements extend, rather than replace, the
[security model](security.md).

## Audit order and acceptance evidence

Recommended review order: health first; configuration provenance second; queue
observations and tracing together next because their operation/settlement
semantics overlap; authorization explanations after the observation contract is
established. This is an audit order, not a promised release order or five new
framework milestones.

| Area             | Evidence required before implementing its devtool feature                                                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Health           | Canary secrets in successful `data`/errors never reach capture; reads invoke no indicators; stale/never-checked states stay distinct; hung checks do not accumulate                                 |
| Configuration    | Precedence/expansion/schema/injected-instance cases report only supported origins; canary values/hashes/paths absent; no second file read or schema evaluation for inspection                       |
| Queue            | Adapter-by-adapter availability; bounded aliases; no payload/headers/claim tokens; no extra reserve/ack/retry calls; failed settlement never reported as confirmed durable success                  |
| Authorization    | Observed result equals actual decision for direct/inherited/wildcard/short-circuit paths; no extra evaluations; custom implementations can decline explanations; no identity/claim leakage          |
| Tracing          | Real HTTP and queue hops with sampling, missing parents/context and loss; exporter behavior preserved; raw names/attributes omitted; no automatic cross-service connection or false clock alignment |
| Shared transport | Version/support negotiation, disabled behavior, credential/identity binding, budgets and teardown exercised through the real packaged extension                                                     |

No row is passed by this source assessment. Keep the preview moving through
D01–D04 while separately designing and auditing the selected addon before its
feature plan is committed to implementation.
