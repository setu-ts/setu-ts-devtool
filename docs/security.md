# Security model and acceptance matrix

Design baseline, 2026-09-22, for the D01–D04 free preview. These controls are
requirements to implement and test, not claims that the extension is already
secure. Read alongside the [architecture](architecture.md) and pinned
[framework contract register](framework-compatibility.md). Product tier does not
change authentication, resource bounds or data protections.

## Assets, actors and trust boundaries

Protect pairing credentials, approved diagnostic metadata, workspace locations,
editor responsiveness and the user's control over local process execution.
Labels, route patterns, plugin versions and trace identifiers can reveal
sensitive structure even when payloads, secrets and configuration values are
omitted.

Treat project files, manifests, application labels, network responses and
webview messages as untrusted input. Consider a crafted repository, an unrelated
loopback listener, a web page attempting to reach the connector, malformed
authenticated records, stale responses after disconnect and a compromised
renderer. The editor, installed extension bundle, host runtime and selected Deno
executable are trusted components. Selecting a trusted project authorizes
application execution; it does not turn arbitrary input into safe HTML or a safe
extension command.

This extension is not a sandbox for a malicious selected application, another
malicious same-user extension, or a compromised OS. Application code can read
its own credentials/environment and use its granted filesystem/network
permissions. Same-user or privileged process inspection, memory dumps and
deliberate detached descendants are outside the isolation guarantee. State these
limits without describing minimized diagnostics as anonymous or guaranteed
secret-free.

| Boundary                          | Allowed crossing                                                  | Prohibited crossing                                                                         |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Workspace files → host            | Bounded descriptors from approved files, checked local paths      | Code evaluation/import, env-file ingestion, arbitrary directory crawl                       |
| Host → owned process              | Explicit task launch and fresh session credentials in environment | Credential-bearing arguments/files/settings; launch from activation or refresh              |
| Application → client              | Signed bounded protocol-v1 projections                            | Unsigned data in the diagnostic model; interpreting errors as trusted instructions          |
| Host → webview                    | Allowlisted bounded display frames                                | Pairing credentials, environment, absolute paths, raw DTOs or process output                |
| Webview → host                    | Validated selection/filter/stop/clear/topic-ID messages           | Arbitrary URL/file/command/process/network requests                                         |
| Extension → disk/network services | Packaged assets; explicit built-in documentation link in browser  | Captures, credential persistence, diagnostic uploads, background analytics or billing calls |

Application dependency downloads and application network activity belong to the
explicitly launched task; the extension cannot claim that the application is
offline. Its own diagnostic traffic is restricted to the selected IPv4 loopback
endpoint. Opening documentation sends no diagnostic query parameters or
fragments.

## Execution and workspace trust

