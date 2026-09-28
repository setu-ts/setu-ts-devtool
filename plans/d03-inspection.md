# D03 — Inspection UI

Status: planned. D01 and D02 are merged to `main`; D02 supplies the sole live
session, authenticated DTO boundary, bounded capture, lifecycle cleanup and
native Launch/Stop/Clear commands consumed here. This plan deliberately adds
presentation only. It does not change how projects are discovered, applications
are launched, credentials are handed off, or diagnostic transport is paired.

## Outcome and exclusions

A trusted, supported local desktop user with an active D02 session can open one
inspection panel. The panel shows the current application state and composition
topology as a bounded graph with an equivalent accessible list; routes and
middleware are identifiable when the application explicitly approved labels.
It also shows a paged request/lifecycle timeline, selected-record details,
literal text filters, and distinct capture-quality indicators for framework
loss, collector drops, host eviction, snapshot truncation and page clipping.
The user can clear the local event capture, stop the active session, and open
only fixed documentation topics. Closing or hiding the panel discards its
renderer data but does not stop the explicit active launch; reopening rebuilds
it from the host's bounded live memory.

The graph represents the declared/observed M98 topology, not a complete
dependency-injection graph or proof of runtime calls. Timeline durations are
inclusive elapsed durations, not exclusive CPU time; null timing is unknown,
late or absent parents remain visibly unresolved, and HTTP timing does not
cover streamed response completion. IDs are opaque and instance-local, so the
UI never correlates records across sessions. Labels absent from the approved
framework projection stay opaque; D03 must not read source, routes, schemas,
configuration, environment or request data to reconstruct them.

This milestone excludes application logs, arbitrary source navigation, health,
configuration, queues, authorization, tracing inspectors, persistence/export,
multi-application views, browser/remote support, URL/port/process control from
the webview, frontend frameworks and graph engines. Fixture preview is a
development/test-only `setuDevtool.sample` command that opens this same panel
from a frozen synthetic snapshot/event fixture, visibly marked `Sample data —
no live connection`. It never constructs a client, endpoint or session. The
fixture factory is dynamically imported only behind the existing development
build guard; the production-artifact test must prove neither the command nor
fixture module is present in `dist`.

## Verified contracts and prerequisite position

The framework reference is
`26aebd0e3fd16074d7b578623577fe87a1930e83`, recorded in
[the compatibility register](../docs/framework-compatibility.md). M98a–c are
implemented but unpublished. That is sufficient for local D03 work because D02
already compiles through the prepared, provenance-checked public artifacts; it
is not released-package or VSIX qualification. D04 owns pinned published
package, installed-VSIX and cross-editor/platform evidence.

| Existing contract/surface | D03 treatment                                                                                                                                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M98a snapshot             | Project only version 1 application state/failure code, 1,024 nodes, 4,096 edges, `truncated` and `droppedEvents`; use node/edge kinds literally and keep labels optional.                                                                      |
| M98a event batch          | Present only retained validated events; event kinds are lifecycle/request/middleware/handler, completion order may put parents after children, and `atMs`/`durationMs` may be null.                                                            |
| M98a loss semantics       | Preserve separate counters for `lost` (framework ring/failed-start gaps), `droppedEvents` (pre-ring collector rejection), host eviction, and UI clipping. Never turn discontinuity into negative loss or claim completeness.                   |
| D02 adapter/validation    | Continue consuming only independently owned, frozen `Capture` records after the public helper's authenticated validation. The renderer never imports framework types/client or receives raw responses.                                         |
| D02 capture revision      | Clear retains topology and cursor but advances the revision. D03 must invalidate pending frames/selections before async UI work so pre-Clear records cannot return. Stop/reset removes topology, records, counters, panel model and selection. |
| D02 scheduler/session     | Reuse its single serialized read/snapshot scheduler and `changed` callback. D03 introduces no reader, timer-driven polling, endpoint, credential or retry path.                                                                                |
| VS Code webview contract  | Desktop UI creates a panel with packaged-only `localResourceRoots`; a webview is a hostile renderer and its messages are untrusted. `acquireVsCodeApi()` remains private to the bundled browser script.                                        |

