# D03b — Session renewal and the v0.10.0 contract pin

Status: planned. D01–D03 are merged to `main`. Framework M98o (session renewal)
shipped in `v0.8.0`; this milestone moves the contract pin to the `v0.10.0`
release commit and consumes renewal. It is the prerequisite for D04, whose plan
is in review on `docs/d04-release-plan`.

## Outcome and exclusions

A trusted local desktop user who launches a project scaffolded or enabled by
`cli@0.10.0` keeps one live session for as long as the application allows,
without relaunching. The extension renews the session at half of its remaining
lifetime and shows how long the current session window and the renewable maximum
still have. When the application did not opt into renewal, or the maximum is
reached, the extension shows the fixed deadline, stops the launch when it
passes, and says that a new explicit launch is needed.

The pin move is part of this milestone, because renewal cannot be consumed
without it and the devtool on `main` cannot launch any project the `0.8.0`,
`0.9.0` or `0.10.0` CLI wrote (see the
[roadmap](../ROADMAP.md#d03b--session-renewal-before-d04)).

Excluded:

- Node projects, npm discovery and the `tsx` launch path (D06, which needs a
  framework release containing M126).
- Accepting development entries written by an earlier CLI. The pinned CLI still
  recognizes its `0.8.0` and `0.9.0` renderings as its own
  (`devEntryVariants`), so `setu devtool enable` from `cli@0.10.0` rewrites
  them; the devtool accepts only the pinned rendering, as D02 requires.
- Addon inspectors (`health()`, `queues()` and the rest). The new pin carries
  them; P03 plans them.
- A setting for the renewal policy, renewal after a failure, automatic relaunch,
  and a specific message for why preflight refused an entry.
- Published packages, VSIX installation and other platforms (D04).

## Contracts verified from source

Read at `d7a04734be8a4658774c7fe5b5e30297d5103ef3` (tag `v0.10.0`) on
2026-10-29, and probed where marked.

| Contract                       | What the source says                                                                                                                                                                                                                                                                                                         | Consequence                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `IDiagnosticsClient.session()` | `packages/diagnostics-plugin/src/interfaces/index.ts:213`, `client/client.ts:485`: one signed status exchange; the first call pairs, and any failure of it is terminal. Returns frozen `{ expiresInMs, renewal: { maxRemainingMs } \| null }`, `expiresInMs` floored to whole milliseconds                                   | Pair with `session()` instead of `snapshot()`, so pairing yields the authenticated lifetime    |
| `IDiagnosticsClient.renew()`   | `client.ts:492`: throws locally, sending nothing, unless the paired status advertised renewal; otherwise `GET /v1/renew`, and the signed four-field body must name the paired instance. Failure is a plain `Error`                                                                                                           | Decide renewability from `renewal === null`; treat any renew failure as a session failure      |
| Renewal arithmetic             | `docs/diagnostics-protocol.md` "Replay, expiry, and binding": expiry becomes `max(current, min(now + ttlMs, activation + maxSessionLifetimeMs))`; never revives or shortens. Renewable values are safe integers with `expiresInMs <= maxRemainingMs`                                                                         | Renewal stops helping once `expiresInMs === maxRemainingMs`                                    |
| Status consistency             | `client.ts:471`: a later status whose renewal support differs from the pairing status is refused                                                                                                                                                                                                                             | Renewal support is fixed for a session                                                         |
| Rate limits                    | `transport/limits.ts:56-57`: a paired session's bucket is 20 requests/second, burst 40; no total budget                                                                                                                                                                                                                      | 4 reads/second plus one renewal per 7.5 minutes stays far inside it for 8 hours                |
| Generated entry                | `packages/cli/src/devtool/dev-entry.ts:66-145`: reads the pair through `Deno.env.get`, sets `maxSessionLifetimeMs: 28_800_000` and the default `ttlMs` (15 minutes), adds a composition probe that exits when `setu.config.ts` drops the plugin, and names `npm:@setu-ts/cli@0.10.0` in that message                         | The regenerated catalog accepts this text; the fixture `createApp` must pass `plugins` through |
| Generator exports              | `renderDevEntry`, `workspaceDevRunner`, `workspaceProfile`, `devtoolTasks`, `FUNCTIONAL_MODULE_MANIFEST` all exist. Probed: both esbuild bundles build from an archive of `packages` alone; `workspaceProfile('deno').runAll` now carries `--allow-env=SETU_DEVTOOL_SESSION_ID,SETU_DEVTOOL_SESSION_KEY,SETU_DEVTOOL_MEMBER` | `prepare-framework.mjs` keeps its bundle inputs                                                |
| Repository layout              | The root `deno.json` and `deno.lock` are gone (M111e3). Each package keeps a `deno.json` with `name`, `exports` and an `imports` map of bare npm specifiers (`hono` → `npm:hono@^4.12.30`, `@hono/node-server`, `ws`, plus `vitest`)                                                                                         | The archive list drops the two root files; the fixture import map must merge package `imports` |
| Core DTOs                      | `packages/common/src/services/diagnostics.ts`: `DiagnosticsNode`, `Edge`, `Snapshot`, `Event`, `Batch` and their unions are unchanged since `26aebd0e` apart from formatting                                                                                                                                                 | `validate.ts` projections and D03 presentation need no change                                  |
| Qualified Deno                 | Framework CI at `v0.10.0` uses Deno 2.9.6                                                                                                                                                                                                                                                                                    | `framework-pin.json` keeps `"deno": "2.9.6"`                                                   |
| End to end (probed)            | A Deno 2.9.6 app from the archived source, with the merged import map and `maxSessionLifetimeMs: 28_800_000`, paired with the bundled client from Node: `session()` returned `{"expiresInMs":895979,"renewal":{"maxRemainingMs":28795979}}`, `renew()` returned `{"expiresInMs":900000,…}`, and a later `session()` agreed   | The design below rests on measured behaviour, not only on reading                              |

## Design decisions

### 1. The pin move

- `scripts/framework-pin.json`: commit `d7a04734be8a4658774c7fe5b5e30297d5103ef3`,
  Deno `2.9.6`.
- `scripts/prepare-framework.mjs`: archive `packages` and `LICENSE` only. The
  rest of the script is unchanged; `frameworkSha256` and the recipe hashes
  change as a result and `build.mjs` checks them as before.
- `src/launch/recipes.ts` reads the regenerated catalog. Its matching rules do
  not change: the standalone and member entries in raw and `deno fmt` form,
  the two `dev` tasks, the runner, and the root task.
- `test/fixtures/projects.ts` builds its import map from every package's
  `deno.json`: `exports` mapped to file URLs as now, plus each `imports` entry
  except `vitest`. Two packages giving one key different values fail the
  fixture. The npm ranges resolve from the registry when the fixture runs;
  exact versions are D04's concern.
- The fixture's `createApp` keeps passing `options.plugins` and
  `options.diagnostics` through, which the probe in the new entry checks.
- `src/diagnostics/transport.ts` admits `GET /v1/renew` beside status,
  snapshot and events, with the same four request headers. Every other target
  is still refused before a socket opens.

### 2. Pairing and the authenticated lifetime

`coreClient` gains `session()` and `renew()`, each returning a devtool-owned
`SessionLifetime` built by a new `lifetimeProjection` in
`src/diagnostics/validate.ts`. The projection accepts only what the contract
allows and fails with the existing fixed `CONNECTION_FAILED` otherwise:

- `expiresInMs`: a safe integer from 0 to 3,600,000 (the framework's maximum
  `ttlMs`).
- `renewal`: `null`, or an object whose `maxRemainingMs` is a safe integer from
  `expiresInMs` to 43,200,000 (the framework's ceiling).
- No other fields; the result is a fresh frozen object.

Pairing calls `session()` first, then `snapshot()`. A failed `session()` is a
failed pairing, with the same teardown and fresh-credentials rule as today.

### 3. Local deadline and renewal policy

A new pure module, `src/session/lifetime.ts`, turns a lifetime into local
times on `performance.now()`:

- `sentAt` is read before the call is made. The client serializes requests, so
  the exchange may start later than `sentAt`, never earlier. The local deadline
  `sentAt + expiresInMs` is therefore never later than the server's.
- `renewAt` is `sentAt + floor(expiresInMs / 2)` when `renewal` is non-null
  and `maxRemainingMs > expiresInMs`. Otherwise it is `null` and the session
  is no longer renewable: either the application did not opt in, or the next
  renewal could not extend it.
- `maxDeadline` is `sentAt + maxRemainingMs`, or `null`.

The controller keeps a single deadline timer:

- From before supervisor launch until pairing, it is the existing 900-second
  startup bound. A session cannot pair after its initial TTL, so this bound
  is never shorter than the server's.
- After pairing and after every successful renewal, it is replaced by the
  authenticated local deadline.
- When it fires, the controller stops the launch as it does now, and records
  the fixed end reason `deadline`.

Renewal runs inside the existing scheduler, so there is still at most one
outstanding request. The scheduler gains a third action: on each 250 ms tick,
if `renewAt` has passed, it renews instead of reading. A renewal failure
rejects the scheduler and stops the session as a read failure does. Nothing is
retried. The user relaunches explicitly, with fresh credentials.

### 4. What the user sees

`SessionController.status()` gains:

- `lifetime`: `{ remainingMs, renewable, maxRemainingMs }` computed at call
  time from the local plan, or `null` before pairing.
- `ended`: `"deadline"` or `null`. It is kept in `Failed` and cleared by the
  next launch.

The status bar shows these in the existing Live tooltip, replacing "Local
session limit: 15 minutes":

- While renewable: "Session renews automatically; up to 7 h 52 min left in
  total."
- Otherwise: "Session ends in 12 min and cannot be renewed. Launch again to
  continue." The bar text also gains "· 12 min left".
- After a deadline stop: "Session ended at its deadline. Launch again to
  continue."

The launch confirmation's "Local limit: 15 minutes" becomes "The session renews
automatically while the application allows it." Durations are rounded down to
whole minutes. No value reaches the webview; the panel is unchanged.

### 5. Documents

- `docs/framework-compatibility.md`: source baseline and every pinned link move
  to `d7a04734`. Publication becomes npm. The client-observation table loses
  "no public status/expiry accessor, renewal operation", and gains `session()`,
  `renew()` and status-consistency rows. The M98c section describes the new
  entry: probe, `maxSessionLifetimeMs`, and Node refused at this pin (M126 is
  unreleased). The credential reads are unchanged.
- `docs/architecture.md`: the session-timer paragraph and the Starting,
  Pairing and Live rows of the state table follow §3.
- `docs/security.md`: the deadline paragraph and S09. Renewal is allowed only
  through the public helper, only while the authenticated status advertises
  it, at most once per half-lifetime, never after a failure, and never beyond
  the application's maximum.
- `README.md` session paragraph; `ROADMAP.md` D03b row, framework work item 1
  and the D04 prerequisites; `plans/README.md` item 4; the `format` lists in
  `package.json`.
- New `docs/d03b-validation.md` (commands, versions, results) and
  `docs/d03b-security-review.md` (the independent review).

## Internal surface and file/test mapping

Nothing here is exported beyond the extension bundle.

| File                            | Change                                                 | Tests                                                                                                                           |
| ------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/framework-pin.json`    | New commit                                             | CI prepare step; `build.mjs` provenance check                                                                                   |
| `scripts/prepare-framework.mjs` | Archive list                                           | Prepare from a clean `v0.10.0` checkout; refusal on a dirty tree or another commit (manual, recorded)                           |
| `src/launch/recipes.ts`         | None; catalog regenerated                              | `test/unit/launch.test.ts` against the new catalog, including a `0.9.0` entry refused                                           |
| `src/diagnostics/transport.ts`  | Admit `/v1/renew`                                      | `test/integration/transport.test.ts`: renew allowed; renew with a query, other verbs and paths refused                          |
| `src/diagnostics/validate.ts`   | `lifetimeProjection`                                   | New `test/unit/lifetime.test.ts`: every bound, both `renewal` shapes, extra fields, non-integers                                |
| `src/diagnostics/client.ts`     | `session()`, `renew()`                                 | `test/integration/transport.test.ts`: signed fake server with renewable, non-renewable and invalid lifetimes                    |
| `src/session/lifetime.ts` (new) | Local plan and display values                          | `test/unit/lifetime.test.ts`: `renewAt` null when not renewable and when capped, rounding, conservatism                         |
| `src/session/scheduler.ts`      | Renewal action                                         | `test/unit/scheduler.test.ts`: renewal replaces a read, never overlaps one, rejection ends the loop                             |
| `src/session/controller.ts`     | Pair via `session()`, deadline replacement, `status()` | `test/unit/controller.test.ts`: renew failure stops without retry; deadline stop sets `ended`; stale renewal after Stop ignored |
| `src/editor/connection.ts`      | Tooltip, bar text, confirmation                        | `test/unit/editor.test.ts`: the three tooltip forms                                                                             |
| `test/fixtures/projects.ts`     | Merged import map                                      | Every real exercise                                                                                                             |

Real exercises, in `test/integration/connection.test.ts`:

1. The existing standalone and workspace exercises on the new pin: launch,
   pair, capture, Clear, Stop.
2. Real renewal through the regenerated recipe. The controller's lifetime
   planner is a `SessionPorts` member, so the test can inject one that renews
   after one second. The test asserts that a real `GET /v1/renew` succeeded
   and that the session stays Live past the next renewal.
3. A short-lifetime fixture, outside preflight, with `ttlMs: 2000` and
   `maxSessionLifetimeMs: 5000`. It renews, reaches the cap, stops at the
   deadline with `ended: "deadline"`, and leaves no process.
4. The same fixture without `maxSessionLifetimeMs`: shown as not renewable,
   stopped at about 2 seconds, and no renew call reaches the client. The
   client is wrapped to count calls.

## Implementation order and verification

1. Pin move, archive list and fixture import map. Run the existing real
   exercises unchanged on the new pin before any renewal code. This step alone
   restores launching current scaffolds.
2. Transport admission, `lifetimeProjection`, `session()` and `renew()`, and
   pairing through `session()`.
3. `lifetime.ts`, the scheduler action and the controller's deadline
   handling, with unit tests driven by fake timers and fake clients.
4. Status and editor text.
5. Real exercises 2–4, then the documents in §5.
6. Gates: `npm run check`, `npm run format:check`, `npm run test:coverage` and
   `npm run build`. Read the per-file coverage table: every `src` and
   `webview` file must be at least 90% on lines, branches and functions.
7. The behavioural check in a real Code OSS development host on Linux:
   - Launch a project scaffolded with `cli@0.10.0` from npm (`setu new
--runtime deno --devtool`).
   - Keep it Live past the first scheduled renewal (7.5 minutes), and watch
     the tooltip's remaining time go back up.
   - Stop it, and confirm the processes are gone.
8. An independent security review of the implementation commit. A fresh agent
   runs the `devtool-review` skill, because this milestone touches credentials,
   authenticated transport and the build provenance of the bundled client. It
   covers S09 and the transport allowlist, and records negative controls for
   two failures: a renewal attempted without advertised support, and a
   renewal retried after a failure.

Codex implements; Claude reviews, verifies and runs the review hand-off. D04
starts only after this merges, because its exercises and VSIX bundle the client
and catalog this milestone produces.
