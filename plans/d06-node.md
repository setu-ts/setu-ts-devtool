# D06 — Node applications

Status: implemented and independently reviewed against framework `develop`
`4e26f834`, then moved to the `v0.11.0` release commit `446d9472` and
requalified on 2026-11-04 ([validation](../docs/d06-validation.md),
[security review](../docs/d06-security-review.md)). D01–D03b are merged to `main`. Framework M126 (setu-ts#521,
merge commit `4e26f834`) makes the diagnostics listener bind on Node and lets
the CLI emit `--devtool` for Node projects and workspace members. It shipped
in framework `v0.11.0` (2026-10-30). D04 runs after this milestone.

## Outcome and exclusions

A trusted local Linux desktop user can discover, launch, pair with, inspect,
renew and stop a Node project that the framework CLI scaffolded or enabled with
`--devtool`. This covers a standalone project and a member of a Node workspace,
exactly as D02–D03b already do for Deno. A default `setu new` project targets
Node, so after this milestone the devtool can inspect what most users create.

Excluded:

- Bun projects and workspaces, which stay refused. The framework listener does
  not bind on Bun.
- Watch mode. The `dev` script is never a watch script, because a restart is a
  new instance and ends the session. Siblings in a workspace run
  `start:dev` (`tsx watch main.ts`), which is the CLI's choice and not
  instrumented.
- Package installation. The devtool never runs `npm install`; preflight refuses
  a project whose `tsx` is not installed.
- Accepting a development entry, script or runner other than the pinned CLI's
  current rendering.
- Windows and macOS, which stay refused (D04 records the refusal).

## Pin and release timing

Implementation and every test run against the framework `develop` commit
`4e26f834`. `scripts/prepare-framework.mjs` prepares any clean commit. The PR's
last commit moves the pin to the release commit that contains M126, re-runs the
whole suite, and regenerates the recipe catalog. D06 merges only after that
release exists, so `main` never depends on unreleased framework code. If the
release changes anything the catalog or listener depends on, that is handled in
this PR.

## Contracts verified from source

Read at framework `develop` `4e26f834` (2026-10-29); probed where marked. The
probes used a CLI bundled from that commit, scaffolds it generated, and Node
24.22.1 with npm 11.19.1.