There is no unfinished framework milestone that blocks D03's stated local UI.
Do not consume M98d–g merely because their helper methods exist: their
capability-specific inspectors remain separately designed and reviewed work.
Publication and real VSIX/editor compatibility remain D04 blockers only.

## Design and trust boundaries

### Host model and display projection

Keep `src/model/capture.ts` as the sole bounded live capture owner. Add a pure
`src/model/presentation.ts` (and narrowly scoped display-contract types under
`src/presentation/`) that accepts a `Capture` snapshot and only emits fresh,
frozen, allowlisted display records. It must not expose raw diagnostic objects,
absolute project paths, endpoint/instance identifiers, credential material,
environment, process output, unknown fields or arbitrary errors.

Use named display fields with bounded string clipping and serialized byte
accounting. The host retains one snapshot, at most 4,096 events or 4 MiB as
D02 already specifies. A frame contains no more than 100 nodes, 200 edges and
100 events; pagination/filter summaries state every omitted record. Filtering
is literal text only, at most 256 characters—never compile/evaluate a user
regular expression. Graph traversal and relationship lookup are bounded by the
retained-record count; do not recurse, and guard defensively against cycles.

The projection keeps unresolved event parent/node references explicit. It
preserves snapshot truncation, framework ring loss, collector drops, extension
evictions and UI page clipping as separately named, saturated non-negative
counters. A selected ID must belong to the current projected display model;
selection is cleared when Clear/Stop/pruning removes it. D03 must cap all
indexes and discard indexes with the event records they reference.

### Panel lifecycle and protocol

Add `src/presentation/panel.ts` as a host-owned `WebviewPanel` controller and a
versioned discriminated bridge contract shared only with browser-safe webview
code. Open/View Inspection is a native command available only in the same
trusted, local desktop context as D02. It may show an empty/idle fixed state,
but it cannot select a project, launch an application or create a session.
Wire D02's existing change callback to coalesced panel refreshes and retain the
native status/Stop command when the panel is hidden or disposed.

Each panel gets a fresh opaque panel generation, separate from session and
framework identity. Every host frame carries protocol version, panel generation
and capture revision. The panel may send its one bootstrap `ready` with an empty
generation because it has not received a frame yet; that request has no action
authority. Every subsequent request must carry the frame generation. The panel
must send `ready` before frames and acknowledge
the exact frame sequence. Allow at most two host updates per second, one
unacknowledged frame and one replacement frame, each at most 256 KiB. After
five seconds without acknowledgement, stop updates, dispose the stale panel and
only recreate it through an explicit reopen; never accumulate history.

The only accepted renderer requests are `ready`, `acknowledge`, select
node/event, set bounded page/filter, clear capture, stop session, and open a
built-in documentation topic ID. Validate every request before dispatch:
protocol version, generation, exact discriminant/allowed fields, JSON-safe
shape, 8 KiB byte limit, maximum depth 8, known display IDs, page/filter bounds
and a token-bucket limit of 20 messages/second with burst 20. Unknown, extra,
deep, malformed, stale or flooded messages are ignored/refused without logging
their contents. Duplicate/stale acknowledgements cannot release arbitrary
frames. A valid clear/stop request delegates only to the existing native D02
operation; it does not receive a process, client, URL, path, command or network
primitive.

Before Clear/Stop/session replacement/panel recreation, advance or compare the
capture revision and invalidate frames/selections before awaiting any operation.
If the visible reset cannot be acknowledged, dispose the panel rather than risk
showing old capture as current. No `retainContextWhenHidden`, panel serializer,
`setState`, memento, workspace/global state, browser storage or local storage
may retain diagnostics, labels, filters, selections or credentials.