Declare `untrustedWorkspaces.supported: false` and check `workspace.isTrusted`
inside every entry point that can read project data or start work. UI visibility
is not authorization: commands may be invoked programmatically. No discovery or
launch is triggered by gaining trust until the relevant user command is invoked.
The platform exposes trust declarations and runtime checks; this design does not
invent a separate trust store.
[Workspace Trust guidance](https://raw.githubusercontent.com/microsoft/vscode-docs/main/api/extension-guides/workspace-trust.md).

Reject web, remote and virtual execution contexts even when a local extension
host is available. Recheck context and root membership before spawning and
before accepting a new session. Removing the active root or observing a loss of
trust stops the session. Do not rely on an invented trust-revocation event;
guard calls and use actual editor lifecycle/disposal behavior in qualification
tests.

Parse bounded inputs, reject duplicate keys and path escapes, and revalidate
canonical paths/recipe inputs immediately before launch. This reduces accidental
or crafted path redirection; it does not eliminate filesystem races against an
actively malicious same-user process. Never infer that `shell: false` makes a
workspace's `deno task dev` safe: the task is executable project content.

The native Launch action identifies the working directory, selected member and
all members that the root runner will start. No auto-launch, task installation,
scaffold editing, arbitrary launch arguments, attach command or
workspace-supplied executable override exists in the preview. User-level
executable configuration names a local executable and is validated before use.

## Credential lifecycle and transport

Generate a new ID/key for every launch attempt; never reuse them after failure,
expiry, Stop, reload or project switch. Session ID is treated as sensitive along
with the key. Inject through the child environment only. Remove inherited
handoff variables before constructing it; set the workspace selector only from a
validated member. Test the M98c sibling-emptying behavior with a real
multi-member launch.

The host retains key material only as required for spawn and the helper's lazy
import. Clear owned byte buffers after the initial call settles or at teardown,
drop references, and never claim secure erasure of immutable strings or child
environments. Do not use `SecretStorage`, mementos, settings, temporary env
files, webview state, terminal command history or crash reports for session
credentials.

Only the framework helper signs and verifies diagnostic requests. The host
supplies its own crypto, timers and fetch implementation; never import a
workspace-provided client, fetch shim or signing implementation. Require the
measured fetch route to connect directly to `127.0.0.1`, with
proxy/environment-proxy behavior disabled or proven bypassed in the supported
host. Do not follow redirects, consult arbitrary URL settings, forward remote
ports, fall back to `localhost`/IPv6, or connect from the webview. HMAC
authenticates, but does not encrypt, loopback HTTP.

TCP readiness probes carry no credentials and prove only that the selected port
accepts a connection. The signed initial exchange establishes the diagnostic
peer; pairing failure terminates that launch. Close all probes on every stop
path. Client validation must reject bad signatures, replay and oversized
responses before data reaches display. The extension additionally validates
complete DTO shape and consistency. A valid MAC does not make a label safe to
render.

The existing helper does not fully enforce post-pairing instance consistency and
has shallow DTO guards, mutable results and generic failures. These are recorded
integration gaps, not assurances. Require framework-side adversarial instance
tests and any necessary fix before D02 acceptance. Do not compensate by
importing private helper state or writing a second HMAC implementation.

Use a conservative local 15-minute deadline starting at spawn. On any helper or
validation failure, stop reads, clear the view/model and stop owned processes.
Do not report the exact server expiry or infer a detailed failure class from an
internal error string. Client `close()` alone does not revoke the server.

## Data minimization, display and persistence

Accept only the common diagnostics projections and construct a new display model
with named fields. Drop unknown fields before IPC; never spread raw objects into
messages. Show absent labels as opaque IDs and unresolved relationships as
unknown. Do not try to reconstruct names by reading source files, route schemas,
config values, request payloads or environment. Approving labels remains an
explicit application-side decision; the extension does not widen approval lists.

Host capture and webview rendering follow the numeric budgets in
[architecture](architecture.md). Refuse malformed input; evict valid old events
when the host budget is reached and report those evictions separately from
framework loss. Apply literal text filtering, not user regex evaluation. Bound
indexes, graph traversal, nesting depth, timers, pending calls and IPC queues as
well as primary arrays. Byte limits describe logical data volume; measure actual
heap growth and responsiveness during D03/D04 stress exercises.

Render labels using text nodes, including SVG text, with explicit clipping;
never interpolate them into HTML, CSS, scripts, URIs or Markdown command links.
Use a fixed shell and this intended CSP, substituting only extension-owned asset
source and a fresh script nonce:

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

Ship external script/style files, disable command URIs, limit
`localResourceRoots` to packaged assets, and keep `acquireVsCodeApi()` private.
No remote assets, inline event handlers, `eval`, injected SVG markup or
workspace resource loading. CSP and text rendering are complementary controls;
resource roots alone are not a sandbox.
[Webview security guidance](https://code.visualstudio.com/api/extension-guides/webview).

Validate all incoming IPC by kind, version, generation, size, depth, rate and
allowed fields. Compare IDs against the host model before use. A valid message
may select data or stop the current session; it cannot launch, choose a URL or
read a file. Duplicate/stale acknowledgements cannot free arbitrary queued
frames. Invalidate the session/capture revision before awaiting teardown so
races cannot restore erased data. Discard a stalled panel when its reset cannot
be confirmed.

No diagnostic records, labels, selections, filters containing user text, or
session credentials are persisted in the preview. Do not use `setState`, panel
serializers, `retainContextWhenHidden`, workspace/global mementos or
local/browser storage for them. Closing the panel destroys its display; bounded
host capture survives only while the session remains active. Clear removes local
event history while retaining the cursor and topology, so it neither rereads old
retained events nor claims to erase the collector. Stop clears the full
diagnostic model and closes the panel.

Ignore application stdio rather than capture it in terminals, output channels or
files. Extension errors use fixed codes and safe exit numbers, without raw
exception text, fetch responses, environment, arguments or filesystem paths.
Synthetic test secrets can be asserted in memory, but test failure output must
not dump runtime credentials. This policy cannot prevent application code
writing its own logs/files.

## Process lifecycle and residual limits

Own only the process group created by this window's launch. Shutdown must cover
task wrappers, the workspace runner and ordinary descendants, including a root
that exited before its children. Verify ownership and group disappearance; never
treat sending a signal or observing only the root exit as successful cleanup.
Guard against PID reuse when the root exits before its group. The D02 plan must
define and test that identity check; never escalate a signal against an
unverified replacement process. After bounded graceful/forced attempts, report
incomplete cleanup and prevent a replacement launch while ownership is
unresolved. Do not persist identifiers for future automatic killing or search
for processes by port/name.

Normal Stop, deadline, project removal, app exit and deactivation share the same
cleanup path. Test group cleanup with a child ignoring SIGTERM and with a runner
that exits first. Qualification is initially Linux only; do not claim Windows or
macOS behavior from mocks. Ordinary descendants are supported; a hostile app can
escape a process group, and an OS/host crash can bypass extension cleanup. The
connector TTL limits remaining diagnostic access but does not stop the app.

On editor restart the extension has no recoverable credentials, diagnostics or
authority to kill a previous PID. An occupied port is refused with manual
recovery guidance. Crash-proof process supervision would require a separate
implementation and review; it is not an implicit property of the framework
runner.

## Acceptance matrix

All rows are **required evidence, not yet executed**. Canonical milestone plans
must map each ID to named tests or a repeatable manual exercise. A mocked unit
pass cannot substitute for rows that require an actual editor or process tree.

| ID  | Threat or failure                                   | Required evidence                                                                                                                                                                               | Owner                  |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| S01 | Untrusted or unsupported context launches code      | Restricted Mode, direct command invocation, web/remote/virtual contexts and unsupported OS refuse without process/network activity                                                              | D01; D04 editor matrix |
| S02 | Crafted workspace escapes discovery bounds          | Malformed/duplicate-key/deep/oversized JSON and JSONC, path traversal, symlink escape, duplicate roots, invalid members and file changes during preflight fail without evaluation               | D01/D02                |
| S03 | Selection/refresh starts unexpected services        | No auto-launch; native launch identifies all workspace members and the one instrumented target; selection/refresh/invalid root spawn nothing                                                    | D02                    |
| S04 | Credentials leak or get reused                      | Real standalone and multi-member launches verify fresh values, exact encoding, sibling blanks and absence from arguments, IPC and extension persistence/output                                  | D02                    |
| S05 | Wrong executable/task or shell interpolation        | Workspace executable overrides and path tricks refused; explicit user executable validated; fixed argument vector used; unsupported recipes fail                                                | D02                    |
| S06 | Wrong listener wins readiness race                  | Occupied port, delayed listener, listener replacement and wrong signing key never yield live data; failed pairing requires fresh launch; probes/timers close                                    | D02                    |
| S07 | Signed/unsigned malicious transport data reaches UI | Bad MAC/replay/redirect, body overrun/stall, unsupported version, malformed fields/enums/numbers, instance/header/DTO mismatch and cursor inconsistency rejected before display                 | Framework + D02        |
| S08 | Proxy or browser exposes diagnostic traffic         | Instrumented supported-host fetch uses only selected IPv4 loopback even with proxy variables configured; browser-Origin requests rejected; webview has no fetch route                           | D02/D04                |
| S09 | Error handling misstates identity or expiry         | Non-200/timeout/invalid DTO use fixed neutral failure; local deadline is labeled correctly; no private error-string matching or automatic retry/renewal                                         | D02                    |
| S10 | Close leaves owned children alive                   | Real standalone/workspace tree, early root exit, SIGTERM-resistant child, startup cancellation and forced cleanup exercise group disappearance and incomplete-cleanup state                     | D02; D04 editor matrix |
| S11 | Late callbacks resurrect records                    | Races between Stop/Clear, polling, pairing, project change, panel reload and new session cannot restore old generations or undo clear                                                           | D02/D03                |
| S12 | Labels/links execute or exfiltrate                  | HTML/SVG/script, command/file/data/http URLs and control characters stay inert; actual packaged webview CSP blocks connections/resources; only fixed documentation topic destinations open      | D03                    |
| S13 | Compromised renderer gains host authority           | Unknown/oversized/deep/flooded/stale IPC and arbitrary path/URL/command requests rejected; protocol provides no launch/file/network primitive                                                   | D03                    |
| S14 | Bounded arrays hide unbounded work/memory           | Flood events, snapshots, watchers, filters and unacknowledged frames; prove scheduler/queue/index limits, explicit loss counters and responsive editor                                          | D01–D03; D04 stress    |
| S15 | Clear/Stop/reload retains sensitive data            | Inspect host store, rendered DOM, pending frames and extension storage; Stop removes all capture, Clear does not rewind cursor, no panel/session restoration after reload                       | D02/D03                |
| S16 | Crash creates misleading cleanup claims             | Force host termination; document surviving process behavior and TTL, verify no silent reconnect or persisted-PID kill, then clean test processes externally                                     | D04                    |
| S17 | Packaging changes trust assumptions                 | Install the VSIX in VS Code and Code OSS; verify bundled helper provenance, no workspace module resolution, no Deno globals in host, no unexpected egress, and package contents/dependency pins | D04                    |
| S18 | Loss/partial data presented as complete             | Late/missing parents, null timings, truncation, ring gaps, collector drops, host evictions and page clipping have distinct visible treatment                                                    | D03                    |

## Completion and changes to this model

D01 can proceed while the framework helper gap remains open. D02 acceptance
needs instance-binding conformance evidence and real launch/cleanup tests; a
promise to fix it after shipping is not evidence. D03 must validate the actual
packaged webview, and D04 must attach exact editor, OS, runtime and framework
versions to the acceptance matrix. No row is marked passed by this documentation
update.

Recording, export/import, remote access, arbitrary attachment, custom TTLs,
application log viewing, health/config/job introspection and Pro licensing each
require an explicit extension of this model before implementation. Any later
entitlement service receives no diagnostic data or session credentials;
licensing cannot authorize application access or weaken the free connection
protections.
