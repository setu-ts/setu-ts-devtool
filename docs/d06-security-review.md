# Independent D06 security review

Date: 2026-10-29. Reviewer: separate review agent, not the implementation
author.

## Decision

**APPROVE D06 for the documented local Linux preview scope.** The reviewer
assessed `origin/main..eb7b38a` on `feat/d06-node`: Node discovery, Node/npm
resolution and verification, the fixed npm environment, Node preflight, the
supervisor's Node launch, the prepare-step changes and the documents. That
round found one blocking finding (F1) and five low or informational ones
(F2–F6). The reviewer re-reviewed the fixes in `eb7b38a..c81f692`, found F1
still reachable through a key spelling and one test gap (N1), and re-reviewed
`c81f692..e349cb7`. All findings are closed. This is not an installed-VSIX,
published-release or cross-platform approval.

No tracked file was modified, no commit or push was made, and no external action
was performed by the reviewer.

## Revision audited

- Branch `feat/d06-node`, `origin/main..eb7b38a` (11 commits).
- Fix deltas `eb7b38a..c81f692` (`d1a1985`, `c81f692`) and `c81f692..e349cb7`.
- Framework `develop` `4e26f834` (M126); Node 24.22.1, npm 11.19.1, Deno 2.9.6.

## Scope

S01, S04, S05, S10 and S17 preconditions for the Node path:
`src/launch/{executable,credentials,supervisor,launcher,preflight,recipes}.ts`,
`src/discovery/{discover,files}.ts`, `src/editor/connection.ts`,
`src/extension.ts`, `scripts/prepare-framework.mjs`,
`scripts/framework-pin.json`, the tests and the document changes.

## Probes

- At `e349cb7`: `npm run check` and `npm run test:coverage` (105/105, none
  skipped) pass; every `src` file is at least 90% on lines, branches and
  functions.
- Provenance: an independent `git archive` at `4e26f834` matches
  `archiveSha256`; re-running the prepare step from a clean checkout reproduced
  `recipes.json` and `client.cjs` byte-for-byte. The pinned CLI's `new` and
  `generate` paths spawn nothing and fetch nothing; Prettier 3.9.10 is locked
  with integrity; fixture installs use `--ignore-scripts` and are not shipped.
- npm 11.19.1 under the fixed environment: `script-shell`, `node-options` and
  `predev`/`postdev` from a project `.npmrc` take no effect; a project `prefix`
  is refused by npm; mixed-case `npm_config_*` variables are stripped; npm
  writes no debug log even when a project `.npmrc` sets `logs-dir` and
  `logs-max`; the session key does not appear in npm's debug log.
- Script redirection: `--no-workspaces` makes the launch's npm run its own
  package's `dev`, or fail closed on a configured `workspace`, including for a
  project nested in a parent npm workspace. Preflight refuses, on the real
  workspace fixture, a root `.npmrc` with `${npm_package_name}=worker` (root
  package named `workspace`), a lone-CR separator, a JSON-escaped quoted key, a
  BOM-prefixed `workspace`, `Include_Workspace_Root`, backslash keys and
  `[section]` lines, and accepts `@scope:registry=`. Plain keys `w`, `ws`,
  `workspace-root` and `iwr` are not workspace selectors to npm; `global` and
  `location=global` fail closed in the runner.

## Negative controls

| Mutation                                                      | Result                               |
| ------------------------------------------------------------- | ------------------------------------ |
| Drop `node_options`, `ignore_scripts` or `script_shell`       | Both hostile-`.npmrc` exercises fail |
| Case-sensitive or removed `npm_config_*` filter               | Unit test fails                      |
| Accept a non-`npm-cli.js` npm; accept Node 26, 24.10, 24.22.0 | Unit tests fail                      |
| Drop `--no-workspaces`                                        | Parent-workspace exercise fails      |
| Drop the plain-key refusal or the `[]` normalization          | Spelling unit test fails             |
| Look npm up beside the configured path; drop the verify `cwd` | Unit test fails                      |
| Accept any sibling script; drop the `tsx` presence check      | Unit tests fail                      |
| Drop the Bun refusal (manifest or lock file)                  | Unit test fails                      |

## Findings

- **F1 (medium, S05/S04): closed.** A project `.npmrc` could select another
  package's `dev` script (`workspace`, `workspaces`, `include-workspace-root`,
  or through `userconfig`/`globalconfig`), which then ran with the session
  credentials; confirmed through the real launch path. The first fix's key
  denylist was bypassed by an environment-variable key
  (`${npm_package_name}=worker`, confirmed end to end), a quoted key and a
  lone CR. Now: the launch runs `npm --no-workspaces run dev`, and preflight
  splits lines as ini does, refuses any key outside a plain character set, and
  refuses the redirecting keys in any case or separator spelling.
- **F2 (low, test gap): closed.** A test has npm link into the root while node
  stays outside it.
- **F3 (low, S05): closed.** The launch refuses a prepared descriptor whose
  runtime differs from the selection.
- **F4 (low, S01): closed.** `verifyNode` runs from npm's own directory.
- **F5 (informational): closed.** npm is found beside the resolved node, as
  the child `PATH` finds it.
- **F6 (informational): closed.** The watcher includes `package.json` and
  `.npmrc`; npm writes no debug log.
- **N1 (low, test gap): resolved by removal.** The fresh descriptor's runtime
  check could not fire alone: a runtime change changes the files preflight
  reads, so the fingerprint comparison already refuses it.