### Rendering and CSP

Create browser-only `webview/` TypeScript and packaged CSS assets, separately
bundled by `scripts/build.mjs` without Node imports. Use plain DOM and SVG/DOM
construction with `textContent`/text nodes for every application-derived value,
including SVG labels. Never use `innerHTML`, injected SVG/XML/Markdown, inline
event handlers, `eval`, remote assets or workspace resources. Clip labels in
the host/display contract and render clipped text literally; CSS/SVG shapes and
interaction targets are fixed extension code.

The host writes a fixed HTML shell, substituting only `webview.cspSource` asset
URIs and a newly generated script nonce. Apply exactly:

```text
default-src 'none';
script-src 'nonce-<generated>';
style-src <webview.cspSource>;
img-src <webview.cspSource>;
connect-src 'none';
font-src 'none';
object-src 'none';
frame-src 'none';
base-uri 'none';
form-action 'none';
```

`localResourceRoots` contains only the extension's packaged webview assets.
Disable command URIs. Documentation opening accepts exactly these topic IDs and
destinations, with no query parameters: `architecture` →
`https://github.com/setu-ts/setu-ts-devtool/blob/main/docs/architecture.md`,
`security` →
`https://github.com/setu-ts/setu-ts-devtool/blob/main/docs/security.md`, and
`framework-contract` →
`https://github.com/setu-ts/setu-ts/blob/26aebd0e3fd16074d7b578623577fe87a1930e83/docs/diagnostics-protocol.md`.
The host, not the renderer, owns this frozen mapping and uses VS Code's external
opener; renderer input can never provide a URL or query data. The rendered graph has an accessible
list/table equivalent, keyboard-reachable controls, semantic labels and an
announced capture-quality summary; accessibility must not require unbounded
hidden DOM copies.

## Internal surface and file/test mapping

No D03 module is a public package API. Exported internal symbols require a
named production consumer. Update existing test fixtures rather than placing
fixture captures in production bundles.