| Contract                           | What the source or probe shows                                                                                                                                                                                                                                                                                                                                                                                                          | Consequence                                                                                                     |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Standalone Node scaffold (probed)  | `setu new demo --devtool` writes `package.json` with `"dev": "tsx main.dev.ts"`, `@setu-ts/*` caret ranges in `dependencies` and `devDependencies` (`diagnostics-plugin` dev only), `tsx` in `devDependencies`, a `.prettierrc.json`, and a runtime-neutral `main.dev.ts` that reads credentials through `runtime.env` and binds port 4919                                                                                              | Discovery reads `package.json`; preflight compares the `dev` script and the entry                               |
| Development entry                  | `packages/cli/src/devtool/dev-entry.ts:68`: `renderDevEntry(input, runtime)`. Current renderings are runtime-neutral for Deno too; the `Deno.env` form survives only as a legacy variant for the CLI's own recognition                                                                                                                                                                                                                  | The catalog is regenerated for both runtimes; Deno entries change at this pin                                   |
| Formatting (probed)                | The raw rendering passes `prettier --check` under the scaffold's own `.prettierrc.json`                                                                                                                                                                                                                                                                                                                                                 | Node needs no formatter variant; Deno keeps its `deno fmt` variant                                              |
| Node workspace (probed)            | `setu.workspace.json` has `"runtime": "node"` and `devtoolPort` per member; the root `package.json` has `"dev": "node scripts/dev.mjs"` and npm `workspaces`; members live in `apps/<name>` with their own `package.json`. The runner starts the selected member with `npm run dev` and every other member with `npm run start:dev`, blanks the session variables for siblings, and does not detach any child when a member is selected | Preflight compares the root script, the runner, the member's `dev` script and each sibling's `start:dev` script |
| Runner's `npm` lookup              | `scripts/dev.mjs` spawns the bare name `npm` with `shell: false`                                                                                                                                                                                                                                                                                                                                                                        | The child `PATH` must lead with the qualified Node directory                                                    |
| Process tree (probed)              | `npm run dev` → `node …/tsx/dist/cli.mjs main.dev.ts` → `node --require … main.dev.ts`, all in the launcher's process group (`/bin/sh` execs the single command). `kill -TERM -<group>` left no process and no listener                                                                                                                                                                                                                 | The supervisor's existing group teardown covers the chain                                                       |
| npm configuration (probed)         | A project `.npmrc` with `script-shell` and `node-options` changes what runs. Environment variables override it: `npm_config_script_shell=/bin/sh` and `npm_config_ignore_scripts=true` took effect (no `predev`/`postdev`). An **empty** `npm_config_node_options` did not override the file; a single space did, giving an empty effective `NODE_OPTIONS`                                                                              | §2's fixed npm environment                                                                                      |
| Pairing on Node (probed)           | The scaffold, with `@setu-ts/*` mapped to the commit's sources, launched through `npm run dev` with that environment, paired, read a 15-node snapshot and renewed                                                                                                                                                                                                                                                                       | The Node path works end to end before any devtool code changes                                                  |
| Bare imports from framework source | Node resolves `hono` from the importing file's directory, so sources outside the fixture failed with `ERR_MODULE_NOT_FOUND`                                                                                                                                                                                                                                                                                                             | Fixtures copy the prepared sources under the fixture directory (§5)                                             |
| Third-party versions               | Framework lock at the commit: `hono@4.13.14`, `@hono/node-server@2.1.5`, `tsx@4.23.15`; `ws` is a lazy optional import                                                                                                                                                                                                                                                                                                                  | Fixtures install these exact versions                                                                           |
| Listener                           | M126: plain `node:http`, request-target kept as sent; the 16 connector suites and the conformance table run on both runtimes                                                                                                                                                                                                                                                                                                            | The client and transport need no change                                                                         |

## Design decisions

### 1. Discovery

- **Standalone:** a root with `deno.json`/`deno.jsonc` stays a Deno project, as
  today, even when it also has a `package.json`. A Deno full-stack scaffold
  emits both, so treating "both" as an error would break it. A root with only
  `package.json`, whose `dependencies` or `devDependencies` name an `@setu-ts/`
  package, is a Node project. Its `task` is `candidate` when `scripts.dev` is a
  non-empty string and `missing` otherwise, matching the Deno rule.
- **Bun:** a root with `bun.lock` or `bun.lockb`, or a workspace manifest with
  `"runtime": "bun"`, is reported as unsupported.
- **Workspace:** `runtime` may now be `"node"`. A Node member's manifest is
  `apps/<name>/package.json`; a Deno member's stays `deno.json`/`deno.jsonc`.
- `Project` gains `runtime: "deno" | "node"`. The reads stay bounded, and no
  application code is imported or executed.

### 2. Executables and environment

- A new application-scoped setting, `setuDevtool.nodePath`, sits beside
  `denoPath`. Workspace values are ignored, as for `denoPath`.
- `resolveNode` follows `resolveDeno`: an absolute override, otherwise `PATH`
  entries outside every workspace root, realpath and identity recorded.
- npm is the `npm` entry in the same `PATH` directory as the chosen `node`. Its
  realpath must be `…/node_modules/npm/bin/npm-cli.js`, also outside workspace
  roots, with its identity recorded.
- `verifyNode` runs `node --version` and requires Node 24, at least 24.22.1, the
  qualified line. `npm --version`, run through that same `node` with the fixed
  npm environment below (so no update check reaches the registry), must be
  11.x. Node is checked rather than trusted from `PATH`: on the probe machine
  `/usr/bin/node` is 26.10.0, below the CLI's own engines floor for 26
  (`>=26.12.1`). Such a machine is refused with a message naming
  `setuDevtool.nodePath`.