- **F7 (medium, S05/S04): fixed; see [ancestor lookup](#ancestor-path-lookup-f7--2026-11-04).**
  `npm run` searches `node_modules/.bin` of every directory above the launch
  root before the verified node, so a `node` there ran with the session key.

## Limits

The reviewer did not exercise a real Code OSS host, an installed VSIX, the
published framework release containing M126, or platforms other than Linux.
`provenance.json` is self-attested by the prepare step and does not record the
Prettier version that shapes the Node recipes. Same-user filesystem races
between verification and spawn remain outside the guarantee, as for Deno.
Workspace `node_modules` content (`tsx`, `.bin`) is application code that the
launch confirmation authorizes.

## Pin move to v0.11.0 — 2026-11-04

A fresh review agent, not the author of the change, assessed
`abceda2..8f30803`, which moves the pin from `4e26f834` to the `v0.11.0`
release commit `446d9472`. **Decision: approve.**

- **Framework diff.** `4e26f834` is an ancestor of `446d9472`, and the remote
  tag `v0.11.0` resolves to it. On the diagnostics surface, the only change is
  `redis` added to the trace instrumentation kinds (diagnostics plugin and
  `common`); the kernel collector has no diff. The CLI's devtool sources, the
  workspace runner and the runtime package are unchanged apart from versions.
  Generator inputs that did change (new runtime-profile test fields, the flat
  module layout, new root `test`/`build`/`deploy` scripts) weaken no gate:
  preflight compares only the root `dev` script, pre/post scripts stay
  disabled, and sibling `start:dev` scripts are regenerated from the pinned CLI.
  The locked `hono`, `@hono/node-server`, `tsx` and Prettier versions are
  identical.
- **Provenance.** The prepare step and `build.mjs` refuse a different or dirty
  commit and the wrong Deno version. The reviewer recomputed the archive,
  prepared-tree, `client.cjs` and `recipes.json` hashes and found them equal to
  `provenance.json`, which names `446d9472`.
- **Documents.** The `redis`, release-date, "unchanged" and lock claims hold.
  One informational finding: the documents said only "entries" from
  `cli@0.10.0` are refused, but a Deno workspace runner is refused too, because
  it names the CLI version. Corrected in the validation record and the contract
  register. No extension release has shipped, so no user is affected.
- **Gates rerun by the reviewer at `8f30803`:** `check`, `test:coverage` (105
  tests) and `build` exited zero.

Limits: the reviewer read the published-scaffold logs but did not rerun them or
the host runs, and did not audit the M117 Redis adapter or M122 deploy code,
which the devtool does not load. Credentials, transport, process lifecycle and
data minimisation are untouched by this range.

## Ancestor PATH lookup (F7) — 2026-11-04

Found by a code review in the session that moved the pin, which did not write
the D06 code but is not independent of this fix.

`npm run` puts `node_modules/.bin` of the package directory and of every
directory above it, up to `/`, ahead of the verified node on `PATH`. The chain
looks up `node` (the workspace root script and `tsx`'s `#!/usr/bin/env node`),
`npm` (the workspace runner) and `tsx` by name. A `node` wrapper placed above
both published `cli@0.11.0` scaffolds ran with `SETU_DEVTOOL_SESSION_KEY` while
the launch paired normally and the confirmation named the verified node.
Another local user who can write to a directory above a project (for example
under `/tmp`) could take the session that way.

Fix: Node preflight requires an executable `node_modules/.bin/tsx` in the
launch root, so every `tsx` lookup ends inside it, and refuses when
`node_modules/.bin/node` or `node_modules/.bin/npm` exists, in any form, in any
directory above the root. An unreadable directory on that path is refused too.
Both preparations run the check, the second immediately before launch. Evidence
and the negative control are in the [validation record](d06-validation.md).
Projects inside a JavaScript repository whose `node_modules/.bin` has neither
`node` nor `npm` are unaffected. A directory above the root that gains one
between the second preparation and the spawn is outside the guarantee, like the
same-user races below.

**Independent re-review: approved for its stated scope.** A separate agent,
not the author, assessed `36cbbd3..b446685`. From npm 11's
`@npmcli/run-script` it confirmed that the lookup directories outside the root
are exactly the root's ancestors (member scripts walk through `apps/` and the
root first), that `project.root` and npm's working directory are both physical
paths, and that the names looked up are `node`, `npm`, `tsx` and npm's default
shell `sh`. It ran the reproduction, its positive control and the full suite.

- **A (medium, S05/S04): fixed.** The runner's nested `npm run dev` has no
  `--no-workspaces`. npm walks up from the member to the first `package.json`
  whose `workspaces` include it; a root whose `workspaces` missed the member let
  that walk reach an ancestor, whose `.npmrc` `workspace=` ran another package's
  `dev` with the session key (reproduced on the published workspace). Preflight
  now requires the root `workspaces` to be an array containing `apps/*`.
- **B (low, false refusal): fixed.** A `tsx` installed only in the member still
  passed the package check but failed the root `.bin` check. The member clause
  is removed: a sibling's lookup would not reach the member's `.bin`, so the
  root must hold `tsx`.
- **`sh` (informational): documented.** An ancestor `node_modules/.bin/sh`
  received the session key under npm's default script shell. The fixed
  `npm_config_script_shell=/bin/sh` prevents it; `docs/security.md` now names
  that setting as load-bearing.
- **C (informational): accepted.** A project under a directory with the `node`
  or `npm` package installed is refused with the generic preparation message.
- **D (informational): documented** in `docs/security.md` as a limit of a
  check without a lock.
- **E (informational): accepted.** The unreadable-directory case does not fail
  as root, which CI does not run as.

A and B were fixed in the authoring session after this re-review; see the
follow-up below.

## Verdict

Passed, including the pin move to `v0.11.0`.