| File                                                          | Main surface and consumer                                                                                                                           | Required tests                                                                                                                                                                                                                              |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/model/capture.ts`                                        | Existing bounded records plus safe snapshot/view accessor for presentation                                                                          | Extend `test/unit/capture.test.ts` for eviction/index pruning, revision and counter separation                                                                                                                                              |
| `src/model/presentation.ts`                                   | Pure frozen graph/timeline projection, pagination, literal filtering and capture-quality model                                                      | New `test/unit/presentation.test.ts`: labels, missing/late parents, null/inclusive timings, cycles, clipping, all limits and no raw-field leakage                                                                                           |
| `src/presentation/protocol.ts`                                | Exact browser-safe request/frame discriminated unions and hostile request decoder                                                                   | New `test/unit/protocol.test.ts`: version/field/size/depth/generation/ID/rate rejection                                                                                                                                                     |
| `src/presentation/panel.ts`                                   | Webview construction, CSP/shell, local assets, frame acknowledgement/coalescing and fixed documentation map                                         | New `test/unit/panel.test.ts`: CSP/resource roots, nonce, no command URLs, stale/duplicate ack, stall/reset/disposal and no persistence                                                                                                     |
| `src/editor/connection.ts`                                    | Existing session commands plus panel opening/wiring; native authority remains here                                                                  | Extend `test/unit/editor.test.ts` for panel command context and Clear/Stop synchronization                                                                                                                                                  |
| `src/extension.ts`                                            | Compose panel lifetime with session change/disposal and context guards                                                                              | Extend host test and unit fixture for hidden/reopened/disposed panel behavior                                                                                                                                                               |
| `webview/main.ts`, `webview/style.css`, `webview/renderer.ts` | Browser-only accessible DOM/SVG renderer and local interactions; renderer helpers are DOM-port injected for Node tests                              | `test/webview/renderer.test.ts`: text-node-only hostile labels, accessible list and controls, literal filtering, no fetch/storage/bridge leakage                                                                                            |
| `scripts/build.mjs`, `package.json`, `tsconfig.json`          | Separate webview build copied to `dist/webview`; browser sources are strict-typechecked and production artifacts exclude fixtures/forbidden imports | `npm run test:webview` builds `test/webview/*.test.ts` and runs `node --test out/webview/*.test.cjs`; `npm run check` includes `webview/**/*.ts`; `npm run test:coverage` includes the webview test output and enforces 90% per source file |
| `test/fixtures/`                                              | Synthetic bounded graph/timeline and hostile label/IPC data                                                                                         | Unit and actual development-host exercises; never include live/recorded traffic                                                                                                                                                             |

## Implementation order and verification

1. Commit this plan. Re-read D02's `Capture`, controller revisions and editor
   lifecycle before changing their surfaces. Add synthetic M98 snapshots/batches
   covering labels/no labels, all node/edge/event families, null timing,
   completion-order parents, loss/drop/truncation and over-limit fixtures.
2. Implement and fully unit-test the pure owned presentation projection first.
   Preserve D02 retention semantics; make filtering, pagination, clipping,
   indexes and capture-quality accounting bounded before rendering anything.
3. Define the strict versioned protocol and host panel controller. Test hostile
   renderer messages, acknowledgements and reset races with injected VS Code
   ports. Connect native Open Inspection/Clear/Stop paths only after the bridge
   is least-authority and bounded.
4. Build the browser-only DOM/SVG/accessibility view and separate asset pipeline.
   Exercise the actual development-host panel with fixture data and a live D02
   session. Do not add a frontend dependency or graph engine merely to draw the
   bounded graph.
5. Run flood/stall and Clear/Stop/reload races, inspect bundled artifacts and
   actual DOM/CSP behavior. Update validation evidence and the S11–S15/S18
   mapping with exact commands/versions/results. Obtain an independent security
   review of the implementation commit before merge because D03 introduces the
   renderer/DOM/IPC boundary.

Required normal gates are `npm run check`, `npm run format:check`,
`npm run test:webview`, `npm run test:coverage` and `npm run build`; inspect the
per-file coverage table and maintain at least 90% line, branch and function
coverage for every `src` and `webview` TypeScript source file. `test:webview`
is the required Node test command above, while the real Code OSS development
host exercise verifies the emitted browser asset and actual CSP. Run the existing
real local D02 standalone and workspace exercises after D03 wiring to
prove the UI did not alter pairing, polling, cursor, Clear or Stop behavior.

Security acceptance evidence must cover D03 portions of S11–S15 and S18:

- S11/S15: Stop, Clear, session replacement, panel reload/hide/reopen and
  stalled acknowledgement cannot restore old records; no diagnostic state is
  found in host/editor/webview persistence or pending frames.
- S12: hostile HTML/SVG/script/control labels and command/file/data/http URL
  attempts render inert; actual panel CSP disallows connection/remote resource
  loading; only the fixed documentation-topic destinations open.
- S13: arbitrary/unknown/oversized/deep/flooded/stale renderer IPC has no
  launch, file, URL, command, endpoint or network effect.
- S14/S18: event/snapshot/filter/frame floods keep arrays, indexes, traversal,
  timers and queues bounded and responsive; graph/timeline visibly distinguish
  framework loss, collector drops, host evictions, clipping, truncation and
  partial relationships.

The required behavioral exercise is not a mock-only pass: in a real Code OSS
development host on qualified Linux, explicitly launch a prepared D02 fixture,
generate an application request, open the inspection panel, observe topology
and its request/middleware timeline, filter/select it, verify quality indicators
with a loss/partial fixture, Clear without cursor rewind, then Stop and confirm
the panel/model are emptied. Repeat with malicious labels and IPC fixtures while
checking the actual CSP. D04 still owns installed VSIX evidence in both VS Code
and Code OSS, published dependency pins, other OS qualification and the final
compatibility matrix.
