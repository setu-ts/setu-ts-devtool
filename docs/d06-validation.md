# D06 local validation — 2026-10-29

D06 was qualified on `feat/d06-node` against framework `develop` commit
`4e26f834` (the M126 merge), then moved to the `v0.11.0` release commit and
requalified with the published CLI ([pin move](#pin-move-to-v0110--2026-11-04)).
The record below the pin-move section is the original `4e26f834` qualification. No VSIX was built, installed or
published; that is D04.

## Pin move to v0.11.0 — 2026-11-04

- Framework pin `446d94723cbb0a853dd303022d6c9896ac17bdcd` (tag `v0.11.0`,
  2026-10-30), prepared from a clean checkout. Against `4e26f834` the
  development entry, the workspace runner, the npm `dev` script and the
  connector are unchanged; the trace protocol gains a `redis` instrumentation
  kind. The framework lock still names `hono@4.13.14`,
  `@hono/node-server@2.1.5`, `tsx@4.23.15` and Prettier 3.9.10. The regenerated
  catalog names `npm:@setu-ts/cli@0.11.0`, so a Deno entry or workspace runner
  written by `cli@0.10.0` is now refused as stale.
- Linux x64; Node 24.22.1 with npm 11.19.1; Deno 2.9.6; Code - OSS 1.138.0,
  embedded Node 24.19.0 and Electron 42.11.18.
- The gates below exited zero: **105 tests**, then **106** with the F7 fix, no
  failures or skips, every `src` and `webview` file at or above 90% for lines, branches and functions. The
  development and production-bundle host runs made a live connection; the
  restricted run made none.

| Exercise                      | Result                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Published standalone scaffold | `npx @setu-ts/cli@0.11.0 new demo --devtool`, then `npm install --ignore-scripts` (all `@setu-ts/*` at 0.11.0, `tsx` 4.23.15). Discovered, accepted by preflight unchanged, launched, paired, renewed three times on a 2 s schedule, stopped with no listener left                                           |
| Published workspace member    | `new ws --workspace`, `g app api --devtool`, `g app worker`, then `npm install --ignore-scripts`. Member `api` discovered, accepted with its sibling's `start:dev` checked, launched, paired, renewed three times and stopped; no listener on the member, sibling or devtool ports and no `tsx` process left |

## Environment and commands

- Linux x64; Node 24.22.1 with npm 11.19.1; Deno 2.9.6.
- Code - OSS 1.138.0, embedded Node 24.19.0 and Electron 42.11.10.
- Framework pin `4e26f834c8fe6280e28fab355fa5d5a771cf72d9`, prepared from a clean
  checkout with `npm run prepare:framework`. Preparation bundles the CLI from
  that commit and reads the Node recipes from the files it writes, formatted
  with Prettier 3.9.10, the version the framework locks. It installs the
  fixtures' `hono@4.13.14`, `@hono/node-server@2.1.5` and `tsx@4.23.15`, the
  versions in the framework lock.

```sh
npm run check
npm run format:check
npm run test:coverage
npm run build:dev && npm run test:host
npm run build
npm run test:host -- --production
npm run test:host -- --restricted
```

All commands exited zero. The coverage command ran **105 tests** with no
failures or skips, and every `src` and `webview` file is at or above 90% for
lines, branches and functions. The development and production-bundle host runs
made a live connection; the restricted run correctly made none.

## Behavioural evidence

| Exercise                                  | Result                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deno on the new pin, before any Node code | The existing Deno exercises passed unchanged (80 tests) with the regenerated, now runtime-neutral, Deno entries                                                                                                                                                                                                                                                                    |
| Catalog against real scaffolds            | The Node entries, runner and root script in the catalog equal, byte for byte, what the commit's CLI wrote for `setu new --devtool` and for a workspace member generated with `--devtool`                                                                                                                                                                                           |
| Real Node standalone and workspace        | Launch, pair, capture, Clear and Stop. In the workspace the sibling reports no session key in its own environment, and no listener survives Stop                                                                                                                                                                                                                                   |
| Renewal and deadline on Node              | Renewal through the generated entry kept the session Live. A 3 s window capped at 7 s renewed and stopped at its deadline (about 7.8 s); a fixed 3 s session stopped at about 3.7 s                                                                                                                                                                                                |
| Hostile npm configuration                 | A `.npmrc` with `script-shell=/nonexistent/shell` and `node-options=--require=<marker script>`, plus `predev`/`postdev` scripts, in the project and in the workspace root and member: the launch paired and nothing wrote the marker                                                                                                                                               |
| npm killed from outside                   | Killing the `npm run dev` process with SIGKILL moved the session to Failed and left no member in its process group and no listener                                                                                                                                                                                                                                                 |
| `node` above the launch root (F7)         | A `node` wrapper in `node_modules/.bin` of the directory above both published `cli@0.11.0` scaffolds, logging whether it held the session key. Before the fix it ran with the key (standalone: through `tsx`'s `env node`; workspace: the root script, the runner's `npm`, and `tsx`) while the launch paired normally. After it, preflight refused both and the wrapper never ran |
| Ancestor workspace redirect (re-review A) | The published workspace with `apps/*` removed from its root `workspaces`, under a directory whose `package.json` lists `ws/apps/*` and `evil` and whose `.npmrc` says `workspace=evil`. Before the fix preflight accepted it and `evil`'s `dev` ran with the session key; after it, preflight refused                                                                              |
| Executables on this machine               | `node` from nvm 24.22.1 with its npm 11.19.1 resolved and verified; with `/usr/bin` first, `/usr/bin/node` 26.10.0 was refused                                                                                                                                                                                                                                                     |
| Redirected npm script                     | A root `.npmrc` with `workspace=apps/worker`, `userconfig=`, `${npm_package_name}=worker` (root package named `workspace`), a quoted key or a lone-CR line is refused by preflight. A project inside a parent npm workspace whose `.npmrc` selects another package pairs normally, and that package's script never runs                                                            |
| Unmodified CLI scaffold                   | A project written by the commit's CLI (`setu new demo --devtool`), with the framework sources mapped in and `tsx` installed, was discovered, accepted by preflight with its entry unchanged, launched, paired, renewed three times on a 2 s schedule and stopped with no listener left                                                                                             |

## Negative controls

Each mutation was applied, tested and reverted:

| Mutation                                                                                             | Failing tests                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fixed npm environment not applied                                                                    | Both hostile-`.npmrc` exercises and the npm environment unit test                                                                                                                          |
| Only lowercase `npm_config_` removed                                                                 | The npm environment unit test                                                                                                                                                              |
| Bun workspace runtime not refused                                                                    | The Bun discovery test                                                                                                                                                                     |
| Sibling `start:dev` scripts not checked                                                              | The Node preflight test and the matcher test                                                                                                                                               |
| Any `npm` beside node accepted                                                                       | The npm-location test                                                                                                                                                                      |
| Any Node version accepted                                                                            | The version-gate test                                                                                                                                                                      |
| Launch without `--no-workspaces`                                                                     | The parent-npm-workspace exercise                                                                                                                                                          |
| `.npmrc` redirecting keys not checked, or keys with `${…}`/quotes allowed, or LF-only line splitting | The root-`.npmrc` refusal exercise and the spelling unit test                                                                                                                              |
| npm resolving inside a workspace root accepted                                                       | The npm-location test                                                                                                                                                                      |
| Prepared runtime may differ from the selection                                                       | The editor runtime-mismatch test                                                                                                                                                           |
| Root `workspaces` without `apps/*`, or not an array, accepted                                        | "Node preflight compares the scripts, entry and runner…", and an ancestor `.npmrc` with `workspace=evil` ran `evil`'s `dev` with the session key from the published workspace              |
| `node`/`npm` above the root, or no `tsx` link in it, accepted                                        | "Node preflight refuses node or npm above the root and needs tsx inside it", and the wrapper ran with the session key in both published scaffolds                                          |
| Supervisor accepts any npm script path                                                               | "supervisor runs node only with npm's CLI script, never another script" (added after the first form of this control went undetected: a refused message and a failed spawn looked the same) |

The independent review ([D06 security review](d06-security-review.md)) found
that a project `.npmrc` could redirect `npm run dev` to an unchecked script
(F1), and five smaller findings; all are fixed and re-reviewed.

## Not covered

Bun, Windows and macOS, which are refused, and an installed VSIX, which is D04.