- The supervisor runs `node <npm-cli.js> run dev`. The shebang is not used, so
  the verified `node` is the one that runs npm. The child `PATH` starts with
  that Node directory, so the workspace runner's `npm` and npm's `tsx` resolve
  as verified.
- The application environment is the existing filtered one, with every
  inherited npm configuration variable removed. npm reads the prefix in either
  case, so both `npm_config_*` and `NPM_CONFIG_*` are removed. These are set
  instead:

  | Variable                     | Value     | Why                                                                 |
  | ---------------------------- | --------- | ------------------------------------------------------------------- |
  | `npm_config_ignore_scripts`  | `true`    | No `predev`/`postdev` scripts, here or in the runner's nested `npm` |
  | `npm_config_script_shell`    | `/bin/sh` | A project `.npmrc` cannot choose the shell                          |
  | `npm_config_node_options`    | one space | A project `.npmrc` cannot preload code; empty does not override     |
  | `npm_config_update_notifier` | `false`   | No registry request at launch                                       |
  | `npm_config_fund`, `…_audit` | `false`   | No other network or output                                          |

  They are inherited by the runner's children, so a workspace member is covered
  too. A test proves each against a hostile `.npmrc`.

### 3. Preflight and the recipe catalog

`scripts/prepare-framework.mjs` adds a `node` section to `recipes.json`:

- the standalone and member entries from `renderDevEntry(…, 'node')`;
- `NODE_DEVTOOL_DEV_SCRIPT`;
- the `dev` and `start:dev` scripts of every template that renders a Node
  project, rendered one template at a time, so a sibling built from any
  template is matched (the gap CodeRabbit found in D04's plan);
- the Node runner from `workspaceDevRunner(workspaceProfile('node'))`;
- `profile.runAll`.

Preparation fails if any export it needs is missing at the pinned commit. If
the CLI exposes no per-template script renderer, preparation instead runs the
CLI bundled from the pinned commit (`src/bin.ts`, as this plan's probe did) in a
scratch directory, once per template, and reads the scripts from what it
writes. The
Deno section is regenerated from the same commit, with `'deno'` passed to
`renderDevEntry`.

For a Node project, preflight requires:

- the selected `package.json` `dev` script, and its entry, equal to the catalog;
- `node_modules/.bin/tsx` present, under the project or the workspace root;
- for a workspace: the root `dev` script and `scripts/dev.mjs` equal to the
  catalog, and every sibling's `start:dev` script equal to the catalog.

The fingerprint covers the same files. `predev` and `postdev` are no longer
refused, because `npm_config_ignore_scripts` stops them; a test proves they do
not run.

### 4. Launch, ownership and display

- The supervisor's `start` message gains a `runtime` field. For `deno` it runs
  `deno task dev` as now. For `node` it runs `node <npm-cli.js> run dev` and
  validates the npm path as absolute.
- Teardown is unchanged: the supervisor signals its own group, and probing
  showed the whole Node chain stays in it.
- The launch dialog names `Node: <path> (npm <version>)` instead of `Deno:` for
  a Node project.
- Pairing, renewal, capture and the panel are unchanged.

### 5. Test fixtures

`test/fixtures/projects.ts` gains Node standalone and workspace fixtures built
from catalog text, as the Deno ones are. Each copies the prepared
`@setu-ts/common`, `kernel`, `runtime` and `diagnostics-plugin` sources under
the fixture's own `vendor/`, maps them through `tsconfig.json` `paths` (which
`tsx` honours), and installs `hono`, `@hono/node-server` and `tsx` at the exact
versions in the framework lock. The `package.json` scripts and the entry stay
catalog text; only `dependencies` and `tsconfig.json` are fixture-owned.

### 6. Documents

- `docs/framework-compatibility.md`: Node rows; Node and Deno entries at the new
  commit; the npm environment.
- `docs/architecture.md`: the Node process chain and executable resolution.
- `docs/security.md`: the S-cases re-proved on Node, especially S04
  (credentials) and S10 (cleanup), plus the npm-config case.
- `README.md`, `ROADMAP.md` (D06 row, framework work item 2) and
  `plans/README.md`.
- New `docs/d06-validation.md` and `docs/d06-security-review.md`.

## Internal surface and file/test mapping

Nothing here is exported beyond the extension bundle.

| File                                       | Change                                                | Tests                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `scripts/framework-pin.json`               | `4e26f834`, then the release commit                   | CI prepare step; `build.mjs` provenance                                                                 |
| `scripts/prepare-framework.mjs`            | `node` catalog section; runtime argument              | Prepare from a clean checkout; a missing export fails preparation                                       |
| `src/discovery/discover.ts`                | Node standalone and workspace; Bun refusal; `runtime` | `test/unit/discovery.test.ts`: both manifests, Bun lock, Bun workspace, Node member, bounds             |
| `src/launch/executable.ts`                 | `resolveNode`, `verifyNode`, npm beside node          | `test/unit/launcher.test.ts`: in-root refusal, wrong version, npm elsewhere, npm not npm-cli.js         |
| `src/launch/credentials.ts`                | npm environment                                       | `test/unit/launch.test.ts`: inherited `npm_config_*` removed; fixed values set                          |
| `src/launch/recipes.ts`                    | Node matchers                                         | `test/unit/launch.test.ts`: entry, scripts, runner, root script                                         |
| `src/launch/preflight.ts`                  | Node project and workspace checks                     | `test/unit/launch.test.ts`: each mismatch refused, missing `tsx` refused, fingerprint covers Node files |
| `src/launch/launcher.ts`                   | `runtime` in the start message                        | `test/unit/launcher.test.ts`                                                                            |
| `src/launch/supervisor.ts`                 | Node spawn                                            | `test/integration/supervisor.test.ts`: argument and path validation                                     |
| `src/editor/connection.ts`, `package.json` | `nodePath` setting; dialog wording                    | `test/unit/editor.test.ts`                                                                              |
| `test/fixtures/projects.ts`                | Node fixtures                                         | Every Node exercise                                                                                     |

Real exercises, in `test/integration/`:

1. Node standalone: launch, pair, capture, Clear, Stop. The same for a Node
   workspace member, checking that siblings run and receive blank session
   variables (read from `/proc/<pid>/environ`).
2. A hostile `.npmrc` (`script-shell`, `node-options`) and `predev`/`postdev`
   scripts. None takes effect, and the launch still pairs.
3. Renewal and the short-lifetime deadline stop on Node, as D03b's exercises.
4. Teardown: Stop leaves no process in the group and no listener. A root
   process killed from outside still leads to full cleanup.
5. The existing Deno exercises, unchanged, on the new pin.

## Implementation order and verification

1. Move the pin to `4e26f834` and regenerate the catalog for both runtimes. The
   Deno exercises must pass before any Node code.
2. Discovery, then executables and the npm environment, each with unit tests.
3. Catalog matchers and preflight.
4. Supervisor and launcher.
5. Node fixtures and real exercises 1–4; then the documents.
6. Gates: `npm run check`, `npm run format:check`, `npm run test:coverage`,
   `npm run build`, and the three `test:host` runs. Every `src` and `webview`
   file must be at least 90% on lines, branches and functions.
7. Behavioural check against a real scaffold. Use a project from the bundled
   commit CLI until the release, then one from the published CLI. Run discovery
   and preflight, then launch, pair, renew and stop.
8. Negative controls for each new guard: npm environment, Bun refusal, sibling
   script check, and executable location.
9. An independent security review by a fresh agent using the `devtool-review`
   skill. It covers process ownership, the npm configuration boundary and
   credential exposure along the Node chain.
10. When the framework releases M126: move the pin to the release commit,
    re-run steps 6–7 with the published CLI, and only then merge. Done on
    2026-11-04 against `v0.11.0`.

Claude implements (maintainer decision for this session); D04 follows this
milestone.
